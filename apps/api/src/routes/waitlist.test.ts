import { InMemoryPlatformAdminAccess, InMemoryWaitlist } from '@na-regua/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { registerWaitlistRoutes } from './waitlist.js'

/**
 * Lista de espera do pre-lancamento, pelo ciclo real do Fastify — NR-111.
 *
 * `POST /lista-vip` nao tem `onRequest` de sessao, ao contrario das outras
 * suites de rota: e exatamente isso que a primeira parte desta suite prova —
 * a rota funciona sem `principal` nem `sessionClaims` nenhum, porque e
 * publica. `GET /admin/lista-vip*` exige `sessionClaims`, por isso o
 * `buildApp` aceita um `userId` opcional para simular sessao.
 */

const PAYLOAD_MINIMO = {
  name: 'Maria Souza',
  phone: '(41) 99876-5432',
  expectation: 'Queria saber o que vendi no dia sem abrir planilha.',
}

async function buildApp(userId: string | null = null) {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRateLimit(app)
  app.addHook('onRequest', async (request) => {
    if (userId !== null) request.sessionClaims = { userId, companyId: null }
  })

  const waitlist = new InMemoryWaitlist()
  const platformAdmin = new InMemoryPlatformAdminAccess({ aoEntrar: () => {}, aoSair: () => {} })
  registerWaitlistRoutes(app, { waitlist, platformAdmin })

  return { app, waitlist, platformAdmin }
}

let app: FastifyInstance

afterEach(async () => {
  await app?.close()
})

describe('lista de espera do pre-lancamento — POST /lista-vip', () => {
  it('cria com 201 mesmo sem sessao nenhuma — a rota e publica', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'POST', url: '/lista-vip', payload: PAYLOAD_MINIMO })

    expect(r.statusCode).toBe(201)
    expect(r.json().name).toBe('Maria Souza')
    expect(c.waitlist.todas()).toHaveLength(1)
  })

  it('celular chega com mascara e sai so em digitos', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'POST', url: '/lista-vip', payload: PAYLOAD_MINIMO })

    expect(r.json().phone).toBe('41998765432')
  })

  it('sem expectativa responde 400 — e a unica pergunta aberta obrigatoria', async () => {
    const c = await buildApp()
    app = c.app
    const { expectation: _fora, ...semExpectativa } = PAYLOAD_MINIMO

    const r = await app.inject({ method: 'POST', url: '/lista-vip', payload: semExpectativa })

    expect(r.statusCode).toBe(400)
    expect(c.waitlist.todas()).toHaveLength(0)
  })

  it('grava dificuldades e o texto de "outra" quando vierem', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/lista-vip',
      payload: {
        ...PAYLOAD_MINIMO,
        painPoints: ['cash_flow', 'other'],
        painPointOther: 'Achar tempo para tudo',
      },
    })

    expect(r.statusCode).toBe(201)
    expect(r.json().painPoints).toEqual(['cash_flow', 'other'])
  })

  it('campo desconhecido responde 400 — o contrato e strict', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/lista-vip',
      payload: { ...PAYLOAD_MINIMO, empresa: 'Mercado da Maria' },
    })

    expect(r.statusCode).toBe(400)
  })
})

describe('painel do Super Admin — GET /admin/lista-vip*', () => {
  it('sem sessao nenhuma responde 401', async () => {
    const c = await buildApp(null)
    app = c.app

    expect((await app.inject({ method: 'GET', url: '/admin/lista-vip' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/admin/lista-vip/resumo' })).statusCode).toBe(
      401,
    )
  })

  it('com sessao mas sem ser Super Admin responde 403', async () => {
    const c = await buildApp('user-comum')
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/admin/lista-vip' })

    expect(r.statusCode).toBe(403)
  })

  it('Super Admin ve a lista paginada', async () => {
    const c = await buildApp('user-admin')
    app = c.app
    c.platformAdmin.tornarSuperAdmin('user-admin')
    await app.inject({ method: 'POST', url: '/lista-vip', payload: PAYLOAD_MINIMO })

    const r = await app.inject({ method: 'GET', url: '/admin/lista-vip' })

    expect(r.statusCode).toBe(200)
    expect(r.json().total).toBe(1)
    expect(r.json().entries[0].name).toBe('Maria Souza')
  })

  it('Super Admin ve os agregados', async () => {
    const c = await buildApp('user-admin')
    app = c.app
    c.platformAdmin.tornarSuperAdmin('user-admin')
    await app.inject({
      method: 'POST',
      url: '/lista-vip',
      payload: { ...PAYLOAD_MINIMO, painPoints: ['cash_flow'] },
    })

    const r = await app.inject({ method: 'GET', url: '/admin/lista-vip/resumo' })

    expect(r.statusCode).toBe(200)
    expect(r.json().total).toBe(1)
    expect(r.json().painPoints).toEqual([{ value: 'cash_flow', count: 1 }])
  })
})
