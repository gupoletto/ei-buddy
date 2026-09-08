import { InMemoryAuditTrail, InMemoryReceivables } from '@na-regua/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import type { AuthenticatedPrincipal } from '../plugins/execution-context.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { type ContasDeps, registerContasRoutes } from './contas.js'

/**
 * A rota de contas a receber pelo ciclo real do Fastify — RF-064, RF-066.
 *
 * Ela faltava inteira. A baixa de recebivel existe desde a NR-029
 * (`POST /contas-a-receber/:id/baixas`), mas nao havia como LISTAR o que
 * baixar: a tela do mobile e a do web mostravam recebiveis de exemplo, e o
 * botao de baixa apontava para ids que nao existiam no banco.
 *
 * Repositorio em memoria: o que a rota promete e um par status + corpo, e
 * provar isso nao precisa de Postgres. O `receivable-repository` de verdade e
 * exercitado pelas suites de `db`.
 */

const PRINCIPAL: AuthenticatedPrincipal = {
  companyId: 'empresa-1',
  userId: 'usuario-1',
  role: 'owner',
}

async function buildApp(
  principal: AuthenticatedPrincipal | null = PRINCIPAL,
  receivables = new InMemoryReceivables(),
) {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRateLimit(app)
  app.addHook('onRequest', async (request) => {
    if (principal !== null) request.principal = principal
  })

  const deps = {
    receivables,
    /* A rota de contas a pagar convive neste arquivo; ela nao e exercitada
       aqui, e um falso vazio basta para o registro nao quebrar. */
    queries: { list: async () => [] },
    uow: {},
    ids: { next: () => 'id' },
    audit: new InMemoryAuditTrail(),
  }

  registerContasRoutes(app, deps as unknown as ContasDeps)
  return { app, receivables }
}

let app: FastifyInstance

afterEach(async () => {
  await app?.close()
})

const doGrupo = (corpo: { grupos: { faixa: string; receivables: unknown[] }[] }, faixa: string) =>
  corpo.grupos.find((g) => g.faixa === faixa)!

describe('contas a receber — RF-064, RF-066', () => {
  it('devolve os grupos por vencimento e o total', async () => {
    const c = await buildApp()
    app = c.app
    c.receivables.adicionar('empresa-1', { dueDate: '2020-01-01', amountCents: 30_000 })

    const r = await app.inject({ method: 'GET', url: '/contas-a-receber' })

    expect(r.statusCode).toBe(200)
    expect(r.json().totalCents).toBe(30_000)
    expect(doGrupo(r.json(), 'overdue').receivables).toHaveLength(1)
  })

  it('lista vazia responde 200 com total zero, e nao 404', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/contas-a-receber' })

    /* "Nao ha nada a receber" e uma resposta legitima — e a de uma loja que
       so vende a vista. 404 diria que a lista nao existe. */
    expect(r.statusCode).toBe(200)
    expect(r.json().totalCents).toBe(0)
    expect(r.json().temVencidas).toBe(false)
  })

  it('recebivel de outra loja nao aparece', async () => {
    const c = await buildApp()
    app = c.app
    c.receivables.adicionar('outra-empresa', { dueDate: '2020-01-01', amountCents: 99_999 })

    const r = await app.inject({ method: 'GET', url: '/contas-a-receber' })

    expect(r.json().totalCents).toBe(0)
  })

  it('o que ja foi recebido fica de fora', async () => {
    const c = await buildApp()
    app = c.app
    c.receivables.adicionar('empresa-1', { dueDate: '2020-01-01', status: 'settled' })

    expect((await app.inject({ method: 'GET', url: '/contas-a-receber' })).json().totalCents).toBe(
      0,
    )
  })

  it('accountant consulta — e somente leitura, e e quem mais le esta tela', async () => {
    const c = await buildApp({ ...PRINCIPAL, role: 'accountant' })
    app = c.app
    c.receivables.adicionar('empresa-1', { dueDate: '2020-01-01' })

    expect((await app.inject({ method: 'GET', url: '/contas-a-receber' })).statusCode).toBe(200)
  })

  it('sem sessao responde 401', async () => {
    const c = await buildApp(null)
    app = c.app

    expect((await app.inject({ method: 'GET', url: '/contas-a-receber' })).statusCode).toBe(401)
  })

  /* As duas listas convivem no mesmo arquivo de rotas, sob prefixos parecidos:
     trocar uma pela outra devolveria o dinheiro que SAI onde se esperava o que
     entra. */
  it('nao confunde contas a receber com contas a pagar', async () => {
    const c = await buildApp()
    app = c.app
    c.receivables.adicionar('empresa-1', { dueDate: '2020-01-01', amountCents: 30_000 })

    const aPagar = await app.inject({ method: 'GET', url: '/contas-a-pagar' })

    expect(aPagar.statusCode).toBe(200)
    expect(aPagar.json().totalCents).toBe(0)
  })
})
