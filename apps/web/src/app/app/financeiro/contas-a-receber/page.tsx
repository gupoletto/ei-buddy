import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import ContasView from '@/components/financeiro/ContasView'

export const metadata: Metadata = {
  title: `Contas a receber — ${BRAND}`,
  description: 'Recebíveis, cobrança e baixas.',
}

export default function ContasReceberPage() {
  return <ContasView tipo="receber" />
}
