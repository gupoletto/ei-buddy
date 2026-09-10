import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import LoginForm from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: `Entrar — ${BRAND}`,
  description: 'Acesse o painel do seu negócio.',
}

export default function EntrarPage() {
  return <LoginForm />
}
