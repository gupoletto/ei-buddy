import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import AdminView from '@/components/admin/AdminView'

export const metadata: Metadata = {
  title: `Super Admin — ${BRAND}`,
  description:
    'Entre em qualquer loja com justificativa auditada, e gerencie quem mais é Super Admin.',
}

export default function AdminPage() {
  return <AdminView />
}
