import type { FairPrice, PainPoint, UsesSystem, WaitlistEntryOutput } from '@na-regua/contracts'
import type { NewWaitlistEntry, WaitlistRepository } from '@na-regua/core'
import type { Sql } from 'postgres'
import { withPlatformScope } from './tenant.js'

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
  }
}
