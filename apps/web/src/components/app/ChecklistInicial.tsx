'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  assinarChecklistDispensado,
  dispensarChecklist,
  lerChecklistDispensado,
  lerChecklistDispensadoNoServidor,
} from '@/lib/checklist'
import { Card } from '@/components/ui/UI'
import { IconCheck, IconClose } from '@/components/Icons'
import styles from './checklist.module.css'

type ItemDoChecklist = {
  titulo: string
  feito: boolean
  href: string
}

/**
 * "Primeiros passos" — NR-104.
 *
 * So aparece enquanto sobrar passo (ou ate a pessoa dispensar). Os tres itens
 * saem do MESMO dado que `carregarPainel` ja busca para o resto da tela —
 * nao ha consulta nova so para o checklist.
 */
export default function ChecklistInicial({
  totalProdutos,
  totalClientes,
  temVenda,
}: {
  totalProdutos: number | null
  totalClientes: number | null
  temVenda: boolean
}) {
  const dispensado = useSyncExternalStore(
    assinarChecklistDispensado,
    lerChecklistDispensado,
    lerChecklistDispensadoNoServidor,
  )

  const itens: ItemDoChecklist[] = [
    {
      titulo: 'Cadastre seu primeiro produto',
      feito: (totalProdutos ?? 0) > 0,
      href: '/app/produtos/novo',
    },
    {
      titulo: 'Cadastre seu primeiro cliente',
      feito: (totalClientes ?? 0) > 0,
      href: '/app/clientes/novo',
    },
    {
      titulo: 'Registre sua primeira venda',
      feito: temVenda,
      href: '/app/vendas/nova',
    },
  ]

  const concluidos = itens.filter((item) => item.feito).length
  const tudoPronto = concluidos === itens.length

  if (dispensado || tudoPronto) return null

  return (
    <Card className={styles.card}>
      <div className={styles.cabecalho}>
        <div>
          <strong className={styles.titulo}>Primeiros passos</strong>
          <span className={styles.progresso}>
            {concluidos} de {itens.length} concluídos
          </span>
        </div>
        <button
          type="button"
          className={styles.fechar}
          onClick={dispensarChecklist}
          aria-label="Dispensar primeiros passos"
        >
          <IconClose size={16} />
        </button>
      </div>

      <ul className={styles.lista}>
        {itens.map((item) =>
          item.feito ? (
            <li key={item.titulo} className={styles.itemFeito}>
              <span className={styles.marca}>
                <IconCheck size={13} />
              </span>
              {item.titulo}
            </li>
          ) : (
            <li key={item.titulo}>
              <Link href={item.href} className={styles.itemPendente}>
                <span className={styles.bolinha} aria-hidden="true" />
                {item.titulo}
              </Link>
            </li>
          ),
        )}
      </ul>
    </Card>
  )
}
