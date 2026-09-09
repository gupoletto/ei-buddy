import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ARMAZENAMENTO_LOCAL, COOKIES, EXIGE_CONSENTIMENTO } from './cookies.js'

/**
 * O portao do inventario — NR-085, LGPD art. 9.
 *
 * ## Por que ler o codigo, e nao confiar na lista
 *
 * Porque politica de cookies e o documento que envelhece primeiro. Quem
 * acrescenta um `Set-Cookie` esta resolvendo outro problema, e "atualizar a
 * politica" e um pedido que falha em silencio — ninguem descobre, porque nada
 * quebra.
 *
 * Esta suite varre a fonte do `apps/web`, junta todo cookie e toda chave de
 * `localStorage` que o codigo grava, e exige que cada um esteja no inventario.
 * Cookie novo sem entrada reprova o PR.
 *
 * ## O que ela NAO consegue provar
 *
 * Cookie posto por script de terceiro, em tempo de execucao. Nenhuma varredura
 * de fonte pega isso — o unico controle possivel ali e nao carregar script de
 * terceiro, e hoje nao carregamos nenhum. Se um entrar, esta suite continuara
 * verde e estara mentindo; por isso o teste do fim do arquivo, que recusa
 * exatamente essa entrada.
 */

/* `fileURLToPath` e nao `url.pathname`: no Windows o `pathname` vem como
   `/C:/...`, e o `join` seguinte produzia `C:\C:\...`. */
const AQUI = fileURLToPath(new URL('.', import.meta.url))
const FONTE = join(AQUI, '..')

function arquivos(pasta: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(pasta)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue

    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) {
      arquivos(caminho, achados)
      continue
    }
    if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) achados.push(caminho)
  }
  return achados
}

const fontes = arquivos(FONTE).map((caminho) => readFileSync(caminho, 'utf8'))
const tudo = fontes.join('\n')

/**
 * Constantes de modulo que guardam nome de cookie ou chave.
 *
 * O codigo nao escreve `cookies.set('nr_session', ...)`: escreve
 * `cookies.set(SESSION_COOKIE, ...)`, e com razao — nome repetido em quatro
 * arquivos e um erro de digitacao esperando acontecer. Entao a varredura
 * resolve o identificador antes de comparar, senao ela nao acharia o unico
 * cookie que existe e passaria verde sem ler nada.
 */
const constantes = new Map<string, string>()
for (const m of tudo.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g)) {
  constantes.set(m[1]!, m[2]!)
}

/** Um argumento vira o nome que ele representa, ou fica como esta. */
const resolver = (argumento: string): string => {
  const cru = argumento.trim()
  const literal = /^'([^']*)'$/.exec(cru)
  if (literal) return literal[1]!
  return constantes.get(cru) ?? cru
}

/**
 * Todo lugar que GRAVA cookie.
 *
 * `cookies.set(...)` do Next cobre os handlers do BFF, que sao os unicos que
 * gravam hoje. `document.cookie =` entra na varredura mesmo sem uso atual: e
 * por ali que um cookie de navegador apareceria, e o teste tem de reprovar
 * quando aparecer, nao depois.
 */
const cookiesGravados = new Set<string>()
for (const m of tudo.matchAll(/\.cookies\.set\(\s*([^,)]+)/g)) {
  cookiesGravados.add(resolver(m[1]!))
}
const escreveDocumentCookie = /document\.cookie\s*=/.test(tudo)

const chavesGravadas = new Set<string>()
for (const m of tudo.matchAll(/(?:local|session)Storage\.setItem\(\s*([^,)]+)/g)) {
  chavesGravadas.add(resolver(m[1]!))
}

describe('a varredura enxerga o codigo', () => {
  /* Sem isto, uma pasta renomeada faria a suite passar sem ler nada — e teste
     que nao le nada aprova qualquer coisa. */
  it('acha os arquivos da aplicacao', () => {
    expect(fontes.length).toBeGreaterThan(50)
  })

  /* E prova que a resolucao de constantes funciona: se ela quebrar, o conjunto
     de cookies vem vazio e todos os `toContain` abaixo passariam por vacuidade. */
  it('acha o cookie de sessao, resolvendo a constante', () => {
    expect([...cookiesGravados]).toContain('nr_session')
  })
})

describe('todo cookie gravado esta no inventario — LGPD art. 9', () => {
  const inventariados = new Set(COOKIES.map((c) => c.nome))

  it.each([...cookiesGravados])('%s aparece na politica', (nome) => {
    expect(inventariados).toContain(nome)
  })

  /*
   * O outro lado. Entrada no inventario que ninguem grava e politica
   * descrevendo cookie que nao existe — menos grave que o contrario, e ainda
   * assim uma afirmacao falsa sobre o que fazemos com o aparelho da pessoa.
   */
  it.each(COOKIES.map((c) => c.nome))('%s realmente e gravado pelo codigo', (nome) => {
    expect([...cookiesGravados]).toContain(nome)
  })
})

describe('todo armazenamento local esta no inventario', () => {
  const inventariadas = new Set(ARMAZENAMENTO_LOCAL.map((a) => a.chave))

  /*
   * `localStorage` nao e cookie, e a diferenca nao interessa a quem le: os dois
   * guardam coisa no aparelho dela. Cumprir a letra do art. 9 e omitir o
   * `localStorage` seria furar o proposito.
   */
  it.each([...chavesGravadas])('%s aparece na politica', (chave) => {
    expect(inventariadas).toContain(chave)
  })
})

describe('nada aqui depende de consentimento — e por isso nao ha banner', () => {
  /*
   * O cookie de sessao e estritamente necessario: a base legal e a execucao do
   * contrato (art. 7, V), nao o consentimento. Pedir "aceita cookies?" para
   * algo que sera gravado de qualquer jeito treina a pessoa a clicar em
   * "aceitar" sem ler.
   *
   * Este teste e o que impede a situacao INVERSA de passar sem ninguem notar:
   * um cookie de analise ou marketing entrar enquanto a unica coisa que existe
   * e um aviso informativo. Ai o aviso passaria a ser uma afirmacao falsa, e o
   * consentimento passaria a ser obrigatorio, previo e revogavel.
   */
  it('nenhum cookie de analise ou marketing entrou sem mecanismo de consentimento', () => {
    expect(EXIGE_CONSENTIMENTO).toBe(false)
  })

  /*
   * Cookie de terceiro nao aparece em varredura de fonte: quem grava e o script
   * dele, em tempo de execucao. O unico controle possivel e nao carregar
   * script de terceiro — entao e isso que se verifica.
   */
  it('nenhum script de terceiro carrega na aplicacao', () => {
    const suspeitos =
      /googletagmanager|google-analytics|gtag\(|posthog|mixpanel|hotjar|clarity\.ms|connect\.facebook|fbq\(/i
    expect(suspeitos.test(tudo)).toBe(false)
  })

  /* Ninguem grava cookie pelo navegador hoje, e a varredura acima nao alcanca
     o que for gravado assim. Se passar a gravar, este teste avisa. */
  it('nenhum cookie e gravado por document.cookie', () => {
    expect(escreveDocumentCookie).toBe(false)
  })
})
