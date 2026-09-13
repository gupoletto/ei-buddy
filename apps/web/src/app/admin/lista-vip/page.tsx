import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import AdminListaVipView from '@/components/admin/AdminListaVipView'
import ChaveDeAcessoListaVip from '@/components/admin/ChaveDeAcessoListaVip'

export const metadata: Metadata = {
  title: `Lista de espera — Super Admin — ${BRAND}`,
  description: 'Respostas do Grupo VIP de Pré-Lançamento, agregadas e individuais.',
}

export default function AdminListaVipPage() {
  return (
    <ChaveDeAcessoListaVip>
      <AdminListaVipView />
    </ChaveDeAcessoListaVip>
  )
}
