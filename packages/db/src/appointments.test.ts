import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * Schema de agenda — NR-035. RF-089 a RF-093.
 *
 * A tabela existe para atender a porta `AppointmentRepository`, que ja estava
 * declarada em `core` com apenas um repositorio em memoria por tras. Por isso
 * as asserções aqui perseguem o que aquela porta promete, e nao o que a tabela
 * tem de colunas:
 *
 *   - `findById` devolve `undefined` para compromisso de OUTRA empresa;
 *   - `listBetween` traz em ordem de horario e SEM os cancelados;
 *   - `cancel` marca, nao apaga (RNF-040).
 *
 * Como nas outras suites de `db`: pulada sem `DATABASE_URL`, executada na CI, e
 * com as asserções rodando por um papel COMUM — com a conexao de administrador,
 * superusuario ignora RLS e a suite mediria o vazio.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('schema de agenda — NR-035', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string
  /** Cliente da empresa A, para o vinculo de RF-090. */
  let clienteA: string

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

  /** Cria um compromisso e devolve o id. `startsAt` em UTC, como a coluna. */
  async function agendar(
    empresa: string,
    titulo: string,
    startsAt: string,
    extra: {
      customerId?: string
      lembrete?: number
      endsAt?: string
      local?: string
    } = {},
  ): Promise<string> {
    const [linha] = await withTenant(
      sql,
      empresa,
      (tx) => tx<{ id: string }[]>`
        INSERT INTO appointments
          (company_id, title, starts_at, ends_at, location, customer_id,
           reminder_minutes_before)
        VALUES (
          ${empresa},
          ${titulo},
          ${startsAt},
          ${extra.endsAt ?? null},
          ${extra.local ?? null},
          ${extra.customerId ?? null},
          ${extra.lembrete ?? null}
        )
        RETURNING id
      `,
    )
    return linha!.id
  }

  /** A agenda do dia, como `listBetween` a monta: intervalo, sem cancelado. */
  function agendaDoDia(empresa: string, de: string, ate: string) {
    return withTenant(
      sql,
      empresa,
      (tx) => tx<{ title: string }[]>`
        SELECT title FROM appointments
        WHERE starts_at >= ${de} AND starts_at < ${ate} AND status = 'scheduled'
        ORDER BY starts_at
      `,
    )
  }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_dominio_0909')
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_dominio_0909')

    admin = postgres(DATABASE_URL!, { max: 3, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    /* Prefixos 3 e 4 para nao colidir com os 1 e 2 de schema.test.ts, caso as
       duas suites caiam no mesmo milissegundo. */
    empresaA = await criarEmpresa(cnpjDeTeste('3'), 'Barbearia A')
    empresaB = await criarEmpresa(cnpjDeTeste('4'), 'Barbearia B')

    const [cliente] = await withTenant(
      sql,
      empresaA,
      (tx) => tx<{ id: string }[]>`
        INSERT INTO customers (company_id, name) VALUES (${empresaA}, ${'Dona Marta'})
        RETURNING id
      `,
    )
    clienteA = cliente!.id
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    const empresas = [empresaA, empresaB].filter(Boolean)

    /*
     * Duas passadas, e nao uma por empresa. A CI encontrou o motivo:
     * `DELETE FROM customers` da empresa A falhava com violacao de chave
     * estrangeira porque um compromisso da empresa B — criado pelo teste de FK
     * cross-tenant abaixo — ainda apontava para o cliente dela.
     *
     * Nao e defeito do schema: e o `ON DELETE RESTRICT` funcionando. Apagar o
     * cliente enquanto alguem o referencia deixaria a referencia pendurada.
     * A limpeza e que precisa respeitar a ordem das dependencias, e como o
     * vinculo atravessa empresas, ela tem de esvaziar TODOS os compromissos
     * antes de tocar em qualquer cliente.
     */
    for (const empresa of empresas) {
      await withTenant(sql, empresa, (tx) => tx`DELETE FROM appointments`)
    }
    for (const empresa of empresas) {
      await withTenant(sql, empresa, async (tx) => {
        await tx`DELETE FROM customers`
        await tx`DELETE FROM companies`
      })
    }
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  }, 60_000)

  // -------------------------------------------------------------------------
  // Isolamento
  // -------------------------------------------------------------------------

  describe('isolamento por empresa', () => {
    it('compromisso de uma loja nao aparece na outra', async () => {
      await agendar(empresaA, 'Corte do Seu Jose', '2026-10-01T13:00:00Z')

      const daOutra = await agendaDoDia(empresaB, '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z')

      expect(daOutra).toEqual([])
    })

    /*
     * `findById` promete `undefined` para compromisso de outra empresa — nao
     * um erro de permissao. Um 403 confirmaria que o id existe em algum lugar,
     * e a existencia ja e informacao.
     */
    it('buscar por id o compromisso da outra loja devolve vazio, nao erro', async () => {
      const id = await agendar(empresaA, 'Barba do Paulo', '2026-10-02T13:00:00Z')

      const achado = await withTenant(
        sql,
        empresaB,
        (tx) => tx<{ id: string }[]>`SELECT id FROM appointments WHERE id = ${id}`,
      )

      expect(achado).toEqual([])
    })

    it('nao grava compromisso com o company_id da vizinha', async () => {
      /* A clausula WITH CHECK da politica e a metade que costuma faltar: sem
         ela, o INSERT com o id da outra empresa entra e fica. */
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO appointments (company_id, title, starts_at)
            VALUES (${empresaB}, ${'Enxerido'}, ${'2026-10-03T13:00:00Z'})
          `,
        ),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // A agenda do dia — RF-093
  // -------------------------------------------------------------------------

  describe('agenda do dia — RF-093', () => {
    it('devolve em ordem de horario, nao de insercao', async () => {
      await agendar(empresaA, 'Tarde', '2026-11-05T19:00:00Z')
      await agendar(empresaA, 'Manha', '2026-11-05T11:00:00Z')
      await agendar(empresaA, 'Meio-dia', '2026-11-05T15:00:00Z')

      const dia = await agendaDoDia(empresaA, '2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z')

      expect(dia.map((l) => l.title)).toEqual(['Manha', 'Meio-dia', 'Tarde'])
    })

    it('nao mistura compromisso do dia seguinte', async () => {
      await agendar(empresaA, 'Do dia 10', '2026-11-10T13:00:00Z')
      await agendar(empresaA, 'Do dia 11', '2026-11-11T13:00:00Z')

      const dia = await agendaDoDia(empresaA, '2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z')

      expect(dia.map((l) => l.title)).toEqual(['Do dia 10'])
    })
  })

  // -------------------------------------------------------------------------
  // Cancelamento — RF-092, RNF-040
  // -------------------------------------------------------------------------

  describe('cancelamento', () => {
    it('cancelar marca e NAO apaga — RNF-040', async () => {
      const id = await agendar(empresaA, 'Que vai cair', '2026-12-01T13:00:00Z')

      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          UPDATE appointments
          SET status = 'cancelled', cancelled_at = now(), cancel_reason = ${'Cliente remarcou'}
          WHERE id = ${id}
        `,
      )

      const [linha] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ status: string; cancel_reason: string | null }[]>`
          SELECT status, cancel_reason FROM appointments WHERE id = ${id}
        `,
      )

      /* Continua respondendo por id — some da agenda, nao da existencia. */
      expect(linha?.status).toBe('cancelled')
      expect(linha?.cancel_reason).toBe('Cliente remarcou')
    })

    it('cancelado sai da agenda do dia', async () => {
      const id = await agendar(empresaA, 'Sumira', '2026-12-02T13:00:00Z')
      await agendar(empresaA, 'Ficara', '2026-12-02T14:00:00Z')

      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          UPDATE appointments SET status = 'cancelled', cancelled_at = now() WHERE id = ${id}
        `,
      )

      const dia = await agendaDoDia(empresaA, '2026-12-02T00:00:00Z', '2026-12-03T00:00:00Z')

      expect(dia.map((l) => l.title)).toEqual(['Ficara'])
    })

    it('recusa status cancelado sem a data do cancelamento', async () => {
      const id = await agendar(empresaA, 'Meio cancelado', '2026-12-03T13:00:00Z')

      /* Sem a constraint, a agenda passaria a ter duas respostas para "isso
         foi cancelado?" — o status diria uma coisa e a data, outra. */
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE appointments SET status = 'cancelled' WHERE id = ${id}`,
        ),
      ).rejects.toThrow()
    })

    it('recusa data de cancelamento com o compromisso ainda de pe', async () => {
      const id = await agendar(empresaA, 'Cancelado ao contrario', '2026-12-04T13:00:00Z')

      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE appointments SET cancelled_at = now() WHERE id = ${id}`,
        ),
      ).rejects.toThrow()
    })

    it('recusa status que nao existe', async () => {
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO appointments (company_id, title, starts_at, status)
            VALUES (${empresaA}, ${'Status inventado'}, ${'2026-12-05T13:00:00Z'}, ${'remarcado'})
          `,
        ),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // Limites que repetem os de contracts
  // -------------------------------------------------------------------------

  describe('limites de coluna', () => {
    it('recusa titulo curto demais', async () => {
      await expect(agendar(empresaA, 'a', '2026-12-06T13:00:00Z')).rejects.toThrow()
    })

    it('recusa titulo que e so espaco — o CHECK olha o titulo aparado', async () => {
      await expect(agendar(empresaA, '     ', '2026-12-07T13:00:00Z')).rejects.toThrow()
    })

    it('recusa titulo longo demais', async () => {
      await expect(agendar(empresaA, 'x'.repeat(141), '2026-12-08T13:00:00Z')).rejects.toThrow()
    })

    it.each([0, 10_081])('recusa antecedencia de lembrete de %i minutos', async (minutos) => {
      await expect(
        agendar(empresaA, 'Lembrete invalido', '2026-12-09T13:00:00Z', { lembrete: minutos }),
      ).rejects.toThrow()
    })

    it.each([1, 30, 10_080])('aceita antecedencia de %i minutos', async (minutos) => {
      const id = await agendar(empresaA, `Lembrete de ${minutos}`, '2026-12-10T13:00:00Z', {
        lembrete: minutos,
      })
      expect(id).toBeTruthy()
    })

    it('sem lembrete pedido, a coluna fica nula — nao zero', async () => {
      const id = await agendar(empresaA, 'Sem lembrete', '2026-12-11T13:00:00Z')

      const [linha] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ reminder_minutes_before: number | null }[]>`
          SELECT reminder_minutes_before FROM appointments WHERE id = ${id}
        `,
      )

      /* Zero seria "avise na hora", que e um pedido; nulo e a ausencia dele. */
      expect(linha?.reminder_minutes_before).toBeNull()
    })

    /* Migration 0020. Antes dela o formulario pedia hora de fim e local, e os
       dois eram descartados por nao haver coluna. */
    it('guarda a hora de fim e o local', async () => {
      const id = await agendar(empresaA, 'Entrega', '2026-12-12T13:00:00Z', {
        endsAt: '2026-12-12T14:30:00Z',
        local: 'Rua Xavier da Silva, 88',
      })

      const [linha] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ ends_at: Date | null; location: string | null }[]>`
          SELECT ends_at, location FROM appointments WHERE id = ${id}
        `,
      )

      expect(linha?.ends_at?.toISOString()).toBe('2026-12-12T14:30:00.000Z')
      expect(linha?.location).toBe('Rua Xavier da Silva, 88')
    })

    it('compromisso pontual fica com ends_at NULO — nao com uma duracao inventada', async () => {
      const id = await agendar(empresaA, 'Pagar aluguel', '2026-12-13T13:00:00Z')

      const [linha] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ ends_at: Date | null }[]>`
          SELECT ends_at FROM appointments WHERE id = ${id}
        `,
      )

      expect(linha?.ends_at).toBeNull()
    })

    it('recusa fim ANTES do inicio', async () => {
      /* O CHECK e a ultima linha de defesa: `contracts` valida o que entra por
         HTTP, e migration, script e worker escrevem por fora. */
      await expect(
        agendar(empresaA, 'Impossivel', '2026-12-14T13:00:00Z', {
          endsAt: '2026-12-14T12:00:00Z',
        }),
      ).rejects.toThrow(/violates check constraint/i)
    })

    it('recusa fim IGUAL ao inicio — duracao zero e o compromisso pontual', async () => {
      await expect(
        agendar(empresaA, 'Zero', '2026-12-15T13:00:00Z', { endsAt: '2026-12-15T13:00:00Z' }),
      ).rejects.toThrow(/violates check constraint/i)
    })

    it('recusa local longo demais', async () => {
      await expect(
        agendar(empresaA, 'Local enorme', '2026-12-16T13:00:00Z', { local: 'x'.repeat(201) }),
      ).rejects.toThrow(/violates check constraint/i)
    })
  })

  // -------------------------------------------------------------------------
  // Vinculo com o cliente — RF-090
  // -------------------------------------------------------------------------

  describe('vinculo com o cliente — RF-090', () => {
    it('guarda o cliente para o compromisso aparecer no cadastro dele', async () => {
      await agendar(empresaA, 'Corte da Dona Marta', '2027-01-05T13:00:00Z', {
        customerId: clienteA,
      })

      const doCliente = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ title: string }[]>`
          SELECT title FROM appointments WHERE customer_id = ${clienteA} ORDER BY starts_at
        `,
      )

      expect(doCliente.map((l) => l.title)).toContain('Corte da Dona Marta')
    })

    /**
     * Compromisso sem cliente e o caso normal, nao a excecao: entrega,
     * conferencia de estoque, ida ao banco. A coluna e opcional por isso.
     */
    it('aceita compromisso sem cliente', async () => {
      const id = await agendar(empresaA, 'Conferir estoque', '2027-01-06T13:00:00Z')
      expect(id).toBeTruthy()
    })

    /**
     * Integridade entre lojas na FK — comportamento MEDIDO, nao suposto.
     *
     * As checagens de chave estrangeira do Postgres rodam por gatilhos internos
     * (`ri_triggers.c`) que **nao passam pela politica de RLS**. A consequencia
     * ficou provada na CI, e do jeito util: a limpeza da suite falhou com
     *
     *   update or delete on table "customers" violates foreign key constraint
     *   "appointments_customer_id_fkey"  —  Key is still referenced
     *
     * ou seja, o INSERT da empresa B apontando para o cliente da empresa A
     * **entrou**. O mesmo vale para `sales.customer_id`, que usa FK simples
     * igual.
     *
     * O teste fixa esse comportamento de proposito. Nao porque ele seja
     * desejavel, mas porque ele e real: se um dia alguem adotar FK composta
     * `(company_id, customer_id)` — o que exigiria UNIQUE em
     * `customers (company_id, id)` e valeria para `sales` tambem —, este teste
     * reprova e obriga a mudanca a ser deliberada, em vez de silenciosa.
     *
     * O que NAO muda nos dois casos, e e o que protege o lojista: a empresa B
     * pode guardar o id, e nao consegue ler nada sobre a pessoa.
     */
    it('aceita a FK cross-tenant no INSERT — gatilho de FK ignora RLS', async () => {
      await expect(
        withTenant(
          sql,
          empresaB,
          (tx) => tx`
            INSERT INTO appointments (company_id, title, starts_at, customer_id)
            VALUES (${empresaB}, ${'Aponta pra fora'}, ${'2027-01-07T13:00:00Z'}, ${clienteA})
          `,
        ),
      ).resolves.toBeDefined()
    })

    it('mas o cliente da vizinha continua ilegivel — o id nao vira dado', async () => {
      const vazou = await withTenant(
        sql,
        empresaB,
        (tx) => tx<{ name: string }[]>`SELECT name FROM customers WHERE id = ${clienteA}`,
      )

      expect(vazou).toEqual([])
    })
  })
})
