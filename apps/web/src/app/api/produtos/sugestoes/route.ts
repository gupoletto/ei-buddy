import { encaminhar } from '@/lib/bff'

/** Categoria e fornecedor ja usados — as sugestoes do formulario de cadastro. */
export async function GET() {
  return encaminhar('/produtos/sugestoes')
}
