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
import { LIMITE_DE_AUTENTICACAO } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

export type WaitlistRouteDeps = SubmitWaitlistEntryDeps & WaitlistAdminDeps

/** Mesma exigencia de `/admin/*`: so precisa de sessao, nao de empresa ativa. */
function usuarioDaSessao(request: FastifyRequest): string {
  const claims = request.sessionClaims
  if (claims === undefined) throw AppError.unauthorized('Entre na sua conta para continuar.')
  return claims.userId
}

/**
 * Lista de espera do pre-lancamento — NR-111.
 *
 * `POST /lista-vip` e PUBLICA: sem `requireContext`, como `POST /auth/signup`
 * — quem responde nao tem sessao. `LIMITE_DE_AUTENTICACAO` (10/min) e nao
 * `LIMITE_DE_ESCRITA`: a mesma exposicao do signup, por ser um POST publico
 * na internet aberta.
 *
 * As duas rotas `/admin/lista-vip*` exigem sessao (nao `requireContext`,
 * porque Super Admin pode nao ter empresa ativa — mesmo padrao de
 * `routes/admin.ts`) e `isPlatformAdmin`, conferido DENTRO do caso de uso.
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

  app.get('/admin/lista-vip', async (request, reply) => {
    const userId = usuarioDaSessao(request)
    const input = validate(listWaitlistEntriesQuerySchema, request.query ?? {})

    const pagina = await listWaitlistEntries(deps, userId, {
      ...(input.q === undefined || input.q === '' ? {} : { termo: input.q }),
      offset: (input.page - 1) * input.pageSize,
      limite: input.pageSize,
    })

    return reply.code(200).send({
      entries: pagina.entries,
      total: pagina.total,
      page: input.page,
      pageSize: input.pageSize,
    })
  })

  app.get('/admin/lista-vip/resumo', async (request, reply) => {
    const userId = usuarioDaSessao(request)

    const resumo = await getWaitlistStats(deps, userId)

    return reply.code(200).send(resumo)
  })
}
