'use client'

import type { ReactNode } from 'react'
import { useSubscription } from './SubscriptionProvider'
import styles from './billing.module.css'

function IconLock({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  )
}

/**
 * Envolve o conteudo de um modulo bloqueado.
 *
 * O conteudo continua visivel por baixo (desfocado e nao interativo) de
 * proposito: o lojista precisa enxergar o que perdeu, nao uma tela vazia.
 * Clicar em qualquer lugar abre o modal de regularizacao.
 */
export default function LockedModuleOverlay({
  titulo = 'Módulo bloqueado',
  descricao = 'Regularize o pagamento para voltar a usar este módulo.',
  children,
}: {
  titulo?: string
  descricao?: string
  children: ReactNode
}) {
  const { bloqueado, pedirRegularizacao } = useSubscription()

  if (!bloqueado) return <>{children}</>

  return (
    <div className={styles.lockedWrap}>
      {/* aria-hidden: o conteudo desfocado nao deve ser lido nem tabulado */}
      <div className={styles.lockedContent} aria-hidden="true" inert>
        {children}
      </div>

      <button type="button" className={styles.lockedOverlay} onClick={pedirRegularizacao}>
        <span className={styles.lockedCard}>
          <span className={styles.lockedIcon}>
            <IconLock />
          </span>
          <strong className={styles.lockedTitle}>{titulo}</strong>
          <span className={styles.lockedText}>{descricao}</span>
          <span className={styles.lockedCta}>Ver como regularizar</span>
        </span>
      </button>
    </div>
  )
}
