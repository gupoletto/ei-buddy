/**
 * Schema Drizzle, migrations, politicas RLS e repositorios.
 *
 * A estrategia de isolamento esta decidida: RLS por linha, `company_id` em toda
 * tabela de negocio mais politica no PostgreSQL — ADR-0001, origem DEC-002.
 * Ver docs/arquitetura/dados.md#multi-tenant para as consequencias que valem
 * para todo o codigo (FORCE ROW LEVEL SECURITY, consulta sem `app.company_id`
 * falha, migrations com papel separado).
 *
 * O que existe hoje (NR-007): a conexao, a verificacao de saude, o runner de
 * migrations e o mecanismo de isolamento — a funcao `enable_tenant_isolation`
 * no banco e o `withTenant` aqui. As TABELAS de negocio nascem na NR-008
 * (cadastros) e na NR-020 (vendas e financeiro), e cada uma chama aquela
 * funcao.
 */
export { checkConnection, closeConnection, getClient } from './connection.js'
export type { DatabaseHealth } from './connection.js'

/* --- Migrations: SQL cru, papel com BYPASSRLS — `pnpm db:migrate` --- */
export { lerMigrations, migrate } from './migrate.js'
export type { Migration, MigrationResult } from './migrate.js'

/* --- Repositorios: implementam as portas declaradas por core --- */
export { createAppointmentRepository } from './appointment-repository.js'
export {
  createCompanyRepository,
  createCustomerRepository,
  createProductRepository,
} from './registration-repositories.js'
export { createPayableQueries, createPayableUnitOfWork } from './payable-repository.js'
export { createChartOfAccountsRepository } from './chart-of-accounts-repository.js'
export { createInvoiceStore } from './invoice-repository.js'
export {
  createBankTransactionWriter,
  createReconciliationQueries,
  createReconciliationUnitOfWork,
} from './bank-transaction-repository.js'
export { createSaleUnitOfWork } from './sale-unit-of-work.js'

/* Diretorio de usuarios — NR-014. Le por fora da RLS, pelas funcoes auth_* da
   migration 0009; ver user-directory.ts sobre por que isso e necessario. */
export { createUserDirectory } from './user-directory.js'

/* --- Guarda: a conexao da aplicacao pode ignorar RLS? --- */
export { assertRlsEnforced, checkRlsEnforcement } from './rls-guard.js'
export type { RlsStatus } from './rls-guard.js'

/* --- Isolamento: a ponte entre o ExecutionContext e a politica de RLS --- */
export { withPlatformScope, withTenant } from './tenant.js'
export type { TenantId } from './tenant.js'

/* Segredo de lojista cifrado em coluna — RF-004, RNF-022, NR-042. */
export { ChaveDeSegredoInvalida, cifrar, decifrar, lerChaveDeSegredo } from './secret-box.js'
export { createFiscalCredentials } from './fiscal-credentials-repository.js'
export type { SituacaoFiscalDaEmpresa } from './fiscal-credentials-repository.js'
export { createSaleFiscalReader } from './sale-fiscal-repository.js'

/* Faturamento e rankings — NR-077, US-041. */
export { createReportRepository } from './report-repository.js'

/* Estoque: ajuste, saldo e trilha — NR-023, RF-022 a RF-024. */
export {
  createInventoryHistory,
  createInventoryQueries,
  createInventoryUnitOfWork,
} from './inventory-repository.js'

/* Historico de vendas — NR-027, US-021. */
export { createSaleHistoryRepository } from './sale-history-repository.js'
