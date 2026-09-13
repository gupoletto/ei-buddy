import { createWaitlistEntryInputSchema } from '@na-regua/contracts'
import { submitWaitlistEntry, type SubmitWaitlistEntryDeps } from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { LIMITE_DE_AUTENTICACAO } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

export type WaitlistRouteDeps = SubmitWaitlistEntryDeps

/**
 * Lista de espera do pre-lancamento — NR-111.
 *
 * PUBLICA: sem `requireContext`, como `POST /auth/signup` — quem responde
 * nao tem sessao. `LIMITE_DE_AUTENTICACAO` (10/min) e nao `LIMITE_DE_ESCRITA`:
 * a mesma exposicao do signup, por ser um POST publico na internet aberta.
 */
export function registerWaitlistRoutes(app: FastifyInstance, deps: WaitlistRouteDeps): void {
  app.post(
    '/lista-vip',
    { config: { rateLimit: LIMITE_DE_AUTENTICACAO } },
    async (request, reply) => {
      const input = validate(createWaitlistEntryInputSchema, request.body)

      const entrada = await submitWaitlistEntry(deps, input, new Date())

      return reply.code(201).send(entrada)
    },
  )
}
