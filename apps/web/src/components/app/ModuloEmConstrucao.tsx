import type { ReactNode } from 'react'
import { PageHeader } from '@/components/ui/UI'
import styles from './ModuloEmConstrucao.module.css'

/**
 * Placeholder das telas de modulo que ainda nao foram desenhadas.
 *
 * Existe para que a rota e a navegacao ja funcionem de ponta a ponta — a
 * pessoa clica no menu e chega em algum lugar coerente, em vez de um 404.
 * Cada uma destas telas sera substituida pela implementacao real.
 */
export default function ModuloEmConstrucao({
  titulo,
  subtitulo,
  previsto,
}: {
  titulo: string
  subtitulo: string
  /** O que a tela vai conter quando existir. */
  previsto: string[]
  children?: ReactNode
}) {
  return (
    <>
      <PageHeader title={titulo} subtitle={subtitulo} />

      <section className={styles.card}>
        <span className={styles.badge}>Em construção</span>

        <h2 className={styles.title}>O que esta tela vai ter</h2>

        <ul className={styles.list}>
          {previsto.map((item) => (
            <li key={item} className={styles.item}>
              <span className={styles.dot} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <p className={styles.note}>
          A rota e a navegação já estão ligadas. O conteúdo entra na próxima etapa, seguindo o mesmo
          design das telas já prontas.
        </p>
      </section>
    </>
  )
}
