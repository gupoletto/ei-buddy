import type { FixedCostOutput } from '@na-regua/contracts'
import { InMemoryAuditTrail, InMemoryFixedCostGenerator, InMemoryFixedCosts } from '@na-regua/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import type { AuthenticatedPrincipal } from '../plugins/execution-context.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { type CustosFixosDeps, registerCustosFixosRoutes } from './custos-fixos.js'

/**
 * Custos fixos pelo ciclo real do Fastify — NR-110.
 *
 * Repositorio em memoria: o que a rota promete e um par status + corpo, e
 * provar isso nao precisa de Postgres. O `fixed-cost-repository` de verdade e
 * exercitado pelas suites de `db`.
 */

const PRINCIPAL: AuthenticatedPrincipal = {
  companyId: 'empresa-1',
  userId: 'usuario-1',
  role: 'owner',
}

async function buildApp(principal: AuthenticatedPrincipal | null = PRINCIPAL) {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRateLimit(app)
  app.addHook('onRequest', async (request) => {
    if (principal !== null) request.principal = principal
  })

  const fixedCosts = new InMemoryFixedCosts()
  const generator = new InMemoryFixedCostGenerator()
  const audit = new InMemoryAuditTrail()

  const deps: CustosFixosDeps = { fixedCosts, generator, audit }
  registerCustosFixosRoutes(app, deps)

  return { app, fixedCosts, generator }
}

let app: FastifyInstance

afterEach(async () => {
  await app?.close()
})

describe('cadastrar — POST /custos-fixos', () => {
  it('cria com 201', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/custos-fixos',
      payload: { name: 'Aluguel do ponto', amountCents: 150_000, dueDay: 5 },
    })

    expect(r.statusCode).toBe(201)
    expect(r.json().name).toBe('Aluguel do ponto')
  })

  it('recusa nome curto demais', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/custos-fixos',
      payload: { name: 'A', amountCents: 150_000, dueDay: 5 },
    })

    expect(r.statusCode).toBe(400)
  })

  it('recusa dia fora de 1 a 31', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/custos-fixos',
      payload: { name: 'Aluguel', amountCents: 150_000, dueDay: 32 },
    })

    expect(r.statusCode).toBe(400)
  })

  it('accountant nao cadastra', async () => {
    const c = await buildApp({ ...PRINCIPAL, role: 'accountant' })
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/custos-fixos',
      payload: { name: 'Aluguel', amountCents: 150_000, dueDay: 5 },
    })

    expect(r.statusCode).toBe(403)
  })
})

describe('listar — GET /custos-fixos', () => {
  it('devolve os custos da empresa', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({
      method: 'POST',
      url: '/custos-fixos',
      payload: { name: 'Aluguel', amountCents: 150_000, dueDay: 5 },
    })

    const r = await app.inject({ method: 'GET', url: '/custos-fixos' })

    expect(r.statusCode).toBe(200)
    expect(r.json().fixedCosts).toHaveLength(1)
  })
})

describe('editar — PATCH /custos-fixos/:id', () => {
  it('redefine e devolve 200', async () => {
    const c = await buildApp()
    app = c.app
    const criado = (
      await app.inject({
        method: 'POST',
        url: '/custos-fixos',
        payload: { name: 'Aluguel', amountCents: 150_000, dueDay: 5 },
      })
    ).json() as FixedCostOutput

    const r = await app.inject({
      method: 'PATCH',
      url: `/custos-fixos/${criado.id}`,
      payload: { name: 'Aluguel novo', amountCents: 180_000, dueDay: 10 },
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().name).toBe('Aluguel novo')
  })

  it('id inexistente responde 404', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'PATCH',
      url: '/custos-fixos/nao-existe',
      payload: { name: 'Aluguel', amountCents: 150_000, dueDay: 5 },
    })

    expect(r.statusCode).toBe(404)
  })
})

describe('excluir — DELETE /custos-fixos/:id', () => {
  it('apaga e devolve 204', async () => {
    const c = await buildApp()
    app = c.app
    const criado = (
      await app.inject({
        method: 'POST',
        url: '/custos-fixos',
        payload: { name: 'Aluguel', amountCents: 150_000, dueDay: 5 },
      })
    ).json() as FixedCostOutput

    const r = await app.inject({ method: 'DELETE', url: `/custos-fixos/${criado.id}` })

    expect(r.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/custos-fixos' })).json().fixedCosts).toEqual(
      [],
    )
  })
})

describe('gerar as contas do mes — POST /custos-fixos/gerar', () => {
  it('gera e devolve o resumo', async () => {
    const c = await buildApp()
    app = c.app
    await app.inject({
      method: 'POST',
      url: '/custos-fixos',
      payload: { name: 'Aluguel', amountCents: 150_000, dueDay: 5 },
    })

    const r = await app.inject({
      method: 'POST',
      url: '/custos-fixos/gerar',
      payload: { competencia: '2026-09' },
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().generatedCount).toBe(1)
    expect(r.json().alreadyExistedCount).toBe(0)
  })

  it('recusa competencia fora do formato AAAA-MM', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/custos-fixos/gerar',
      payload: { competencia: 'setembro' },
    })

    expect(r.statusCode).toBe(400)
  })

  it('accountant nao gera', async () => {
    const c = await buildApp({ ...PRINCIPAL, role: 'accountant' })
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/custos-fixos/gerar',
      payload: { competencia: '2026-09' },
    })

    expect(r.statusCode).toBe(403)
  })
})
