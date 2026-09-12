import type { TeamMemberOutput } from '@na-regua/contracts'
import type { CompanyId } from '../context.js'

/** Porta da equipe da loja — quem pode ser responsavel por um card, hoje. */
export type TeamRepository = {
  /** Membros ativos da empresa, para o seletor de responsavel. */
  list(companyId: CompanyId): Promise<readonly TeamMemberOutput[]>
}
