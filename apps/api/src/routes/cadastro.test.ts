import type { CompanyOutput, CustomerOutput, ProductOutput } from '@na-regua/contracts'
import type {
  CompanyRepository,
  CustomerRepository,
  NewCustomer,
  NewProduct,
  ProductRepository,
} from '@na-regua/core'
import {
  InMemoryAuditTrail,
  InMemoryChartOfAccounts,
  InMemoryInventory,
  TETO_DO_CATALOGO,
} from '@na-regua/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import type { AuthenticatedPrincipal } from '../plugins/execution-context.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { type CadastroDeps, registerCadastroRoutes } from './cadastro.js'

const PRINCIPAL: AuthenticatedPrincipal = {
  companyId: 'empresa-1',
  userId: 'usuario-1',
  role: 'owner',
}

function cadastroEmMemoria() {
  const empresas: CompanyOutput[] = []
  const clientes: (CustomerOutput & { companyId: string })[] = []
  const produtos: (ProductOutput & { companyId: string })[] = []
  let seq = 0

  const companies: CompanyRepository = {
    create: async (c) => {
      seq += 1
      const e: CompanyOutput = {
        id: `emp-${seq}`,
        legalName: c.legalName,
        tradeName: c.tradeName ?? c.legalName,
        cnpj: c.cnpj,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt.toISOString(),
      }
      empresas.push(e)
      return e
    },
    cnpjTaken: async (cnpj) => empresas.some((e) => e.cnpj === cnpj),
  }

  const customers: CustomerRepository = {
    create: async (c: NewCustomer) => {
      seq += 1
      const cl = {
        id: `cli-${seq}`,
        companyId: c.companyId,
        name: c.name,
        document: c.document ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        notes: c.notes ?? null,
        walletLimitCents: c.walletLimitCents ?? 0,
        walletBalanceCents: 0,
        createdAt: c.createdAt.toISOString(),
      }
      clientes.push(cl)
      return cl
    },
    /* O falso nao guarda venda: o historico volta zerado, e isso e honesto —
       quem testa a ROTA testa paginacao e filtro, nao a agregacao de compras,
       que so o banco faz. */
    list: async (companyId, criterio) => {
      const termo = criterio.termo?.toLowerCase() ?? ''
      const casam = clientes
        .filter((c) => c.companyId === companyId)
        .filter((c) => termo === '' || c.name.toLowerCase().includes(termo))
        .sort((a, b) => a.name.localeCompare(b.name))

      return {
        total: casam.length,
        clientes: casam
          .slice(criterio.offset, criterio.offset + criterio.limite)
          .map((c) => ({ ...c, lastSaleOn: null, salesCount: 0, totalSpentCents: 0 })),
      }
    },

    findSimilar: async (companyId, criteria) =>
      criteria.phone === undefined && criteria.document === undefined
        ? []
        : clientes.filter(
            (c) =>
              c.companyId === companyId &&
              ((criteria.phone !== undefined && c.phone === criteria.phone) ||
                (criteria.document !== undefined && c.document === criteria.document)),
          ),
  }

  const inventario = new InMemoryInventory()

  const products: ProductRepository = {
    /* O catalogo do balcao (RF-019). Imita o LIMITE e a ORDEM do repositorio de
       verdade: um falso que devolvesse tudo em qualquer ordem deixaria passar
       um SQL sem `LIMIT` nem `ORDER BY`. */
    search: async (companyId, criterio) => {
      const termo = criterio.termo?.toLowerCase() ?? ''
      return produtos
        .filter((p) => p.companyId === companyId)
        .filter((p) => termo === '' || p.description.toLowerCase().includes(termo))
        .sort((a, b) => a.description.localeCompare(b.description))
        .slice(0, criterio.limite)
    },

    /* O catalogo do backoffice (NR-072). Corta a pagina DEPOIS de contar,
       como o SQL faz: contar sobre a pagina daria `total` sempre igual ao
       tamanho dela, e a tela nunca ofereceria a proxima. */
    listCatalog: async (companyId, criterio) => {
      const termo = criterio.termo?.toLowerCase() ?? ''
      const casam = produtos
        .filter((p) => p.companyId === companyId)
        .filter((p) => termo === '' || p.description.toLowerCase().includes(termo))
        .filter((p) => {
          if (criterio.stock === 'esgotado') return p.stock <= 0
          if (criterio.stock === 'baixo') return p.stock > 0 && p.stock < p.minStock
          return true
        })
        .sort((a, b) => a.description.localeCompare(b.description))

      return {
        total: casam.length,
        produtos: casam.slice(criterio.offset, criterio.offset + criterio.limite),
      }
    },

    catalogSummary: async (companyId) => {
      const meus = produtos.filter((p) => p.companyId === companyId)
      return {
        total: meus.length,
        belowMinimum: meus.filter((p) => p.stock < p.minStock).length,
        outOfStock: meus.filter((p) => p.stock <= 0).length,
        stockValueCents: meus.reduce((acc, p) => acc + p.stock * p.costPriceCents, 0),
      }
    },

    create: async (p: NewProduct) => {
      seq += 1
      const pr = {
        id: `prod-${seq}`,
        companyId: p.companyId,
        description: p.description,
        barcode: p.barcode ?? null,
        internalCode: p.internalCode,
        unitOfMeasure: p.unitOfMeasure,
        salePriceCents: p.salePriceCents,
        costPriceCents: p.costPriceCents,
        taxRate: p.taxRate ?? null,
        ncm: p.ncm,
        cfop: p.cfop,
        taxSituationCode: p.taxSituationCode,
        stock: 0,
        minStock: p.minStock,
        categoryId: p.categoryId ?? null,
      }
      produtos.push(pr)

      /* Costura os dois falsos: em producao o cadastro e o estoque falam da
         MESMA tabela `products`, e sem isto o saldo inicial da importacao
         cairia em "produto nao encontrado" — erro do teste, nao do codigo. */
      inventario.adicionarProduto(p.companyId, {
        id: pr.id,
        description: pr.description,
        salePriceCents: pr.salePriceCents,
        stockQuantity: 0,
        location: null,
        minStock: pr.minStock,
      })

      return pr
    },
    /* Filtra por empresa de verdade: um falso que ignorasse isso faria o teste
       de isolamento medir o vazio. */
    findByBarcode: async (companyId, barcode) =>
      produtos.find((p) => p.companyId === companyId && p.barcode === barcode),
    countAll: async (companyId) => produtos.filter((p) => p.companyId === companyId).length,
  }

  /* O onboarding semeia o plano de contas (RF-081, NR-077), entao a rota
     precisa da porta. Falso de verdade, e nao um objeto vazio: assim o teste
     do 201 prova que a semeadura roda, em vez de so nao explodir. */
  const accounts = new InMemoryChartOfAccounts()

  /*
   * O estoque entra porque a IMPORTACAO grava saldo inicial, e saldo so muda
   * por movimento (RF-124). Em producao o cadastro e o estoque falam da mesma
   * tabela `products`; aqui sao dois falsos, e o `create` acima ja registra
   * cada produto novo no inventario para costura-los.
   */
  const uow = inventario
  const audit = new InMemoryAuditTrail()

  return {
    companies,
    customers,
    products,
    accounts,
    uow,
    audit,
    empresas,
    clientes,
    produtos,
    inventario,
  }
}

async function buildApp(principal: AuthenticatedPrincipal | null = PRINCIPAL) {
  const memoria = cadastroEmMemoria()
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRateLimit(app)
  app.addHook('onRequest', async (request) => {
    if (principal !== null) request.principal = principal
  })
  registerCadastroRoutes(app, memoria as unknown as CadastroDeps)
  return { app, memoria }
}

let app: FastifyInstance

afterEach(async () => {
  await app?.close()
})

const EMPRESA = {
  legalName: 'Mercearia Sol Nascente LTDA',
  cnpj: '11222333000181',
  email: 'contato@sol.local',
  phone: '41999990000',
}

describe('cadastrar empresa — RF-001, RF-002', () => {
  it('cria e responde 201', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'POST', url: '/empresas', payload: EMPRESA })

    expect(r.statusCode).toBe(201)
    expect(r.json().cnpj).toBe('11222333000181')
  })

  /**
   * RF-002 pede recusar CNPJ repetido "sem revelar dados da empresa existente".
   * A mensagem nao pode trazer razao social — quem digitou so um numero nao
   * deveria descobrir de quem ele e.
   */
  it('recusa CNPJ repetido sem revelar a empresa existente', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/empresas', payload: EMPRESA })

    const r = await app.inject({
      method: 'POST',
      url: '/empresas',
      payload: { ...EMPRESA, legalName: 'Outra Razao Social LTDA' },
    })

    expect(r.statusCode).toBe(409)
    expect(JSON.stringify(r.json())).not.toContain('Sol Nascente')
  })

  it('CNPJ invalido responde 400', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/empresas',
      payload: { ...EMPRESA, cnpj: '11111111111111' },
    })

    expect(r.statusCode).toBe(400)
  })

  it('sem sessao responde 401', async () => {
    const c = await buildApp(null)
    app = c.app

    expect(
      (await app.inject({ method: 'POST', url: '/empresas', payload: EMPRESA })).statusCode,
    ).toBe(401)
  })
})

/**
 * O ponto mais interessante do cadastro: duplicado NAO e erro, e resposta.
 *
 * A decisao de reusar o existente e de quem esta no balcao, com o cliente na
 * frente — recusar automaticamente travaria o cadastro de dois irmaos com o
 * telefone de casa, que acontece.
 */
describe('cadastrar cliente — RF-009, RF-010', () => {
  const CLIENTE = { name: 'Dona Marta', phone: '41988887777' }

  it('cria com apenas nome — RF-009', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'POST', url: '/clientes', payload: { name: 'Marta' } })

    expect(r.statusCode).toBe(201)
  })

  it('telefone repetido responde 409 COM os candidatos', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/clientes', payload: CLIENTE })

    const r = await app.inject({
      method: 'POST',
      url: '/clientes',
      payload: { name: 'Marta Souza', phone: '41988887777' },
    })

    expect(r.statusCode).toBe(409)
    expect(r.json().candidates).toHaveLength(1)
    expect(r.json().candidates[0].name).toBe('Dona Marta')
  })

  /* Os candidatos vao FORA do envelope de erro: nao sao detalhe do erro, sao a
     informacao que permite decidir. */
  it('os candidatos nao ficam dentro do envelope de erro', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/clientes', payload: CLIENTE })

    const r = await app.inject({ method: 'POST', url: '/clientes', payload: CLIENTE })

    expect(r.json().error.candidates).toBeUndefined()
    expect(r.json().candidates).toBeDefined()
  })

  it('quem decidiu reenvia com ?duplicado=permitir e cadastra', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/clientes', payload: CLIENTE })

    const r = await app.inject({
      method: 'POST',
      url: '/clientes?duplicado=permitir',
      payload: { name: 'Marta Souza', phone: '41988887777' },
    })

    expect(r.statusCode).toBe(201)
    expect(c.memoria.clientes).toHaveLength(2)
  })

  it('cliente sem telefone nem documento nao dispara busca de duplicado', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/clientes', payload: { name: 'Joao' } })

    const r = await app.inject({ method: 'POST', url: '/clientes', payload: { name: 'Joao' } })

    expect(r.statusCode).toBe(201)
  })

  it('accountant recebe 403', async () => {
    const c = await buildApp({ ...PRINCIPAL, role: 'accountant' })
    app = c.app

    expect(
      (await app.inject({ method: 'POST', url: '/clientes', payload: CLIENTE })).statusCode,
    ).toBe(403)
  })
})

describe('cadastrar produto — RF-017, RF-019', () => {
  const PRODUTO = {
    description: 'Cafe torrado 500g',
    unitOfMeasure: 'un' as const,
    salePriceCents: 1990,
    costPriceCents: 1200,
  }

  it('cria e responde 201', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'POST', url: '/produtos', payload: PRODUTO })

    expect(r.statusCode).toBe(201)
  })

  /* RF-019: sem codigo de barras, `core` gera o interno. A rota nao participa
     disso — se participasse, o canal WhatsApp geraria outro formato. */
  it('sem codigo de barras, ganha codigo interno', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'POST', url: '/produtos', payload: PRODUTO })

    expect(r.json().internalCode).toBeTruthy()
    expect(r.json().barcode).toBeNull()
  })

  it('preco negativo responde 400', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/produtos',
      payload: { ...PRODUTO, salePriceCents: -1 },
    })

    expect(r.statusCode).toBe(400)
  })
})

describe('localizar por codigo de barras — RF-018', () => {
  const COM_CODIGO = {
    description: 'Arroz 5kg',
    barcode: '7891234567895',
    unitOfMeasure: 'un' as const,
    salePriceCents: 2890,
    costPriceCents: 2100,
  }

  it('devolve o produto lido', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/produtos', payload: COM_CODIGO })

    const r = await app.inject({ method: 'GET', url: '/produtos/codigo-de-barras/7891234567895' })

    expect(r.statusCode).toBe(200)
    expect(r.json().description).toBe('Arroz 5kg')
  })

  /* 404 e nao lista vazia: o balcao precisa distinguir "nao existe" de "existe
     e esta zerado" — a segunda e cadastro feito, a primeira e cadastro a
     fazer. */
  it('codigo desconhecido responde 404, nao lista vazia', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/produtos/codigo-de-barras/0000000000000' })

    expect(r.statusCode).toBe(404)
  })

  it('produto de outra empresa responde 404', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/produtos', payload: COM_CODIGO })
    await app.close()

    const outra = await buildApp({ ...PRINCIPAL, companyId: 'empresa-2' })
    app = outra.app

    const r = await app.inject({ method: 'GET', url: '/produtos/codigo-de-barras/7891234567895' })

    expect(r.statusCode).toBe(404)
  })

  /* Somente leitura nao e sem acesso — o contador confere cadastro. */
  it('accountant consulta', async () => {
    const c = await buildApp({ ...PRINCIPAL, role: 'accountant' })
    app = c.app

    expect(
      (await app.inject({ method: 'GET', url: '/produtos/codigo-de-barras/0000000000000' }))
        .statusCode,
    ).toBe(404)
  })
})

describe('catalogo do balcao — RF-019', () => {
  const CAFE = {
    description: 'Cafe torrado 500g',
    unitOfMeasure: 'un' as const,
    salePriceCents: 1990,
    costPriceCents: 1200,
  }
  const ACUCAR = {
    description: 'Acucar refinado 1kg',
    unitOfMeasure: 'un' as const,
    salePriceCents: 599,
    costPriceCents: 400,
  }

  async function comCatalogo() {
    const c = await buildApp()
    app = c.app
    await app.inject({ method: 'POST', url: '/produtos', payload: CAFE })
    await app.inject({ method: 'POST', url: '/produtos', payload: ACUCAR })
    return c
  }

  it('sem termo, devolve o catalogo — e o estado em que o PDV abre', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos' })

    expect(r.statusCode).toBe(200)
    expect(r.json().products).toHaveLength(2)
  })

  it('ordena por descricao, para a lista nao dancar entre buscas iguais', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos' })

    expect(r.json().products.map((p: { description: string }) => p.description)).toEqual([
      'Acucar refinado 1kg',
      'Cafe torrado 500g',
    ])
  })

  it('filtra pelo termo, sem depender da caixa', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos?q=CAFE' })

    expect(r.json().products).toHaveLength(1)
    expect(r.json().products[0].description).toBe('Cafe torrado 500g')
  })

  it('nada encontrado e lista VAZIA, e nao 404', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos?q=bicicleta' })

    /*
     * Aqui e busca sobre colecao: "nenhum produto com esse nome" e uma
     * resposta. O 404 fica para o codigo de barras, onde nao achar significa
     * "existe no mundo e falta cadastrar" — e o balcao age diferente nos dois.
     */
    expect(r.statusCode).toBe(200)
    expect(r.json().products).toEqual([])
  })

  it('nao passa do teto, mesmo se pedirem mais', async () => {
    const c = await comCatalogo()
    app = c.app

    const r = await app.inject({ method: 'GET', url: `/produtos?limite=${TETO_DO_CATALOGO + 500}` })

    /* O teto e decisao de produto e mora em `core`: na rota, cada cliente novo
       — mobile, assistente — escolheria o seu. Quem pede pode reduzir. */
    expect(r.json().products.length).toBeLessThanOrEqual(TETO_DO_CATALOGO)
  })

  it('sem sessao, 401', async () => {
    const c = await buildApp(null)
    app = c.app

    expect((await app.inject({ method: 'GET', url: '/produtos' })).statusCode).toBe(401)
  })
})

describe('catalogo do backoffice — NR-072, US-008', () => {
  const produto = (description: string, salePriceCents: number) => ({
    description,
    unitOfMeasure: 'un' as const,
    salePriceCents,
    costPriceCents: 400,
  })

  async function comCatalogo() {
    const c = await buildApp()
    app = c.app
    for (const d of ['Acucar', 'Biscoito', 'Cafe', 'Detergente', 'Erva-mate']) {
      await app.inject({ method: 'POST', url: '/produtos', payload: produto(d, 1000) })
    }
    return c
  }

  it('devolve a pagina com o total do catalogo, e nao o tamanho da pagina', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos/catalogo?pageSize=2' })

    expect(r.statusCode).toBe(200)
    expect(r.json().products).toHaveLength(2)
    /* CINCO. E o que faz a tela dizer "2 de 5" e oferecer a proxima pagina. */
    expect(r.json().total).toBe(5)
  })

  it('converte pagina e tamanho, que chegam como TEXTO na query', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos/catalogo?page=2&pageSize=2' })

    /* Numeros, e nao "2": um OFFSET com texto passaria aqui e explodiria no
       banco. E o `page` ecoado prova que a rota nao caiu no padrao. */
    expect(r.json().page).toBe(2)
    expect(r.json().pageSize).toBe(2)
    expect(r.json().products.map((p: { description: string }) => p.description)).toEqual([
      'Cafe',
      'Detergente',
    ])
  })

  it('usa o padrao quando ninguem pede pagina', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos/catalogo' })

    expect(r.json().page).toBe(1)
    expect(r.json().pageSize).toBe(24)
  })

  it('recusa pagina acima do teto em vez de varrer o catalogo inteiro', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos/catalogo?pageSize=5000' })

    expect(r.statusCode).toBe(400)
  })

  it('nao confunde /produtos/catalogo com /produtos/codigo-de-barras/:codigo', async () => {
    await comCatalogo()

    /* As duas sao GET sob `/produtos/`. Se a rota de codigo de barras casasse
       primeiro, "catalogo" viraria um codigo procurado e a tela receberia 404
       em vez do catalogo. */
    const r = await app.inject({ method: 'GET', url: '/produtos/catalogo' })

    expect(r.statusCode).toBe(200)
    expect(r.json().products).toHaveLength(5)
  })

  it('o resumo fala do catalogo inteiro', async () => {
    await comCatalogo()

    const r = await app.inject({ method: 'GET', url: '/produtos/resumo' })

    expect(r.statusCode).toBe(200)
    expect(r.json().total).toBe(5)
    /* Produto nasce com estoque zero — o saldo so muda por movimento (NR-023).
       Entao os cinco estao esgotados, e o valor parado e zero. */
    expect(r.json().outOfStock).toBe(5)
    expect(r.json().stockValueCents).toBe(0)
  })
})

describe('importacao de catalogo — NR-072, US-008', () => {
  const linha = (description: string, over: Record<string, unknown> = {}) => ({
    description,
    unitOfMeasure: 'un',
    salePriceCents: 1000,
    costPriceCents: 400,
    ...over,
  })

  it('importa o lote e devolve 200, e nao 201', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/produtos/importacao',
      payload: { products: [linha('Cafe'), linha('Acucar')] },
    })

    /*
     * 200 e nao 201 porque o lote pode ter entrado inteiro, pela metade ou
     * nada — e 201 diria "criei" para um pedido em que talvez nada tenha sido
     * criado.
     */
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ imported: 2, rejected: [] })
  })

  it('recusa a linha ruim e importa o resto, dizendo qual falhou', async () => {
    const c = await buildApp()
    app = c.app

    await app.inject({
      method: 'POST',
      url: '/produtos',
      payload: linha('Ja existe', { barcode: '7891234567895' }),
    })

    const r = await app.inject({
      method: 'POST',
      url: '/produtos/importacao',
      payload: {
        products: [linha('Cafe'), linha('Repetido', { barcode: '7891234567895' })],
      },
    })

    expect(r.json().imported).toBe(1)
    expect(r.json().rejected).toHaveLength(1)
    expect(r.json().rejected[0]).toMatchObject({ index: 1, description: 'Repetido' })
  })

  it('grava o saldo inicial como movimento de estoque', async () => {
    const c = await buildApp()
    app = c.app

    await app.inject({
      method: 'POST',
      url: '/produtos/importacao',
      payload: { products: [linha('Cafe', { stock: 40 })] },
    })

    /* Movimento, e nao coluna escrita direto: o saldo e consequencia da trilha
       (RF-124). Antes disto, `stock` era aceito e descartado em silencio. */
    expect(c.memoria.inventario.movimentos).toHaveLength(1)
    expect(c.memoria.inventario.movimentos[0]).toMatchObject({
      quantityDelta: 40,
      balanceAfter: 40,
    })
  })

  it('recusa forma invalida no contrato, antes de tocar em qualquer linha', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/produtos/importacao',
      /* Preco de venda abaixo do custo: quem recusa e o contrato, e a recusa
         vale para o lote inteiro — forma errada nao e "linha ignorada". */
      payload: { products: [linha('Prejuizo', { salePriceCents: 100, costPriceCents: 900 })] },
    })

    expect(r.statusCode).toBe(400)
    expect(c.memoria.produtos).toHaveLength(0)
  })

  it('recusa lote acima do teto', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/produtos/importacao',
      payload: { products: Array.from({ length: 501 }, (_, i) => linha(`P${i}`)) },
    })

    expect(r.statusCode).toBe(400)
  })

  it('recusa lote vazio em vez de responder "importei zero"', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/produtos/importacao',
      payload: { products: [] },
    })

    expect(r.statusCode).toBe(400)
  })
})
