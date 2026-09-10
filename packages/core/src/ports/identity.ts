import type { Credential, MembershipOutput, Role } from '@na-regua/contracts'
import type { CompanyId, UserId } from '../context.js'

/**
 * Portas da autenticacao — NR-014, RF-005, RF-119, RF-120.
 *
 * A divisao vem da [ADR-0002](../../../../docs/decisoes/adr/0002-autenticacao-identidade-propria.md):
 * **somos donos da sessao, alugamos a prova.** O provedor responde uma unica
 * pergunta — esta credencial e deste `subject`? — e nada mais. Empresa, papel e
 * token sao nossos, porque a RLS le `app.company_id` das nossas tabelas e papel
 * guardado num provedor seria adorno: duas fontes de verdade em que a que a
 * seguranca usa nao e a do provedor.
 */

/** O que o provedor devolve depois de conferir a credencial. */
export type VerifiedIdentity = {
  /**
   * Identificador da pessoa NO PROVEDOR, estavel e opaco.
   *
   * E por ele que amarramos a identidade externa ao nosso `users.id`, e nao
   * pelo e-mail: e-mail muda, e amarrar por ele faria uma troca de endereco no
   * provedor orfa a conta inteira.
   */
  readonly subject: string
  /** Contato que o provedor confirmou ser da pessoa. */
  readonly email: string | null
  readonly phone: string | null
}

export type IdentityProvider = {
  /**
   * `undefined` para credencial invalida — resultado, nao excecao.
   *
   * O caso de uso precisa tratar credencial errada e usuario inexistente
   * exatamente igual (RF-120), e isso fica obvio quando os dois sao um
   * `undefined` no mesmo `if`. Com excecao, seriam dois caminhos diferentes
   * que alguem teria de lembrar de convergir.
   */
  verify(credential: Credential): Promise<VerifiedIdentity | undefined>
}

/**
 * Quem sabe CRIAR uma credencial — NR-014.
 *
 * Porta separada de `IdentityProvider`, e nao um metodo a mais nela, porque
 * nem todo provedor a oferece: quando a identidade e alugada de verdade
 * (ADR-0002), quem cria a credencial e a tela DELE, e o nosso cadastro so
 * amarra a pessoa ja autenticada a uma empresa.
 *
 * Com `AUTH_PROVIDER=fake`, somos nos: o falso guarda o par e o login passa a
 * funcionar. Sem esta porta, o cadastro criava a empresa e o usuario e a pessoa
 * NAO conseguia entrar — o provedor falso nasce sem credencial nenhuma, entao
 * `verify` devolvia indefinido para todo mundo.
 */
export type IdentityRegistrar = {
  /**
   * Cria a credencial e devolve o `subject` que o provedor passa a usar.
   *
   * `undefined` quando o identificador ja existe no provedor — resultado, e nao
   * excecao, pelo mesmo motivo de `verify`: "ja tem conta" e uma resposta que o
   * cadastro precisa tratar, nao uma falha.
   */
  register(
    credential: Credential,
    dados: { readonly email: string | null; readonly phone: string | null },
  ): Promise<{ readonly subject: string } | undefined>
}

export type LocalUser = {
  readonly id: UserId
  readonly name: string
  readonly isActive: boolean
}

/**
 * Nossas tabelas de identidade: `users` e `company_users`.
 *
 * Sem `deleteUser` e sem `changeRole` — nao e esquecimento. Remover
 * funcionario e RF-006 e encerra sessao; mudar papel e escalada de privilegio.
 * As duas tem regra propria e entram quando a tarefa delas entrar.
 */
export type UserDirectory = {
  findById(userId: UserId): Promise<LocalUser | undefined>
  findBySubject(subject: string): Promise<LocalUser | undefined>
  findByEmail(email: string): Promise<LocalUser | undefined>
  findByPhone(phone: string): Promise<LocalUser | undefined>

  /**
   * Amarra o `subject` do provedor a um usuario nosso que ainda nao tem.
   *
   * Acontece no primeiro login de quem foi convidado: o convite criou a linha
   * em `users` com e-mail, e so quando a pessoa entra e que existe `subject`
   * para guardar.
   */
  attachSubject(userId: UserId, subject: string): Promise<void>

  /** So vinculos ATIVOS, e da loja ativa. Acesso revogado nao e vinculo. */
  listMemberships(userId: UserId): Promise<readonly MembershipOutput[]>

  findMembership(companyId: CompanyId, userId: UserId): Promise<MembershipOutput | undefined>

  /**
   * Cria a pessoa E o acesso, juntos.
   *
   * Uma operacao e nao duas, porque nao existe estado intermediario valido.
   * Usuario gravado sem vinculo nao consegue entrar — login com zero vinculos
   * responde falha (RF-120) — e ainda ocupa o e-mail no indice unico, o que
   * faz a segunda tentativa de convite responder "esta pessoa ja existe". O
   * convite passaria a ser impossivel, e a saida seria mexer no banco a mao.
   *
   * Nasce sem `auth_subject`: quem prova a identidade e o provedor, e ele so
   * conhece a pessoa no primeiro login, que e quando `attachSubject` roda.
   */
  createUserWithAccess(convite: {
    readonly companyId: CompanyId
    readonly name: string
    readonly email: string | null
    readonly phone: string | null
    readonly role: Role
    readonly createdAt: Date
  }): Promise<LocalUser>

  /** Da acesso a esta loja a quem ja existe. Uma escrita, atomica por si. */
  grantAccess(vinculo: {
    readonly companyId: CompanyId
    readonly userId: UserId
    readonly role: Role
    readonly createdAt: Date
  }): Promise<void>

  /**
   * Cria uma pessoa SEM vinculo de empresa nenhum — ADR-0007.
   *
   * So existe para o bootstrap de um Super Admin novo: toda outra pessoa do
   * sistema nasce com `createUserWithAccess`, porque nasce operando uma loja.
   * `users.tenant_isolation` aceita qualquer INSERT (`WITH CHECK (true)`) —
   * so a LEITURA exige vinculo — entao esta escrita nao precisa de
   * `SECURITY DEFINER` nenhum, so nao pode devolver a linha por `RETURNING`
   * (o `SELECT` implicito dele passaria pela politica e veria zero linhas).
   */
  createUserWithoutCompany(dados: {
    readonly name: string
    readonly email: string
    readonly createdAt: Date
  }): Promise<LocalUser>
}

/**
 * A sessao que emitimos.
 *
 * Uniao discriminada, e nao `companyId?: string` com `role?: Role`: sessao sem
 * empresa **nao tem papel**, e o tipo diz isso. Com campos opcionais, algum
 * codigo leria `claims.role` de uma sessao que ainda nao escolheu loja e
 * receberia `undefined` onde esperava papel — que e como uma verificacao de
 * permissao vira um `if` sempre falso.
 */
export type SessionClaims =
  | { readonly userId: UserId; readonly companyId: null }
  | { readonly userId: UserId; readonly companyId: CompanyId; readonly role: Role }

export type SessionIssuer = {
  issue(claims: SessionClaims, expiresAt: Date): Promise<string>
  /** `undefined` para token invalido, expirado, revogado ou adulterado. */
  read(token: string): Promise<SessionClaims | undefined>

  /**
   * Encerra a sessao ANTES da expiracao — RF-119, e o pre-requisito da RF-006.
   *
   * Existe porque sair sem isto nao encerrava nada: os clientes apagavam o
   * token do proprio armazenamento e o servidor continuava aceitando ele por
   * doze horas. Quem tivesse copiado o token — de um aparelho emprestado, de um
   * navegador compartilhado — continuava dentro depois de a pessoa "sair".
   *
   * Idempotente e sem retorno: revogar duas vezes e revogar um token que nunca
   * existiu tem o mesmo efeito visivel. Um booleano aqui viraria um oraculo de
   * token valido para quem chutasse.
   *
   * A RF-006 (remover funcionario encerra a sessao) precisa de um segundo
   * metodo, por usuario, e ele **nao** entra especulativamente: qual sessao
   * encerrar quando alguem perde acesso a UMA loja e regra, e o contador que
   * atende cinco nao pode ser expulso das outras quatro. Entra com a tarefa
   * dela; o que faltava era existir onde revogar.
   */
  revoke(token: string): Promise<void>
}

/**
 * Desaceleracao de tentativas repetidas — RF-120, RNF-026.
 *
 * A chave e passada de fora porque o caso de uso conta as tentativas por
 * identificador **e** por origem, e quem sabe a origem e a borda HTTP.
 */
export type LoginThrottle = {
  /** Quantos segundos esperar, ou `undefined` quando pode tentar. */
  retryAfter(chave: string): Promise<number | undefined>
  registerFailure(chave: string, at: Date): Promise<void>
  /** Login certo zera o contador — senao uma pessoa se trancaria fora sozinha. */
  clear(chave: string): Promise<void>
}
