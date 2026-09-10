import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import PlanoDeContasView from '@/components/financeiro/PlanoDeContasView'

export const metadata: Metadata = {
  title: `Plano de contas — ${BRAND}`,
  description: 'Estrutura de receitas e despesas, e custos fixos do negócio.',
}

export default function PlanoDeContasPage() {
  return <PlanoDeContasView />
}
