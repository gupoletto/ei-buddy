import { encaminhar } from '@/lib/bff'

/** Quem trabalha na loja — usada hoje pelo seletor de responsavel do CRM. */
export async function GET() {
  return encaminhar('/equipe')
}
