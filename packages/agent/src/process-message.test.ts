import type {
  CatalogInput,
  CreateCustomerInput,
  CreateSaleInput,
  RevenueByMonthInput,
} from '@na-regua/contracts'
import { AppError, type ExecutionContext } from '@na-regua/core'
import { describe, expect, it } from 'vitest'
import { createAgentRuntime } from './create-runtime.js'
import { FakeLlm } from './fake-llm.js'
import { eNao, eSim, processMessage } from './process-message.js'
import type { AgentUseCases } from './catalog.js'
import type { IncomingMessage } from './types.js'

const agora = new Date('2026-09-11T15:00:00.000Z')

const ctx: ExecutionContext = {
  companyId: 'emp-1',
  userId: 'user-1',
  role: 'owner',
  channel: 'app',
  requestId: 'req-1',
  now: agora,
}

function casos(over: Partial<AgentUseCases> = {}): AgentUseCases {
  return {
    listSales: async () => ({
      sales: [],
      total: 0,
      page: 1,
      pageSize: 20,
      summary: {
        salesCount: 3,
        grossCents: 15_000,
        netCents: 14_000,
        cardFeeCents: 500,
        netAfterFeesCents: 13_500,
        averageTicketCents: 5_000,
      },
    }),
    listReceivables: async () => ({
      grupos: [
        {
          faixa: 'overdue',
          totalCents: 2_000,
          receivables: [
            {
              id: 'r1',
              saleId: null,
              customerId: 'c1',
              customerName: 'Joao',
              description: 'Fiado',
              amountCents: 2_000,
              netAmountCents: 2_000,
              settledAmountCents: 0,
              dueDate: '2026-09-01',
              installmentNumber: 1,
              installmentCount: 1,
              status: 'open',
              createdAt: '2026-08-01T12:00:00.000Z',
            },
          ],
        },
        { faixa: 'today', totalCents: 0, receivables: [] },
        { faixa: 'week', totalCents: 0, receivables: [] },
        { faixa: 'month', totalCents: 0, receivables: [] },
        { faixa: 'later', totalCents: 0, receivables: [] },
      ],
      totalCents: 2_000,
      temVencidas: true,
    }),
    registerCustomer: async (_ctx: ExecutionContext, input: CreateCustomerInput) => ({
      status: 'created',
      customer: {
        id: 'cli-1',
        name: input.name,
        document: null,
        phone: input.phone ?? null,
        email: null,
        notes: null,
        walletLimitCents: 0,
        walletBalanceCents: 0,
        address: {
          zipCode: null,
          street: null,
          number: null,
          complement: null,
          district: null,
          city: null,
          state: null,
        },
        createdAt: agora.toISOString(),
        anonymizedAt: null,
      },
    }),
    registerSale: async () => ({
      sale: {
        id: 's1',
        number: 1042,
        grossAmountCents: 9_980,
        costAmountCents: 4_000,
        taxAmountCents: 0,
        cardFeeAmountCents: 0,
        netAmountCents: 9_980,
        changeCents: 0,
        createdAt: agora.toISOString(),
      },
      replayed: false,
      stockWarnings: [],
    }),
    searchProducts: async (_ctx: ExecutionContext, input: CatalogInput) => {
      if (input.q === 'xyz') return []
      return [
        {
          id: 'p-azul',
          description: 'Camiseta M azul',
          barcode: null,
          internalCode: 'PROD-0001',
          unitOfMeasure: 'un',
          salePriceCents: 4_990,
          costPriceCents: 2_000,
          taxRate: 0,
          ncm: null,
          cfop: null,
          taxSituationCode: null,
          stock: 10,
          minStock: 0,
          category: null,
        },
        {
          id: 'p-branca',
          description: 'Camiseta M branca',
          barcode: null,
          internalCode: 'PROD-0002',
          unitOfMeasure: 'un',
          salePriceCents: 4_990,
          costPriceCents: 2_000,
          taxRate: 0,
          ncm: null,
          cfop: null,
          taxSituationCode: null,
          stock: 4,
          minStock: 0,
          category: null,
        },
      ]
    },
    revenueByMonth: async (_ctx: ExecutionContext, input: RevenueByMonthInput) => ({
      from: input.from,
      to: input.to,
      months: [],
      totalNetCents: 50_000,
    }),
    ...over,
  }
}

function msg(over: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    text: 'quanto vendi hoje?',
    requestId: 'req-1',
    now: agora,
    channel: 'app',
    ctx,
    ...over,
  }
}

describe('processMessage — consultas (RF-096, RF-097)', () => {
  it('responde vendas de hoje pelo reconhecidor falso, com numeros do caso de uso', async () => {
    const runtime = createAgentRuntime({ useCases: casos() })
    const r = await processMessage(runtime, msg())
    expect(r.kind).toBe('answer')
    expect(r.text).toContain('3 vendas')
    expect(r.text).toContain('R$')
  })

  it('lista inadimplentes', async () => {
    const runtime = createAgentRuntime({ useCases: casos() })
    const r = await processMessage(runtime, msg({ text: 'quem esta me devendo?' }))
    expect(r.kind).toBe('answer')
    expect(r.text).toContain('Joao')
    expect(r.text).toContain('R$')
  })

  it('declara capacidades quando nao reconhece — RF-097', async () => {
    const runtime = createAgentRuntime({ useCases: casos() })
    const r = await processMessage(runtime, msg({ text: 'me conta uma piada' }))
    expect(r.kind).toBe('unknown')
    expect(r.text).toContain('consultar vendas')
    expect(r.text).toContain('create_sale')
  })
})

describe('processMessage — confirmacao (RF-103, RF-104)', () => {
  const venda = {
    items: [{ productId: 'p-azul', quantity: 2, unitPriceCents: 4_990 }],
    payments: [{ method: 'pix' as const, amountCents: 9_980 }],
  }

  it('nao grava venda antes do sim', async () => {
    let chamadas = 0
    const llm = new FakeLlm()
    llm.script('venda pro joao', { type: 'tool', name: 'create_sale', args: venda })
    const runtime = createAgentRuntime({
      useCases: casos({
        registerSale: async (_ctx, input: CreateSaleInput) => {
          chamadas += 1
          expect(input.items[0]?.productId).toBe('p-azul')
          return casos().registerSale(_ctx, input)
        },
      }),
      llm,
    })

    const pedido = await processMessage(runtime, msg({ text: 'venda pro joao' }))
    expect(pedido.kind).toBe('confirmation')
    expect(pedido.text).toMatch(/Confirma\?/)
    expect(chamadas).toBe(0)

    const feito = await processMessage(runtime, msg({ text: 'sim' }))
    expect(feito.kind).toBe('answer')
    expect(feito.text).toContain('#1042')
    expect(chamadas).toBe(1)
  })

  it('recusa ambigua conta como nao — RF-104', async () => {
    let chamadas = 0
    const llm = new FakeLlm()
    llm.script('cadastra o joao', {
      type: 'tool',
      name: 'create_customer',
      args: { name: 'Joao', phone: '11988887777' },
    })
    const runtime = createAgentRuntime({
      useCases: casos({
        registerCustomer: async (c, i) => {
          chamadas += 1
          return casos().registerCustomer(c, i)
        },
      }),
      llm,
    })

    await processMessage(runtime, msg({ text: 'cadastra o joao' }))
    const r = await processMessage(runtime, msg({ text: 'talvez depois' }))
    expect(r.text).toMatch(/cancelei/i)
    expect(chamadas).toBe(0)
  })

  it('expira e nao executa', async () => {
    let chamadas = 0
    const llm = new FakeLlm()
    llm.script('cadastra o joao', {
      type: 'tool',
      name: 'create_customer',
      args: { name: 'Joao' },
    })
    const runtime = createAgentRuntime({
      useCases: casos({
        registerCustomer: async (c, i) => {
          chamadas += 1
          return casos().registerCustomer(c, i)
        },
      }),
      llm,
      confirmationTtlMs: 1_000,
    })

    await processMessage(runtime, msg({ text: 'cadastra o joao' }))
    const depois = new Date(agora.getTime() + 5_000)
    const r = await processMessage(runtime, msg({ text: 'sim', now: depois }))
    expect(r.text).toMatch(/expirou/i)
    expect(chamadas).toBe(0)
  })
})

describe('processMessage — WhatsApp sem vinculo (RF-095)', () => {
  it('ignora numero desconhecido sem vazar informacao', async () => {
    const runtime = createAgentRuntime({
      useCases: casos(),
      peers: { resolve: async () => null },
    })
    const r = await processMessage(runtime, {
      text: 'quanto vendi hoje?',
      requestId: 'req-w',
      now: agora,
      channel: 'whatsapp',
      peer: '5511999990000',
    })
    expect(r.kind).toBe('ignored')
    expect(r.text).toBe('')
  })

  it('atende numero vinculado', async () => {
    const runtime = createAgentRuntime({
      useCases: casos(),
      peers: {
        resolve: async () => ({ companyId: 'emp-1', userId: 'user-1', role: 'owner' }),
      },
    })
    const r = await processMessage(runtime, {
      text: 'quanto vendi hoje?',
      requestId: 'req-w',
      now: agora,
      channel: 'whatsapp',
      peer: '5511999990000',
    })
    expect(r.kind).toBe('answer')
    expect(r.text).toContain('3 vendas')
  })
})

describe('processMessage — produto ambiguo (RF-102)', () => {
  it('lista opcoes em vez de escolher', async () => {
    const llm = new FakeLlm()
    llm.script('camiseta m', { type: 'tool', name: 'search_products', args: { q: 'camiseta' } })
    const runtime = createAgentRuntime({ useCases: casos(), llm })
    const r = await processMessage(runtime, msg({ text: 'camiseta m' }))
    expect(r.text).toMatch(/mais de um/i)
    expect(r.text).toContain('azul')
    expect(r.text).toContain('branca')
  })
})

describe('processMessage — desfechos restantes', () => {
  it('resume o mes pelo reconhecidor', async () => {
    const runtime = createAgentRuntime({ useCases: casos() })
    const r = await processMessage(runtime, msg({ text: 'resumo do mes' }))
    expect(r.kind).toBe('answer')
    expect(r.text).toContain('Faturamento liquido')
    expect(r.text).toContain('2026-09-01')
  })

  it('pede esclarecimento quando o modelo so fala', async () => {
    const llm = new FakeLlm()
    llm.script('oi', { type: 'text', text: 'Qual o periodo?' })
    const runtime = createAgentRuntime({ useCases: casos(), llm })
    const r = await processMessage(runtime, msg({ text: 'oi' }))
    expect(r.kind).toBe('clarify')
    expect(r.text).toBe('Qual o periodo?')
  })

  it('cancela com nao e nao grava', async () => {
    let chamadas = 0
    const llm = new FakeLlm()
    llm.script('cadastra o joao', { type: 'tool', name: 'create_customer', args: { name: 'Joao' } })
    const runtime = createAgentRuntime({
      useCases: casos({
        registerCustomer: async (c, i) => {
          chamadas += 1
          return casos().registerCustomer(c, i)
        },
      }),
      llm,
    })
    await processMessage(runtime, msg({ text: 'cadastra o joao' }))
    const r = await processMessage(runtime, msg({ text: 'nao' }))
    expect(r.text).toMatch(/Cancelado/)
    expect(chamadas).toBe(0)
  })

  it('expirada com pedido novo reprocessa a mensagem', async () => {
    const llm = new FakeLlm()
    llm.script('cadastra o joao', { type: 'tool', name: 'create_customer', args: { name: 'Joao' } })
    const runtime = createAgentRuntime({
      useCases: casos(),
      llm,
      confirmationTtlMs: 1_000,
    })
    await processMessage(runtime, msg({ text: 'cadastra o joao' }))
    const depois = new Date(agora.getTime() + 5_000)
    const r = await processMessage(runtime, msg({ text: 'quanto vendi hoje?', now: depois }))
    expect(r.kind).toBe('answer')
    expect(r.text).toContain('3 vendas')
  })

  it('recusa argumentos invalidos da tool de escrita', async () => {
    const llm = new FakeLlm()
    llm.script('vende', { type: 'tool', name: 'create_sale', args: {} })
    const runtime = createAgentRuntime({ useCases: casos(), llm })
    const r = await processMessage(runtime, msg({ text: 'vende' }))
    expect(r.kind).toBe('clarify')
    expect(r.text).toMatch(/entender os dados/i)
  })

  it('ignora tool que nao existe no catalogo', async () => {
    const llm = new FakeLlm()
    llm.script('x', { type: 'tool', name: 'explodir', args: {} })
    const runtime = createAgentRuntime({ useCases: casos(), llm })
    const r = await processMessage(runtime, msg({ text: 'x' }))
    expect(r.kind).toBe('unknown')
  })

  it('traduz AppError do caso de uso', async () => {
    const runtime = createAgentRuntime({
      useCases: casos({
        listSales: async () => {
          throw AppError.validation('Periodo invalido.', [
            { path: 'from', message: 'depois do fim' },
          ])
        },
      }),
    })
    const r = await processMessage(runtime, msg())
    expect(r.kind).toBe('clarify')
    expect(r.text).toContain('Periodo invalido')
    expect(r.text).toContain('from')
  })

  it('nao vaza erro interno', async () => {
    const runtime = createAgentRuntime({
      useCases: casos({
        listSales: async () => {
          throw new Error('ECONNREFUSED')
        },
      }),
    })
    const r = await processMessage(runtime, msg())
    expect(r.text).toMatch(/tente de novo/i)
    expect(r.text).not.toContain('ECONNREFUSED')
  })

  it('lista vazia de produto', async () => {
    const llm = new FakeLlm()
    llm.script('xyz', { type: 'tool', name: 'search_products', args: { q: 'xyz' } })
    const runtime = createAgentRuntime({ useCases: casos(), llm })
    const r = await processMessage(runtime, msg({ text: 'xyz' }))
    expect(r.text).toMatch(/Nenhum produto/)
  })

  it('ignora WhatsApp sem diretorio de numeros', async () => {
    const runtime = createAgentRuntime({ useCases: casos() })
    const r = await processMessage(runtime, {
      text: 'quanto vendi hoje?',
      requestId: 'req-w',
      now: agora,
      channel: 'whatsapp',
      peer: '5511999990000',
    })
    expect(r.kind).toBe('ignored')
  })
})

describe('FakeLlm', () => {
  it('roteiro ganha de palavra-chave', async () => {
    const llm = new FakeLlm()
    llm.script('quanto vendi hoje?', { type: 'unknown' })
    const d = await llm.decide({
      text: 'quanto vendi hoje?',
      tools: [{ id: 'list_sales', description: '', inputSchema: {} as never, mutatesValue: false }],
      today: '2026-09-11',
    })
    expect(d).toEqual({ type: 'unknown' })
  })

  it('reconhece sim e nao compactos', () => {
    expect(eSim('Sim!')).toBe(true)
    expect(eNao('cancela')).toBe(true)
    expect(eSim('talvez')).toBe(false)
  })
})
