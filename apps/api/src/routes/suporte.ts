import { openTicketInputSchema, replyToTicketInputSchema } from '@na-regua/contracts'
import {
  getTicket,
  listTickets,
  openTicket,
  readTicket,
  replyToTicket,
  type SupportDeps,
} from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Chamados de suporte — NR-080, US-062.
 *
 * A tela existia inteira sobre `lib/mock-data`: o lojista abria um chamado, via
 * o protocolo na confirmacao, e nada era gravado.
 */

export type SuporteDeps = SupportDeps

export function registerSuporteRoutes(app: FastifyInstance, deps: SuporteDeps): void {
  /** A lista, com os numeros que a tela e o sino usam. */
  app.get('/suporte/chamados', async (request, reply) => {
    const ctx = requireContext(request)

    return reply.code(200).send(await listTickets(deps, ctx))
  })

  /**
   * O detalhe, SEM marcar lido.
   *
   * Separado do `PATCH` de propósito: recarregar a tela nao pode apagar o aviso
   * de resposta nova. Quem marca e a acao de abrir, e nao a de olhar.
   */
  app.get('/suporte/chamados/:id', async (request, reply) => {
    const ctx = requireContext(request)
    const { id } = request.params as { id: string }

    return reply.code(200).send(await getTicket(deps, ctx, id))
  })

  app.post(
    '/suporte/chamados',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const input = validate(openTicketInputSchema, request.body)

      /* 201: criou o chamado E a primeira mensagem. O corpo ja volta com o
         protocolo, que e o que a pessoa anota. */
      return reply.code(201).send(await openTicket(deps, ctx, input))
    },
  )

  app.post(
    '/suporte/chamados/:id/mensagens',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      /* O id vem do CAMINHO; o do corpo e ignorado. Aceitar os dois abriria
         espaco para discordarem, e a resposta cairia em outro chamado. */
      const input = validate(replyToTicketInputSchema, {
        ...(request.body as Record<string, unknown>),
        ticketId: id,
      })

      return reply.code(201).send(await replyToTicket(deps, ctx, input))
    },
  )

  /**
   * Marcar lido — a acao de ABRIR o chamado.
   *
   * Devolve o chamado ja sem as nao lidas: a tela abre o detalhe uma vez so, e
   * duas idas fariam o badge piscar, apagando depois que a conversa apareceu.
   */
  app.patch(
    '/suporte/chamados/:id',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      return reply.code(200).send(await readTicket(deps, ctx, id))
    },
  )
}
