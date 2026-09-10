'use client'

import { useSyncExternalStore } from 'react'
import { IconMoon, IconSun } from '../Icons'
import {
  alternarTemaDoPainel,
  assinarTemaDoPainel,
  lerTemaDoPainel,
  lerTemaDoPainelNoServidor,
} from '@/lib/tema-painel'
import styles from './AppShell.module.css'

/**
 * O botao de mudar o tema do painel — NR-099.
 *
 * Fica no `.topActions` do `AppShell`, junto dos outros botoes de icone
 * (notificacoes, sair), e usa a MESMA classe `iconButton` deles — um botao
 * novo que parecesse outra coisa destacaria sem motivo.
 *
 * O icone mostra o tema ATUAL, nao o que o toque vai ligar: sol quando esta
 * claro, lua quando esta escuro. E a convencao mais comum (a "engrenagem"
 * do oposto seria mais precisa e menos reconhecivel — ninguem para para ler
 * o icone de um botao de uma tecla so).
 */
export default function ThemeToggle() {
  const tema = useSyncExternalStore(assinarTemaDoPainel, lerTemaDoPainel, lerTemaDoPainelNoServidor)

  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={alternarTemaDoPainel}
      aria-label={tema === 'claro' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      title={tema === 'claro' ? 'Tema claro' : 'Tema escuro'}
    >
      {tema === 'claro' ? <IconSun size={19} /> : <IconMoon size={19} />}
    </button>
  )
}
