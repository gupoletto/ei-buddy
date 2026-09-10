'use client'

import { useSyncExternalStore } from 'react'
import { IconSom, IconSomMudo } from '../Icons'
import { alternarSom, assinarSom, lerSom, lerSomNoServidor } from '@/lib/som'
import styles from './AppShell.module.css'

/**
 * O botao de ligar/desligar som do painel.
 *
 * Mesma classe `iconButton` do `ThemeToggle`, ao lado dele no `.topActions` —
 * os dois sao a mesma familia de controle (uma preferencia, um icone, um
 * clique). Controla o bipe do leitor de codigo de barras e a confirmacao de
 * venda fechada; ver `lib/som.ts`.
 */
export default function SomToggle() {
  const som = useSyncExternalStore(assinarSom, lerSom, lerSomNoServidor)

  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={alternarSom}
      aria-label={som === 'ligado' ? 'Desligar som' : 'Ligar som'}
      title={som === 'ligado' ? 'Som ligado' : 'Som desligado'}
    >
      {som === 'ligado' ? <IconSom size={19} /> : <IconSomMudo size={19} />}
    </button>
  )
}
