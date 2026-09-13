import { mesDoDia } from './format.js'
import type { LlmDecision, LlmPort, ToolDescriptor } from './types.js'

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * LLM falso — `AGENT_PROVIDER=fake`.
 *
 * Nao fala com a OpenAI. Dois modos, e o segundo e o que importa no dia a dia:
 * roteiro gravado para teste, e um reconhecedor minimo em portugues para as
 * consultas da US-047 ("quanto vendi hoje?", "quem esta me devendo?").
 *
 * Interpretacao de venda e cadastro NAO entra no reconhecedor: sem modelo, o
 * risco e executar a tool errada. Esses caminhos usam `script()`.
 */
export class FakeLlm implements LlmPort {
  private readonly roteiros = new Map<string, LlmDecision>()

  script(texto: string, decisao: LlmDecision): void {
    this.roteiros.set(normalizar(texto), decisao)
  }

  async decide(input: {
    readonly text: string
    readonly tools: readonly ToolDescriptor[]
    readonly today: string
  }): Promise<LlmDecision> {
    const chave = normalizar(input.text)
    const roteiro = this.roteiros.get(chave)
    if (roteiro !== undefined) return roteiro

    const ids = new Set(input.tools.map((t) => t.id))
    const porPalavra = reconhecerConsulta(chave, input.today)
    if (porPalavra !== undefined && ids.has(porPalavra.name)) return porPalavra

    return { type: 'unknown' }
  }
}

function reconhecerConsulta(
  texto: string,
  today: string,
): Extract<LlmDecision, { type: 'tool' }> | undefined {
  if (/quanto vend|faturamento|vendas? (de )?hoje|ticket medio/.test(texto)) {
    return { type: 'tool', name: 'list_sales', args: { from: today, to: today } }
  }
  if (/quem (me )?(esta |ta )?dev|inadimplen|me devendo/.test(texto)) {
    return { type: 'tool', name: 'list_receivables', args: {} }
  }
  if (/resumo do mes|resultado do mes/.test(texto)) {
    const mes = mesDoDia(today)
    return { type: 'tool', name: 'revenue_by_month', args: mes }
  }
  return undefined
}
