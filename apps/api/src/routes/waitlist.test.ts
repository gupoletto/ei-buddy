import { InMemoryWaitlist } from '@na-regua/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { registerWaitlistRoutes } from './waitlist.js'

/**
 * Lista de espera do pre-lancamento, pelo ciclo real do Fastify — NR-111.
 *
 * Sem `onRequest` de sessao, ao contrario das outras suites de rota: e
 * exatamente isso que esta suite prova — a rota funciona sem `principal`
 * nenhum, porque e publica.
 */

const PAYLOAD_MINIMO = {
  name: 'Maria Souza',
  phone: '(41) 99876-5432',
  expectation: 'Queria saber o que vendi no dia sem abrir planilha.',
}

async function buildApp() {
  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRateLimit(app)

  const waitlist = new InMemoryWaitlist()
  registerWaitlistRoutes(app, { waitlist })

  return { app, waitlist }
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
