import {
  reverseSettlementInputSchema,
  settlePayableInputSchema,
  settleReceivableInputSchema,
} from '@na-regua/contracts'
import { reverseSettlement, type SettleDeps, settlePayable, settleReceivable } from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Baixa e estorno de titulo — NR-029, RF-063 a RF-067.
 *
 * Estas rotas faltavam. `core` tinha os tres casos de uso desde a NR-029, com
 * teste contra falso, e `db` ganhou a implementacao agora — mas sem rota o
 * lojista nao tinha por onde dar baixa numa conta. A operacao mais diaria do
 * financeiro existia no repositorio e nao no produto.
 *
 * A verificacao de papel fica em `core` (`assertCanWrite`), e nao aqui: senao o
 * canal WhatsApp (NR-060) daria a mesma baixa sem ela.
 */

export type BaixasDeps = SettleDeps

export function registerBaixasRoutes(app: FastifyInstance, deps: BaixasDeps): void {
  /**
   * Baixa em conta a pagar — RF-063.
   *
   * `POST` numa subcolecao do titulo, e nao `PATCH` no titulo. A baixa e um
   * FATO novo — uma linha na trilha — e o saldo do titulo e consequencia dela.
   * Um `PATCH status=settled` deixaria o saldo mudado sem registro de quando,
   * de quanto e de qual conta saiu o dinheiro.
   */
  app.post(
    '/contas-a-pagar/:id/baixas',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      /* O id vem do CAMINHO; o do corpo e ignorado. Aceitar os dois abriria
         espaco para discordarem, e a baixa cairia em outro titulo. */
      const input = validate(settlePayableInputSchema, {
        ...(request.body as Record<string, unknown>),
        payableId: id,
      })

      return reply.code(201).send(await settlePayable(deps, ctx, input))
    },
  )

  /**
   * Baixa em recebivel — RF-064.
   *
   * Separada da de pagar porque as duas guardam coisas diferentes: aqui entra
   * COMO o cliente pagou, la entra de qual conta saiu. E esta mexe no fiado do
   * cliente (RF-013), que a outra nao toca.
   */
  app.post(
    '/contas-a-receber/:id/baixas',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      const input = validate(settleReceivableInputSchema, {
        ...(request.body as Record<string, unknown>),
        receivableId: id,
      })

      return reply.code(201).send(await settleReceivable(deps, ctx, input))
    },
  )

  /**
   * Estorno — RF-067.
   *
   * `POST` de uma baixa NEGATIVA, e nao `DELETE` da original. O passado nao se
   * apaga: quem confere o caixa do dia precisa ver que houve uma baixa e um
   * estorno, e nao um buraco onde a baixa estava.
   *
   * A rota nao diz se o titulo e a pagar ou a receber. Quem estorna tem o id da
   * baixa na mao e nao sabe — nem precisa saber — em qual tabela ela mora.
   */
  app.post(
    '/baixas/:id/estorno',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      const input = validate(reverseSettlementInputSchema, {
        ...(request.body as Record<string, unknown>),
        settlementId: id,
      })

      return reply.code(201).send(await reverseSettlement(deps, ctx, input))
    },
  )
}
