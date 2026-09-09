import type { ExportCollection } from '@na-regua/contracts'
import type {
  AnonymizationCounts,
  DataSubjectRepository,
  ExportPage,
  ExportSource,
} from '@na-regua/core'
import type { Sql } from 'postgres'
import { withTenant } from './tenant.js'

/**
 * Exportacao completa e anonimizacao no banco — NR-086, RF-125, RF-127, RF-128.
 *
 * ## O que faltava
 *
 * `core` tinha os dois casos de uso desde a NR-031, com teste contra falso, e
 * `packages/db` nao tinha implementacao nenhuma. Sem ela nao havia rota, e sem
 * rota o lojista nao conseguia exercer o direito de portabilidade nem atender
 * um pedido de exclusao — dois direitos com codigo escrito e sem caminho.
 *
 * ## Uma tabela por colecao, declarada e nao inferida
 *
 * O mapa abaixo e explicito de proposito. A alternativa — varrer
 * `information_schema` e exportar o que achar — parece mais segura contra
 * esquecimento e e pior: exportaria `sessions`, `login_throttle` e as
 * credenciais fiscais cifradas, ou seja, entregaria segredo junto com dado. E
 * um `SELECT *` sobre tabela desconhecida quebra na primeira coluna que nao
 * existe mais.
 *
 * O que protege contra esquecimento e outra coisa: `privacidade.test.ts`
 * compara este mapa E o contrato com as tabelas que existem no banco.
 */

/**
 * Como cada colecao e lida.
 *
 * `escopo` existe porque nem toda tabela se filtra igual. A maioria tem
 * `company_id`; `companies` E a propria empresa, e `users` nao tem coluna de
 * empresa nenhuma — o vinculo mora em `company_users`.
 */
type Fonte = {
  readonly tabela: string
  /**
   * Como a linha e restringida a esta empresa.
   *
   * `company_id` e a maioria. `id` e a propria `companies`. `vinculo` e so
   * `users`, que nao tem coluna de empresa — e tem funcao de leitura propria,
   * porque tambem traz o papel.
   */
  readonly escopo: 'company_id' | 'id' | 'vinculo'
}

const FONTES: Readonly<Record<ExportCollection, Fonte>> = {
  /* A propria empresa: uma linha, e o filtro e o `id`. */
  company: { tabela: 'companies', escopo: 'id' },
  /*
   * `users` nao tem `company_id`: a mesma pessoa opera mais de uma loja
   * (0002). Quem pertence a esta empresa sai de `company_users`, e e por isso
   * que o escopo e proprio.
   */
  users: { tabela: 'users', escopo: 'vinculo' },
  customers: { tabela: 'customers', escopo: 'company_id' },
  products: { tabela: 'products', escopo: 'company_id' },
  categories: { tabela: 'categories', escopo: 'company_id' },
  sales: { tabela: 'sales', escopo: 'company_id' },
  sale_items: { tabela: 'sale_items', escopo: 'company_id' },
  payments: { tabela: 'payments', escopo: 'company_id' },
  receivables: { tabela: 'receivables', escopo: 'company_id' },
  payables: { tabela: 'payables', escopo: 'company_id' },
  settlements: { tabela: 'settlements', escopo: 'company_id' },
  inventory_movements: { tabela: 'inventory_movements', escopo: 'company_id' },
  appointments: { tabela: 'appointments', escopo: 'company_id' },
  accounts: { tabela: 'accounts', escopo: 'company_id' },
  bank_transactions: { tabela: 'bank_transactions', escopo: 'company_id' },
  audit_log: { tabela: 'audit_log', escopo: 'company_id' },
  invoices: { tabela: 'invoices', escopo: 'company_id' },
  sale_returns: { tabela: 'sale_returns', escopo: 'company_id' },
  sale_return_items: { tabela: 'sale_return_items', escopo: 'company_id' },
  support_tickets: { tabela: 'support_tickets', escopo: 'company_id' },
  support_messages: { tabela: 'support_messages', escopo: 'company_id' },
}

/**
 * Tabelas de negocio que ficam FORA da exportacao, de proposito.
 *
 * Exportada porque o teste compara o banco com esta lista mais as colecoes: uma
 * tabela nova que nao esteja em nenhuma das duas reprova o PR. Sem isso, a
 * ausencia por decisao e a ausencia por esquecimento seriam indistinguiveis.
 */
export const FORA_DA_EXPORTACAO: Readonly<Record<string, string>> = {
  /* Segredo, e nao dado. Exportar credencial cifrada de emissao fiscal seria
     entregar a chave da casa junto com o inventario dela — e o titular do
     direito de portabilidade nao pediu isso. */
  company_fiscal_credentials: 'Credenciais cifradas de terceiros. Segredo, nao dado do titular.',
  /* Numeracao de nota fiscal. Controle interno, e nao dado de negocio: levar o
     contador para outro sistema faria a serie continuar de onde parou por
     acidente, o que e problema fiscal e nao portabilidade. */
  company_counters: 'Controle interno de numeracao fiscal.',
  /* Vinculo e papel saem dentro da colecao `users`, com o `role` junto. Tabela
     separada duplicaria a informacao no pacote. */
  company_users: 'Sai junto de `users`, com o papel na mesma linha.',
  /* Sessao viva e credencial, nao historico. E dura doze horas. */
  sessions: 'Credencial de acesso em vigor. Nao e dado do titular.',
  /* Contagem de tentativa de login por chave. Nao pertence a empresa nenhuma —
     a chave pode ser um IP compartilhado. */
  login_throttle: 'Controle de forca bruta, sem vinculo com empresa.',
  /* Baixas de conta a PAGAR. Saem dentro de `settlements`, com `kind`. */
  payable_settlements: 'Sai junto de `settlements`, com o tipo na mesma linha.',
  /* Controle das migrations. */
  schema_migrations: 'Controle de versao do schema.',
}

/**
 * Quantas linhas por ida ao banco.
 *
 * Igual ao `LINHAS_POR_PAGINA` do caso de uso. Repetido aqui porque o
 * repositorio nao importa `core` para constante — e se um dia divergirem, o
 * caso de uso continua correto: ele pagina pelo cursor que recebe, e nao pelo
 * tamanho que espera.
 */
const LIMITE = 1_000

/**
 * A leitura de uma pagina, por cursor de chave.
 *
 * `WHERE id > cursor ORDER BY id LIMIT n`, e nao `OFFSET`. Com `OFFSET`, o
 * banco le e descarta as linhas anteriores em cada pagina: a exportacao de uma
 * loja grande ficaria quadratica justamente no caso que este desenho existe
 * para atender. E `OFFSET` pula linha quando algo e inserido no meio da
 * varredura, o que aqui significa pacote incompleto sem nenhum sinal.
 *
 * Todas as tabelas tem `id uuid`, entao o cursor e um uuid em texto para
 * qualquer colecao. O caso de uso trata o cursor como opaco — e ele e.
 */
async function lerPagina(
  sql: Sql,
  companyId: string,
  fonte: Fonte,
  cursor: string | undefined,
): Promise<ExportPage> {
  const rows = await withTenant(sql, companyId, async (tx) => {
    /*
     * Nome de tabela vem do mapa `FONTES`, nunca de fora: e literal de codigo,
     * e o `unsafe` aqui nao alcanca entrada de usuario. O `companyId` e o
     * cursor vao como PARAMETRO, e e por isso que a interpolacao abaixo se
     * limita ao identificador.
     */
    const condicao = fonte.escopo === 'id' ? 't.id = $1' : 't.company_id = $1'
    const corte = cursor === undefined ? '' : 'AND t.id > $2'
    const parametros = cursor === undefined ? [companyId] : [companyId, cursor]

    return tx.unsafe<Record<string, unknown>[]>(
      `SELECT t.*
         FROM ${fonte.tabela} t
        WHERE ${condicao} ${corte}
        ORDER BY t.id
        LIMIT ${LIMITE}`,
      parametros,
    )
  })

  const ultima = rows.at(-1)

  return {
    rows,
    /*
     * Pagina cheia significa "talvez haja mais", e nao "ha mais". O caso de uso
     * pede a proxima, recebe vazia e para — uma ida a mais no caso exato em que
     * o total e multiplo de mil. O contrario, adivinhar que acabou, truncaria o
     * pacote.
     */
    nextCursor: rows.length === LIMITE ? (ultima?.['id'] as string | undefined) : undefined,
  }
}

export function createExportSource(sql: Sql): ExportSource {
  return {
    collections: () => Object.keys(FONTES) as ExportCollection[],

    readPage: async (companyId, collection, cursor) => {
      const fonte = FONTES[collection]

      if (collection === 'users') return lerUsuarios(sql, companyId, cursor)
      if (collection === 'settlements') return lerBaixas(sql, companyId, cursor)

      return lerPagina(sql, companyId, fonte, cursor)
    },
  }
}

/**
 * Usuarios com o PAPEL na mesma linha.
 *
 * `company_users` nao entra como colecao propria: ela e a unica tabela de
 * negocio sem `id` simples, e paginar por chave composta pediria um cursor
 * diferente das outras vinte. E, mais importante, papel sem pessoa nao diz nada
 * — quem le o pacote quer "Ana, dona" e nao dois arquivos para cruzar.
 *
 * `auth_subject` sai de fora: e o identificador da pessoa NO PROVEDOR de
 * identidade, nao um dado dela. Exporta-lo entregaria uma referencia interna
 * que so serve para amarrar a conta, sem utilidade para quem recebe o pacote.
 */
async function lerUsuarios(
  sql: Sql,
  companyId: string,
  cursor: string | undefined,
): Promise<ExportPage> {
  const rows = await withTenant(sql, companyId, async (tx) => {
    const corte = cursor === undefined ? '' : 'AND u.id > $2'
    const parametros = cursor === undefined ? [companyId] : [companyId, cursor]

    return tx.unsafe<Record<string, unknown>[]>(
      `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at, u.updated_at,
              cu.role, cu.is_active AS access_active, cu.created_at AS access_since
         FROM users u
         JOIN company_users cu ON cu.user_id = u.id
        WHERE cu.company_id = $1 ${corte}
        ORDER BY u.id
        LIMIT ${LIMITE}`,
      parametros,
    )
  })

  return {
    rows,
    nextCursor: rows.length === LIMITE ? (rows.at(-1)?.['id'] as string | undefined) : undefined,
  }
}

/**
 * As baixas das DUAS tabelas, numa colecao so.
 *
 * `settlements` guarda as de recebivel e `payable_settlements` as de pagavel —
 * separadas desde a 0003/0010 porque guardam colunas diferentes. O contrato tem
 * uma colecao, e exportar apenas uma delas omitiria metade das baixas em
 * silencio.
 *
 * `kind` na linha e o que torna o pacote legivel: sem ele, quem recebe ve dois
 * conjuntos de colunas misturados e nao sabe qual e qual.
 *
 * O cursor cobre as duas: elas sao ordenadas juntas por `id`, entao a paginacao
 * atravessa a uniao como se fosse uma tabela.
 */
async function lerBaixas(
  sql: Sql,
  companyId: string,
  cursor: string | undefined,
): Promise<ExportPage> {
  const rows = await withTenant(sql, companyId, async (tx) => {
    const corte = cursor === undefined ? '' : 'AND id > $2'
    const parametros = cursor === undefined ? [companyId] : [companyId, cursor]

    return tx.unsafe<Record<string, unknown>[]>(
      `SELECT * FROM (
           SELECT id, company_id, 'receivable' AS kind, receivable_id AS titulo_id, amount_cents,
                  method, NULL::text AS bank_account, settled_at::date AS settled_on, notes,
                  reverses_id, created_at, created_by
             FROM settlements
            WHERE company_id = $1 ${corte}
           UNION ALL
           SELECT id, company_id, 'payable' AS kind, payable_id AS titulo_id, amount_cents,
                  NULL::text AS method, bank_account, settled_on, notes,
                  reverses_id, created_at, created_by
             FROM payable_settlements
            WHERE company_id = $1 ${corte}
         ) baixas
        ORDER BY id
        LIMIT ${LIMITE}`,
      parametros,
    )
  })

  return {
    rows,
    nextCursor: rows.length === LIMITE ? (rows.at(-1)?.['id'] as string | undefined) : undefined,
  }
}

/* -------------------------------------------------------------------------- */
/* Anonimizacao — RF-127, RF-128                                              */
/* -------------------------------------------------------------------------- */

type LinhaDeCliente = {
  id: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
  address: string | null
  wallet_balance_cents: string | number
  anonymized_at: Date | null
}

export function createDataSubjectRepository(sql: Sql): DataSubjectRepository {
  return {
    findCustomer: async (companyId, customerId) => {
      /*
       * O endereco vem concatenado num campo.
       *
       * A porta pede `address: string | null`, e quem le o comprovante quer ver
       * o que sera removido — nao sete colunas soltas. O `nullif` de fora
       * impede que endereco vazio vire uma linha de virgulas, e o de dentro
       * evita "rua sem numero" virar " ".
       */
      const [linha] = await withTenant(
        sql,
        companyId,
        (tx) => tx<LinhaDeCliente[]>`
          SELECT id, name, phone, email, document,
                 nullif(
                   concat_ws(', ',
                     nullif(concat_ws(' ', street, number), ''),
                     complement, district, city, state, zip_code
                   ), ''
                 ) AS address,
                 wallet_balance_cents, anonymized_at
            FROM customers
           WHERE id = ${customerId}
             AND deleted_at IS NULL
        `,
      )

      if (linha === undefined) return undefined

      return {
        id: linha.id,
        name: linha.name,
        phone: linha.phone,
        email: linha.email,
        taxId: linha.document,
        address: linha.address,
        /* O driver devolve `bigint` como STRING. Comparar string com zero em
           `recusaSeDeve` daria falso para "1000" — e a recusa de anonimizar
           quem deve deixaria de funcionar sem nada falhar. */
        walletBalanceCents: Number(linha.wallet_balance_cents),
        anonymizedAt: linha.anonymized_at?.toISOString() ?? null,
      }
    },

    /**
     * Substitui os campos pessoais e conta o que ficou — numa transacao.
     *
     * ## Por que uma transacao, e nao tres UPDATEs
     *
     * Cliente meio anonimizado e o pior estado possivel: responde ao titular
     * que foi atendido e continua com o telefone dele na base, e a segunda
     * tentativa recusa por causa do `anonymized_at` ja gravado — deixando o
     * resto para sempre. `withTenant` ja abre a transacao.
     *
     * ## As contagens sao lidas, e nao estimadas
     *
     * O comprovante que o caso de uso devolve afirma "12 vendas preservadas".
     * Numero inventado num comprovante de atendimento a titular e pior que
     * numero nenhum.
     *
     * ## As conversas
     *
     * `messagesDeleted` volta zero, e nao e omissao: nao existe tabela de
     * mensagem de WhatsApp — o adapter esta bloqueado pela DEC-003. Quando ela
     * existir, o apagamento entra aqui, e o comprovante ja tem o campo.
     */
    anonymizeCustomer: async (pedido) =>
      withTenant(sql, pedido.companyId, async (tx): Promise<AnonymizationCounts> => {
        /*
         * Cada campo vem da lista que `core` montou, e nao de nomes escritos
         * aqui. Se um dia o caso de uso parar de mandar `street`, a coluna
         * deixa de ser limpa e o teste que compara as colunas pessoais com a
         * lista reprova — em vez de o endereco sobreviver em silencio, que foi
         * exatamente o que aconteceu antes da NR-086.
         */
        const s = pedido.substitutes

        const [alterada] = await tx<{ id: string }[]>`
          UPDATE customers
             SET name = ${s['name'] ?? ''},
                 document = ${s['document'] ?? null},
                 phone = ${s['phone'] ?? null},
                 email = ${s['email'] ?? null},
                 notes = ${s['notes'] ?? null},
                 zip_code = ${s['zip_code'] ?? null},
                 street = ${s['street'] ?? null},
                 number = ${s['number'] ?? null},
                 complement = ${s['complement'] ?? null},
                 district = ${s['district'] ?? null},
                 city = ${s['city'] ?? null},
                 state = ${s['state'] ?? null},
                 anonymized_at = ${pedido.anonymizedAt},
                 anonymized_by = ${pedido.anonymizedBy},
                 updated_at = now()
           WHERE id = ${pedido.customerId}
             AND anonymized_at IS NULL
          RETURNING id
        `

        if (alterada === undefined) {
          /*
           * O caso de uso ja conferiu que existe e que nao foi anonimizado.
           * Chegar aqui e outra chamada ter passado no meio — falhar alto e
           * melhor que devolver um comprovante de uma operacao que nao
           * aconteceu.
           */
          throw new Error(
            `Cliente ${pedido.customerId} nao foi anonimizado: ja estava anonimizado ou desapareceu.`,
          )
        }

        const [contagens] = await tx<{ vendas: string; recebiveis: string; notas: string }[]>`
          SELECT
            (SELECT count(*) FROM sales WHERE customer_id = ${pedido.customerId})::text AS vendas,
            (SELECT count(*) FROM receivables WHERE customer_id = ${pedido.customerId})::text
              AS recebiveis,
            (SELECT count(*) FROM invoices i
              JOIN sales s ON s.id = i.sale_id
             WHERE s.customer_id = ${pedido.customerId})::text AS notas
        `

        return {
          salesPreserved: Number(contagens?.vendas ?? 0),
          receivablesPreserved: Number(contagens?.recebiveis ?? 0),
          fiscalDocumentsPreserved: Number(contagens?.notas ?? 0),
          /* Ver o cabecalho: a tabela nao existe ate a DEC-003 fechar. */
          messagesDeleted: 0,
        }
      }),
  }
}
