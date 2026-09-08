import { createPayableInputSchema, endRecurrenceInputSchema } from '@na-regua/contracts'
import {
  createPayable,
  type CreatePayableDeps,
  endRecurrence,
  type EndRecurrenceDeps,
  listPayables,
  type ListPayablesDeps,
  listReceivables,
  type ListReceivablesDeps,
} from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Contas a pagar e a receber — NR-074, RF-055 a RF-066.
 *
 * Como as outras rotas: le o contexto, valida a forma, chama o caso de uso e
 * traduz. Recorrencia, faixa de vencimento e o total por grupo ficam em `core`
 * e em `domain`.
 *
 * As duas listas convivem no mesmo arquivo porque respondem perguntas
 * simetricas — "o que sai" e "o que entra" — e a tela e a mesma estrutura com a
 * contraparte trocada. Separa-las faria a faixa de vencimento ser explicada
 * duas vezes, e e assim que as duas passam a discordar.
 */

export type ContasDeps = CreatePayableDeps &
  EndRecurrenceDeps &
  ListReceivablesDeps & { readonly queries: ListPayablesDeps }

export function registerContasRoutes(app: FastifyInstance, deps: ContasDeps): void {
  /**
   * Lancar — RF-055, RF-057.
   *
   * Devolve a LISTA de ocorrencias, e nao uma so: uma conta recorrente vira N
   * linhas de verdade, e quem lancou precisa ver quantas entraram. `201` porque
   * criou, mesmo quando criou doze.
   */
  app.post(
    '/contas-a-pagar',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const input = validate(createPayableInputSchema, request.body)

      const contas = await createPayable(deps, ctx, input)

      return reply.code(201).send({ payables: contas, count: contas.length })
    },
  )

  /**
   * A lista agrupada por vencimento — RF-061, RF-062.
   *
   * Sem parametro de filtro: o agrupamento e o recorte. Quem quiser "so as
   * vencidas" le o grupo `overdue` da resposta — e assim a tela nao precisa
   * pedir de novo para trocar de aba.
   *
   * `temVencidas` vem no corpo em vez de a tela procurar o grupo e contar: a
   * abertura do sistema pergunta uma coisa so (RF-062), e obriga-la a percorrer
   * a estrutura convida cada tela a responder de um jeito.
   */
  app.get('/contas-a-pagar', async (request, reply) => {
    const ctx = requireContext(request)

    const agrupadas = await listPayables(deps.queries, ctx)

    return reply.code(200).send(agrupadas)
  })

  /**
   * O que a loja tem a receber — RF-064, RF-066.
   *
   * Mesma forma da lista a pagar, e de proposito: as duas telas sao a mesma
   * estrutura com a contraparte trocada, e formas diferentes fariam o total
   * significar uma coisa numa e outra na outra.
   *
   * So o que esta em aberto. Recebivel ja recebido nao pertence a "o que entra
   * esta semana", e cancelado nao pertence a lugar nenhum.
   *
   * A rota faltava. A baixa de recebivel existe desde a NR-029
   * (`POST /contas-a-receber/:id/baixas`), mas nao havia como LISTAR o que
   * baixar — a tela do mobile e a do web mostravam recebiveis de exemplo, e o
   * botao de baixa apontava para ids que nao existiam no banco.
   */
  app.get('/contas-a-receber', async (request, reply) => {
    const ctx = requireContext(request)

    return reply.code(200).send(await listReceivables(deps, ctx))
  })

  /**
   * Encerrar a recorrencia — RF-058.
   *
   * `POST .../encerrar` e nao `DELETE`: o passado nao e apagado. As ocorrencias
   * ja vencidas continuam devidas, e a resposta diz quantas foram canceladas e
   * quantas ficaram — dizer so "pronto" faria o lojista achar que a serie
   * inteira sumiu.
   */
  app.post(
    '/contas-a-pagar/recorrencias/:id/encerrar',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      const input = validate(endRecurrenceInputSchema, { recurrenceId: id })

      const r = await endRecurrence(deps, ctx, input)

      return reply.code(200).send(r)
    },
  )
}
