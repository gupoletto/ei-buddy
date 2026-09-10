'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { ACOES_BLOQUEADAS, ACOES_LIBERADAS } from '@/lib/access'
import { IconCheck, IconClose } from '../Icons'
import { useSubscription } from './SubscriptionProvider'
import styles from './billing.module.css'

/**
 * Modal exibido quando o usuario tenta usar um modulo bloqueado.
 *
 * Explica o motivo, lista o que continua liberado (para nao dar a sensacao
 * de perda total) e leva para a area de regularizacao.
 */
export default function PaymentRequiredModal() {
  const { modalAberto, fecharModal } = useSubscription()
  const dialogRef = useRef<HTMLDivElement>(null)

  /* Fecha no Esc e devolve o foco ao fechar. */
  useEffect(() => {
    if (!modalAberto) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharModal()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [modalAberto, fecharModal])

  if (!modalAberto) return null

  return (
    <div className={styles.modalRoot}>
      <button
        type="button"
        className={styles.modalBackdrop}
        onClick={fecharModal}
        aria-label="Fechar"
      />

      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-bloqueio-titulo"
        tabIndex={-1}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={fecharModal}
          aria-label="Fechar"
        >
          <IconClose size={18} />
        </button>

        <span className={styles.modalBadge}>Pagamento pendente</span>

        <h2 id="modal-bloqueio-titulo" className={styles.modalTitle}>
          Regularize para voltar a usar este módulo
        </h2>

        <p className={styles.modalText}>
          Seu acesso está em modo restrito porque a última fatura ainda não foi confirmada. Seus
          dados continuam salvos e nada foi apagado.
        </p>

        <div className={styles.modalLists}>
          <div>
            <h3 className={styles.modalListTitle}>Continua liberado</h3>
            <ul className={styles.modalList}>
              {ACOES_LIBERADAS.map((item) => (
                <li key={item}>
                  <span className={styles.modalCheck}>
                    <IconCheck size={12} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={styles.modalListTitle}>Bloqueado por enquanto</h3>
            <ul className={`${styles.modalList} ${styles.modalListMuted}`}>
              {ACOES_BLOQUEADAS.map((item) => (
                <li key={item}>
                  <span className={styles.modalDash} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.modalActions}>
          <Link href="/app/assinatura" className={styles.modalPrimary} onClick={fecharModal}>
            Regularizar pagamento
          </Link>
          <button type="button" className={styles.modalGhost} onClick={fecharModal}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
