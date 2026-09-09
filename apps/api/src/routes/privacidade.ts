import { anonymizeCustomerInputSchema } from '@na-regua/contracts'
import {
  type AnonymizeDeps,
  anonymizeCustomer,
  type ExportDeps,
  exportCompanyData,
} from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Direitos do titular — NR-086, RF-125, RF-127, RF-128, LGPD art. 18.
 *
 * Estas rotas faltavam inteiras. `core` tinha os dois casos de uso desde a
 * NR-031, com teste contra falso, e nada os expunha: o lojista nao conseguia
 * levar os dados dele para outro sistema nem atender um pedido de exclusao.
 * Direito com codigo escrito e sem caminho continua sendo direito nao atendido.
 *
 * Quem pode o que fica em `core` — exportar e de `owner` e `accountant`,
 * anonimizar e so de `owner` —, e nao aqui. Se ficasse no handler, o canal
 * WhatsApp nao aplicaria, e e contra ele que a ADR-0002 escreveu a regra do
 * segundo canal: uma mensagem que devolve a base inteira e o pior caso de um
 * numero roubado.
 */

/**
 * A exportacao recebe uma FABRICA de destino, e nao um destino.
 *
 * Cada exportacao escreve num lugar proprio, nomeado pela empresa e pelo
 * instante. Um `sink` unico compartilhado entre requisicoes faria duas
 * exportacoes simultaneas escreverem no mesmo pacote — e o resultado nao seria
 * erro, seria um pacote com dados de duas lojas dentro.
 */
export type PrivacidadeDeps = Omit<ExportDeps, 'sink'> &
  AnonymizeDeps & {
    readonly criarDestino: (companyId: string, carimbo: Date) => ExportDeps['sink']
  }

export function registerPrivacidadeRoutes(app: FastifyInstance, deps: PrivacidadeDeps): void {
  /**
   * Exportar tudo — RF-125, RF-126.
   *
   * `POST` e nao `GET`: a exportacao GRAVA — um pacote no destino e uma linha
   * na trilha de auditoria. `GET` prometeria leitura sem efeito, e um
   * pre-carregador de navegador dispararia exportacoes da base inteira.
   *
   * O limite de escrita vale: e a operacao mais cara do sistema, e repeti-la em
   * rajada e uma forma de derrubar o banco com uma credencial valida.
   */
  app.post(
    '/privacidade/exportacoes',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)

      const r = await exportCompanyData(
        { ...deps, sink: deps.criarDestino(ctx.companyId, ctx.now) },
        ctx,
      )

      /* 201: criou o pacote. O corpo leva o manifesto, que e o que permite
         conferir se veio tudo — e nao apenas "pronto". */
      return reply.code(201).send(r)
    },
  )

  /**
   * Anonimizar um cliente — RF-127, RF-128.
   *
   * `POST` numa subcolecao do cliente, e nao `DELETE` nele. O titular pediu
   * exclusao e recebe anonimizacao: o `id` fica, as vendas ficam, os campos
   * pessoais somem. `DELETE` prometeria que a linha deixou de existir, o que
   * seria mentir para o titular e quebrar os totais de periodos fechados.
   *
   * O id vem do CAMINHO; o do corpo e ignorado. Aceitar os dois abriria espaco
   * para discordarem, e a anonimizacao cairia em outra pessoa — numa operacao
   * que nao tem como desfazer.
   */
  app.post(
    '/clientes/:id/anonimizacao',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const ctx = requireContext(request)
      const { id } = request.params as { id: string }

      const input = validate(anonymizeCustomerInputSchema, {
        ...(request.body as Record<string, unknown>),
        customerId: id,
      })

      /* 200 e nao 201: nada foi criado. O corpo e o COMPROVANTE, que o lojista
         usa para responder ao titular — o que saiu, o que ficou, e por que. */
      return reply.code(200).send(await anonymizeCustomer(deps, ctx, input))
    },
  )
}
