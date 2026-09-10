'use client'

import Link from 'next/link'
import { useState } from 'react'
import { IconClose } from '../Icons'
import styles from './billing.module.css'

/**
 * Banner fixo de pagamento pendente.
 *
 * Fica no topo do painel em tom de alerta (ambar) — nunca vermelho, que
 * fica reservado para erro critico. Pode ser recolhido, mas volta a cada
 * navegacao: e um aviso persistente, nao uma notificacao descartavel.
 */
export default function PaymentOverdueBanner({ diasEmAtraso = 14 }: { diasEmAtraso?: number }) {
  const [recolhido, setRecolhido] = useState(false)

  if (recolhido) {
    return (
      <button type="button" className={styles.bannerCollapsed} onClick={() => setRecolhido(false)}>
        <span className={styles.bannerDot} aria-hidden="true" />
        Pagamento pendente
      </button>
    )
  }

  return (
    <div className={styles.banner} role="status">
      <span className={styles.bannerIcon} aria-hidden="true">
        !
      </span>

      <p className={styles.bannerText}>
        <strong>Seu pagamento está pendente.</strong> Regularize para manter acesso completo
        {diasEmAtraso > 0 ? ` — ${diasEmAtraso} dias em atraso` : ''}.
      </p>

      <Link href="/app/assinatura" className={styles.bannerCta}>
        Regularizar pagamento
      </Link>

      <button
        type="button"
        className={styles.bannerClose}
        onClick={() => setRecolhido(true)}
        aria-label="Recolher aviso"
      >
        <IconClose size={17} />
      </button>
    </div>
  )
}
