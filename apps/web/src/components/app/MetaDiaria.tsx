'use client'

import { useState, useSyncExternalStore } from 'react'
import { assinarMeta, definirMeta, lerMeta, lerMetaNoServidor } from '@/lib/meta'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/UI'
import styles from './meta.module.css'

/**
 * A meta diaria de faturamento — NR-104.
 *
 * Recebe `faturamentoHojeCents` do painel (server component): o numero em si
 * ja e buscado por `carregarPainel`, este componente so acrescenta a meta
 * (que mora no navegador — ver `lib/meta.ts`) e desenha o progresso.
 */
export default function MetaDiaria({
  faturamentoHojeCents,
}: {
  faturamentoHojeCents: number | null
}) {
  const meta = useSyncExternalStore(assinarMeta, lerMeta, lerMetaNoServidor)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')

  function iniciarEdicao() {
    setValor(meta === null ? '' : String(meta / 100).replace('.', ','))
    setEditando(true)
  }

  function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    const reais = Number.parseFloat(valor.replace(',', '.'))
    definirMeta(Number.isFinite(reais) && reais > 0 ? Math.round(reais * 100) : null)
    setEditando(false)
  }

  if (editando) {
    return (
      <Card className={styles.card}>
        <form onSubmit={salvar} className={styles.form}>
          <label htmlFor="meta-input" className={styles.label}>
            Meta diária de faturamento
          </label>
          <div className={styles.formLinha}>
            <span className={styles.prefixo}>R$</span>
            <input
              id="meta-input"
              className={styles.input}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="sm">
              Salvar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    )
  }

  if (meta === null) {
    return (
      <Card className={styles.card}>
        <button type="button" className={styles.prompt} onClick={iniciarEdicao}>
          <span>Defina uma meta diária de faturamento para acompanhar seu progresso aqui.</span>
          <span className={styles.promptCta}>Definir meta</span>
        </button>
      </Card>
    )
  }

  const bateu = faturamentoHojeCents !== null && faturamentoHojeCents >= meta
  const progresso =
    faturamentoHojeCents === null ? 0 : Math.min(100, (faturamentoHojeCents / meta) * 100)
  const faltamCents =
    faturamentoHojeCents === null ? null : Math.max(0, meta - faturamentoHojeCents)

  return (
    <Card className={styles.card}>
      <div className={styles.cabecalho}>
        <span className={styles.titulo}>{bateu ? 'Meta do dia batida! 🎉' : 'Meta do dia'}</span>
        <button type="button" className={styles.editar} onClick={iniciarEdicao}>
          Editar meta
        </button>
      </div>

      <div className={styles.barraFundo}>
        <div
          className={`${styles.barraPreenchida} ${bateu ? styles.barraCompleta : ''}`}
          style={{ width: `${progresso}%` }}
        />
      </div>

      <span className={styles.legenda}>
        {faturamentoHojeCents === null
          ? `Meta: ${formatMoney(meta / 100)} · ainda não deu para saber quanto você já vendeu hoje`
          : bateu
            ? `${formatMoney(faturamentoHojeCents / 100)} de ${formatMoney(meta / 100)}`
            : `${formatMoney(faturamentoHojeCents / 100)} de ${formatMoney(meta / 100)} · faltam ${formatMoney((faltamCents ?? 0) / 100)}`}
      </span>
    </Card>
  )
}
