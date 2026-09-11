import { encaminhar } from '@/lib/bff'

/** Empresas que outras do seu ramo ja conectaram — ADR-0008. */
export async function GET() {
  return encaminhar('/fornecedores/sugestoes')
}
