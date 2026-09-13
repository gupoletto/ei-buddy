import type { FairPrice, PainPoint, UsesSystem, WaitlistEntryOutput } from '@na-regua/contracts'
import type {
  Contagem,
  NewWaitlistEntry,
  WaitlistFilter,
  WaitlistRepository,
  WaitlistStats,
} from '@na-regua/core'
import type { Sql } from 'postgres'
import { withPlatformScope } from './tenant.js'

const numero = (valor: unknown): number => Number(valor)

/**
 * Lista de espera do pre-lancamento — NR-111.
 *
 * `withPlatformScope`, e nao `withTenant`: quem responde nao tem empresa —
 * ver o cabecalho da migration `0013_lista_de_espera.sql`.
 */

type Linha = {
  id: string
  name: string
  business_type: string | null
  phone: string
  expectation: string
  pain_points: PainPoint[]
  pain_point_other: string | null
  uses_system: UsesSystem | null
  uses_system_other: string | null
  fair_price: FairPrice | null
  wants_updates: boolean
  created_at: Date
}

const paraSaida = (l: Linha): WaitlistEntryOutput => ({
  id: l.id,
  name: l.name,
  businessType: l.business_type,
  phone: l.phone,
  expectation: l.expectation,
  painPoints: l.pain_points,
  painPointOther: l.pain_point_other,
  usesSystem: l.uses_system,
  usesSystemOther: l.uses_system_other,
  fairPrice: l.fair_price,
  wantsUpdates: l.wants_updates,
  createdAt: l.created_at.toISOString(),
})

export function createWaitlistRepository(sql: Sql): WaitlistRepository {
  return {
    insert: async (entry: NewWaitlistEntry) => {
      const [linha] = await withPlatformScope(
        sql,
        (tx) => tx<Linha[]>`
          INSERT INTO waitlist_entries
            (name, business_type, phone, expectation, pain_points, pain_point_other,
             uses_system, uses_system_other, fair_price, wants_updates, created_at)
          VALUES (${entry.name}, ${entry.businessType}, ${entry.phone}, ${entry.expectation},
                  ${sql.array([...entry.painPoints])}, ${entry.painPointOther},
                  ${entry.usesSystem}, ${entry.usesSystemOther}, ${entry.fairPrice},
                  ${entry.wantsUpdates}, ${entry.createdAt})
          RETURNING id, name, business_type, phone, expectation, pain_points, pain_point_other,
                    uses_system, uses_system_other, fair_price, wants_updates, created_at
        `,
      )
      return paraSaida(linha!)
    },

    /**
     * Painel do Super Admin — busca livre, mais nova primeiro.
     *
     * `count(*) OVER ()` conta o que casou com o filtro ANTES do `LIMIT`,
     * mesmo padrao de `listCatalog` — um `SELECT count(*)` em separado
     * varreria a tabela de novo, e entre as duas leituras uma resposta nova
     * faria a conta "23 de 300" parar de fechar.
     */
    list: async (filter: WaitlistFilter) => {
      const linhas = await withPlatformScope(
        sql,
        (tx) => tx<(Linha & { total_geral: string })[]>`
          SELECT id, name, business_type, phone, expectation, pain_points, pain_point_other,
                 uses_system, uses_system_other, fair_price, wants_updates, created_at,
                 count(*) OVER () AS total_geral
          FROM waitlist_entries
          ${
            filter.termo === undefined || filter.termo.trim() === ''
              ? tx``
              : tx`WHERE name ILIKE ${'%' + filter.termo + '%'}
                     OR phone ILIKE ${'%' + filter.termo + '%'}
                     OR business_type ILIKE ${'%' + filter.termo + '%'}
                     OR expectation ILIKE ${'%' + filter.termo + '%'}`
          }
          ORDER BY created_at DESC
          LIMIT ${filter.limite} OFFSET ${filter.offset}
        `,
      )

      return {
        entries: linhas.map(paraSaida),
        total: numero(linhas[0]?.total_geral ?? 0),
      }
    },

    /**
     * Os agregados do painel — uma consulta por pergunta fechada, mais a
     * evolucao por dia. Quatro varreduras pequenas e independentes, contra
     * uma consulta so tentando cruzar tudo: o volume esperado (lista de
     * espera de pre-lancamento) nao paga o preco de complicar a leitura.
     */
    stats: async (): Promise<WaitlistStats> => {
      const paraContagem = <T extends string>(
        linhas: readonly { value: T; count: string }[],
      ): Contagem<T>[] => linhas.map((l) => ({ value: l.value, count: numero(l.count) }))

      return withPlatformScope(sql, async (tx) => {
        /* Sequencial, e nao `Promise.all`: sao cinco leituras pequenas na
           mesma conexao, e o volume esperado (lista de espera de
           pre-lancamento) nao paga o risco de disparar consultas
           concorrentes numa unica transacao so para ganhar um pouco de
           tempo. */
        const [totalLinha] = await tx<{ total: string }[]>`
          SELECT count(*)::text AS total FROM waitlist_entries
        `
        const painPoints = await tx<{ value: PainPoint; count: string }[]>`
          SELECT pp AS value, count(*)::text AS count
          FROM waitlist_entries, unnest(pain_points) AS pp
          GROUP BY pp
          ORDER BY count(*) DESC
        `
        const usesSystem = await tx<{ value: UsesSystem; count: string }[]>`
          SELECT uses_system AS value, count(*)::text AS count
          FROM waitlist_entries
          WHERE uses_system IS NOT NULL
          GROUP BY uses_system
          ORDER BY count(*) DESC
        `
        const fairPrice = await tx<{ value: FairPrice; count: string }[]>`
          SELECT fair_price AS value, count(*)::text AS count
          FROM waitlist_entries
          WHERE fair_price IS NOT NULL
          GROUP BY fair_price
          ORDER BY count(*) DESC
        `
        const perDay = await tx<{ date: string; count: string }[]>`
          SELECT to_char(created_at, 'YYYY-MM-DD') AS date, count(*)::text AS count
          FROM waitlist_entries
          GROUP BY 1
          ORDER BY 1
        `

        return {
          total: numero(totalLinha?.total ?? 0),
          painPoints: paraContagem(painPoints),
          usesSystem: paraContagem(usesSystem),
          fairPrice: paraContagem(fairPrice),
          perDay: perDay.map((l) => ({ date: l.date, count: numero(l.count) })),
        }
      })
    },
  }
}
