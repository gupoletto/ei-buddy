import { z } from 'zod'
import { cfopSchema, ncmSchema, taxSituationCodeSchema } from '../invoice/invoice.js'
import {
  barcodeSchema,
  idSchema,
  moneyCentsSchema,
  rateSchema,
  unitOfMeasureSchema,
} from '../common/primitives.js'

/** Produto — glossario `Product`. */

export const createProductInputSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(2, 'Descricao muito curta.')
      .max(200, 'Descricao muito longa.'),
    /** Ausente em produto sem etiqueta — granel, servico, feito na hora. */
    barcode: barcodeSchema.optional(),
    unitOfMeasure: unitOfMeasureSchema,
    salePriceCents: moneyCentsSchema,
    /**
     * Custo e obrigatorio: sem ele nao existe margem, e vender sem saber a
     * margem e o problema que este produto se propoe a resolver.
     */
    costPriceCents: moneyCentsSchema,
    /** Aliquota propria. Ausente = usa a do regime da empresa. */
    taxRate: rateSchema.optional(),

    /*
     * Campos fiscais — RF-046. Todos OPCIONAIS no cadastro.
     *
     * Exigir os tres aqui travaria o balcao no dia da instalacao, e a RF-017
     * pede cadastro rapido. Quem cobra e a EMISSAO: ela recusa antes de
     * transmitir e diz qual produto falta classificar, que e o momento em que
     * a informacao realmente faz falta.
     */
    ncm: ncmSchema.optional(),
    /* Varia por produto: 5102 e revenda comum, 5405 e revenda com ST ja
       recolhida — e uma mercearia tem os dois na mesma prateleira. */
    cfop: cfopSchema.optional(),
    /* CST (2 digitos) no regime normal, CSOSN (3) no Simples. Qual vale sai do
       regime da empresa — ver `situacaoTributariaPadrao` em `domain`. */
    taxSituationCode: taxSituationCodeSchema.optional(),
    stock: z.number().int('Estoque precisa ser inteiro.').default(0),
    /** Abaixo disto a tela avisa que precisa repor. */
    minStock: z.number().int('Estoque minimo precisa ser inteiro.').nonnegative().default(0),
    categoryId: idSchema.optional(),
  })
  .strict()
  .refine((p) => p.salePriceCents >= p.costPriceCents, {
    /* Vender abaixo do custo existe (queima de estoque), mas quase sempre e
       erro de digitacao. Recusar aqui e mais barato que descobrir no DRE. */
    message: 'Preco de venda menor que o custo. Confira os valores.',
    path: ['salePriceCents'],
  })

export type CreateProductInput = z.infer<typeof createProductInputSchema>

/**
 * Atualizacao nao herda o `.refine` acima porque `partial()` remove os campos
 * que a regra compara. A checagem de preco contra custo, na edicao, e do
 * `core`, que enxerga o produto inteiro.
 */
export const updateProductInputSchema = z
  .object({
    description: z.string().trim().min(2).max(200),
    barcode: barcodeSchema,
    unitOfMeasure: unitOfMeasureSchema,
    salePriceCents: moneyCentsSchema,
    costPriceCents: moneyCentsSchema,
    taxRate: rateSchema,
    minStock: z.number().int().nonnegative(),
    categoryId: idSchema,
  })
  .partial()
  .strict()

export type UpdateProductInput = z.infer<typeof updateProductInputSchema>

export const productOutputSchema = z.object({
  id: idSchema,
  description: z.string(),
  barcode: z.string().nullable(),
  /**
   * Codigo interno, gerado quando nao ha codigo de barras — RF-019.
   *
   * Sai no output porque e por ele que o lojista se refere ao item quando o
   * leitor nao le: etiqueta amassada, granel, produto sem embalagem. Codigo
   * gerado que a tela nao mostra nao serve para nada.
   */
  internalCode: z.string().min(1),
  unitOfMeasure: unitOfMeasureSchema,
  salePriceCents: z.number().int(),
  costPriceCents: z.number().int(),
  taxRate: z.number().nullable(),
  /* Fiscais — RF-046. Nulos ate o lojista informar; a emissao e quem cobra. */
  ncm: z.string().nullable(),
  cfop: z.string().nullable(),
  taxSituationCode: z.string().nullable(),
  stock: z.number().int(),
  minStock: z.number().int(),
  categoryId: idSchema.nullable(),
})

export type ProductOutput = z.infer<typeof productOutputSchema>

/**
 * O catalogo do backoffice — NR-072, US-008.
 *
 * Separado de `GET /produtos`, que e a busca do BALCAO e tem teto rigido de
 * `TETO_DO_CATALOGO` itens. Os dois respondem perguntas diferentes: o balcao
 * quer achar UM produto para vender agora, e a tela de catalogo quer percorrer
 * TODOS. Dar paginacao a rota do balcao mudaria o contrato de quem ja depende
 * do teto; ler o catalogo inteiro pela rota do balcao mostraria 50 produtos ao
 * lojista que tem 300, sem nenhum aviso de que faltam 250.
 */
export const NIVEL_DE_ESTOQUE = ['todos', 'baixo', 'esgotado'] as const

export const stockLevelSchema = z.enum(NIVEL_DE_ESTOQUE)

export type StockLevel = z.infer<typeof stockLevelSchema>

export const PAGINA_PADRAO_DO_CATALOGO = 24
export const PAGINA_MAXIMA_DO_CATALOGO = 100

export const catalogInputSchema = z
  .object({
    /** Descricao, codigo interno ou codigo de barras. */
    q: z.string().trim().max(120).optional(),
    stock: stockLevelSchema.default('todos'),
    page: z.coerce.number().int().min(1, 'A primeira pagina e a 1.').default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINA_MAXIMA_DO_CATALOGO, `A pagina vai ate ${PAGINA_MAXIMA_DO_CATALOGO} itens.`)
      .default(PAGINA_PADRAO_DO_CATALOGO),
  })
  .strict()

export type CatalogInput = z.infer<typeof catalogInputSchema>

export const catalogOutputSchema = z.object({
  products: z.array(productOutputSchema),
  /**
   * Quantos casam com o filtro — NAO quantos vieram nesta pagina.
   *
   * E o que permite a tela dizer "23 de 300" em vez de "23". Sem ele, uma
   * pagina cheia e indistinguivel do fim do catalogo, e o lojista para de
   * procurar achando que acabou.
   */
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export type CatalogOutput = z.infer<typeof catalogOutputSchema>

/**
 * O resumo do catalogo INTEIRO — os numeros do topo da tela.
 *
 * Consulta propria, e nao soma da pagina. "Valor em estoque" calculado sobre
 * 24 dos 300 produtos daria um numero que parece certo e esta errado por um
 * fator de doze — e o lojista usa esse numero para decidir compra.
 */
export const catalogSummaryOutputSchema = z.object({
  total: z.number().int(),
  belowMinimum: z.number().int(),
  outOfStock: z.number().int(),
  stockValueCents: z.number().int(),
})

export type CatalogSummaryOutput = z.infer<typeof catalogSummaryOutputSchema>
