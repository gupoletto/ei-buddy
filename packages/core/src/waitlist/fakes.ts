import type { FairPrice, PainPoint, UsesSystem, WaitlistEntryOutput } from '@na-regua/contracts'
import type {
  Contagem,
  NewWaitlistEntry,
  WaitlistFilter,
  WaitlistRepository,
  WaitlistStats,
} from '../ports/waitlist-repository.js'

/** Lista de espera em memoria, para o caso de uso — NR-111. */
export class InMemoryWaitlist implements WaitlistRepository {
  private readonly registros: WaitlistEntryOutput[] = []
  private sequencia = 0

  async insert(entry: NewWaitlistEntry): Promise<WaitlistEntryOutput> {
    this.sequencia += 1
    const gravado: WaitlistEntryOutput = {
      id: `wait-${this.sequencia}`,
      name: entry.name,
      businessType: entry.businessType,
      phone: entry.phone,
      expectation: entry.expectation,
      painPoints: [...entry.painPoints],
      painPointOther: entry.painPointOther,
      usesSystem: entry.usesSystem,
      usesSystemOther: entry.usesSystemOther,
      fairPrice: entry.fairPrice,
      wantsUpdates: entry.wantsUpdates,
      createdAt: entry.createdAt.toISOString(),
    }
    this.registros.push(gravado)
    return gravado
  }

  /** Atalho de teste: tudo que foi gravado, na ordem de chegada. */
  todas(): readonly WaitlistEntryOutput[] {
    return this.registros
  }

  async list(
    filter: WaitlistFilter,
  ): Promise<{ entries: readonly WaitlistEntryOutput[]; total: number }> {
    const termo = filter.termo?.trim().toLowerCase() ?? ''

    const casam = [...this.registros]
      .filter(
        (r) =>
          termo === '' ||
          r.name.toLowerCase().includes(termo) ||
          r.phone.includes(termo) ||
          (r.businessType?.toLowerCase().includes(termo) ?? false) ||
          r.expectation.toLowerCase().includes(termo),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return {
      total: casam.length,
      entries: casam.slice(filter.offset, filter.offset + filter.limite),
    }
  }

  async stats(): Promise<WaitlistStats> {
    const contarPor = <T extends string>(valores: (T | null)[]): Contagem<T>[] => {
      const contagens = new Map<T, number>()
      for (const v of valores) {
        if (v === null) continue
        contagens.set(v, (contagens.get(v) ?? 0) + 1)
      }
      return [...contagens.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
    }

    const porDia = new Map<string, number>()
    for (const r of this.registros) {
      const dia = r.createdAt.slice(0, 10)
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
    }

    return {
      total: this.registros.length,
      painPoints: contarPor<PainPoint>(this.registros.flatMap((r) => r.painPoints)),
      usesSystem: contarPor<UsesSystem>(this.registros.map((r) => r.usesSystem)),
      fairPrice: contarPor<FairPrice>(this.registros.map((r) => r.fairPrice)),
      perDay: [...porDia.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }
  }
}
