/**
 * Tema do painel — claro ou escuro — NR-099.
 *
 * ## Por que o padrao continua sendo escuro
 *
 * O painel sempre foi escuro, de proposito — packages/ui documenta isso desde
 * a NR-011 ("Tema escuro — painel logado e o aplicativo inteiro"). Esta tarefa
 * nao muda essa decisao: adiciona uma ESCOLHA por cima dela. Quem nunca tocar
 * no botao continua vendo exatamente o que via antes.
 *
 * ## Por que `useSyncExternalStore`, e nao um `useState` com `useEffect`
 *
 * O mesmo motivo do `AvisoDeCookies`: o tema mora fora do React — no atributo
 * `data-theme` do `<html>`, lido por um script inline ANTES da hidratacao
 * (ver `app/layout.tsx`) para nao piscar escuro-depois-claro em quem ja
 * escolheu claro numa visita anterior. Ler isso num efeito e chamar
 * `setState` no corpo dele e o padrao que o compilador do React reprova, com
 * razao — um render inteiro jogado fora em toda abertura de tela.
 *
 * `getServerSnapshot` devolve 'escuro' porque no servidor nao ha `document`;
 * como e tambem o valor do primeiro paint no cliente antes do script inline
 * rodar, os dois batem e nao ha flash para quem ainda nao escolheu.
 */

export type TemaDoPainel = 'claro' | 'escuro'

/** Documentada no inventario de cookies — lib/cookies.ts. */
export const CHAVE_TEMA_PAINEL = 'nr:tema-painel'

const ouvintes = new Set<() => void>()

function lerAtributo(): TemaDoPainel {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'claro' : 'escuro'
}

export function assinarTemaDoPainel(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function lerTemaDoPainel(): TemaDoPainel {
  return lerAtributo()
}

export function lerTemaDoPainelNoServidor(): TemaDoPainel {
  return 'escuro'
}

/**
 * Alterna e persiste.
 *
 * O atributo vai no `<html>`, nao num wrapper proprio: e o mesmo elemento que
 * o script inline escreve antes da hidratacao, entao os dois concordam sobre
 * onde procurar. `data-theme='light'` e nao `'claro'` porque e a UNICA peca
 * deste sistema que atravessa para o CSS (`:root[data-theme='light']` em
 * globals.css) — o resto do modulo fala portugues, aqui o valor e dado para
 * uma folha de estilo, e o vocabulario dela ja e `light`/`dark` na `.appTheme`
 * original.
 */
export function alternarTemaDoPainel(): void {
  const proximo: TemaDoPainel = lerAtributo() === 'claro' ? 'escuro' : 'claro'

  if (proximo === 'claro') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }

  try {
    window.localStorage.setItem(CHAVE_TEMA_PAINEL, proximo === 'claro' ? 'light' : 'dark')
  } catch {
    /* Sem onde gravar, a escolha nao sobrevive a proxima visita — mas vale
       para esta. Mesma decisao do AvisoDeCookies. */
  }

  for (const ouvinte of ouvintes) ouvinte()
}

/**
 * O script que roda ANTES da hidratacao — string, para ir inline no `<head>`.
 *
 * Precisa ser JS puro e autocontido: nada de import, nada que dependa de o
 * bundle ja ter carregado. `try/catch` porque `localStorage` pode lancar (aba
 * privada restritiva) e um erro aqui nao pode impedir o resto da pagina de
 * pintar.
 */
export const SCRIPT_TEMA_INICIAL = `
try {
  if (window.localStorage.getItem('${CHAVE_TEMA_PAINEL}') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch (e) {}
`
