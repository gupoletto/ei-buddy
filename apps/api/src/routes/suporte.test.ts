import type { SupportRepository } from '@na-regua/core'
import type { TicketDetail, TicketSummary } from '@na-regua/contracts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import type { AuthenticatedPrincipal } from '../plugins/execution-context.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { registerSuporteRoutes, type SuporteDeps } from './suporte.js'

/**
 * Rotas de suporte — NR-080, US-062.
 *
 * As regras tem teste em `core` e as consultas em `db`. Aqui se prova o que so
 * a rota faz: o codigo que sai, a forma que entra, e a separacao entre LER o
 * chamado e ABRIR o chamado — que e o que decide se o aviso de resposta nova
 * apaga ou nao.
 */

const PRINCIPAL: AuthenticatedPrincipal = {
  companyId: 'empresa-1',
  userId: 'usuario-1',
  role: 'owner',
}

const AGORA = '2026-09-07T12:00:00.000Z'

const resumo = (over: Partial<TicketSummary> = {}): TicketSummary => ({
  id: 'ch-1',
  protocol: '2026-0001',
  subject: 'Nota saiu com CFOP errado',
  category: 'tecnico',
  status: 'open',
  createdAt: AGORA,
  updatedAt: AGORA,
  unread: 0,
  ...over,
})

const detalhe = (over: Partial<TicketDetail> = {}): TicketDetail => ({
  ...resumo(),
  messages: [
    {
      id: 'm-1',
      author: 'cliente',
      authorName: 'Dona Marina',
      body: 'A nota saiu errada.',
      attachment: null,
      createdAt: AGORA,
    },
  ],
  ...over,
})

function repositorio(over: Partial<SupportRepository> = {}) {
  const chamadas: string[] = []

  const support: SupportRepository = {
    list: async () => {
      chamadas.push('list')
      return []
    },
    findById: async () => {
      chamadas.push('findById')
      return detalhe()
    },
    open: async () => {
      chamadas.push('open')
      return detalhe()
    },
    reply: async () => {
      chamadas.push('reply')
      return detalhe()
    },
    markRead: async () => {
      chamadas.push('markRead')
    },
    ...over,
  }

  return { support, chamadas }
}

async function buildApp(over: Partial<SupportRepository> = {}) {
  const { support, chamadas } = repositorio(over)
  const deps: SuporteDeps = { support, quemEscreve: async () => 'Dona Marina' }

  const app = Fastify({ logger: false })
  registerErrorHandler(app)
  await registerRateLimit(app)
  app.addHook('onRequest', async (request) => {
    request.principal = PRINCIPAL
  })
  registerSuporteRoutes(app, deps)

  return { app, chamadas }
}

let app: FastifyInstance

afterEach(async () => {
  await app?.close()
})

describe('a lista — GET /suporte/chamados', () => {
  it('devolve os chamados com os dois numeros do topo', async () => {
    const c = await buildApp({
      list: async () => [
        resumo({ id: 'a', status: 'open', unread: 2 }),
        resumo({ id: 'b', status: 'closed', unread: 0 }),
        resumo({ id: 'c', status: 'waiting', unread: 1 }),
      ],
    })
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/suporte/chamados' })

    expect(r.statusCode).toBe(200)
    expect(r.json().tickets).toHaveLength(3)
    /* Abertos NAO conta o encerrado; nao lidas soma as dos tres. */
    expect(r.json().open).toBe(2)
    expect(r.json().unread).toBe(3)
  })
})

describe('abrir e responder', () => {
  it('abre com 201 e devolve o protocolo', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/suporte/chamados',
      payload: {
        subject: 'Nota saiu com CFOP errado',
        category: 'tecnico',
        body: 'A nota da venda 42 saiu com o CFOP de outra operacao.',
      },
    })

    expect(r.statusCode).toBe(201)
    /* O protocolo e o que a pessoa anota — tem de voltar na criacao. */
    expect(r.json().protocol).toBe('2026-0001')
  })

  it('recusa assunto curto demais para alguem entender', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/suporte/chamados',
      payload: { subject: 'erro', category: 'tecnico', body: 'Aconteceu um problema aqui.' },
    })

    /* "erro" nao e assunto: custa uma ida e volta so para descobrir do que se
       trata. */
    expect(r.statusCode).toBe(400)
  })

  it('recusa descricao curta demais', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/suporte/chamados',
      payload: { subject: 'Um assunto legivel', category: 'tecnico', body: 'nao vai' },
    })

    expect(r.statusCode).toBe(400)
  })

  it('a resposta usa o id do CAMINHO, e ignora o do corpo', async () => {
    const c = await buildApp({
      reply: async (m) => {
        /* Aceitar os dois abriria espaco para discordarem, e a mensagem cairia
           em outro chamado. */
        expect(m.ticketId).toBe('ch-do-caminho')
        return detalhe()
      },
    })
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/suporte/chamados/ch-do-caminho/mensagens',
      payload: { ticketId: 'ch-do-corpo', body: 'Continua acontecendo.' },
    })

    expect(r.statusCode).toBe(201)
  })

  it('responder chamado inexistente volta 404', async () => {
    const c = await buildApp({ reply: async () => undefined })
    app = c.app

    const r = await app.inject({
      method: 'POST',
      url: '/suporte/chamados/nao-existe/mensagens',
      payload: { body: 'Ninguem vai ler.' },
    })

    expect(r.statusCode).toBe(404)
  })
})

describe('ler nao e o mesmo que abrir', () => {
  it('GET do detalhe NAO marca lido', async () => {
    const c = await buildApp({ findById: async () => detalhe({ unread: 3 }) })
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/suporte/chamados/ch-1' })

    expect(r.statusCode).toBe(200)
    /*
     * Recarregar a tela nao pode apagar o aviso de resposta nova. Quem marca e
     * a acao de ABRIR, e nao a de olhar — e por isso as duas rotas existem.
     */
    expect(c.chamadas).not.toContain('markRead')
    expect(r.json().unread).toBe(3)
  })

  it('PATCH marca lido e ja devolve o chamado sem as nao lidas', async () => {
    const c = await buildApp({ findById: async () => detalhe({ unread: 3 }) })
    app = c.app

    const r = await app.inject({ method: 'PATCH', url: '/suporte/chamados/ch-1' })

    expect(r.statusCode).toBe(200)
    expect(c.chamadas).toContain('markRead')
    /* Marcar e devolver juntos: duas idas fariam o badge piscar, apagando
       depois que a conversa ja apareceu. */
    expect(r.json().unread).toBe(0)
  })

  it('chamado de outra loja volta 404, e nao 403', async () => {
    const c = await buildApp({ findById: async () => undefined })
    app = c.app

    const r = await app.inject({ method: 'GET', url: '/suporte/chamados/de-outra-loja' })

    /* 404 e nao 403: dizer "existe, mas nao e seu" confirmaria a existencia de
       um chamado de outra empresa. */
    expect(r.statusCode).toBe(404)
  })
})
