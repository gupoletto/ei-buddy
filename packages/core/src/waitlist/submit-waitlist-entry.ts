import type { CreateWaitlistEntryInput, WaitlistEntryOutput } from '@na-regua/contracts'
import type { WaitlistRepository } from '../ports/waitlist-repository.js'

export type SubmitWaitlistEntryDeps = {
  readonly waitlist: WaitlistRepository
}

/**
 * Grava uma resposta da lista de espera — NR-111.
 *
 * Sem `ExecutionContext`: quem responde o formulario publico nao tem sessao,
 * usuario nem empresa — nao ha nada para um contexto de execucao descrever
 * aqui, e forcar um contexto falso (`companyId` inventado) seria pior que nao
 * ter um. `submittedAt` entra como parametro, e nao `new Date()` no corpo, so
 * para o caso de uso continuar testavel sem mockar relogio.
 *
 * Sem checagem de duplicidade de proposito: a mesma pessoa respondendo duas
 * vezes (por exemplo, apos limpar o formulario) e um lead a mais na lista, nao
 * um erro — isto e uma lista de espera, nao um cadastro unico.
 */
export async function submitWaitlistEntry(
  deps: SubmitWaitlistEntryDeps,
  input: CreateWaitlistEntryInput,
  submittedAt: Date,
): Promise<WaitlistEntryOutput> {
  return deps.waitlist.insert({
    name: input.name,
    businessType: input.businessType ?? null,
    phone: input.phone,
    expectation: input.expectation,
    painPoints: input.painPoints,
    painPointOther: input.painPointOther ?? null,
    usesSystem: input.usesSystem ?? null,
    usesSystemOther: input.usesSystemOther ?? null,
    fairPrice: input.fairPrice ?? null,
    wantsUpdates: input.wantsUpdates,
    createdAt: submittedAt,
  })
}
