import { randomUUID } from 'node:crypto'
import type { CompanyOutput, CustomerOutput, ProductOutput } from '@na-regua/contracts'
import type {
  CompanyRepository,
  CustomerRepository,
  NewCompany,
  NewCustomer,
  NewProduct,
  ProductRepository,
} from '@na-regua/core'
import type { Sql } from 'postgres'
import { withPlatformScope, withTenant } from './tenant.js'

/**
 * Repositorios de cadastro — NR-026, RF-001 a RF-019.
 *
 * `bigint` volta como STRING no postgres.js, de proposito, para nao perder
 * precisao acima de 2^53. As portas declaram `number`, e um valor em string
 * entrando num calculo estoura com "Cannot mix BigInt and other types" — a CI
 * ja mostrou isso no repositorio de vendas. A conversao acontece na BORDA.
 */
const numero = (valor: unknown): number => Number(valor)

type LinhaEmpresa = {
  id: string
  legal_name: string
  trade_name: string | null
  cnpj: string
  email: string
  phone: string
  tax_regime: string
  is_active: boolean
  created_at: Date
}

const paraEmpresa = (l: LinhaEmpresa): CompanyOutput => ({
  id: l.id,
  legalName: l.legal_name,
  /* O contrato pede `string`, a coluna aceita nulo: quem nao informou nome
     fantasia opera com a razao social, e e isso que a tela mostra. */
  tradeName: l.trade_name ?? l.legal_name,
  cnpj: l.cnpj,
  email: l.email,
  phone: l.phone,
  createdAt: l.created_at.toISOString(),
})

export function createCompanyRepository(sql: Sql): CompanyRepository {
  return {
    create: async (c: NewCompany) => {
      /*
       * O id e gerado AQUI e passado no INSERT, e nao deixado para o
       * `DEFAULT gen_random_uuid()`.
       *
       * A politica raiz de `companies` e `WITH CHECK (id = current_company_id())`:
       * para inserir, o tenant do contexto ja precisa ser o id da linha. Com o
       * id vindo do default, nao haveria o que colocar em `app.company_id`
       * antes de inserir — o INSERT seria recusado pela propria politica que
       * protege a tabela. Ver packages/db/README.md#tabelas.
       */
      const id = randomUUID()

      const [linha] = await withTenant(
        sql,
        id,
        (tx) => tx<LinhaEmpresa[]>`
          INSERT INTO companies (id, legal_name, trade_name, cnpj, email, phone, created_at)
          VALUES (${id}, ${c.legalName}, ${c.tradeName ?? null}, ${c.cnpj},
                  ${c.email}, ${c.phone}, ${c.createdAt})
          RETURNING *
        `,
      )
      return paraEmpresa(linha!)
    },

    /*
     * A UNICA consulta do sistema que atravessa tenants, e por isso usa
     * `withPlatformScope` — nomeado assim para quem le ver uma excecao
     * consciente, e nao um esquecimento.
     *
     * Devolve booleano, nunca a linha: RF-002 pede recusar CNPJ repetido "sem
     * revelar dados da empresa existente". Devolver a linha vazaria razao
     * social para quem so digitou um numero.
     */
    /**
     * Este CNPJ ja tem cadastro? — RF-002.
     *
     * Pela funcao `auth_cnpj_taken` (migration 0017), e nao por um SELECT
     * direto. O SELECT direto so funcionava em conexao que IGNORA a RLS: sem
     * empresa no contexto — e no cadastro nao ha, por definicao — a consulta
     * LANCA desde a 0004 (RF-121). Num papel comum, o cadastro morria na
     * primeira linha e a tela mostrava "algo deu errado do nosso lado".
     *
     * A funcao devolve um booleano e nada mais, que e o que a RF-002 pede:
     * recusar "sem revelar dados da empresa existente".
     */
    cnpjTaken: async (cnpj) =>
      withPlatformScope(sql, async (tx) => {
        const [linha] = await tx<{ existe: boolean }[]>`
          SELECT auth_cnpj_taken(${cnpj}) AS existe
        `
        return linha?.existe === true
      }),
  }
}

type LinhaCliente = {
  id: string
  name: string
  document: string | null
  phone: string | null
  email: string | null
  notes: string | null
  wallet_limit_cents: string | number
  wallet_balance_cents: string | number
  created_at: Date
}

const paraCliente = (l: LinhaCliente): CustomerOutput => ({
  id: l.id,
  name: l.name,
  document: l.document,
  phone: l.phone,
  email: l.email,
  notes: l.notes,
  walletLimitCents: numero(l.wallet_limit_cents),
  walletBalanceCents: numero(l.wallet_balance_cents),
  createdAt: l.created_at.toISOString(),
})

export function createCustomerRepository(sql: Sql): CustomerRepository {
  return {
    create: async (c: NewCustomer) => {
      const [linha] = await withTenant(
        sql,
        c.companyId,
        (tx) => tx<LinhaCliente[]>`
          INSERT INTO customers
            (company_id, name, document, phone, email, notes, wallet_limit_cents,
             created_by, created_at)
          VALUES (${c.companyId}, ${c.name}, ${c.document ?? null}, ${c.phone ?? null},
                  ${c.email ?? null}, ${c.notes ?? null}, ${c.walletLimitCents ?? 0},
                  ${c.createdBy}, ${c.createdAt})
          RETURNING *
        `,
      )
      return paraCliente(linha!)
    },

    findSimilar: async (companyId, criteria) => {
      /*
       * Sem criterio nao ha semelhanca a procurar. Sair antes evita um
       * `WHERE false` que varreria o indice a toa — e, pior, evita que uma
       * mudanca futura no SQL transforme isso em "traz todo mundo".
       */
      if (criteria.phone === undefined && criteria.document === undefined) return []

      return withTenant(sql, companyId, async (tx) => {
        const linhas = await tx<LinhaCliente[]>`
          SELECT * FROM customers
          WHERE deleted_at IS NULL
            AND (
              ${criteria.phone ?? null}::text IS NOT NULL AND phone = ${criteria.phone ?? null}
              OR
              ${criteria.document ?? null}::text IS NOT NULL AND document = ${criteria.document ?? null}
            )
          ORDER BY created_at DESC
          LIMIT 10
        `
        return linhas.map(paraCliente)
      })
    },
  }
}

type LinhaProduto = {
  id: string
  description: string
  barcode: string | null
  internal_code: string
  unit_of_measure: string
  sale_price_cents: string | number
  cost_price_cents: string | number
  tax_rate: string | null
  stock_quantity: number
  min_stock: number
  category_id: string | null
  is_active: boolean
  created_at: Date
  ncm: string | null
  cfop: string | null
  tax_situation_code: string | null
}

const paraProduto = (l: LinhaProduto): ProductOutput => ({
  id: l.id,
  description: l.description,
  barcode: l.barcode,
  internalCode: l.internal_code,
  unitOfMeasure: l.unit_of_measure as ProductOutput['unitOfMeasure'],
  salePriceCents: numero(l.sale_price_cents),
  costPriceCents: numero(l.cost_price_cents),
  /* `numeric` tambem volta como string — e `null` continua `null`. */
  taxRate: l.tax_rate === null ? null : numero(l.tax_rate),
  ncm: l.ncm,
  cfop: l.cfop,
  taxSituationCode: l.tax_situation_code,
  /* A coluna chama `stock_quantity`; o contrato chama `stock`. */
  stock: l.stock_quantity,
  minStock: l.min_stock,
  categoryId: l.category_id,
})

export function createProductRepository(sql: Sql): ProductRepository {
  return {
    create: async (p: NewProduct) => {
      const [linha] = await withTenant(
        sql,
        p.companyId,
        (tx) => tx<LinhaProduto[]>`
          INSERT INTO products
            (company_id, description, barcode, internal_code, unit_of_measure,
             sale_price_cents, cost_price_cents, tax_rate, min_stock, category_id,
             ncm, cfop, tax_situation_code,
             created_by, created_at)
          VALUES (${p.companyId}, ${p.description}, ${p.barcode ?? null}, ${p.internalCode},
                  ${p.unitOfMeasure}, ${p.salePriceCents}, ${p.costPriceCents},
                  ${p.taxRate ?? null}, ${p.minStock}, ${p.categoryId ?? null},
                  ${p.ncm}, ${p.cfop}, ${p.taxSituationCode},
                  ${p.createdBy}, ${p.createdAt})
          RETURNING *
        `,
      )
      return paraProduto(linha!)
    },

    findByBarcode: async (companyId, barcode) => {
      const [linha] = await withTenant(
        sql,
        companyId,
        (tx) => tx<LinhaProduto[]>`
          SELECT * FROM products
          WHERE barcode = ${barcode} AND deleted_at IS NULL
        `,
      )
      return linha === undefined ? undefined : paraProduto(linha)
    },

    /**
     * O catalogo do balcao — RF-019.
     *
     * O termo vai para o SQL porque aqui nao ha regra a esconder, e filtrar em
     * memoria significaria carregar o catalogo inteiro a cada tecla. `ILIKE`
     * resolve a caixa sem `lower()` dos dois lados.
     *
     * Ordena por descricao para a lista nao dancar entre buscas iguais — sem
     * `ORDER BY`, o Postgres pode devolver em qualquer ordem e a tela pisca.
     */
    search: async (companyId, criterio) => {
      const linhas = await withTenant(
        sql,
        companyId,
        (tx) => tx<LinhaProduto[]>`
          SELECT * FROM products
          WHERE deleted_at IS NULL
          ${
            criterio.termo === undefined
              ? tx``
              : tx`AND (description ILIKE ${'%' + criterio.termo + '%'}
                     OR internal_code ILIKE ${'%' + criterio.termo + '%'}
                     OR barcode = ${criterio.termo})`
          }
          ORDER BY description
          LIMIT ${criterio.limite}
        `,
      )
      return linhas.map(paraProduto)
    },

    /**
     * O catalogo do backoffice — NR-072.
     *
     * ## A pagina e o total saem da MESMA varredura
     *
     * `count(*) OVER ()` conta as linhas que casaram com o `WHERE` ANTES do
     * `LIMIT`, e vem repetido em toda linha da pagina. E o que faz a tela dizer
     * "24 de 300". Um `SELECT count(*)` separado varreria a tabela de novo, e
     * entre as duas leituras um cadastro novo faria a conta deixar de fechar.
     *
     * A pagina vazia (busca sem resultado, ou pagina alem do fim) devolve zero
     * linhas e, com elas, nenhum total — por isso `total` cai para 0 aqui, que
     * e a resposta certa nos dois casos.
     *
     * ## O filtro de estoque e do BANCO
     *
     * "Esgotados" calculado sobre a pagina mostraria os esgotados DAQUELES 24,
     * e nao os da loja. O lojista abre esse filtro justamente para achar o que
     * nao esta na frente dele.
     */
    listCatalog: async (companyId, criterio) => {
      const linhas = await withTenant(
        sql,
        companyId,
        (tx) => tx<(LinhaProduto & { total_geral: string })[]>`
          SELECT *, count(*) OVER () AS total_geral FROM products
          WHERE deleted_at IS NULL
          ${
            criterio.termo === undefined
              ? tx``
              : tx`AND (description ILIKE ${'%' + criterio.termo + '%'}
                     OR internal_code ILIKE ${'%' + criterio.termo + '%'}
                     OR barcode = ${criterio.termo})`
          }
          ${
            criterio.stock === 'esgotado'
              ? tx`AND stock_quantity <= 0`
              : criterio.stock === 'baixo'
                ? tx`AND stock_quantity > 0 AND stock_quantity < min_stock`
                : tx``
          }
          ORDER BY description, id
          LIMIT ${criterio.limite} OFFSET ${criterio.offset}
        `,
      )

      return {
        produtos: linhas.map(paraProduto),
        total: numero(linhas[0]?.total_geral ?? 0),
      }
    },

    /**
     * Os numeros do topo, sobre o catalogo inteiro — NR-072.
     *
     * Uma consulta so com quatro agregacoes, e nao quatro consultas. Alem de
     * varrer a tabela uma vez, garante que os quatro numeros descrevem o MESMO
     * instante: em quatro leituras, um cadastro no meio faria "produtos no
     * catalogo" e "valor em estoque" discordarem.
     *
     * `belowMinimum` inclui os zerados de proposito — quem esta em zero esta
     * abaixo do minimo. Sao duas contagens que se sobrepoem, e nao parcelas de
     * um total; a tela nao pode soma-las.
     */
    catalogSummary: async (companyId) => {
      const [linha] = await withTenant(
        sql,
        companyId,
        (tx) => tx<
          {
            total: string
            below_minimum: string
            out_of_stock: string
            stock_value_cents: string
          }[]
        >`
          SELECT count(*)                                              AS total,
                 count(*) FILTER (WHERE stock_quantity < min_stock)    AS below_minimum,
                 count(*) FILTER (WHERE stock_quantity <= 0)           AS out_of_stock,
                 COALESCE(SUM(stock_quantity * cost_price_cents), 0)   AS stock_value_cents
          FROM products
          WHERE deleted_at IS NULL
        `,
      )

      return {
        total: numero(linha?.total ?? 0),
        belowMinimum: numero(linha?.below_minimum ?? 0),
        outOfStock: numero(linha?.out_of_stock ?? 0),
        stockValueCents: numero(linha?.stock_value_cents ?? 0),
      }
    },

    countAll: async (companyId) => {
      const [linha] = await withTenant(
        sql,
        companyId,
        /* Conta os apagados tambem: o codigo interno nao pode ser reusado, e
           contar so os vivos faria o proximo colidir com um que ja existiu. */
        (tx) => tx<{ total: string }[]>`SELECT count(*)::text AS total FROM products`,
      )
      return numero(linha?.total ?? 0)
    },
  }
}
