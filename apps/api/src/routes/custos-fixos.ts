import {
  createFixedCostInputSchema,
  generateFixedCostPayablesInputSchema,
  updateFixedCostInputSchema,
} from '@na-regua/contracts'
import {
  createFixedCost,
  deleteFixedCost,
  type FixedCostDeps,
  generateFixedCostPayables,
  type GenerateFixedCostPayablesDeps,
  listFixedCosts,
  updateFixedCost,
} from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Custos fixos — NR-110.
 *
 * A tela de "Plano de contas" montava a lista a partir de `mock-data`, e
 * cadastrar, editar, excluir e "gerar contas a pagar do mes" eram
 * `await delay(...)` seguidos de sucesso — nada era gravado.
 */

export type CustosFixosDeps = FixedCostDeps & GenerateFixedCostPayablesDeps

export function registerCustosFixosRoutes(app: FastifyInstance, deps: CustosFixosDeps): void {
  app.get('/custos-fixos', async (request, reply) => {
    const ctx = requireContext(request)

    return reply.code(200).send({ fixedCosts: await listFixedCosts(deps, ctx) })
  })

  app.post(
    '/custos-fixos',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const input = validate(createFixedCostInputSchema, request.body)

      return reply.code(201).send(await createFixedCost(deps, ctx, input))
    },
  )

  app.patch(
    '/custos-fixos/:id',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }
      const input = validate(updateFixedCostInputSchema, request.body)

      return reply.code(200).send(await updateFixedCost(deps, ctx, id, input))
    },
  )

  app.delete(
    '/custos-fixos/:id',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      await deleteFixedCost(deps, ctx, id)

      return reply.code(204).send()
    },
  )

  /**
   * Gerar as contas do mes — o botao "Gerar contas a pagar".
   *
   * Devolve quantas entraram e quantas ja existiam: "3 geradas, 2 ja
   * existiam" diz ao lojista que apertar de novo nao vai duplicar nada.
   */
  app.post(
    '/custos-fixos/gerar',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const input = validate(generateFixedCostPayablesInputSchema, request.body)

      const r = await generateFixedCostPayables(deps, ctx, input)

      return reply.code(200).send({
        generated: r.generated,
        generatedCount: r.generated.length,
        alreadyExistedCount: r.alreadyExistedCount,
      })
    },
  )
}
