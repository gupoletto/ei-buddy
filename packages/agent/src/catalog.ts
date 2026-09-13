import {
  catalogInputSchema,
  createCustomerInputSchema,
  createSaleInputSchema,
  revenueByMonthInputSchema,
  saleHistoryInputSchema,
  type CatalogInput,
  type CreateCustomerInput,
  type CreateSaleInput,
  type RevenueByMonthInput,
  type RevenueByMonthOutput,
  type SaleHistoryInput,
  type SaleHistoryOutput,
} from '@na-regua/contracts'
import type {
  ExecutionContext,
  RegisterCustomerResult,
  RegisterSaleResult,
  ReceivablesAgrupadas,
} from '@na-regua/core'
import type { ProductOutput } from '@na-regua/contracts'
import { z } from 'zod'
import { defineTool } from './define-tool.js'
import { formatarCentavos } from './format.js'
import type { AgentTool } from './types.js'

const emptyInputSchema = z.object({}).strict()

export type AgentUseCases = {
  readonly listSales: (ctx: ExecutionContext, input: SaleHistoryInput) => Promise<SaleHistoryOutput>
  readonly listReceivables: (ctx: ExecutionContext) => Promise<ReceivablesAgrupadas>
  readonly registerCustomer: (
    ctx: ExecutionContext,
    input: CreateCustomerInput,
  ) => Promise<RegisterCustomerResult>
  readonly registerSale: (
    ctx: ExecutionContext,
    input: CreateSaleInput,
  ) => Promise<RegisterSaleResult>
  readonly searchProducts: (
    ctx: ExecutionContext,
    input: CatalogInput,
  ) => Promise<readonly ProductOutput[]>
  readonly revenueByMonth: (
    ctx: ExecutionContext,
    input: RevenueByMonthInput,
  ) => Promise<RevenueByMonthOutput>
}

export function createToolCatalog(casos: AgentUseCases): readonly AgentTool[] {
  return [
    defineTool({
      id: 'list_sales',
      description:
        'Consulta vendas de um periodo: total, quantidade e ticket medio. Use para perguntas como "quanto vendi hoje?".',
      inputSchema: saleHistoryInputSchema,
      mutatesValue: false,
      execute: (input, ctx) => casos.listSales(ctx, input),
      formatProposal: () => 'Consultar vendas',
      formatReply: (out) => {
        const s = out.summary
        const n = s.salesCount
        const periodo =
          n === 0 ? 'Nenhuma venda nesse periodo.' : `${n} venda${n === 1 ? '' : 's'}.`
        const ticket =
          s.averageTicketCents === null
            ? ''
            : ` Ticket medio ${formatarCentavos(s.averageTicketCents)}.`
        return `${periodo} Bruto ${formatarCentavos(s.grossCents)}. Liquido ${formatarCentavos(s.netAfterFeesCents)}.${ticket}`
      },
    }),
    defineTool({
      id: 'list_receivables',
      description:
        'Lista quem esta devendo, com valor e vencimento. Use para "quem esta me devendo?" ou inadimplentes.',
      inputSchema: emptyInputSchema,
      mutatesValue: false,
      execute: (_input, ctx) => casos.listReceivables(ctx),
      formatProposal: () => 'Consultar contas a receber',
      formatReply: (out) => {
        if (out.totalCents === 0) return 'Ninguem esta devendo no momento.'
        const linhas = out.grupos
          .flatMap((g) => g.receivables)
          .slice(0, 8)
          .map((r) => {
            const nome = r.customerName ?? 'cliente nao identificado'
            const emAberto = r.amountCents - r.settledAmountCents
            return `- ${nome}: ${formatarCentavos(emAberto)} (vence ${r.dueDate})`
          })
        const extra =
          out.grupos.reduce((n, g) => n + g.receivables.length, 0) > 8 ? '\n(e outros)' : ''
        return `Em aberto ${formatarCentavos(out.totalCents)}.\n${linhas.join('\n')}${extra}`
      },
    }),
    defineTool({
      id: 'search_products',
      description:
        'Busca produtos do catalogo por nome, codigo interno ou barras. Use quando o produto da mensagem for ambiguo.',
      inputSchema: catalogInputSchema,
      mutatesValue: false,
      execute: (input, ctx) => casos.searchProducts(ctx, input),
      formatProposal: (input) => `Buscar produto "${input.q ?? ''}"`,
      formatReply: (produtos) => {
        if (produtos.length === 0) return 'Nenhum produto encontrado com esse nome.'
        if (produtos.length === 1) {
          const p = produtos[0]!
          return `${p.description} (${p.id}) — ${formatarCentavos(p.salePriceCents)}.`
        }
        const opcoes = produtos
          .slice(0, 5)
          .map((p) => `- ${p.description} (${p.id}) ${formatarCentavos(p.salePriceCents)}`)
        return `Encontrei mais de um. Qual deles?\n${opcoes.join('\n')}`
      },
    }),
    defineTool({
      id: 'revenue_by_month',
      description:
        'Resumo de faturamento por mes no periodo. Use para "resumo do mes" ou relatorio de faturamento.',
      inputSchema: revenueByMonthInputSchema,
      mutatesValue: false,
      execute: (input, ctx) => casos.revenueByMonth(ctx, input),
      formatProposal: (input) => `Resumo de ${input.from} a ${input.to}`,
      formatReply: (out) =>
        `Faturamento liquido ${formatarCentavos(out.totalNetCents)} de ${out.from} a ${out.to}.`,
    }),
    defineTool({
      id: 'create_customer',
      description:
        'Cadastra um cliente. Exige confirmacao. Use quando o lojista pedir para cadastrar alguem.',
      inputSchema: createCustomerInputSchema,
      mutatesValue: true,
      execute: (input, ctx) => casos.registerCustomer(ctx, input),
      formatProposal: (input) => {
        const tel = input.phone === undefined ? '' : `, telefone ${input.phone}`
        return `Cadastrar cliente ${input.name}${tel}`
      },
      formatReply: (out) => {
        if (out.status === 'duplicate_found') {
          const nomes = out.candidates.map((c) => c.name).join(', ')
          return `Ja existe cadastro parecido (${nomes}). Confirme se e outra pessoa ou reutilize o existente.`
        }
        return `Cliente ${out.customer.name} cadastrado.`
      },
    }),
    defineTool({
      id: 'create_sale',
      description:
        'Registra uma venda com os mesmos calculos do aplicativo. Exige confirmacao. Nao some valores — o sistema calcula.',
      inputSchema: createSaleInputSchema,
      mutatesValue: true,
      execute: (input, ctx) => casos.registerSale(ctx, input),
      formatProposal: (input) => {
        const itens = input.items.map((i) => `${i.quantity}x ${i.productId}`).join(', ')
        const pagamentos = input.payments.map((p) => p.method).join(', ')
        return `Registrar venda: ${itens}. Pagamento: ${pagamentos}`
      },
      formatReply: (out) =>
        `Venda #${out.sale.number} registrada — ${formatarCentavos(out.sale.netAmountCents)}.`,
    }),
  ]
}

export function textoDasCapacidades(tools: readonly AgentTool[]): string {
  const linhas = tools.map((t) => `- ${t.id}: ${t.description}`)
  return (
    'Nao entendi o pedido. Posso consultar vendas e quem esta devendo, ' +
    'buscar produto, cadastrar cliente e registrar venda — sempre pedindo ' +
    'confirmacao antes de gravar.\n' +
    linhas.join('\n')
  )
}
