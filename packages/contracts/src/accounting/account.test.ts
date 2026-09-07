import { describe, expect, it } from 'vitest'
import { dreInputSchema } from '../index.js'

/**
 * Periodo do DRE — RF-085, US-041.
 *
 * A rota nao tem padrao de "mes atual" de proposito: quem escolhe o periodo e
 * quem pergunta. Isso poe todo o peso neste schema — se ele aceitar um periodo
 * invertido, o relatorio volta vazio e parece que a loja nao vendeu nada.
 */

describe('periodo do DRE — RF-085', () => {
  it('aceita o periodo em ordem', () => {
    expect(dreInputSchema.safeParse({ from: '2026-01-01', to: '2026-01-31' }).success).toBe(true)
  })

  it('aceita um dia so', () => {
    expect(dreInputSchema.safeParse({ from: '2026-01-10', to: '2026-01-10' }).success).toBe(true)
  })

  it('recusa periodo invertido, apontando o campo', () => {
    const r = dreInputSchema.safeParse({ from: '2026-03-01', to: '2026-01-31' })

    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['from'])
  })

  it('exige as duas pontas', () => {
    expect(dreInputSchema.safeParse({ from: '2026-01-01' }).success).toBe(false)
    expect(dreInputSchema.safeParse({}).success).toBe(false)
  })

  it('recusa campo a mais em vez de descartar em silencio', () => {
    const r = dreInputSchema.safeParse({ from: '2026-01-01', to: '2026-01-31', conta: 'x' })

    expect(r.success).toBe(false)
  })
})
