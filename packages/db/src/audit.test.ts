import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * Trilha de auditoria somente-insercao — NR-025. RF-123, RF-124.
 *
 * A suite existe para uma propriedade que nao da para verificar lendo o schema:
 * que UPDATE, DELETE e TRUNCATE sao **recusados de verdade**, pelo papel que a
 * aplicacao usa. Um teste que so conferisse a existencia dos gatilhos em
 * `pg_trigger` passaria com um gatilho que nao faz nada.
 *
 * Como nas outras suites de `db`: pulada sem `DATABASE_URL`, executada na CI, e
 * com as asserções rodando por um papel COMUM.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('trilha de auditoria — NR-025', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string

  async function criarEmpresa(cnpj: string, nome: string): Promise<string> {
    const id = randomUUID()
    await withTenant(
      sql,
      id,
      (tx) =>
        tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${id}, ${nome}, ${cnpj}, ${'contato@' + cnpj + '.local'}, ${'41999990000'})
      `,
    )
    return id
  }

  async function registrar(
    empresa: string,
    over: { entityId?: string; actorId?: string; channel?: string } = {},
  ): Promise<string> {
    const [linha] = await withTenant(
      sql,
      empresa,
      (tx) => tx<{ id: string }[]>`
        INSERT INTO audit_logs
          (company_id, entity, entity_id, action, actor_id, channel, occurred_at, before, after)
        VALUES (
          ${empresa},
          ${'Product'},
          ${over.entityId ?? randomUUID()},
          ${'updated'},
          ${over.actorId ?? randomUUID()},
          ${over.channel ?? 'app'},
          ${'2026-09-02T12:00:00Z'},
          ${sql.json({ stockQuantity: 20 })},
          ${sql.json({ stockQuantity: 18 })}
        )
        RETURNING id
      `,
    )
    return linha!.id
  }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0007_acrescimos')

    admin = postgres(DATABASE_URL!, { max: 3, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    /* Prefixos 5 e 6: 1 e 2 sao de schema.test.ts, 3 e 4 de appointments. */
    empresaA = await criarEmpresa(cnpjDeTeste('5'), 'Mercado A')
    empresaB = await criarEmpresa(cnpjDeTeste('6'), 'Mercado B')
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    /*
     * A trilha NAO e limpa, e nao ha como limpar: e exatamente o que esta suite
     * verifica. As linhas ficam no banco de teste, e ficar e barato — elas sao
     * pequenas, escopadas por empresa, e cada execucao cria empresas novas.
     *
     * Apagar as empresas funciona porque `audit_logs` nao tem chave estrangeira
     * para `companies` — decisao registrada na migration: prova nao pode
     * depender da existencia daquilo que ela prova.
     */
    for (const empresa of [empresaA, empresaB].filter(Boolean)) {
      await withTenant(sql, empresa, (tx) => tx`DELETE FROM companies`)
    }
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  }, 60_000)

  describe('registrar', () => {
    it('grava autor, canal, data e antes/depois — RF-123', async () => {
      const id = await registrar(empresaA, { actorId: '11111111-1111-1111-1111-111111111111' })

      const [linha] = await withTenant(
        sql,
        empresaA,
        (tx) =>
          tx<
            { actor_id: string; channel: string; before: unknown; after: unknown }[]
          >`SELECT actor_id, channel, before, after FROM audit_logs WHERE id = ${id}`,
      )

      expect(linha?.actor_id).toBe('11111111-1111-1111-1111-111111111111')
      expect(linha?.channel).toBe('app')
      expect(linha?.before).toEqual({ stockQuantity: 20 })
      expect(linha?.after).toEqual({ stockQuantity: 18 })
    })

    it('aceita whatsapp como canal — RF-123 pede distinguir', async () => {
      const id = await registrar(empresaA, { channel: 'whatsapp' })

      const [linha] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ channel: string }[]>`SELECT channel FROM audit_logs WHERE id = ${id}`,
      )

      expect(linha?.channel).toBe('whatsapp')
    })

    it('recusa canal que nao existe', async () => {
      await expect(registrar(empresaA, { channel: 'telepatia' })).rejects.toThrow()
    })

    it('recusa criacao com estado anterior — nao havia antes', async () => {
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO audit_logs
              (company_id, entity, entity_id, action, actor_id, channel, occurred_at, before)
            VALUES (${empresaA}, ${'Product'}, ${randomUUID()}, ${'created'}, ${randomUUID()},
                    ${'app'}, ${'2026-09-02T12:00:00Z'}, ${sql.json({ a: 1 })})
          `,
        ),
      ).rejects.toThrow()
    })
  })

  /**
   * O coracao da RF-124. Quem tem acesso para alterar o dado costuma ter acesso
   * para alterar o registro do que fez — e por isso a garantia mora no banco.
   */
  describe('somente insercao — RF-124', () => {
    it('recusa UPDATE', async () => {
      const id = await registrar(empresaA)

      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE audit_logs SET action = ${'created'} WHERE id = ${id}`,
        ),
      ).rejects.toThrow(/somente-insercao/)
    })

    it('recusa DELETE', async () => {
      const id = await registrar(empresaA)

      await expect(
        withTenant(sql, empresaA, (tx) => tx`DELETE FROM audit_logs WHERE id = ${id}`),
      ).rejects.toThrow(/somente-insercao/)
    })

    /*
     * TRUNCATE e DONO: as duas coisas no mesmo teste, porque as duas so sao
     * verificaveis pela conexao de ADMIN.
     *
     * O papel da aplicacao nem chega ao gatilho — ele tem SELECT, INSERT,
     * UPDATE e DELETE, e nao TRUNCATE, entao levaria "permission denied" e o
     * teste passaria sem provar nada sobre a trilha.
     *
     * Pelo admin o teste vale duas vezes: TRUNCATE nao dispara gatilho de linha
     * (e o que o torna rapido, e o que apagaria a trilha inteira por cima dos
     * outros dois gatilhos), e o admin e DONO da tabela — que e exatamente o
     * caso que `REVOKE` nao cobriria, e o motivo de a garantia ser gatilho.
     */
    it('recusa TRUNCATE, inclusive pelo dono da tabela', async () => {
      await expect(admin`TRUNCATE audit_logs`).rejects.toThrow(/somente-insercao/)
    })

    it('recusa UPDATE do dono — REVOKE nao cobriria este caso', async () => {
      const id = await registrar(empresaA)

      await expect(
        admin`UPDATE audit_logs SET action = ${'created'} WHERE id = ${id}`,
      ).rejects.toThrow(/somente-insercao/)
    })

    it('a linha continua la depois da tentativa', async () => {
      const id = await registrar(empresaA)

      await withTenant(sql, empresaA, (tx) => tx`DELETE FROM audit_logs WHERE id = ${id}`).catch(
        () => undefined,
      )

      const achada = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ id: string }[]>`SELECT id FROM audit_logs WHERE id = ${id}`,
      )

      expect(achada).toHaveLength(1)
    })
  })

  describe('isolamento por empresa', () => {
    it('uma loja nao le a trilha da outra', async () => {
      const id = await registrar(empresaA)

      const daOutra = await withTenant(
        sql,
        empresaB,
        (tx) => tx<{ id: string }[]>`SELECT id FROM audit_logs WHERE id = ${id}`,
      )

      expect(daOutra).toEqual([])
    })

    it('nao grava trilha com o company_id da vizinha', async () => {
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO audit_logs
              (company_id, entity, entity_id, action, actor_id, channel, occurred_at)
            VALUES (${empresaB}, ${'Product'}, ${randomUUID()}, ${'updated'}, ${randomUUID()},
                    ${'app'}, ${'2026-09-02T12:00:00Z'})
          `,
        ),
      ).rejects.toThrow()
    })
  })
})
