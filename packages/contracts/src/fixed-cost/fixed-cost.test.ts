import { describe, expect, it } from 'vitest'
import { createFixedCostInputSchema, generateFixedCostPayablesInputSchema } from './fixed-cost.js'

const valido = {
  name: 'Aluguel do ponto',
  amountCents: 150_000,
  dueDay: 5,
}

describe('cadastrar custo fixo — NR-110', () => {
  it('aceita o minimo', () => {
    expect(createFixedCostInputSchema.parse(valido).amountCents).toBe(150_000)
  })

  it('exige nome', () => {
    const { name: _fora, ...sem } = valido
    expect(createFixedCostInputSchema.safeParse(sem).success).toBe(false)
  })

  it('recusa nome de uma letra', () => {
    expect(createFixedCostInputSchema.safeParse({ ...valido, name: 'A' }).success).toBe(false)
  })

  it('apara o nome', () => {
    expect(createFixedCostInputSchema.parse({ ...valido, name: '  Aluguel  ' }).name).toBe(
      'Aluguel',
    )
  })

  it('recusa valor zero', () => {
    expect(createFixedCostInputSchema.safeParse({ ...valido, amountCents: 0 }).success).toBe(false)
  })

  it.each([0, 32])('recusa dia do vencimento %i — fora de 1 a 31', (dueDay) => {
    expect(createFixedCostInputSchema.safeParse({ ...valido, dueDay }).success).toBe(false)
  })

  it.each([1, 31])('aceita dia do vencimento %i — nos limites', (dueDay) => {
    expect(createFixedCostInputSchema.parse({ ...valido, dueDay }).dueDay).toBe(dueDay)
  })

  it('recusa dia nao inteiro', () => {
    expect(createFixedCostInputSchema.safeParse({ ...valido, dueDay: 5.5 }).success).toBe(false)
  })

  it('plano de conta e opcional — pode classificar depois', () => {
    expect(createFixedCostInputSchema.parse(valido).accountId).toBeUndefined()
  })

  it('recusa campo desconhecido — o schema e strict', () => {
    expect(createFixedCostInputSchema.safeParse({ ...valido, banco: 'Itau' }).success).toBe(false)
  })
})

describe('gerar as contas do mes — NR-110', () => {
  it('aceita AAAA-MM', () => {
    expect(generateFixedCostPayablesInputSchema.parse({ competencia: '2026-09' }).competencia).toBe(
      '2026-09',
    )
  })

  it.each(['2026-9', '09-2026', '2026/09', 'setembro'])('recusa "%s"', (competencia) => {
    expect(generateFixedCostPayablesInputSchema.safeParse({ competencia }).success).toBe(false)
  })
})
