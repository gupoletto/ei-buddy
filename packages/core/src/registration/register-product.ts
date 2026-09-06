import type {
  CatalogInput,
  CatalogOutput,
  CatalogSummaryOutput,
  CreateProductInput,
  ProductOutput,
} from '@na-regua/contracts'
import { AppError } from '../app-error.js'
import { assertCanWrite } from '../authorization.js'
import type { ExecutionContext } from '../context.js'
import type { ProductRepository } from '../ports/registration-repositories.js'

export type RegisterProductDeps = {
  readonly products: ProductRepository
}

/**
 * Gera o codigo interno de um produto sem codigo de barras — RF-019.
 *
 * Formato `PROD-0001`, sequencial por empresa. Deliberadamente NAO e o id nem
 * um trecho de uuid: este codigo vai na etiqueta escrita a mao e e ditado no
 * telefone, entao precisa ser curto e sem caractere ambiguo. `a1b2c3` na
 * etiqueta de granel volta como `alb2c3`.
 *
 * A regra do formato vive aqui, em `core`, e nao no repositorio: quem informa o
 * fato (quantos produtos existem) e `db`; quem decide como o codigo se parece e
 * o nucleo.
 */
export function generateInternalCode(existingCount: number): string {
  return `PROD-${String(existingCount + 1).padStart(4, '0')}`
}

/**
 * Cadastra produto — RF-017, RF-018, RF-019.
 *
 * Com codigo de barras: procura antes de criar. Ler um EAN que ja existe e o
 * caso comum de reposicao, e criar um segundo cadastro deixaria a loja com dois
 * precos para o mesmo produto — que e como se descobre o problema, no dia em
 * que o caixa cobra o barato.
 */
export async function registerProduct(
  deps: RegisterProductDeps,
  ctx: ExecutionContext,
  input: CreateProductInput,
): Promise<ProductOutput> {
  assertCanWrite(ctx)

  if (input.barcode !== undefined) {
    const existente = await deps.products.findByBarcode(ctx.companyId, input.barcode)
    if (existente) {
      throw AppError.conflict(
        `Este codigo de barras ja esta em "${existente.description}". ` +
          'Edite o produto existente em vez de criar outro.',
      )
    }
  }

  /*
   * Codigo interno para todo produto, com ou sem codigo de barras: e por ele
   * que o lojista se refere ao item quando o leitor nao le — etiqueta amassada,
   * granel, produto sem embalagem.
   */
  const internalCode = generateInternalCode(await deps.products.countAll(ctx.companyId))

  return deps.products.create({
    companyId: ctx.companyId,
    description: input.description,
    barcode: input.barcode,
    internalCode,
    unitOfMeasure: input.unitOfMeasure,
    salePriceCents: input.salePriceCents,
    costPriceCents: input.costPriceCents,
    taxRate: input.taxRate,
    ncm: input.ncm ?? null,
    cfop: input.cfop ?? null,
    taxSituationCode: input.taxSituationCode ?? null,
    minStock: input.minStock,
    categoryId: input.categoryId,
    createdBy: ctx.userId,
    createdAt: ctx.now,
  })
}

/**
 * Localiza produto pelo codigo de barras lido — RF-018.
 *
 * Devolve `undefined` em vez de lancar: no PDV, "nao achei" e resposta normal
 * e leva a tela de cadastro (RF-017). Excecao aqui faria o caminho comum
 * passar por `catch`.
 */
export async function findProductByBarcode(
  deps: RegisterProductDeps,
  ctx: ExecutionContext,
  barcode: string,
): Promise<ProductOutput | undefined> {
  return deps.products.findByBarcode(ctx.companyId, barcode)
}

/**
 * O catalogo do balcao — RF-019.
 *
 * Leitura: nao passa por `assertCanWrite`. Quem vende precisa ver o que ha para
 * vender, e `accountant` consulta preco como qualquer um.
 *
 * O teto vive AQUI e nao na rota: ele e decisao de produto ("a tela mostra uma
 * lista, nao um banco"), e na rota cada cliente novo — mobile, assistente —
 * escolheria o seu. Quem pede pode reduzir; aumentar, nao.
 */
export const TETO_DO_CATALOGO = 50

export type SearchProductsDeps = { readonly products: ProductRepository }

export async function searchProducts(
  deps: SearchProductsDeps,
  ctx: ExecutionContext,
  input: { readonly termo?: string; readonly limite?: number },
): Promise<readonly ProductOutput[]> {
  const limite = Math.min(input.limite ?? TETO_DO_CATALOGO, TETO_DO_CATALOGO)

  return deps.products.search(ctx.companyId, {
    /* Termo vazio e "me mostre o catalogo", nao "nao ache nada" — e o estado
       em que a tela do PDV abre. */
    ...(input.termo === undefined || input.termo.trim() === ''
      ? {}
      : { termo: input.termo.trim() }),
    limite: Math.max(1, limite),
  })
}

/**
 * O catalogo do backoffice — NR-072, US-008.
 *
 * Leitura, sem `assertCanWrite`: `accountant` precisa ver o catalogo para
 * conferir custo, e exigir papel de escrita o deixaria de fora.
 *
 * `core` nao filtra nem ordena nada aqui. Nao e preguica: filtrar em memoria
 * exigiria trazer o catalogo inteiro para devolver 24 linhas, e o total — que
 * e o que faz a tela dizer "23 de 300" — nao existe sem contar no banco.
 */
export async function listCatalog(
  deps: SearchProductsDeps,
  ctx: ExecutionContext,
  input: CatalogInput,
): Promise<CatalogOutput> {
  const { produtos, total } = await deps.products.listCatalog(ctx.companyId, {
    ...(input.q === undefined || input.q === '' ? {} : { termo: input.q }),
    stock: input.stock,
    offset: (input.page - 1) * input.pageSize,
    limite: input.pageSize,
  })

  return { products: [...produtos], total, page: input.page, pageSize: input.pageSize }
}

/** Os numeros do topo da tela — sobre o catalogo inteiro, nao sobre a pagina. */
export async function catalogSummary(
  deps: SearchProductsDeps,
  ctx: ExecutionContext,
): Promise<CatalogSummaryOutput> {
  return deps.products.catalogSummary(ctx.companyId)
}
