import { z } from 'zod'
import { idSchema } from '../common/primitives.js'

/**
 * A equipe da loja — glossario `TeamMember`.
 *
 * Le `company_users`, que ja existe desde o baseline 0909 para papel e sessao,
 * mas nunca tinha rota que a devolvesse como LISTA. Nasceu aqui porque o CRM e
 * o primeiro caso de uso a precisar de "quem trabalha nesta loja" para um
 * seletor — suporte e outras telas podem passar a usar a mesma rota depois.
 */

export const teamMemberOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
})

export type TeamMemberOutput = z.infer<typeof teamMemberOutputSchema>

export const teamOutputSchema = z.object({
  members: z.array(teamMemberOutputSchema),
})

export type TeamOutput = z.infer<typeof teamOutputSchema>
