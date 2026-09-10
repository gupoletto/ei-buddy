'use client'

import Link from 'next/link'
import { useState } from 'react'
import { IconArrowRight, IconSparkles } from '@/components/Icons'
import styles from './ComandosWhatsApp.module.css'

/**
 * Previa dos comandos que o lojista pode mandar por WhatsApp.
 *
 * Cada chip abre o Assistente IA com a pergunta ja preenchida (via query
 * string) e, em paralelo, copia o texto — assim serve tanto para quem quer
 * usar dentro do app quanto para quem vai colar no WhatsApp.
 *
 * Compartilhado entre as telas de modulo: cada uma passa os proprios
 * comandos.
 */
export default function ComandosWhatsApp({
  comandos,
  descricao = 'Estas perguntas funcionam por mensagem, sem abrir o sistema. Toque para abrir no assistente — o texto também é copiado.',
}: {
  comandos: string[]
  descricao?: string
}) {
  const [copiado, setCopiado] = useState<string | null>(null)

  async function copiar(comando: string) {
    try {
      await navigator.clipboard.writeText(comando)
      setCopiado(comando)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      /* Sem permissao de area de transferencia: o link ainda leva ao
         assistente com a pergunta preenchida, entao nao ha o que avisar. */
    }
  }

  return (
    <section className={styles.comandos}>
      <header className={styles.head}>
        <span className={styles.icon}>
          <IconSparkles size={18} />
        </span>
        <div>
          <h2 className={styles.title}>Via WhatsApp</h2>
          <p className={styles.lead}>{descricao}</p>
        </div>
      </header>

      <ul className={styles.chips}>
        {comandos.map((comando) => (
          <li key={comando}>
            <Link
              href={`/app/assistente-ia?pergunta=${encodeURIComponent(comando)}`}
              className={styles.chip}
              onClick={() => copiar(comando)}
            >
              &ldquo;{comando}&rdquo;
              <span className={styles.chipHint}>
                {copiado === comando ? 'copiado' : <IconArrowRight size={14} />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
