import type { MembershipOutput } from '@na-regua/contracts'
import { AppError } from '../app-error.js'
import type { SessionClaims, UserDirectory } from '../ports/identity.js'

export type ProfileDeps = {
  readonly users: UserDirectory
}

/**
 * Quem esta usando o sistema, e em qual loja — NR-013, RF-119.
 *
 * ## Por que nao serve o `/auth/me`
 *
 * `SessionClaims` carrega apenas IDs: `userId`, `companyId`, `role`. E assim de
 * proposito — o token nao guarda nome, senao um lojista que renomeia a loja
 * continuaria vendo o nome antigo ate a sessao expirar.
 *
 * Mas a barra do topo precisa do NOME. Enquanto nao havia por onde busca-lo, a
 * tela mostrava "Marina Alves / Mercearia Sol Nascente" fixo no codigo: toda
 * loja via o nome da mesma pessoa inventada. Este caso de uso e o "chame a rota
 * do recurso" que o comentario de `/auth/me` ja mandava fazer.
 */
export type Profile = {
  readonly userId: string
  readonly userName: string
  /** Nulo enquanto a pessoa nao escolheu loja — US-059. */
  readonly activeCompanyId: string | null
  readonly companyName: string | null
  readonly role: MembershipOutput['role'] | null
  /** Todas as lojas a que ela tem acesso, para o seletor de loja. */
  readonly memberships: readonly MembershipOutput[]
}

export async function loadProfile(deps: ProfileDeps, claims: SessionClaims): Promise<Profile> {
  const usuario = await deps.users.findById(claims.userId)

  if (usuario === undefined) {
    /*
     * Sessao valida apontando para usuario que sumiu.
     *
     * Acontece quando alguem e removido da empresa com a sessao aberta. 401 e
     * nao 404: o problema nao e "esse recurso nao existe", e sim "esta sessao
     * nao vale mais" — e a tela precisa mandar a pessoa para o login, nao
     * mostrar um erro que ela nao pode resolver.
     */
    throw AppError.unauthorized('Sua sessao nao vale mais. Entre de novo.')
  }

  const vinculos = await deps.users.listMemberships(usuario.id)

  /*
   * O nome da loja sai dos VINCULOS, e nao de uma leitura de `companies`.
   *
   * Os vinculos ja vem com o nome, e ler `companies` de novo seria uma segunda
   * ida ao banco para um dado que ja esta na mao. Alem disso a lista inteira e
   * necessaria de qualquer jeito: quem tem acesso a mais de uma loja precisa do
   * seletor (US-059).
   */
  const ativo =
    claims.companyId === null ? undefined : vinculos.find((v) => v.companyId === claims.companyId)

  return {
    userId: usuario.id,
    userName: usuario.name,
    activeCompanyId: claims.companyId,
    companyName: ativo?.companyName ?? null,
    /*
     * O papel vem do VINCULO e nao das claims quando os dois existem.
     *
     * Se o papel da pessoa mudou depois de a sessao ser emitida, o do vinculo e
     * o atual. As claims continuam mandando na autorizacao — trocar isso aqui
     * seria decidir permissao numa leitura de apresentacao —, mas o que a tela
     * MOSTRA deve ser o de agora.
     */
    role: ativo?.role ?? null,
    memberships: vinculos,
  }
}
