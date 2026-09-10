import { encaminhar } from '@/lib/bff'

/** Quantos pedidos recebidos e pendentes — alimenta o sino do painel. */
export async function GET() {
  return encaminhar('/conexoes/pendentes')
}
