import { timingSafeEqual } from 'node:crypto'
import { createWaitlistEntryInputSchema, listWaitlistEntriesQuerySchema } from '@na-regua/contracts'
import {
  AppError,
  getWaitlistStats,
  listWaitlistEntries,
  submitWaitlistEntry,
  type SubmitWaitlistEntryDeps,
  type WaitlistAdminDeps,
} from '@na-regua/core'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { LIMITE_DE_AUTENTICACAO, LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

export type WaitlistRouteDeps = SubmitWaitlistEntryDeps &
  WaitlistAdminDeps & {
    /**
     * Chave provisoria de acesso sem sessao — NR-111, `env.WAITLIST_ADMIN_KEY`.
     * `undefined` desliga o caminho por completo (so sessao + isPlatformAdmin).
     */
    readonly waitlistAdminKey?: string | undefined
  }

/** Mesma exigencia de `/admin/*`: so precisa de sessao, nao de empresa ativa. */
function usuarioDaSessao(request: FastifyRequest): string {
  const claims = request.sessionClaims
  if (claims === undefined) throw AppError.unauthorized('Entre na sua conta para continuar.')
  return claims.userId
}

/**
 * Se o cabecalho `x-waitlist-admin-key` bate com a chave configurada.
 *
 * Comparacao em tempo constante: e um segredo comparado por igualdade, e
 * `===` vazaria quanto do prefixo bateu pelo tempo de resposta. O tamanho
 * precisa bater ANTES de chamar `timingSafeEqual` — ela lanca em buffers de
 * tamanho diferente, em vez de responder `false`.
 */
function chaveValida(request: FastifyRequest, chaveEsperada: string | undefined): boolean {
  if (chaveEsperada === undefined) return false

  const recebida = request.headers['x-waitlist-admin-key']
  if (typeof recebida !== 'string' || recebida.length !== chaveEsperada.length) return false

  return timingSafeEqual(Buffer.from(recebida), Buffer.from(chaveEsperada))
}

/**
 * Lista de espera do pre-lancamento — NR-111.
 *
 * `POST /lista-vip` e PUBLICA: sem `requireContext`, como `POST /auth/signup`
 * — quem responde nao tem sessao. `LIMITE_DE_AUTENTICACAO` (10/min) e nao
 * `LIMITE_DE_ESCRITA`: a mesma exposicao do signup, por ser um POST publico
 * na internet aberta.
 *
 * As duas rotas `/admin/lista-vip*` aceitam sessao (com `isPlatformAdmin`,
 * conferido DENTRO do caso de uso) OU a chave de `chaveValida` — ainda nao
 * existe o primeiro Super Admin, e o painel precisa funcionar antes disso.
 * Com a chave, chama o repositorio DIRETO (`deps.waitlist.*`): ela ja E a
 * prova de autorizacao, checar `isPlatformAdmin` de um usuario que nao
 * existe nao faria sentido. `LIMITE_DE_ESCRITA` (120/min, nao os 10/min de
 * autenticacao) porque a busca da tela dispara a cada tecla, sem debounce.
 */
export function registerWaitlistRoutes(app: FastifyInstance, deps: WaitlistRouteDeps): void {
  app.post(
    '/lista-vip',
    { config: { rateLimit: LIMITE_DE_AUTENTICACAO } },
    async (request, reply) => {
      const input = validate(createWaitlistEntryInputSchema, request.body)

      const entrada = await submitWaitlistEntry(deps, input, new Date())

      return reply.code(201).send(entrada)
    },
  )

  app.get(
    '/admin/lista-vip',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const input = validate(listWaitlistEntriesQuerySchema, request.query ?? {})
      const filtro = {
        ...(input.q === undefined || input.q === '' ? {} : { termo: input.q }),
        offset: (input.page - 1) * input.pageSize,
        limite: input.pageSize,
      }

      const pagina = chaveValida(request, deps.waitlistAdminKey)
        ? await deps.waitlist.list(filtro)
        : await listWaitlistEntries(deps, usuarioDaSessao(request), filtro)

      return reply.code(200).send({
        entries: pagina.entries,
        total: pagina.total,
        page: input.page,
        pageSize: input.pageSize,
      })
    },
  )

  app.get(
    '/admin/lista-vip/resumo',
    { config: { rateLimit: LIMITE_DE_ESCRITA } },
    async (request, reply) => {
      const resumo = chaveValida(request, deps.waitlistAdminKey)
        ? await deps.waitlist.stats()
        : await getWaitlistStats(deps, usuarioDaSessao(request))

      return reply.code(200).send(resumo)
    },
  )
}
