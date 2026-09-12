import { processMessage, type AgentRuntime, type IncomingMessage } from '@na-regua/agent'
import { agentMessageInputSchema, type AgentReply } from '@na-regua/contracts'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Canal HTTP do assistente — NR-060, sem WhatsApp.
 *
 * A mesma `processMessage` do webhook futuro. Aqui o contexto vem da sessao
 * (`channel: 'app'`), nao do numero. E o que permite testar o runtime com o
 * lojista logado enquanto a DEC-003 nao fecha.
 */

export type AgentRouteDeps = {
  readonly runtime: AgentRuntime
}

export function registerAgentRoutes(app: FastifyInstance, deps: AgentRouteDeps): void {
  app.post(
    '/agent/messages',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const input = validate(agentMessageInputSchema, request.body)

      const mensagem: IncomingMessage = {
        text: input.text,
        requestId: ctx.requestId,
        now: ctx.now,
        channel: 'app',
        ctx,
      }

      const resposta: AgentReply = await processMessage(deps.runtime, mensagem)
      return reply.code(200).send(resposta)
    },
  )
}
