import { buscarFornecedoresQuerySchema, requestConnectionInputSchema } from '@na-regua/contracts'
import {
  connectionPendingCount,
  endConnection,
  type ManageConnectionsDeps,
  listConnections,
  requestConnection,
  respondToConnection,
  searchSuppliers,
  suggestSuppliers,
  type SearchSuppliersDeps,
} from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { validate } from '../plugins/validate.js'

/**
 * Rotas de conexao entre lojistas por proximidade — NR-107, ADR-0008, RF-01 a RF-05.
 *
 * Como as outras: le o contexto, valida a forma, chama o caso de uso, traduz.
 * A autorizacao ("accountant nao pede conexao") e a regra de negocio
 * ("nao pedir para si mesmo", "empresa alvo indisponivel") ficam em `core`.
 */
export type ConnectionsRouteDeps = ManageConnectionsDeps & SearchSuppliersDeps

export function registerConnectionsRoutes(app: FastifyInstance, deps: ConnectionsRouteDeps): void {
  /** Buscar quem vende um produto, perto de mim — RF-01, RF-02, RF-03. */
  app.get('/fornecedores', async (request, reply) => {
    const ctx = requireContext(request)
    const { termo } = validate(buscarFornecedoresQuerySchema, request.query ?? {})

    const saida = await searchSuppliers(deps, ctx, termo)

    return reply.code(200).send(saida)
  })

  /** Empresas que outras do seu ramo ja conectaram — RF-01 (aditivo), ADR-0008. */
  app.get('/fornecedores/sugestoes', async (request, reply) => {
    const ctx = requireContext(request)

    const saida = await suggestSuppliers(deps, ctx)

    return reply.code(200).send(saida)
  })

  /** Pedir conexao — RF-04. */
  app.post('/conexoes', async (request, reply) => {
    const ctx = requireContext(request)
    const input = validate(requestConnectionInputSchema, request.body)

    const saida = await requestConnection(deps, ctx, input.targetCompanyId)

    return reply.code(201).send(saida)
  })

  /** Minhas conexoes, enviadas e recebidas — RF-05. */
  app.get('/conexoes', async (request, reply) => {
    const ctx = requireContext(request)

    const saida = await listConnections(deps, ctx)

    return reply.code(200).send(saida)
  })

  /** Quantos pedidos recebidos e pendentes — alimenta o sino do painel. */
  app.get('/conexoes/pendentes', async (request, reply) => {
    const ctx = requireContext(request)

    const saida = await connectionPendingCount(deps, ctx.userId)

    return reply.code(200).send(saida)
  })

  /** Aceitar um pedido recebido — RF-04. */
  app.post<{ Params: { id: string } }>('/conexoes/:id/aceitar', async (request, reply) => {
    const ctx = requireContext(request)

    await respondToConnection(deps, ctx, request.params.id, true)

    return reply.code(200).send({ ok: true })
  })

  /** Recusar um pedido recebido — RF-04. */
  app.post<{ Params: { id: string } }>('/conexoes/:id/recusar', async (request, reply) => {
    const ctx = requireContext(request)

    await respondToConnection(deps, ctx, request.params.id, false)

    return reply.code(200).send({ ok: true })
  })

  /**
   * Cancelar um pedido pendente, ou desfazer uma conexao aceita — RF-05.
   *
   * A MESMA rota para os dois casos: `core` decide qual dos dois vale pelo
   * estado atual do pedido, e quem chama nao precisa saber em qual dos dois
   * estados a conexao esta para pedir "acabe com isto".
   */
  app.post<{ Params: { id: string } }>('/conexoes/:id/encerrar', async (request, reply) => {
    const ctx = requireContext(request)

    await endConnection(deps, ctx, request.params.id)

    return reply.code(200).send({ ok: true })
  })
}
