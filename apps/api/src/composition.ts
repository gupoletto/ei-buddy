/**
 * RAIZ DE COMPOSICAO.
 *
 * Este e o UNICO arquivo de apps/api autorizado a importar `@na-regua/db` e os
 * adapters. Ele monta o grafo de dependencias e injeta tudo em core.
 * Ver docs/arquitetura/principios.md#matriz-de-imports-permitidos
 *
 * Se um import de `db` ou de adapter aparecer fora daqui, a verificacao de
 * fronteiras na CI barra o PR — e com razao.
 */
import { randomUUID } from 'node:crypto'
import {
  createDefaultSaleSettings,
  FakeIdentityProvider,
  InMemoryAuditTrail,
  InMemoryLoginThrottle,
  InMemorySessionIssuer,
  type RegisterSaleDeps,
} from '@na-regua/core'
import type { AgendaDeps } from './routes/agenda.js'
import type { AuthRouteDeps } from './routes/auth.js'
import { createReminderScheduler } from './reminder-scheduler.js'
import {
  assertRlsEnforced,
  checkConnection,
  closeConnection,
  createAppointmentRepository,
  createBankTransactionWriter,
  createChartOfAccountsRepository,
  createInventoryHistory,
  createInventoryQueries,
  createInventoryUnitOfWork,
  createReportRepository,
  createCompanyRepository,
  createCustomerRepository,
  createFiscalCredentials,
  createInvoiceStore,
  createSaleFiscalReader,
  createPayableQueries,
  createPayableUnitOfWork,
  createProductRepository,
  createReconciliationQueries,
  createReconciliationUnitOfWork,
  createSaleUnitOfWork,
  createUserDirectory,
  getClient,
  lerChaveDeSegredo,
  type DatabaseHealth,
} from '@na-regua/db'
import { createFileStatementReader } from '@na-regua/banking'
import { createFakeInvoiceIssuer, criarEmissorFocusNfe } from '@na-regua/fiscal'
import type { InvoiceIssuer } from '@na-regua/core'
import type { CadastroDeps } from './routes/cadastro.js'
import type { ConciliacaoDeps } from './routes/conciliacao.js'
import type { ContabilidadeDeps } from './routes/contabilidade.js'
import type { EstoqueDeps } from './routes/estoque.js'
import type { RelatoriosDeps } from './routes/relatorios.js'
import type { ContasDeps } from './routes/contas.js'
import { createInvoiceQueue } from './invoice-queue.js'
import type { CredenciaisFiscaisDeps, EmissaoDeps } from './routes/fiscal.js'
import { loadApiEnv } from '@na-regua/env'
import { Redis } from 'ioredis'

/**
 * Validado aqui, na raiz de composicao, antes de qualquer I/O — NR-006. Se
 * faltar variavel obrigatoria o processo lanca e nao sobe; ver
 * packages/env/README.md.
 */
export const env = loadApiEnv()

export type RedisHealth = {
  ok: boolean
  latencyMs: number
  error?: string
}

let redis: Redis | undefined

export function getRedis(url = env.REDIS_URL): Redis {
  redis ??= new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null,
  })
  return redis
}

export async function checkRedis(): Promise<RedisHealth> {
  const startedAt = performance.now()
  try {
    const client = getRedis()
    if (client.status !== 'ready') await client.connect()
    await client.ping()
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function checkDatabase(): Promise<DatabaseHealth> {
  return checkConnection(env.DATABASE_URL)
}

export type IsolationCheck =
  | { readonly status: 'enforced'; readonly role: string }
  /** Nao deu para verificar: banco fora do ar na subida. */
  | { readonly status: 'unknown'; readonly reason: string }
  | { readonly status: 'bypassed'; readonly reason: string }

/**
 * Verifica, na subida, que a conexao da aplicacao esta sujeita a RLS.
 *
 * A CI encontrou isto do jeito caro: em um ambiente real o isolamento entre
 * empresas nao estava em vigor, porque a aplicacao conectava com um papel
 * superusuario — e superusuario ignora politica de RLS inteiramente, `FORCE
 * ROW LEVEL SECURITY` incluido. Nada dava erro; toda consulta simplesmente
 * devolvia as linhas de todas as lojas.
 *
 * A distincao entre os tres desfechos e o ponto:
 *
 * - **`bypassed`** e configuracao errada e vaza dado entre lojas. Derruba o
 *   processo. Melhor nao subir que subir sem isolamento.
 * - **`unknown`** e banco fora do ar na subida, que e indisponibilidade e nao
 *   falha de seguranca. A api sobe: `/health` ja responde 503, o orquestrador
 *   ja sabe, e recusar subir aqui deixaria nem o `/health/live` de pe.
 * - **`enforced`** e o caso normal.
 */
export async function checkIsolation(): Promise<IsolationCheck> {
  try {
    const status = await assertRlsEnforced(getClient(env.DATABASE_URL))
    return { status: 'enforced', role: status.role }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    /* A mensagem do `assertRlsEnforced` e a unica que significa "configurado
       errado". Qualquer outra falha e do caminho ate o banco. */
    return reason.includes('IGNORA as politicas de RLS')
      ? { status: 'bypassed', reason }
      : { status: 'unknown', reason }
  }
}

export async function shutdown(): Promise<void> {
  await Promise.allSettled([closeConnection(), redis?.quit()])
  redis = undefined
}

/**
 * Dependencias do fechamento de venda — NR-027.
 *
 * `unitOfWork` e de `db` e abre a transacao com o tenant definido; `settings`
 * ainda e o padrao de `core`, porque aliquota, tabela de tarifas e teto de
 * desconto **nao tem tabela** (ver `CompanySettingsRepository`). Quando
 * tiverem, so esta funcao muda.
 *
 * Funcao e nao constante: `getClient()` abre conexao, e abrir conexao no topo
 * do modulo faria importar a composicao — inclusive num teste — conectar no
 * banco.
 */
export function buildSaleDeps(): RegisterSaleDeps {
  return {
    unitOfWork: createSaleUnitOfWork(getClient(env.DATABASE_URL)),
    settings: createDefaultSaleSettings(),
  }
}

/**
 * Dependencias de sessao — NR-014, ADR-0002.
 *
 * O provedor de identidade, o emissor de sessao e a desaceleracao sao HOJE as
 * implementacoes de desenvolvimento. As tres vivem em memoria e por instancia:
 * reiniciar o processo derruba todas as sessoes, e duas instancias nao
 * compartilham nem sessao nem contador de tentativa.
 *
 * Por isso `assertAuthUsavelEmProducao` existe. A escolha entre provedor
 * gerenciado (opcao C) e biblioteca auto-hospedada (opcao D) espera a DEC-009,
 * e a ADR-0002 registra que essa espera nao bloqueia codigo: as duas satisfazem
 * a mesma porta, e trocar e trocar esta funcao.
 */
export function buildAuthDeps(): AuthRouteDeps {
  const sql = getClient(env.DATABASE_URL)

  /*
   * A MESMA instancia serve de `provider` e de `registrar`.
   *
   * O falso guarda as credenciais num mapa proprio: duas instancias seriam dois
   * mapas, o cadastro escreveria num e o login leria do outro — e a pessoa
   * cadastrava e nao entrava. E exatamente o defeito que este trecho existe
   * para nao repetir.
   */
  const identidade = new FakeIdentityProvider()

  return {
    provider: identidade,
    registrar: identidade,
    companies: createCompanyRepository(sql),
    accounts: createChartOfAccountsRepository(sql),
    users: createUserDirectory(sql),
    sessions: new InMemorySessionIssuer(),
    throttle: new InMemoryLoginThrottle(),
    /*
     * A trilha do login ainda nao persiste: `packages/db` nao expoe repositorio
     * de auditoria. Registrar em memoria e melhor que nao registrar — o caso de
     * uso continua exercitando o caminho, e o dia em que o repositorio existir
     * so muda esta linha. Mas nao e trilha de verdade, e por isso entra na
     * mesma guarda de producao.
     */
    audit: new InMemoryAuditTrail(),
  }
}

/**
 * Recusa subir em producao com a autenticacao de desenvolvimento.
 *
 * Mesmo mecanismo do `checkIsolation`: ambiente mal configurado tem de derrubar
 * o processo, nao aceitar login em silencio. `AUTH_PROVIDER=fake` aceita
 * qualquer credencial — subir assim seria publicar um sistema sem porta.
 *
 * A verificacao olha o provedor, mas o que ela protege sao as tres coisas: o
 * emissor de sessao e a desaceleracao tambem sao de memoria, e sobem juntos.
 */
export function assertAuthUsavelEmProducao(): void {
  if (env.NODE_ENV === 'production' && env.AUTH_PROVIDER === 'fake') {
    throw new Error(
      'AUTH_PROVIDER=fake aceita qualquer credencial e nao pode rodar em producao. ' +
        'A sessao e a desaceleracao tambem sao de memoria (ADR-0002). ' +
        'Defina um provedor real antes de subir.',
    )
  }
}

/**
 * Dependencias de cadastro — NR-026.
 *
 * Os tres repositorios sao reais. `companies` e o unico que precisa de
 * tratamento especial na escrita — a politica raiz exige que a empresa nasca
 * sob o proprio tenant, e o repositorio cuida disso.
 */
export function buildCadastroDeps(): CadastroDeps {
  const sql = getClient(env.DATABASE_URL)
  return {
    companies: createCompanyRepository(sql),
    customers: createCustomerRepository(sql),
    products: createProductRepository(sql),
    /* O onboarding semeia o plano de contas padrao — RF-081, NR-077. */
    accounts: createChartOfAccountsRepository(sql),
  }
}

/**
 * Dependencias da agenda — NR-036.
 *
 * O repositorio e real (Postgres, com o tenant definido pela transacao) e o
 * agendador de lembrete e uma fila BullMQ com atraso.
 *
 * **O lembrete e agendado, mas ainda nao e ENTREGUE.** Nenhum consumidor le a
 * fila `appointment-remind` — o registro de consumidores do worker (NR-041)
 * cobre emissao, mensagem e cobranca, e nao esta. Entao o job fica la, pronto
 * na hora certa, esperando quem o processe. Isso esta dito no PR: agendar sem
 * consumir e melhor que nao agendar (o dado existe quando o consumidor chegar),
 * mas nao e RF-091 fechada.
 */
export function buildAgendaDeps(): AgendaDeps {
  return {
    appointments: createAppointmentRepository(getClient(env.DATABASE_URL)),
    reminders: createReminderScheduler(getRedis()),
  }
}

/**
 * Dependencias de contas a pagar — NR-074.
 *
 * `ids` e `uow` sao o mesmo objeto porque a implementacao em `db` nao gera id
 * de recorrencia — ela usa o do `randomUUID` do Node, injetado aqui. Manter o
 * gerador como porta e o que deixa o teste saber o que vai sair.
 */
/**
 * Extrato e conciliacao — NR-076.
 *
 * Uma instancia de leitura sob dois nomes: `queries` e a porta que o caso de
 * uso de sugestao declara, `listQueries` a que o da fila declara, e as duas sao
 * leitura do mesmo repositorio. Criar duas seria abrir duas vezes o que a
 * conexao ja compartilha.
 *
 * A trilha e a MESMA nos dois ramos de proposito: importar e conciliar contam
 * a historia de um extrato so, e duas trilhas separadas obrigariam quem audita
 * a juntar as pontas.
 */
export function buildConciliacaoDeps(): ConciliacaoDeps {
  const sql = getClient(env.DATABASE_URL)
  const queries = createReconciliationQueries(sql)
  /* Mesma pendencia das outras: `db` nao expoe repositorio de auditoria. */
  const audit = new InMemoryAuditTrail()

  return {
    uow: createReconciliationUnitOfWork(sql),
    queries,
    listQueries: queries,
    audit,
    import: {
      parser: createFileStatementReader(),
      transactions: createBankTransactionWriter(sql),
      audit,
    },
  }
}

/**
 * Faturamento e rankings — NR-077, US-041.
 *
 * O fuso vem da `TZ` do ambiente e nao de uma constante no repositorio: e ele
 * que decide em qual MES cai a venda das 21h30 do dia 31, e essa decisao tem
 * de ter uma fonte so no sistema inteiro.
 */
export function buildRelatoriosDeps(): RelatoriosDeps {
  const sql = getClient(env.DATABASE_URL)
  return { reports: createReportRepository(sql, env.TZ) }
}

/**
 * Saldo, ajuste e trilha de estoque — NR-023.
 *
 * A trilha e obrigatoria e nao opcional: a RF-123 pede autoria do ajuste, e uma
 * dependencia opcional aqui seria justamente a que some quando quem monta o
 * grafo esquece dela. Enquanto `db` nao expuser repositorio de auditoria, ela e
 * de memoria — mesma pendencia das outras, e a mesma guarda de producao.
 */
export function buildEstoqueDeps(): EstoqueDeps {
  const sql = getClient(env.DATABASE_URL)
  return {
    products: createInventoryQueries(sql).products,
    uow: createInventoryUnitOfWork(sql),
    historico: createInventoryHistory(sql),
    audit: new InMemoryAuditTrail(),
  }
}

/** Plano de contas, classificacao e DRE — NR-077. */
export function buildContabilidadeDeps(): ContabilidadeDeps {
  const sql = getClient(env.DATABASE_URL)
  return {
    accounts: createChartOfAccountsRepository(sql),
    /* Mesma pendencia das outras: `db` nao expoe repositorio de auditoria. */
    audit: new InMemoryAuditTrail(),
  }
}

/**
 * Configuracao da emissao fiscal — NR-042, RF-004.
 *
 * LANCA sem `SECRETS_KEY`, e nao guarda em texto puro. Um caminho alternativo
 * "sem cifragem para desenvolvimento" seria o jeito mais provavel de um token
 * de producao acabar legivel no banco: ninguem lembra de trocar de volta.
 */
export function buildFiscalDeps(): CredenciaisFiscaisDeps {
  if (env.SECRETS_KEY === undefined) {
    throw new Error(
      'SECRETS_KEY nao definida: sem ela nao ha como cifrar o token e o certificado do ' +
        'lojista. Gere com `openssl rand -base64 32` e defina no ambiente.',
    )
  }

  const sql = getClient(env.DATABASE_URL)
  return { fiscalCredentials: createFiscalCredentials(sql, lerChaveDeSegredo(env.SECRETS_KEY)) }
}

/**
 * Emissao da nota — NR-042, RNF-004.
 *
 * A fila usa o MESMO Redis do limitador (`getRedis()`), e nao uma conexao
 * propria: sao o mesmo servidor, e duas conexoes por processo custam duas
 * reconexoes toda vez que ele oscila.
 */
export function buildEmissaoDeps(): EmissaoDeps {
  const sql = getClient(env.DATABASE_URL)
  const store = createInvoiceStore(sql)

  return {
    sales: createSaleFiscalReader(sql),
    queue: createInvoiceQueue(getRedis()),
    store,
    /*
     * A reconciliacao usa o emissor REAL quando ha chave e credenciais, e o
     * falso quando nao ha — o mesmo criterio do worker. Consultar com o falso
     * nao inventa nota: ele devolve o que a guarda tem.
     */
    invoices: montarEmissorDaApi(sql, store),
  }
}

/**
 * O emissor que a api usa para CONSULTAR — NR-042, RF-053.
 *
 * A api nao emite: quem emite e o worker, pela fila. Mas reconciliar
 * contingencia e uma leitura, e ela acontece quando a tela pergunta.
 *
 * Sem `SECRETS_KEY` cai no falso, e nao lanca: aqui a consequencia de nao ter
 * chave e "a reconciliacao nao encontra nada", que e o mesmo que ela encontra
 * quando nao ha contingencia. No worker e diferente — la a falta de chave
 * significaria emitir sem poder, e por isso la ela LANCA.
 */
function montarEmissorDaApi(
  sql: ReturnType<typeof getClient>,
  store: ReturnType<typeof createInvoiceStore>,
): InvoiceIssuer {
  if (env.SECRETS_KEY === undefined) return createFakeInvoiceIssuer()

  return criarEmissorFocusNfe({
    ambiente: 'homologacao',
    credenciais: createFiscalCredentials(sql, lerChaveDeSegredo(env.SECRETS_KEY)),
    store,
  })
}

export function buildContasDeps(): ContasDeps {
  const sql = getClient(env.DATABASE_URL)
  return {
    uow: createPayableUnitOfWork(sql),
    queries: createPayableQueries(sql),
    ids: { next: () => randomUUID() },
    /* Mesma pendencia da autenticacao: `db` nao expoe repositorio de
       auditoria, entao a trilha do lancamento fica em memoria. */
    audit: new InMemoryAuditTrail(),
  }
}
