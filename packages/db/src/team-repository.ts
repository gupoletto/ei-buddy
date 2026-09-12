import type { TeamMemberOutput } from '@na-regua/contracts'
import type { TeamRepository } from '@na-regua/core'
import type { Sql } from 'postgres'
import { withTenant } from './tenant.js'

/**
 * Quem trabalha na loja — usada hoje pelo seletor de responsavel do CRM
 * (NR-109), mas le `company_users` direto: nao ha nada de CRM aqui, e
 * qualquer outra tela que precise "quem esta na equipe" reaproveita esta
 * mesma porta em vez de escrever a mesma consulta de novo.
 */
export function createTeamRepository(sql: Sql): TeamRepository {
  return {
    list: async (companyId) => {
      const linhas = await withTenant(
        sql,
        companyId,
        (tx) => tx<{ id: string; name: string }[]>`
          SELECT u.id, u.name
          FROM company_users cu
          JOIN users u ON u.id = cu.user_id
          WHERE cu.is_active AND u.is_active
          ORDER BY u.name
        `,
      )
      return linhas.map((l): TeamMemberOutput => ({ id: l.id, name: l.name }))
    },
  }
}
