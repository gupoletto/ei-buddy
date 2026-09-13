import type { FairPrice, PainPoint, UsesSystem, WaitlistEntryOutput } from '@na-regua/contracts'

/**
 * Porta da lista de espera do pre-lancamento — NR-111.
 *
 * Sem `CompanyId`: quem responde nao tem empresa. Ver o cabecalho da
 * migration `0013_lista_de_espera.sql` para por que a tabela nao segue o
 * isolamento por tenant do resto do schema.
 */
export type NewWaitlistEntry = {
  readonly name: string
  readonly businessType: string | null
  readonly phone: string
  readonly expectation: string
  readonly painPoints: readonly PainPoint[]
  readonly painPointOther: string | null
  readonly usesSystem: UsesSystem | null
  readonly usesSystemOther: string | null
  readonly fairPrice: FairPrice | null
  readonly wantsUpdates: boolean
  readonly createdAt: Date
}

export type WaitlistRepository = {
  insert(entry: NewWaitlistEntry): Promise<WaitlistEntryOutput>
}
