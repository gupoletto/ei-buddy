/**
 * Sessao do usuario — NR-013, US-059.
 *
 * O token vive num cookie `httpOnly`, escrito pelos Route Handlers do Next e
 * **ilegivel pelo JavaScript da pagina**. Foi o que substituiu o cookie de
 * demonstracao que existia aqui: aquele guardava nome e empresa em texto e era
 * legivel por qualquer script — aceitavel enquanto nao havia backend, inaceitavel
 * agora que o valor guardado abre doze horas de sessao.
 *
 * Este arquivo ficou com o que os DOIS lados usam: o nome do cookie e a forma
 * dos dados. Quem escreve e o servidor; quem le o token e o servidor.
 */

/** Token de sessao. `httpOnly` — o navegador manda, o script nao le. */
export const SESSION_COOKIE = 'nr_session'

/**
 * O que a interface precisa saber sobre quem entrou.
 *
 * Vem da api a cada navegacao de servidor, e nao de um cookie legivel: dado de
 * exibicao guardado no cliente vira dado DESATUALIZADO no cliente — a pessoa
 * troca de loja numa aba e a outra continua mostrando a anterior.
 */
export type SessionUser = {
  readonly userId: string
  readonly userName: string
  readonly activeCompanyId: string | null
  readonly memberships: readonly { companyId: string; companyName: string; role: string }[]
  /** Pode "entrar como" qualquer loja — ADR-0007. Sempre falso fora do login. */
  readonly isPlatformAdmin: boolean
}

/** Opcoes do cookie, num lugar so — divergir entre escrever e apagar deixa cookie orfao. */
export function opcoesDoCookie(maxAgeSegundos: number) {
  return {
    httpOnly: true,
    /* `Lax` e nao `Strict`: com `Strict`, chegar por um link externo mostraria
       a tela de login mesmo com sessao valida. `Lax` ja barra o POST
       entre sites, que e o vetor de CSRF que importa aqui. */
    sameSite: 'lax' as const,
    /* Em desenvolvimento o Next serve por http; exigir `Secure` ali faria o
       cookie ser descartado em silencio e o login "nao funcionar". */
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSegundos,
  }
}

/**
 * Quanto tempo o cookie dura.
 *
 * Doze horas, o mesmo `DURACAO_DA_SESSAO_HORAS` do `core`. Se o cookie durasse
 * mais que o token, a pessoa navegaria pelo painel com um token expirado e
 * receberia 401 em cada tela em vez de ser mandada ao login.
 */
export const DURACAO_DO_COOKIE_SEGUNDOS = 12 * 60 * 60
