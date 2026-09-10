'use client'

import { useCallback, useState } from 'react'
import { createPixCharge, fetchPixChargeStatus } from '@/lib/auth-api'
import CobrancaPix from '@/components/app/CobrancaPix'
import { Badge, Card, PageHeader, Stat } from '@/components/ui/UI'
import { Button } from '@/components/ui/Button'
import DataTable, { type Column } from '@/components/ui/DataTable'
import { formatDate, formatMoney } from '@/lib/format'
import { useSubscription } from './SubscriptionProvider'
import styles from './assinatura.module.css'

type Fatura = {
  id: string
  competencia: string
  vencimento: string
  valor: number
  status: 'pago' | 'aberto' | 'vencido'
}

/** SUBSTITUIR POR: GET /billing/invoices */
const faturas: Fatura[] = [
  {
    id: 'f-4',
    competencia: 'Agosto/2026',
    vencimento: '2026-08-10',
    valor: 149,
    status: 'vencido',
  },
  { id: 'f-3', competencia: 'Julho/2026', vencimento: '2026-07-10', valor: 149, status: 'pago' },
  { id: 'f-2', competencia: 'Junho/2026', vencimento: '2026-06-10', valor: 149, status: 'pago' },
  { id: 'f-1', competencia: 'Maio/2026', vencimento: '2026-05-10', valor: 149, status: 'pago' },
]

const colunas: Column<Fatura>[] = [
  { key: 'comp', header: 'Competência', render: (f) => <strong>{f.competencia}</strong> },
  { key: 'venc', header: 'Vencimento', render: (f) => formatDate(f.vencimento) },
  {
    key: 'status',
    header: 'Status',
    render: (f) =>
      f.status === 'pago' ? (
        <Badge tone="success">Pago</Badge>
      ) : f.status === 'vencido' ? (
        <Badge tone="warning">Vencido</Badge>
      ) : (
        <Badge>Em aberto</Badge>
      ),
  },
  {
    key: 'valor',
    header: 'Valor',
    align: 'right',
    render: (f) => <strong>{formatMoney(f.valor)}</strong>,
  },
]

export default function AssinaturaView() {
  const { bloqueado, setStatus } = useSubscription()
  const [pagando, setPagando] = useState(false)

  /* Estavel: o CobrancaPix usa esta funcao como dependencia de efeito. */
  const criarCobrancaFatura = useCallback(
    (valor: number) => createPixCharge('Plano único', valor),
    [],
  )

  const emAberto = faturas.filter((f) => f.status !== 'pago')
  const total = emAberto.reduce((acc, f) => acc + f.valor, 0)

  return (
    <>
      <PageHeader title="Assinatura" subtitle="Plano, faturas e formas de pagamento" />

      <div className="statRow">
        <Stat label="Plano atual" value="Plano único" hint="todos os módulos inclusos" />
        <Stat
          label="Situação"
          value={bloqueado ? 'Pagamento pendente' : 'Em dia'}
          hint={bloqueado ? 'acesso restrito' : 'acesso completo'}
          tone={bloqueado ? 'warning' : 'positive'}
        />
        <Stat label="Em aberto" value={formatMoney(total)} hint={`${emAberto.length} fatura(s)`} />
      </div>

      {bloqueado && !pagando ? (
        <div className={styles.callout}>
          <div>
            <strong className={styles.calloutTitle}>
              Regularize para liberar o acesso completo
            </strong>
            <p className={styles.calloutText}>
              Assim que o pagamento cair, os módulos voltam automaticamente — nenhum dado seu foi
              apagado.
            </p>
          </div>
          <Button onClick={() => setPagando(true)}>Pagar com Pix</Button>
        </div>
      ) : null}

      {pagando ? (
        <div className={styles.pixWrap}>
          <CobrancaPix
            titulo="Plano único"
            subtitulo="Fatura em aberto"
            amount={total || 149}
            criarCobranca={criarCobrancaFatura}
            consultarStatus={fetchPixChargeStatus}
            onPago={() => {
              /* Confirmado: libera o painel na hora. Com backend, isto vira
                 uma releitura de GET /billing/subscription. */
              setStatus('active')
              setPagando(false)
            }}
            textoSucesso="Acesso liberado. Obrigado!"
          />
        </div>
      ) : null}

      <Card title="Histórico de faturas">
        <DataTable columns={colunas} rows={faturas} getKey={(f) => f.id} />
      </Card>
    </>
  )
}
