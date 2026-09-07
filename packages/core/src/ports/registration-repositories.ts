import type {
  Address,
  CompanyOutput,
  CustomerListItem,
  CustomerOutput,
  ProductOutput,
} from '@na-regua/contracts'
import type { CompanyId, UserId } from '../context.js'

/**
 * Portas dos repositorios de cadastro — RF-001 a RF-019.
 *
 * Declaradas aqui, implementadas por `db` — a seta aponta para dentro. Como em
 * `AppointmentRepository`, os tipos podem morar em `core` porque quem implementa
 * e `db`, e `db` tem permissao para importar `core`. As portas de adapter
 * (`fiscal`, `payments`, `whatsapp`) precisam dos tipos em `contracts` por causa
 * da regra `adapter-nao-importa-core`; esta nao.
 *
 * `companyId` aparece em toda assinatura por decisao, nao por descuido: o
 * isolamento nao pode depender de o chamador lembrar de filtrar. Quem implementa
 * aplica o filtro; quem chama nao tem como esquecer. No banco, a segunda
 * barreira e a politica de RLS (ADR-0001) — as duas juntas, porque uma so
 * depende de disciplina.
 */

export type NewCompany = {
  readonly legalName: string
  readonly tradeName?: string | undefined
  /** So digitos, ja normalizado por `contracts`. */
  readonly cnpj: string
  readonly email: string
  readonly phone: string
  readonly createdAt: Date
}

export type CompanyRepository = {
  /**
   * Grava a empresa e devolve o que ficou gravado.
   *
   * O `id` e gerado por quem implementa, e nao recebido: a politica raiz de RLS
   * exige que a empresa nasca sob o proprio tenant, e quem sabe orquestrar isso
   * e `db` (ver packages/db/README.md#tabelas).
   */
  create(company: NewCompany): Promise<CompanyOutput>

  /**
   * Procura por CNPJ, sem escopo de empresa.
   *
   * E a unica consulta do sistema que atravessa tenants, e de proposito: um
   * CNPJ e uma empresa no pais inteiro, e RF-002 pede recusar o repetido. Por
   * isso devolve apenas se EXISTE — nunca a linha. Devolver os dados da
   * empresa existente vazaria razao social e endereco para quem so digitou um
   * numero.
   */
  cnpjTaken(cnpj: string): Promise<boolean>
}

export type NewCustomer = {
  readonly companyId: CompanyId
  readonly name: string
  readonly document?: string | undefined
  readonly phone?: string | undefined
  readonly email?: string | undefined
  readonly notes?: string | undefined
  readonly walletLimitCents?: number | undefined
  readonly createdBy: UserId
  readonly createdAt: Date
  /**
   * O endereco, inteiro opcional — RF-009.
   *
   * Ate a migration 0019 nao havia onde guardar, e a tela descartava os sete
   * campos que pedia.
   */
  readonly address?: Address | undefined
}

export type CustomerRepository = {
  create(customer: NewCustomer): Promise<CustomerOutput>

  /** Um cliente. `undefined` quando nao existe OU e de outra empresa. */
  findById(companyId: CompanyId, customerId: string): Promise<CustomerOutput | undefined>

  /**
   * Procura cliente parecido por telefone ou documento — RF-010.
   *
   * Devolve os candidatos em vez de recusar o cadastro: a decisao de reusar o
   * existente e de quem esta no balcao, com o cliente na frente. Recusar
   * automaticamente travaria a venda de dois irmaos com o mesmo telefone de
   * casa, que acontece.
   */
  findSimilar(
    companyId: CompanyId,
    criteria: { readonly phone?: string | undefined; readonly document?: string | undefined },
  ): Promise<readonly CustomerOutput[]>

  /**
   * A lista da tela, paginada e com o historico de compra — RF-011.
   *
   * O historico vem na MESMA consulta. A tela mostra "ultima compra" em toda
   * linha, e busca-lo por cliente daria vinte e cinco idas ao banco para uma
   * pagina — o problema N+1 na sua forma mais cara, porque cresce com o
   * tamanho da tela.
   *
   * Devolve a pagina E o total que casa com o filtro. Sem o total, pagina cheia
   * e indistinguivel de fim da lista.
   */
  list(
    companyId: CompanyId,
    criterio: {
      readonly termo?: string
      readonly filtro: 'todos' | 'inativos' | 'fiado'
      /** Dias sem comprar que tornam o cliente inativo. Vem de `contracts`. */
      readonly diasParaInativo: number
      readonly hoje: Date
      readonly offset: number
      readonly limite: number
    },
  ): Promise<{ readonly clientes: readonly CustomerListItem[]; readonly total: number }>
}

export type NewProduct = {
  readonly companyId: CompanyId
  readonly description: string
  readonly barcode?: string | undefined
  /** Gerado por `core` quando nao ha codigo de barras — RF-019. */
  readonly internalCode: string
  readonly unitOfMeasure: ProductOutput['unitOfMeasure']
  readonly salePriceCents: number
  readonly costPriceCents: number
  readonly taxRate?: number | undefined
  readonly minStock: number
  readonly categoryId?: string | undefined
  readonly createdBy: UserId
  readonly createdAt: Date
  /* Fiscais — RF-046. Nulos ate o lojista informar. */
  readonly ncm: string | null
  readonly cfop: string | null
  readonly taxSituationCode: string | null
}

export type ProductRepository = {
  create(product: NewProduct): Promise<ProductOutput>

  /** Localiza pelo codigo de barras lido — RF-018. */
  findByBarcode(companyId: CompanyId, barcode: string): Promise<ProductOutput | undefined>

  /**
   * Catalogo para o balcao — RF-019.
   *
   * O `termo` chega ate o SQL de proposito, ao contrario do valor na
   * conciliacao: aqui nao ha regra nenhuma para esconder, e filtrar em memoria
   * significaria carregar o catalogo inteiro a cada tecla digitada. Uma loja de
   * mercearia tem milhares de itens.
   *
   * Sem `deleted_at`: produto apagado nao se vende. O `limite` existe porque
   * a tela mostra uma lista, nao um banco de dados — quem nao achou refina a
   * busca, e devolver dez mil linhas so trava o navegador.
   */
  search(
    companyId: CompanyId,
    criterio: { readonly termo?: string; readonly limite: number },
  ): Promise<readonly ProductOutput[]>

  /**
   * O catalogo do backoffice, paginado — NR-072.
   *
   * Metodo proprio, e nao `search` com mais parametros. O `search` e a busca
   * do BALCAO: teto rigido, sem total, sem filtro de estoque, e o PDV depende
   * desse formato. Somar paginacao nele mudaria o contrato de quem ja usa.
   *
   * Devolve a pagina E o total que casa com o filtro. O total sai da mesma
   * chamada porque e o complemento da pagina: pedi-lo em separado varreria a
   * mesma tabela de novo, e entre as duas leituras um cadastro novo faria a
   * conta "23 de 300" deixar de fechar.
   */
  listCatalog(
    companyId: CompanyId,
    criterio: {
      readonly termo?: string
      readonly stock: 'todos' | 'baixo' | 'esgotado'
      readonly offset: number
      readonly limite: number
    },
  ): Promise<{ readonly produtos: readonly ProductOutput[]; readonly total: number }>

  /**
   * Os numeros do topo da tela, sobre o catalogo INTEIRO.
   *
   * Nao sao somaveis a partir da pagina: "valor em estoque" calculado sobre 24
   * de 300 produtos da um numero que parece certo e erra por um fator de doze
   * — e o lojista decide compra com ele.
   */
  catalogSummary(companyId: CompanyId): Promise<{
    readonly total: number
    readonly belowMinimum: number
    readonly outOfStock: number
    readonly stockValueCents: number
  }>

  /**
   * Quantos produtos a empresa tem, para gerar o proximo codigo interno.
   *
   * Contagem, e nao "proximo codigo": gerar o codigo e regra (o formato), e
   * regra mora em `core`. O repositorio informa o fato.
   */
  countAll(companyId: CompanyId): Promise<number>
}
