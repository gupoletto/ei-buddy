'use client'

import { useSearchParams } from 'next/navigation'
import styles from './ModuloEmConstrucao.module.css'

/**
 * Mostra a pergunta que veio de outra tela (chips "Via WhatsApp").
 *
 * Quando o Assistente for implementado, este componente sai e a pergunta
 * passa a alimentar o campo de entrada do chat diretamente.
 */
export default function AssistenteEntrada() {
  const params = useSearchParams()
  const pergunta = params.get('pergunta')

  if (!pergunta) return null

  return (
    <div className={styles.perguntaBox}>
      <span className={styles.perguntaLabel}>Pergunta recebida</span>
      <p className={styles.perguntaTexto}>&ldquo;{pergunta}&rdquo;</p>
      <p className={styles.perguntaNota}>
        Quando o assistente estiver pronto, esta pergunta já chega digitada no campo de conversa.
      </p>
    </div>
  )
}
