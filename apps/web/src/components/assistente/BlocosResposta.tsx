'use client'

import type { BlocoResposta } from '@/lib/assistente-api'
import { Button } from '@/components/ui/Button'
import styles from './assistente.module.css'

/**
 * Desenha os blocos ricos que vem na resposta.
 *
 * Um ranking respondido como paragrafo de texto obriga a pessoa a ler
 * numero por numero. Em tabela ela acha o que quer de relance — e e a
 * mesma leitura que ela ja faz no resto do painel.
 */
export default function BlocosResposta({
  blocos,
  onAcao,
}: {
  blocos: BlocoResposta[]
  onAcao: (acao: string) => void
}) {
  return (
    <>
      {blocos.map((bloco, i) => {
        switch (bloco.tipo) {
          case 'texto':
            return (
              <p key={i} className={styles.blocoTexto}>
                {bloco.texto}
              </p>
            )

          case 'indicador':
            return (
              <div key={i} className={styles.blocoIndicador}>
                <span>{bloco.rotulo}</span>
                <strong>{bloco.valor}</strong>
                {bloco.apoio ? <small>{bloco.apoio}</small> : null}
              </div>
            )

          case 'lista':
            if (bloco.itens.length === 0) return null
            return (
              <div key={i} className={styles.blocoCard}>
                <h4 className={styles.blocoTitulo}>{bloco.titulo}</h4>
                <ul className={styles.blocoLista}>
                  {bloco.itens.map((item) => (
                    <li key={item.rotulo}>
                      <span>{item.rotulo}</span>
                      <strong className={item.destaque ? styles.blocoDestaque : undefined}>
                        {item.valor}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            )

          case 'tabela':
            return (
              <div key={i} className={styles.blocoCard}>
                <h4 className={styles.blocoTitulo}>{bloco.titulo}</h4>
                <div className={styles.blocoTabelaWrap}>
                  <table className={styles.blocoTabela}>
                    <thead>
                      <tr>
                        {bloco.colunas.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.linhas.map((linha, li) => (
                        <tr key={li}>
                          {linha.map((celula, ci) => (
                            <td key={ci}>{celula}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )

          case 'confirmacao':
            /* Acao so acontece com aceite explicito — ver nota no
               assistente-api.ts. */
            return (
              <div key={i} className={styles.blocoConfirmacao}>
                <p>{bloco.pergunta}</p>
                <div className={styles.blocoConfirmacaoAcoes}>
                  <Button size="sm" onClick={() => onAcao(bloco.acao)}>
                    Confirmar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onAcao('cancelar')}>
                    Agora não
                  </Button>
                </div>
              </div>
            )

          default:
            return null
        }
      })}
    </>
  )
}
