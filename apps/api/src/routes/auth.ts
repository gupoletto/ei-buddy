import { loginInputSchema, selectCompanyInputSchema, signupInputSchema } from '@na-regua/contracts'
import {
  AppError,
  type AuthDeps,
  type LoginMeta,
  login,
  selectCompany,
  signup,
  type SignupDeps,
  loadProfile,
} from '@na-regua/core'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { LIMITE_DE_AUTENTICACAO } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Rotas de sessao — NR-014, RF-119, RF-120.
 *
 * As unicas rotas do sistema que NAO exigem principal: sao elas que o produzem.
 */

/**
 * O que a borda sabe e o caso de uso nao descobre sozinho.
 *
 * `origin` existe para desacelerar por origem alem de por identificador
 * (RF-120): sem ele, quem varre mil e-mails diferentes nunca bate no limite,
 * porque cada tentativa tem um identificador novo.
 *
 * Vem de `request.ip`, que o Fastify resolve. Atras de proxy isso exige
 * `trustProxy` configurado — enquanto nao estiver, o valor e o IP do proxy e a
 * desaceleracao por origem vira global. Fica registrado como limitacao real:
 * ela nao ABRE buraco, apenas desacelera demais.
 */
function meta(request: FastifyRequest, channel: 'app' | 'whatsapp' = 'app'): LoginMeta {
  return {
    requestId: request.id,
    origin: request.ip,
    channel,
    now: new Date(),
  }
}

/**
 * O cadastro precisa de MAIS que o login.
 *
 * Login so verifica e emite sessao; cadastro escreve empresa, usuario, vinculo
 * e plano de contas. Os dois vivem no mesmo arquivo porque sao a mesma porta de
 * entrada do sistema, e as dependencias somam em vez de se misturarem — assim
 * fica visivel que o cadastro toca mais coisa, e que o login continua nao
 * tocando nenhuma delas.
 */
export type AuthRouteDeps = AuthDeps & SignupDeps

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  /**
   * Entrar — RF-119, RF-120.
   *
   * Devolve 200 mesmo quando a sessao ainda nao tem empresa: quem opera mais de
   * uma loja entra e **depois** escolhe (US-059). Nao e estado de erro, e o
   * corpo diz qual e a situacao em `activeCompanyId` e `memberships`.
   */
  /**
   * Cadastro de conta — NR-014, RF-001, RF-002.
   *
   * PUBLICA: nao passa por `requireContext`. Quem cadastra ainda nao tem
   * sessao nem empresa — exigir contexto aqui seria exigir que a pessoa ja
   * estivesse dentro para poder entrar.
   *
   * O limite de autenticacao vale igual: e o mesmo tipo de superficie do login,
   * e sem ele o cadastro vira um jeito de descobrir quais CNPJ ja existem.
   */
  app.post(
    '/auth/signup',
    { config: { rateLimit: LIMITE_DE_AUTENTICACAO } },
    async (request, reply) => {
      const input = validate(signupInputSchema, request.body)

      const sessao = await signup(deps, input, new Date())

      /* 201: criou pessoa, loja e vinculo. E ja devolve a sessao aberta — quem
         acabou de cadastrar quer usar o sistema, nao digitar tudo de novo. */
      return reply.code(201).send(sessao)
    },
  )

  app.post(
    '/auth/login',
    { config: { rateLimit: LIMITE_DE_AUTENTICACAO } },
    async (request, reply) => {
      const input = validate(loginInputSchema, request.body)

      const sessao = await login(deps, input, meta(request))

      /* Sem `Set-Cookie`: o cliente e aplicativo e SPA, guarda o token e o manda
       no `Authorization`. Cookie exigiria CSRF, e CSRF exigiria uma decisao
       sobre dominio que a DEC-009 (hospedagem) ainda nao tomou. */
      return reply.code(200).send(sessao)
    },
  )

  /**
   * Escolher a loja a operar — RF-119.
   *
   * Precisa de sessao, mas **nao** de principal: o principal so existe depois
   * que ha empresa, e e exatamente isso que esta rota produz. Por isso le
   * `request.sessionClaims` direto.
   */
  app.post(
    '/auth/select-company',
    { config: { rateLimit: LIMITE_DE_AUTENTICACAO } },
    async (request, reply) => {
      const claims = request.sessionClaims
      if (claims === undefined) {
        throw AppError.unauthorized('Entre na sua conta para continuar.')
      }

      const input = validate(selectCompanyInputSchema, request.body)

      const sessao = await selectCompany(deps, claims, input, meta(request))

      return reply.code(200).send(sessao)
    },
  )

  /**
   * Quem sou eu — a tela de shell (NR-013) pergunta isso ao abrir.
   *
   * Devolve o que a sessao ja carrega, sem ida ao banco: quem precisa de dado
   * fresco chama a rota do recurso. Uma consulta aqui seria uma consulta em
   * toda abertura de tela.
   */
  /**
   * O perfil de quem esta logado — NR-013, RF-119.
   *
   * Separada de `/auth/me`, que responde so o que a sessao carrega, sem ida ao
   * banco. Esta VAI ao banco, e e por isso que sao duas: a barra do topo precisa
   * do nome da pessoa e da loja, e nome nao mora no token — se morasse, quem
   * renomeia a loja continuaria vendo o nome antigo ate a sessao expirar.
   *
   * Antes desta rota a tela mostrava "Marina Alves / Mercearia Sol Nascente"
   * fixo no codigo, para toda loja.
   */
  app.get('/auth/perfil', async (request, reply) => {
    const claims = request.sessionClaims
    if (claims === undefined) {
      throw AppError.unauthorized('Entre na sua conta para continuar.')
    }

    return reply.code(200).send(await loadProfile(deps, claims))
  })

  app.get('/auth/me', async (request, reply) => {
    const claims = request.sessionClaims
    if (claims === undefined) {
      throw AppError.unauthorized('Entre na sua conta para continuar.')
    }

    return reply.code(200).send({
      userId: claims.userId,
      activeCompanyId: claims.companyId,
      role: claims.companyId === null ? null : claims.role,
    })
  })
}
