import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyMigration,
  ensureRoles,
  getAppDatabaseUrl,
  getBootstrapUrl,
  resolveTestDatabaseUrl,
} from './migrate.js'
import { withTenant } from './tenant.js'

const adminUrl =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  'postgresql://naregua:naregua@localhost:5432/naregua'

describe('RLS por linha — RF-121, RF-122', () => {
  let admin: postgres.Sql
  let app: postgres.Sql

  const companyA = randomUUID()
  const companyB = randomUUID()
  const customerA = randomUUID()
  const customerB = randomUUID()

  beforeAll(async () => {
    const testUrl = await resolveTestDatabaseUrl(getBootstrapUrl(adminUrl))
    await ensureRoles(testUrl)
    admin = postgres(testUrl, { max: 1, onnotice: () => {} })
    await admin.unsafe('DROP SCHEMA IF EXISTS public CASCADE')
    await admin.unsafe('CREATE SCHEMA public')
    await admin.unsafe('GRANT ALL ON SCHEMA public TO CURRENT_USER')
    await applyMigration(testUrl)
    app = postgres(getAppDatabaseUrl(testUrl), { max: 4, onnotice: () => {} })

    await admin`
      INSERT INTO companies (
        id, legal_name, cnpj, email, phone,
        street, street_number, neighborhood, postal_code, city, state, tax_regime
      ) VALUES
        (${companyA}, 'Loja A', '11222333000181', 'a@loja.com', '41999990000',
         'Rua A', '1', 'Centro', '80010010', 'Curitiba', 'PR', 'simples_nacional'),
        (${companyB}, 'Loja B', '23232323000100', 'b@loja.com', '41999990001',
         'Rua B', '2', 'Centro', '80010010', 'Curitiba', 'PR', 'mei')
    `
  }, 30_000)

  afterAll(async () => {
    await app?.end({ timeout: 5 })
    await admin?.end({ timeout: 5 })
  })

  it('consulta sem app.company_id falha — RF-121', async () => {
    await expect(app`SELECT id FROM customers`).rejects.toThrow(/app\.company_id/)
  })

  it('partners e coupons sao da plataforma: leitura sem app.company_id', async () => {
    const partnerId = randomUUID()
    const couponId = randomUUID()
    await admin`
      INSERT INTO partners (id, name) VALUES (${partnerId}, 'Clube X')
    `
    await admin`
      INSERT INTO coupons (id, partner_id, code, kind, percent)
      VALUES (${couponId}, ${partnerId}, 'CLUBEX10', 'percent', 10)
    `

    const partners = await app<{ id: string; name: string }[]>`
      SELECT id, name FROM partners WHERE id = ${partnerId}
    `
    expect(partners).toEqual([{ id: partnerId, name: 'Clube X' }])

    const coupons = await app<{ id: string; code: string }[]>`
      SELECT id, code FROM coupons WHERE id = ${couponId}
    `
    expect(coupons).toEqual([{ id: couponId, code: 'CLUBEX10' }])
  })

  it('com tenant, nao enxerga linha de outra empresa — RF-122', async () => {
    await admin`
      INSERT INTO customers (id, company_id, name) VALUES
        (${customerA}, ${companyA}, 'Cliente A'),
        (${customerB}, ${companyB}, 'Cliente B')
    `

    const seen = await withTenant(
      app,
      companyA,
      (tx) => tx<{ id: string; name: string }[]>`
      SELECT id, name FROM customers ORDER BY name
    `,
    )

    expect(seen).toEqual([{ id: customerA, name: 'Cliente A' }])
  })

  it('nao cria company_focus ate a empresa encaminhar a Focus', async () => {
    const rows = await admin<{ n: number }[]>`SELECT count(*)::int AS n FROM company_focus`
    expect(rows[0]?.n).toBe(0)
  })

  it('nao cria company_asaas ate o lojista iniciar o KYC', async () => {
    const rows = await admin<{ n: number }[]>`SELECT count(*)::int AS n FROM company_asaas`
    expect(rows[0]?.n).toBe(0)
  })

  it('register_owner cria usuario sem empresa; attach_user_company liga depois', async () => {
    const userId = randomUUID()
    await app`SELECT register_owner(${userId}, 'Dona', 'dona@loja.com', '41999990002', 'hash')`

    const before = await admin<{ company_id: string | null }[]>`
      SELECT company_id FROM users WHERE id = ${userId}
    `
    expect(before[0]?.company_id).toBeNull()

    await app`SELECT attach_user_company(${userId}, ${companyA})`

    const after = await admin<{ company_id: string }[]>`
      SELECT company_id FROM users WHERE id = ${userId}
    `
    expect(after[0]?.company_id).toBe(companyA)
  })

  it('nao cria subscription_asaas ate o billing gravar a assinatura na conta-pai', async () => {
    const rows = await admin<{ n: number }[]>`SELECT count(*)::int AS n FROM subscription_asaas`
    expect(rows[0]?.n).toBe(0)
  })

  it('audit_logs rejeita UPDATE do papel da aplicacao — RF-124', async () => {
    const logId = randomUUID()
    await admin`
      INSERT INTO audit_logs (id, company_id, channel, entity_type, entity_id, action)
      VALUES (${logId}, ${companyA}, 'app', 'customers', ${randomUUID()}, 'created')
    `

    await expect(
      withTenant(
        app,
        companyA,
        (tx) => tx`UPDATE audit_logs SET action = 'updated' WHERE id = ${logId}`,
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('produto nao mistura NCM com codigo de servico nacional', async () => {
    await expect(
      admin`
        INSERT INTO products (
          id, company_id, kind, description, unit_of_measure,
          sale_price_cents, cost_price_cents, ncm, codigo_nbs
        ) VALUES (
          ${randomUUID()}, ${companyA}, 'product', 'Camisa', 'UN',
          1000, 400, '61091000', '12345678'
        )
      `,
    ).rejects.toThrow(/products_kind_fiscal_check/)
  })
})
