import { encaminhar } from '@/lib/bff'

/** Os numeros do topo da tela de produtos, sobre o catalogo inteiro — NR-072. */
export async function GET() {
  return encaminhar('/produtos/resumo')
}
