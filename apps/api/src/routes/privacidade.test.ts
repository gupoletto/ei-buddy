import { COLECOES_DA_EXPORTACAO, InMemoryAuditTrail } from '@na-regua/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerErrorHandler } from '../plugins/error-handler.js'
import type { AuthenticatedPrincipal } from '../plugins/execution-context.js'
import { registerRateLimit } from '../plugins/rate-limit.js'
import { type PrivacidadeDeps, registerPrivacidadeRoutes } from './privacidade.js'

/**
 * As rotas dos direitos do titular — NR-086, RF-125, RF-127.
 *
 * Quem pode o que fica em `core` e e testado la. O que se prova AQUI e a
 * fiacao: que o `sink` nasce por requisicao, que o id vem do caminho e nao do
 * corpo, e que o corpo devolvido e o manifesto e o comprovante — nao um `ok`.
 *
 * Falsos em vez de Postgres: a leitura das 21 colecoes e a anonimizacao
 * transacional sao exercitadas por `packages/db/src/privacidade.test`.
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

  /** Quantos destinos foram criados, e para quem. */
  const destinos: string[] = []

  const deps = {
    source: {
      /*
       * TODAS as colecoes, e nao uma amostra.
       *
       * A primeira versao deste falso declarava saber ler `customers` so, e a
       * rota respondeu 500: `confereQueNadaFicouDeFora`, em `core`, recusa
       * exportar quando o repositorio nao cobre o contrato inteiro. A guarda
       * pegou o proprio teste — que e o comportamento que ela existe para ter.
       */
      collections: () => COLECOES_DA_EXPORTACAO,
      readPage: async () => ({ rows: [{ id: 'c1' }], nextCursor: undefined }),
    },
    criarDestino: (companyId: string) => {
      destinos.push(companyId)
      return {
        writeRows: async () => undefined,
        finish: async () => ({ location: '/tmp/pacote' }),
      }
    },
    subjects: {
      findCustomer: async (_c: string, id: string) => ({
        id,
        name: 'Maria',
        phone: '41988887777',
        email: null,
        taxId: null,
        address: null,
        walletBalanceCents: 0,
        anonymizedAt: null,
      }),
      anonymizeCustomer: async () => ({
        salesPreserved: 3,
        receivablesPreserved: 1,
        fiscalDocumentsPreserved: 2,
        messagesDeleted: 0,
      }),
    },
    audit: new InMemoryAuditTrail(),
  } as unknown as PrivacidadeDeps

  registerPrivacidadeRoutes(app, deps)
  return { app, destinos }
}

let app: FastifyInstance

afterEach(async () => {
  await app?.close()
})

describe('exportar — RF-125', () => {
  it('devolve 201 com o manifesto, e nao um ok', async () => {
    const c = await buildApp()
    app = c.app

    const r = await app.inject({ method: 'POST', url: '/privacidade/exportacoes' })

    expect(r.statusCode).toBe(201)
    /* O manifesto e o que permite conferir se veio tudo. Sem ele, quem recebe
       o pacote so pode confiar — e confiar e o que a portabilidade nao deveria
       exigir. */
    const manifesto = r.json().manifest
    expect(manifesto.collections).toHaveLength(COLECOES_DA_EXPORTACAO.length)
    expect(manifesto.collections).toContainEqual({
      name: 'customers',
      rows: 1,
      file: 'customers.jsonl',
    })
    /* E as notas fiscais estao la — a colecao que faltava no contrato. */
    expect(manifesto.collections.map((c: { name: string }) => c.name)).toContain('invoices')
    expect(r.json().location).toBe('/tmp/pacote')
  })

  /*
   * Um destino por requisicao. Um `sink` compartilhado faria duas exportacoes
   * simultaneas escreverem no mesmo pacote — e o resultado nao seria erro,
   * seria um pacote com dados de duas lojas dentro.
   */
  it('cria um destino por exportacao, com a empresa da sessao', async () => {
    const c = await buildApp()
    app = c.app

    await app.inject({ method: 'POST', url: '/privacidade/exportacoes' })
    await app.inject({ method: 'POST', url: '/privacidade/exportacoes' })

    expect(c.destinos).toEqual(['empresa-1', 'empresa-1'])
  })

  it('recusa sem sessao', async () => {
    const c = await buildApp(null)
    app = c.app

    expect((await app.inject({ method: 'POST', url: '/privacidade/exportacoes' })).statusCode).toBe(
      401,
    )
  })
})

describe('anonimizar — RF-127, RF-128', () => {
  const pedido = (url: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url, payload })

  it('devolve o comprovante, com o que ficou e por que', async () => {
    const c = await buildApp()
    app = c.app

    const r = await pedido('/clientes/cli-9/anonimizacao', {
      reason: 'titular pediu por e-mail em 09/09',
    })

    /* 200 e nao 201: nada foi criado. E o corpo e o COMPROVANTE — o titular
       pediu exclusao e recebeu anonimizacao, e a diferenca precisa estar
       escrita. */
    expect(r.statusCode).toBe(200)
    expect(r.json().customerId).toBe('cli-9')
    expect(r.json().scrubbedFields).toContain('street')
    expect(r.json().preserved.map((p: { rows: number }) => p.rows)).toEqual([3, 1, 2])
  })

  /*
   * O id vem do CAMINHO. Aceitar o do corpo abriria espaco para discordarem, e
   * a anonimizacao cairia em outra pessoa — numa operacao que nao desfaz.
   */
  it('ignora o id do corpo e usa o do caminho', async () => {
    const c = await buildApp()
    app = c.app

    const r = await pedido('/clientes/cli-9/anonimizacao', {
      customerId: 'cli-OUTRO',
      reason: 'titular pediu por e-mail em 09/09',
    })

    expect(r.json().customerId).toBe('cli-9')
  })

  /* O motivo e o fundamento legal da operacao, e vai para a trilha. */
  it('recusa sem motivo', async () => {
    const c = await buildApp()
    app = c.app

    expect((await pedido('/clientes/cli-9/anonimizacao', {})).statusCode).toBe(400)
  })

  it('recusa motivo curto demais para explicar nada', async () => {
    const c = await buildApp()
    app = c.app

    expect((await pedido('/clientes/cli-9/anonimizacao', { reason: 'pediu' })).statusCode).toBe(400)
  })
})
