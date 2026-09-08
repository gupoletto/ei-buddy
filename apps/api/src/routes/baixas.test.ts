import type { SettlementOutput } from '@na-regua/contracts'
import { InMemoryAuditTrail } from '@na-regua/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import type { AuthenticatedPrincipal } from '../plugins/execution-context.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { type BaixasDeps, registerBaixasRoutes } from './baixas.js'

/**
 * As rotas de baixa e estorno pelo ciclo real do Fastify — RF-059 a RF-067.
 *
 * O arquivo nao existia. As rotas de POST entraram na NR-029 sem teste proprio,
 * e o GET do historico entrou agora — e e justamente o GET que a tela precisa
 * para poder estornar, porque o estorno endereca a BAIXA e nao o titulo.
 *
 * Falsos em vez de Postgres: o que estas rotas prometem e um par status +
 * corpo, e para qual TIPO de titulo cada caminho pergunta. As duas tabelas de
 * baixa, o RLS e a transacao sao exercitados por `packages/db/src/baixas.test`.
 */

const PRINCIPAL: AuthenticatedPrincipal = {
  companyId: 'empresa-1',
  userId: 'usuario-1',
  role: 'owner',
}

const baixa = (dados: Partial<SettlementOutput> = {}): SettlementOutput => ({
  id: 'baixa-1',
  payableId: null,
  receivableId: null,
  amountCents: 10_000,
  method: null,
  bankAccount: null,
  settledOn: '2026-09-08',
  notes: null,
  reversesId: null,
  createdBy: 'usuario-1',
  createdAt: '2026-09-08T12:00:00.000Z',
  ...dados,
})

/** O que a rota pediu, para o teste conferir QUAL pergunta ela fez. */
type Pergunta = { companyId: string; tipo: string; tituloId: string }

async function buildApp(principal: AuthenticatedPrincipal | null = PRINCIPAL) {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRateLimit(app)
  app.addHook('onRequest', async (request) => {
    if (principal !== null) request.principal = principal
  })

  const perguntas: Pergunta[] = []

  const deps = {
    settlements: {
      listByTitulo: async (companyId: string, tipo: string, tituloId: string) => {
        perguntas.push({ companyId, tipo, tituloId })
        return [baixa({ payableId: tipo === 'payable' ? tituloId : null })]
      },
    },
    uow: {},
    audit: new InMemoryAuditTrail(),
  }

  registerBaixasRoutes(app, deps as unknown as BaixasDeps)
  return { app, perguntas }
}

let app: FastifyInstance

afterEach(async () => {
  await app?.close()
})

describe('historico de baixas — RF-067', () => {
  it('devolve as baixas da conta a pagar', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/contas-a-pagar/conta-9/baixas' })

    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveLength(1)
    expect(r.json()[0].id).toBe('baixa-1')
  })

  /*
   * Duas rotas irmas que NAO podem se confundir: o id de um titulo a pagar
   * nunca e o de um a receber, e as baixas moram em tabelas diferentes.
   * Perguntar pelo tipo errado devolveria "sem baixas" para um titulo baixado —
   * e a pessoa concluiria que nao ha nada para estornar.
   */
  it('pergunta pelo tipo que o caminho diz, e nao por um so', async () => {
    const c = await buildApp()
    app = c.app

    await app.inject({ method: 'GET', url: '/contas-a-pagar/conta-9/baixas' })
    await app.inject({ method: 'GET', url: '/contas-a-receber/titulo-7/baixas' })

    expect(c.perguntas).toEqual([
      { companyId: 'empresa-1', tipo: 'payable', tituloId: 'conta-9' },
      { companyId: 'empresa-1', tipo: 'receivable', tituloId: 'titulo-7' },
    ])
  })

  /* A empresa vem do PRINCIPAL, nunca do cliente — principio 8. */
  it('usa a empresa da sessao, e nao a do pedido', async () => {
    const c = await buildApp({ ...PRINCIPAL, companyId: 'empresa-2' })
    app = c.app

    await app.inject({ method: 'GET', url: '/contas-a-pagar/conta-9/baixas?companyId=empresa-1' })

    expect(c.perguntas[0]!.companyId).toBe('empresa-2')
  })

  it('recusa sem sessao', async () => {
    const c = await buildApp(null)
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/contas-a-pagar/conta-9/baixas' })

    expect(r.statusCode).toBe(401)
  })
})
