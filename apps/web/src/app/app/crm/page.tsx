import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import CrmQuadro from '@/components/crm/CrmQuadro'

export const metadata: Metadata = {
  title: `CRM — ${BRAND}`,
  description: 'Pendências e contatos em quadro, lançados por você e sua equipe.',
}

export default function CrmPage() {
  return <CrmQuadro />
}
