import { describe, expect, it } from 'vitest'
import { createWaitlistEntryInputSchema } from './waitlist.js'

const valido = {
  name: 'Maria Souza',
  phone: '(41) 99876-5432',
  expectation: 'Queria saber o que vendi no dia sem abrir planilha.',
}

describe('lista de espera do pre-lancamento — NR-111', () => {
  it('aceita so o minimo: nome, celular e expectativa', () => {
    const r = createWaitlistEntryInputSchema.parse(valido)
    expect(r.name).toBe('Maria Souza')
    expect(r.phone).toBe('41998765432')
  })

  it('exige nome', () => {
    const { name: _fora, ...sem } = valido
    expect(createWaitlistEntryInputSchema.safeParse(sem).success).toBe(false)
  })

  it('exige celular valido', () => {
    expect(createWaitlistEntryInputSchema.safeParse({ ...valido, phone: '123' }).success).toBe(
      false,
    )
  })

  it('exige expectativa — a unica pergunta aberta obrigatoria', () => {
    const { expectation: _fora, ...sem } = valido
    expect(createWaitlistEntryInputSchema.safeParse(sem).success).toBe(false)
  })

  it('recusa expectativa vazia, so espaco', () => {
    expect(
      createWaitlistEntryInputSchema.safeParse({ ...valido, expectation: '   ' }).success,
    ).toBe(false)
  })

  it('ramo, dificuldades, sistema, valor justo e novidades sao opcionais', () => {
    const r = createWaitlistEntryInputSchema.parse(valido)
    expect(r.businessType).toBeUndefined()
    expect(r.painPoints).toEqual([])
    expect(r.usesSystem).toBeUndefined()
    expect(r.fairPrice).toBeUndefined()
    /** "Quer receber novidades" comeca marcado — quem so passa direto pelo
        formulario nao perde o convite. */
    expect(r.wantsUpdates).toBe(true)
  })

  it('aceita as dificuldades e o texto de "outra"', () => {
    const r = createWaitlistEntryInputSchema.parse({
      ...valido,
      painPoints: ['cash_flow', 'other'],
      painPointOther: 'Achar tempo para tudo',
    })
    expect(r.painPoints).toEqual(['cash_flow', 'other'])
    expect(r.painPointOther).toBe('Achar tempo para tudo')
  })

  it('recusa dificuldade que nao esta na lista', () => {
    expect(
      createWaitlistEntryInputSchema.safeParse({ ...valido, painPoints: ['inventar'] }).success,
    ).toBe(false)
  })

  it('recusa valor de "ja usa sistema" fora da lista', () => {
    expect(
      createWaitlistEntryInputSchema.safeParse({ ...valido, usesSystem: 'talvez' }).success,
    ).toBe(false)
  })

  it('recusa campo desconhecido — o schema e strict', () => {
    expect(
      createWaitlistEntryInputSchema.safeParse({ ...valido, empresa: 'Mercado da Maria' }).success,
    ).toBe(false)
  })
})
