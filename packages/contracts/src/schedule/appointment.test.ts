import { describe, expect, it } from 'vitest'
import {
  createAppointmentInputSchema,
  DIAS_MAXIMOS_DA_AGENDA,
  listAppointmentRangeInputSchema,
} from './appointment.js'

/**
 * O contrato da agenda — RF-089, RF-093.
 *
 * As duas regras aqui sao de RELACAO entre campos, e nao de campo: "o fim vem
 * depois do inicio" e "o intervalo cabe no teto" so podem ser conferidas com
 * os dois valores em maos. Por isso sao refinamentos, e por isso tem teste
 * proprio — um erro neles nao aparece em nenhuma validacao de campo.
 */

const valido = { title: 'Entrega Padaria Sol', startsAt: '2026-12-10T14:00:00.000Z' }

describe('marcar compromisso — RF-089', () => {
  it('aceita so titulo e inicio — o compromisso pontual', () => {
    const r = createAppointmentInputSchema.parse(valido)

    /* "Pagar aluguel as 10h" nao dura nada: ausente e a resposta certa, e nao
       uma duracao inventada. */
    expect(r.endsAt).toBeUndefined()
    expect(r.location).toBeUndefined()
  })

  it('aceita hora de fim depois do inicio', () => {
    const r = createAppointmentInputSchema.parse({
      ...valido,
      endsAt: '2026-12-10T15:30:00.000Z',
    })

    expect(r.endsAt).toBe('2026-12-10T15:30:00.000Z')
  })

  it('recusa fim ANTES do inicio', () => {
    const r = createAppointmentInputSchema.safeParse({
      ...valido,
      endsAt: '2026-12-10T13:00:00.000Z',
    })

    expect(r.success).toBe(false)
    /* O erro aponta para `endsAt`: e o campo que a pessoa corrige. Apontar
       para a raiz deixaria o formulario sem onde pintar a mensagem. */
    expect(r.error?.issues[0]?.path).toEqual(['endsAt'])
  })

  it('recusa fim IGUAL ao inicio — duracao zero e o compromisso pontual', () => {
    expect(
      createAppointmentInputSchema.safeParse({ ...valido, endsAt: valido.startsAt }).success,
    ).toBe(false)
  })

  /* Fusos diferentes na mesma comparacao: 12:00-03:00 e 16:00Z, e o fim vem
     DEPOIS mesmo o texto parecendo menor. Comparar as strings cruas diria o
     contrario. */
  it('compara instantes, e nao texto — fim em outro fuso continua valendo', () => {
    const r = createAppointmentInputSchema.safeParse({
      title: 'Almoco',
      startsAt: '2026-12-10T12:00:00-03:00',
      endsAt: '2026-12-10T16:00:00.000Z',
    })

    expect(r.success).toBe(true)
  })

  it('apara o local e recusa o longo demais', () => {
    expect(createAppointmentInputSchema.parse({ ...valido, location: '  Loja  ' }).location).toBe(
      'Loja',
    )

    expect(
      createAppointmentInputSchema.safeParse({ ...valido, location: 'x'.repeat(201) }).success,
    ).toBe(false)
  })

  it('recusa campo desconhecido — o schema e strict', () => {
    expect(createAppointmentInputSchema.safeParse({ ...valido, cor: 'azul' }).success).toBe(false)
  })
})

describe('a agenda de um intervalo', () => {
  it('aceita um mes', () => {
    const r = listAppointmentRangeInputSchema.parse({ from: '2026-12-01', to: '2026-12-31' })

    expect(r.from).toBe('2026-12-01')
  })

  it('aceita um dia so — inicio igual ao fim', () => {
    expect(
      listAppointmentRangeInputSchema.safeParse({ from: '2026-12-10', to: '2026-12-10' }).success,
    ).toBe(true)
  })

  it('recusa fim antes do inicio', () => {
    expect(
      listAppointmentRangeInputSchema.safeParse({ from: '2026-12-31', to: '2026-12-01' }).success,
    ).toBe(false)
  })

  /* Sem teto, `2020-01-01` a `2030-12-31` varreria a agenda inteira da loja
     numa resposta so. O calendario nunca precisa de mais que o mes visivel com
     as bordas das semanas vizinhas — quarenta e dois dias. */
  it('recusa intervalo acima do teto', () => {
    expect(
      listAppointmentRangeInputSchema.safeParse({ from: '2020-01-01', to: '2030-12-31' }).success,
    ).toBe(false)
  })

  it(`aceita exatamente o teto de ${DIAS_MAXIMOS_DA_AGENDA} dias`, () => {
    /* O ultimo intervalo que passa: o teto e exclusivo, entao a distancia
       maxima e um dia a menos que ele. */
    const de = new Date('2026-01-01T00:00:00Z')
    const ate = new Date(de.getTime() + (DIAS_MAXIMOS_DA_AGENDA - 1) * 86_400_000)

    const r = listAppointmentRangeInputSchema.safeParse({
      from: '2026-01-01',
      to: ate.toISOString().slice(0, 10),
    })

    expect(r.success).toBe(true)
  })

  it('recusa um dia alem do teto', () => {
    const de = new Date('2026-01-01T00:00:00Z')
    const ate = new Date(de.getTime() + DIAS_MAXIMOS_DA_AGENDA * 86_400_000)

    expect(
      listAppointmentRangeInputSchema.safeParse({
        from: '2026-01-01',
        to: ate.toISOString().slice(0, 10),
      }).success,
    ).toBe(false)
  })

  it('recusa data que nao existe, em vez de responder agenda vazia', () => {
    expect(
      listAppointmentRangeInputSchema.safeParse({ from: '2026-13-40', to: '2026-12-31' }).success,
    ).toBe(false)
  })
})
