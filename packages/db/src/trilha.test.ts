import { randomUUID } from 'node:crypto'
import type { NewAuditEntry } from '@na-regua/core'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuditTrail, gravarTrilha } from './audit-repository.js'
import { migrate } from './migrate.js'
import { createSettlementUnitOfWork } from './settlement-repository.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * A trilha de auditoria escrevendo de verdade — NR-087, RF-123, RF-124, US-061.
 *
 * `audit.test.ts` prova que a tabela recusa UPDATE, DELETE e TRUNCATE. Esta
 * suite prova a outra metade, que nunca existiu: que alguem ESCREVE nela.
 *
 * ## O teste que justifica o arquivo
 *
 * `a entrada desaparece com o rollback da transacao`. E a propriedade que
 * nenhum falso alcanca e que decidiu o desenho desta tarefa: a trilha entra na
 * MESMA transacao do que ela registra. Gravada fora, ela sobreviveria ao
 * rollback — e ficaria na trilha um estorno que nunca aconteceu, o que torna a
 * trilha inutil justamente para a pergunta da US-061.
 *
 * Como as outras suites de `db`: pulada sem `DATABASE_URL`, executada na CI.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('trilha de auditoria — NR-087', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresa: string
  let outra: string
  let usuario: string

  beforeAll(async () => {
    admin = postgres(MIGRATION_URL!, { max: 1, onnotice: () => undefined })
    await migrate(MIGRATION_URL!)
    aplicacao = await conectarComoAplicacao(admin, MIGRATION_URL!)
    sql = aplicacao.sql

    empresa = randomUUID()
    outra = randomUUID()
    usuario = randomUUID()

    for (const [id, prefixo] of [
      [empresa, '3'],
      [outra, '4'],
    ] as const) {
      const cnpj = cnpjDeTeste(prefixo)
      await withTenant(
        sql,
        id,
        (tx) => tx`
          INSERT INTO companies (id, legal_name, cnpj, email, phone)
          VALUES (${id}, ${'Loja da Trilha'}, ${cnpj}, ${`t@${cnpj}.local`}, ${'41999990000'})
        `,
      )
    }
  }, 60_000)

  afterAll(async () => {
    await aplicacao?.encerrar()
    await admin?.end({ timeout: 5 })
  })

  const entrada = (over: Partial<NewAuditEntry> = {}): NewAuditEntry => ({
    companyId: empresa,
    entity: 'Product',
    entityId: randomUUID(),
    action: 'updated',
    actorId: usuario,
    channel: 'app',
    occurredAt: new Date('2026-09-09T12:00:00.000Z'),
    before: { stockQuantity: 20 },
    after: { stockQuantity: 18 },
    ...over,
  })

  const contar = async (entityId: string): Promise<number> => {
    const [linha] = await admin<{ total: string }[]>`
      SELECT count(*)::text AS total FROM audit_log WHERE entity_id = ${entityId}
    `
    return Number(linha!.total)
  }

  /* ---------------------------------------------------------------- */

  describe('a escrita', () => {
    it('grava e devolve a entrada', async () => {
      const e = entrada()

      const gravada = await createAuditTrail(sql).record(e)

      expect(gravada.entityId).toBe(e.entityId)
      expect(gravada.action).toBe('updated')
      expect(gravada.actorId).toBe(usuario)
      expect(gravada.occurredAt).toBe(e.occurredAt.toISOString())
    })

    /*
     * `jsonb` e nao texto — e a diferenca so aparece consultando por CAMPO.
     *
     * Sem o `tx.json` explicito, o driver serializa o objeto como string. A
     * coluna aceitaria (uma string e um json valido), a trilha continuaria
     * gravando, e todo `before ->> 'stockQuantity'` devolveria nulo para
     * sempre. A trilha pararia de ser consultavel sem nada falhar.
     */
    it('o antes e o depois ficam consultaveis por campo', async () => {
      const e = entrada()
      await createAuditTrail(sql).record(e)

      const [linha] = await admin<{ antes: string; depois: string }[]>`
        SELECT before ->> 'stockQuantity' AS antes, after ->> 'stockQuantity' AS depois
          FROM audit_log
         WHERE entity_id = ${e.entityId}
      `

      expect(linha?.antes).toBe('20')
      expect(linha?.depois).toBe('18')
    })

    it('aceita antes nulo, para criacao', async () => {
      const e = entrada({ action: 'created', before: null })

      const gravada = await createAuditTrail(sql).record(e)

      expect(gravada.before).toBeNull()
    })

    /* O CHECK `audit_log_criacao_sem_antes` da 0007: criacao nao tem antes. */
    it('recusa criacao COM estado anterior', async () => {
      await expect(
        createAuditTrail(sql).record(entrada({ action: 'created', before: { a: 1 } })),
      ).rejects.toThrow()
    })

    /* A empresa vem da entrada; a politica confere no `WITH CHECK`. Gravar em
       nome de outra loja e recusado pelo banco, e nao por um `if`. */
    it('nao grava em nome de outra empresa', async () => {
      await expect(
        withTenant(sql, empresa, (tx) => gravarTrilha(tx, entrada({ companyId: outra }))),
      ).rejects.toThrow()
    })

    it('a consulta de uma empresa nao ve a trilha da outra', async () => {
      const e = entrada()
      await createAuditTrail(sql).record(e)

      const linhas = await withTenant(
        sql,
        outra,
        (tx) => tx<{ id: string }[]>`SELECT id FROM audit_log WHERE entity_id = ${e.entityId}`,
      )

      expect(linhas).toEqual([])
    })
  })

  /* ---------------------------------------------------------------- */

  describe('o vocabulario — NR-087', () => {
    /*
     * Os nove verbos. Cinco entraram nesta tarefa: antes eram gravados como o
     * verbo de CRUD mais proximo, com o nome real escondido em `after.event` —
     * e uma consulta por "o que foi alterado neste usuario" devolvia logins.
     */
    it.each([
      'created',
      'updated',
      'deleted',
      'cancelled',
      'access_granted',
      'anonymized',
      'data_export',
      'session_started',
      'session_ended',
    ] as const)('o CHECK aceita %s', async (action) => {
      const e = entrada({ action, before: null })

      expect((await createAuditTrail(sql).record(e)).action).toBe(action)
    })

    /* O contrario tambem importa: o CHECK e o que impede um verbo inventado de
       entrar e a trilha virar um conjunto de vocabularios paralelos. */
    it('o CHECK recusa verbo que nao existe', async () => {
      await expect(
        withTenant(sql, empresa, (tx) =>
          gravarTrilha(tx, entrada({ action: 'mexeu' as never, before: null })),
        ),
      ).rejects.toThrow()
    })
  })

  /* ---------------------------------------------------------------- */

  describe('a trilha entra NA transacao — o teste que decidiu o desenho', () => {
    /*
     * Gravada fora da transacao, a entrada sobreviveria ao rollback: ficaria na
     * trilha um estorno que nunca aconteceu. Isso nao e imprecisao — e a
     * trilha respondendo errado a pergunta da US-061, que e "quem fez o que".
     *
     * Nenhum falso prova isto. O falso de `core` simula rollback porque alguem
     * escreveu o snapshot; aqui e o Postgres.
     */
    it('a entrada desaparece com o rollback da transacao', async () => {
      const e = entrada()

      await expect(
        withTenant(sql, empresa, async (tx) => {
          await gravarTrilha(tx, e)
          /* Depois de gravar, e antes do commit — a janela exata em que a
             trilha de fora ficaria com uma linha orfa. */
          throw new Error('a operacao de negocio falhou')
        }),
      ).rejects.toThrow('a operacao de negocio falhou')

      expect(await contar(e.entityId)).toBe(0)
    })

    it('e fica quando a transacao commita', async () => {
      const e = entrada()

      await withTenant(sql, empresa, (tx) => gravarTrilha(tx, e))

      expect(await contar(e.entityId)).toBe(1)
    })

    /*
     * O mesmo, atraves de um escopo de verdade.
     *
     * `SettlementTransaction` passou a incluir a trilha na NR-087, e e por
     * `tx.record` que a baixa e o estorno auditam. Este teste prova que o
     * `record` do escopo esta na transacao do escopo — se alguem, no futuro,
     * fizer o `escopo()` delegar para uma trilha de conexao propria, aqui
     * quebra.
     */
    it('o `record` do escopo da unidade de trabalho tambem desaparece', async () => {
      const e = entrada({ entity: 'Payable' })
      const uow = createSettlementUnitOfWork(sql)

      await expect(
        uow.transaction(empresa, async (tx) => {
          await tx.record(e)
          throw new Error('a baixa falhou')
        }),
      ).rejects.toThrow('a baixa falhou')

      expect(await contar(e.entityId)).toBe(0)
    })

    it('e permanece quando a transacao do escopo commita', async () => {
      const e = entrada({ entity: 'Payable' })
      const uow = createSettlementUnitOfWork(sql)

      await uow.transaction(empresa, (tx) => tx.record(e))

      expect(await contar(e.entityId)).toBe(1)
    })
  })

  /* ---------------------------------------------------------------- */

  describe('a trilha continua sendo somente-insercao', () => {
    /*
     * `audit.test.ts` ja prova que os gatilhos recusam. O que se prova aqui e
     * que eles recusam DEPOIS de a escrita passar a existir — porque uma
     * trilha em que ninguem escrevia era trivialmente imutavel.
     */
    it('nao da para corrigir o que foi gravado', async () => {
      const e = entrada()
      await createAuditTrail(sql).record(e)

      await expect(
        withTenant(
          sql,
          empresa,
          (tx) =>
            tx`UPDATE audit_log SET actor_id = ${randomUUID()} WHERE entity_id = ${e.entityId}`,
        ),
      ).rejects.toThrow()
    })

    it('nem apagar', async () => {
      const e = entrada()
      await createAuditTrail(sql).record(e)

      await expect(
        withTenant(sql, empresa, (tx) => tx`DELETE FROM audit_log WHERE entity_id = ${e.entityId}`),
      ).rejects.toThrow()

      expect(await contar(e.entityId)).toBe(1)
    })
  })
})
