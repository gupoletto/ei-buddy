import type {
  CompanyOutput,
  CustomerListItem,
  CustomerOutput,
  ProductOutput,
} from '@na-regua/contracts'
import type { CompanyId } from '../context.js'
import type {
  CompanyRepository,
  CustomerRepository,
  NewCompany,
  NewCustomer,
  NewProduct,
  ProductRepository,
} from '../ports/registration-repositories.js'

/**
 * Repositorios em memoria para teste dos casos de uso de cadastro.
 *
 * Aplicam o filtro por empresa **de verdade**, como os da agenda: sem isso, um
 * caso de uso que esquecesse o `companyId` passaria no teste e vazaria dado em
 * producao. O falso que so guarda e devolve nao protege de nada.
 */

export class InMemoryCompanyRepository implements CompanyRepository {
  readonly registros = new Map<string, CompanyOutput>()
  private sequencia = 0

  async create(company: NewCompany): Promise<CompanyOutput> {
    this.sequencia += 1
    const gravada: CompanyOutput = {
      id: `emp-${this.sequencia}`,
      legalName: company.legalName,
      /* O output nao tem nome fantasia opcional: sem ele, o proprio nome
         cumpre o papel na tela. */
      tradeName: company.tradeName ?? company.legalName,
      cnpj: company.cnpj,
      email: company.email,
      phone: company.phone,
      createdAt: company.createdAt.toISOString(),
    }
    this.registros.set(gravada.id, gravada)
    return gravada
  }

  async cnpjTaken(cnpj: string): Promise<boolean> {
    /* Atravessa tenants de proposito — um CNPJ e uma empresa no pais inteiro.
       Devolve apenas se existe, nunca a linha (RF-002). */
    return [...this.registros.values()].some((e) => e.cnpj === cnpj)
  }
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly registros = new Map<string, CustomerOutput & { companyId: CompanyId }>()
  private sequencia = 0

  async create(customer: NewCustomer): Promise<CustomerOutput> {
    this.sequencia += 1
    const gravado = {
      id: `cli-${this.sequencia}`,
      companyId: customer.companyId,
      name: customer.name,
      document: customer.document ?? null,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      notes: customer.notes ?? null,
      walletLimitCents: customer.walletLimitCents ?? 0,
      /* Nao deve nada e zero, nao nulo: nulo obrigaria todo calculo de fiado
         a tratar ausencia. */
      walletBalanceCents: 0,
      createdAt: customer.createdAt.toISOString(),
    }
    this.registros.set(gravado.id, gravado)
    return this.semTenant(gravado)
  }

  async findSimilar(
    companyId: CompanyId,
    criteria: { phone?: string | undefined; document?: string | undefined },
  ): Promise<readonly CustomerOutput[]> {
    if (criteria.phone === undefined && criteria.document === undefined) return []

    return [...this.registros.values()]
      .filter((c) => c.companyId === companyId)
      .filter(
        (c) =>
          (criteria.phone !== undefined && c.phone === criteria.phone) ||
          (criteria.document !== undefined && c.document === criteria.document),
      )
      .map((c) => this.semTenant(c))
  }

  /** `companyId` nao sai do repositorio: e do contexto, nao da resposta. */
  /**
   * A lista, com o historico que a tela mostra.
   *
   * O falso NAO guarda venda, entao o historico volta zerado — e isso e
   * honesto: quem testa a lista com este falso esta testando a paginacao, o
   * filtro e o isolamento, e nao a agregacao de compras, que so o banco faz.
   *
   * Corta a pagina DEPOIS de contar, como o SQL: contar sobre a pagina daria
   * `total` sempre igual ao tamanho dela, e a tela nunca ofereceria a proxima.
   */
  async list(
    companyId: CompanyId,
    criterio: {
      readonly termo?: string
      readonly filtro: 'todos' | 'inativos' | 'fiado'
      readonly diasParaInativo: number
      readonly hoje: Date
      readonly offset: number
      readonly limite: number
    },
  ): Promise<{ readonly clientes: readonly CustomerListItem[]; readonly total: number }> {
    const termo = criterio.termo?.trim().toLowerCase() ?? ''

    const casam = [...this.registros.values()]
      .filter((c) => c.companyId === companyId)
      .filter(
        (c) =>
          termo === '' ||
          c.name.toLowerCase().includes(termo) ||
          (c.document ?? '').includes(termo) ||
          (c.phone ?? '').includes(termo),
      )
      /* Sem venda no falso, "inativo" e todo mundo e "fiado" e quem tem saldo. */
      .filter((c) => (criterio.filtro === 'fiado' ? c.walletBalanceCents > 0 : true))
      .sort((a, b) => a.name.localeCompare(b.name))

    return {
      total: casam.length,
      clientes: casam.slice(criterio.offset, criterio.offset + criterio.limite).map((c) => ({
        ...this.semTenant(c),
        lastSaleOn: null,
        salesCount: 0,
        totalSpentCents: 0,
      })),
    }
  }

  private semTenant(registro: CustomerOutput & { companyId: CompanyId }): CustomerOutput {
    const { companyId: _omitido, ...resto } = registro
    return resto
  }
}

export class InMemoryProductRepository implements ProductRepository {
  private readonly registros = new Map<string, ProductOutput & { companyId: CompanyId }>()
  private sequencia = 0

  async create(product: NewProduct): Promise<ProductOutput> {
    this.sequencia += 1
    const gravado = {
      id: `prod-${this.sequencia}`,
      companyId: product.companyId,
      description: product.description,
      barcode: product.barcode ?? null,
      internalCode: product.internalCode,
      unitOfMeasure: product.unitOfMeasure,
      salePriceCents: product.salePriceCents,
      costPriceCents: product.costPriceCents,
      taxRate: product.taxRate ?? null,
      ncm: product.ncm,
      cfop: product.cfop,
      taxSituationCode: product.taxSituationCode,
      stock: 0,
      minStock: product.minStock,
      categoryId: product.categoryId ?? null,
    }
    this.registros.set(gravado.id, gravado)
    return this.semTenant(gravado)
  }

  async findByBarcode(companyId: CompanyId, barcode: string): Promise<ProductOutput | undefined> {
    const achado = [...this.registros.values()].find(
      (p) => p.companyId === companyId && p.barcode === barcode,
    )
    /* De outra empresa e o mesmo que inexistente. */
    return achado ? this.semTenant(achado) : undefined
  }

  /**
   * Busca por descricao ou codigo, sem depender de caixa.
   *
   * O falso imita o LIMITE e a ORDEM do repositorio de verdade. Um falso que
   * devolvesse tudo, em qualquer ordem, deixaria passar um SQL sem `LIMIT` —
   * e o defeito so apareceria na loja com catalogo grande, que e a que menos
   * pode travar.
   */
  async search(
    companyId: CompanyId,
    criterio: { readonly termo?: string; readonly limite: number },
  ): Promise<readonly ProductOutput[]> {
    const termo = criterio.termo?.trim().toLowerCase() ?? ''

    return [...this.registros.values()]
      .filter((p) => p.companyId === companyId)
      .filter(
        (p) =>
          termo === '' ||
          p.description.toLowerCase().includes(termo) ||
          p.internalCode.toLowerCase().includes(termo) ||
          (p.barcode ?? '').includes(termo),
      )
      .sort((a, b) => a.description.localeCompare(b.description))
      .slice(0, criterio.limite)
      .map((p) => this.semTenant(p))
  }

  /**
   * O catalogo paginado, com o total que casa com o filtro.
   *
   * O falso corta a pagina DEPOIS de contar, como o SQL faz. Contar sobre a
   * pagina daria `total` igual a `products.length` sempre — e a tela mostraria
   * "24 de 24" para uma loja com 300 produtos, sem nunca oferecer a proxima
   * pagina. Um falso que erra assim faz o teste concordar com o defeito.
   */
  async listCatalog(
    companyId: CompanyId,
    criterio: {
      readonly termo?: string
      readonly stock: 'todos' | 'baixo' | 'esgotado'
      readonly offset: number
      readonly limite: number
    },
  ): Promise<{ readonly produtos: readonly ProductOutput[]; readonly total: number }> {
    const termo = criterio.termo?.trim().toLowerCase() ?? ''

    const casam = [...this.registros.values()]
      .filter((p) => p.companyId === companyId)
      .filter(
        (p) =>
          termo === '' ||
          p.description.toLowerCase().includes(termo) ||
          p.internalCode.toLowerCase().includes(termo) ||
          (p.barcode ?? '').includes(termo),
      )
      .filter((p) => {
        if (criterio.stock === 'esgotado') return p.stock <= 0
        if (criterio.stock === 'baixo') return p.stock > 0 && p.stock < p.minStock
        return true
      })
      .sort((a, b) => a.description.localeCompare(b.description))

    return {
      total: casam.length,
      produtos: casam
        .slice(criterio.offset, criterio.offset + criterio.limite)
        .map((p) => this.semTenant(p)),
    }
  }

  async catalogSummary(companyId: CompanyId): Promise<{
    readonly total: number
    readonly belowMinimum: number
    readonly outOfStock: number
    readonly stockValueCents: number
  }> {
    const meus = [...this.registros.values()].filter((p) => p.companyId === companyId)

    return {
      total: meus.length,
      /* Abaixo do minimo e ESGOTADO sao contagens diferentes e nao se somam:
         um produto zerado tambem esta abaixo do minimo, e apresenta-los como
         parcelas de um total faria a tela contar o mesmo produto duas vezes. */
      belowMinimum: meus.filter((p) => p.stock < p.minStock).length,
      outOfStock: meus.filter((p) => p.stock <= 0).length,
      stockValueCents: meus.reduce((acc, p) => acc + p.stock * p.costPriceCents, 0),
    }
  }

  /**
   * Ajusta o saldo para os testes de catalogo.
   *
   * Existe porque `NewProduct` NAO tem `stock`, e isso e de proposito: o saldo
   * so muda por movimento de estoque (NR-023). Sem este atalho, testar o filtro
   * de "esgotados" exigiria montar a trilha de movimentos inteira dentro de um
   * teste que nao e sobre ela. Como `semearPadrao` no plano de contas.
   */
  definirEstoque(id: string, quantidade: number): void {
    const registro = this.registros.get(id)
    if (registro === undefined) throw new Error(`produto ${id} nao existe no falso`)
    this.registros.set(id, { ...registro, stock: quantidade })
  }

  async countAll(companyId: CompanyId): Promise<number> {
    return [...this.registros.values()].filter((p) => p.companyId === companyId).length
  }

  private semTenant(registro: ProductOutput & { companyId: CompanyId }): ProductOutput {
    const { companyId: _omitido, ...resto } = registro
    return resto
  }
}
