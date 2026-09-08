import { encaminhar } from '@/lib/bff'

/**
 * Contas a receber — NR-080, RF-064, RF-066.
 *
 * A rota da api existe desde a NR-074 e o web nao a chamava: a tela de contas a
 * receber era alimentada por dado de exemplo ao lado da tela de contas a pagar,
 * que ja era real. Duas telas irmas, uma verdadeira e outra nao, sem nada
 * dizendo qual era qual.
 */
export async function GET() {
  return encaminhar('/contas-a-receber')
}
