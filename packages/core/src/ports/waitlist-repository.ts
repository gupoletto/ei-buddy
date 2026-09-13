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

export type WaitlistFilter = {
  readonly termo?: string
  readonly offset: number
  readonly limite: number
}

/** Uma contagem por chave — a barra de um grafico. */
export type Contagem<T extends string> = { readonly value: T; readonly count: number }

export type WaitlistStats = {
  readonly total: number
  readonly painPoints: readonly Contagem<PainPoint>[]
  readonly usesSystem: readonly Contagem<UsesSystem>[]
  readonly fairPrice: readonly Contagem<FairPrice>[]
  /** `AAAA-MM-DD`, em ordem crescente — um dia por linha, so os dias com resposta. */
  readonly perDay: readonly { readonly date: string; readonly count: number }[]
}

export type WaitlistRepository = {
  insert(entry: NewWaitlistEntry): Promise<WaitlistEntryOutput>

  /**
   * Painel do Super Admin — NR-111. Busca livre por nome, celular, ramo ou
   * a expectativa em texto aberto; sem busca, devolve tudo, mais novo primeiro.
   */
  list(
    filter: WaitlistFilter,
  ): Promise<{ readonly entries: readonly WaitlistEntryOutput[]; readonly total: number }>

  /** Os agregados do painel — uma pergunta fechada por lista, e a evolucao por dia. */
  stats(): Promise<WaitlistStats>
}
