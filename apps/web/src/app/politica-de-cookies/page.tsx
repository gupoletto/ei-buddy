import type { Metadata } from 'next'
import PaginaLegal, { estilosLegais as styles } from '@/components/legal/PaginaLegal'
import { BRAND } from '@/content/site'
import {
  ARMAZENAMENTO_LOCAL,
  COOKIES,
  EXIGE_CONSENTIMENTO,
  ROTULO_DA_CATEGORIA,
} from '@/lib/cookies'

export const metadata: Metadata = {
  title: `Politica de Cookies — ${BRAND}`,
  description:
    'Quais cookies o sistema usa, para que servem e quanto duram. Hoje ha um, e ele e essencial.',
}

/**
 * Politica de cookies — NR-085, LGPD art. 9.
 *
 * A tabela sai do inventario em `lib/cookies.ts`, e nao de texto escrito aqui.
 * O motivo esta la: politica de cookies e o documento que envelhece primeiro, e
 * `cookies.test.ts` reprova o PR que gravar um cookie fora da lista. Assim a
 * pagina nao pode divergir do que o codigo faz.
 */
export default function PoliticaDeCookies() {
  return (
    <PaginaLegal eyebrow="Documentos" titulo="Politica de Cookies" atualizadoEm="2026-09-09">
      <p>
        Esta pagina lista tudo o que o {BRAND} guarda no seu navegador, para que serve e quanto
        tempo fica. A lista e gerada a partir do proprio codigo do sistema — nao e um texto mantido
        a mao, e por isso ela nao pode ficar desatualizada em relacao ao que acontece de verdade.
      </p>

      <h2>Nao pedimos seu consentimento, e explicamos por que</h2>

      <p>
        Hoje existe <strong>um</strong> cookie, e sem ele o sistema nao funciona: e o que mantem
        voce autenticado entre uma tela e outra. A base legal para ele nao e o consentimento — e a
        execucao do contrato (art. 7, inciso V, da LGPD).
      </p>

      <p>
        Perguntar &quot;voce aceita cookies?&quot; para algo que sera gravado de qualquer forma nao
        protegeria voce de nada. Serviria para nos, como aparencia de conformidade, e treinaria voce
        a clicar em &quot;aceitar&quot; sem ler — o que torna o consentimento pior justamente nos
        casos em que ele importa. O que a lei pede aqui e transparencia, e e o que esta abaixo.
      </p>

      <p>
        <strong>
          Nao usamos cookie de analise, de publicidade ou de rastreamento, nem carregamos script de
          terceiros.
        </strong>{' '}
        No dia em que isso mudar, voce sera perguntado antes — de forma separada por finalidade, e
        podendo mudar de ideia depois. {EXIGE_CONSENTIMENTO ? '' : 'Nao e o caso hoje.'}
      </p>

      <h2>Cookies</h2>

      <div className={styles.tabelaWrap}>
        <table className={styles.tabela}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Para que serve</th>
              <th>Duracao</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((c) => (
              <tr key={c.nome}>
                <td>
                  <code>{c.nome}</code>
                </td>
                <td>
                  <span className={styles.etiqueta}>{ROTULO_DA_CATEGORIA[c.categoria]}</span>
                </td>
                <td>
                  {c.finalidade}
                  {c.httpOnly ? (
                    <>
                      {' '}
                      Ele e marcado como <code>httpOnly</code>: nem o codigo da propria pagina
                      consegue le-lo, o que limita o dano de uma falha de seguranca.
                    </>
                  ) : null}
                </td>
                <td>{c.duracao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Outras coisas guardadas no seu navegador</h2>

      <p>
        Tecnicamente nao sao cookies, e a diferenca nao muda nada para voce: tambem ficam no seu
        aparelho. Por isso entram aqui.
      </p>

      <div className={styles.tabelaWrap}>
        <table className={styles.tabela}>
          <thead>
            <tr>
              <th>Chave</th>
              <th>Tipo</th>
              <th>Para que serve</th>
              <th>Duracao</th>
            </tr>
          </thead>
          <tbody>
            {ARMAZENAMENTO_LOCAL.map((a) => (
              <tr key={a.chave}>
                <td>
                  <code>{a.chave}</code>
                </td>
                <td>
                  <span className={styles.etiqueta}>{ROTULO_DA_CATEGORIA[a.categoria]}</span>
                </td>
                <td>{a.finalidade}</td>
                <td>{a.duracao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Como remover</h2>

      <p>
        Voce pode apagar tudo isso a qualquer momento pelas configuracoes do seu navegador, ou
        clicando em <strong>Sair</strong> dentro do sistema — o que encerra a sessao no servidor, e
        nao apenas no seu aparelho.
      </p>

      <p>
        Apagar o cookie de sessao desconecta voce. Nao ha perda de dado: o que voce lancou fica no
        sistema, e voce entra de novo com a mesma conta.
      </p>

      <h2>Duvidas</h2>

      <p>
        Sobre seus dados em geral, veja a{' '}
        <a href="/politica-de-privacidade">Politica de Privacidade</a>, que explica o que coletamos,
        por que, e como exercer seus direitos.
      </p>
    </PaginaLegal>
  )
}
