import type { WaitlistEntryOutput } from '@na-regua/contracts'
import type { NewWaitlistEntry, WaitlistRepository } from '../ports/waitlist-repository.js'

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
}
