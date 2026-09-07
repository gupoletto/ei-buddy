import { afterAll, describe, expect, it } from 'vitest'
import { diaLocal, horaLocal, instante, montarMes, pontasDaGrade } from './agenda-api'

/**
 * O fuso da agenda — NR-036.
 *
 * A conversao entre INSTANTE (o que o banco guarda) e DIA + HORA (o que a tela
 * mostra) e o unico lugar da agenda onde um erro nao aparece em teste de rota:
 * o servidor devolve o instante certo, e a tela desenha no dia errado.
 *
 * Os testes rodam num fuso FIXO (`America/Sao_Paulo`, UTC-3) e nao no da
 * maquina. Sem isso o resultado dependeria de onde a CI roda, e um teste que
 * passa em Londres e falha em Curitiba nao prova nada sobre o defeito.
 */

const FUSO_ORIGINAL = process.env.TZ
process.env.TZ = 'America/Sao_Paulo'

afterAll(() => {
  process.env.TZ = FUSO_ORIGINAL
})

describe('instante -> dia e hora locais', () => {
  /*
   * O defeito que isto guarda: `toISOString().slice(0, 10)` sobre as 21h de
   * Sao Paulo devolve o dia SEGUINTE, porque em UTC ja passou da meia-noite.
   * O compromisso das 21h de segunda apareceria na terca.
   */
  it('as 21h de Sao Paulo continuam sendo o dia de hoje, e nao o de amanha', () => {
    const noite = new Date('2026-09-10T21:00:00-03:00')

    expect(diaLocal(noite)).toBe('2026-09-10')
    /* A prova de que o teste esta medindo algo: por UTC daria o dia 11. */
    expect(noite.toISOString().slice(0, 10)).toBe('2026-09-11')
  })

  it('a madrugada tambem: 1h da manha e o dia que comecou', () => {
    const madrugada = new Date('2026-09-10T01:00:00-03:00')

    expect(diaLocal(madrugada)).toBe('2026-09-10')
    expect(horaLocal(madrugada)).toBe('01:00')
  })

  it('a hora mostrada e a local, e nao a de Greenwich', () => {
    expect(horaLocal(new Date('2026-09-10T14:00:00-03:00'))).toBe('14:00')
  })

  it('zero a esquerda no mes, no dia e na hora', () => {
    expect(diaLocal(new Date('2026-01-05T09:07:00-03:00'))).toBe('2026-01-05')
    expect(horaLocal(new Date('2026-01-05T09:07:00-03:00'))).toBe('09:07')
  })
})

describe('dia e hora locais -> instante', () => {
  it('09:00 digitado e nove da manha AQUI, e nao em Londres', () => {
    /* Montar a string com `Z` marcaria 09:00 UTC, que sao 6h da manha em Sao
       Paulo — o compromisso apareceria tres horas antes do combinado. */
    expect(instante('2026-09-10', '09:00')).toBe('2026-09-10T12:00:00.000Z')
  })

  it('a volta fecha: instante -> dia/hora -> instante', () => {
    const ida = instante('2026-09-10', '21:30')
    const volta = new Date(ida)

    expect(diaLocal(volta)).toBe('2026-09-10')
    expect(horaLocal(volta)).toBe('21:30')
  })
})

describe('a grade do mes', () => {
  it('comeca no domingo e cobre o mes inteiro', () => {
    /* Setembro de 2026 comeca numa terca. */
    const grade = montarMes(2026, 8, '2026-09-10')

    expect(grade[0]!.data).toBe('2026-08-30')
    expect(grade.filter((d) => d.doMes)).toHaveLength(30)
  })

  it('marca o dia de referencia como hoje — um so', () => {
    const grade = montarMes(2026, 8, '2026-09-10')

    expect(grade.filter((d) => d.hoje).map((d) => d.data)).toEqual(['2026-09-10'])
  })

  /* Fevereiro de 2027 comeca numa segunda e tem 28 dias: cabe em cinco
     semanas, e a sexta seria toda de marco. */
  it('corta a ultima semana quando ela e toda do mes seguinte', () => {
    expect(montarMes(2027, 1, '2027-02-10')).toHaveLength(35)
  })

  it('mantem as seis semanas quando a ultima ainda tem dia do mes', () => {
    /* Maio de 2026 comeca numa sexta e tem 31 dias: nao cabe em cinco. */
    expect(montarMes(2026, 4, '2026-05-10')).toHaveLength(42)
  })

  /*
   * O intervalo pedido ao servidor sai das PONTAS DA GRADE, e nao do mes
   * civil. Com o mes civil, o dia 30 de agosto apareceria em branco na tela de
   * setembro mesmo tendo compromisso marcado.
   */
  it('as pontas cobrem as bordas das semanas vizinhas, e nao so o mes', () => {
    /* Setembro de 2026 cabe em cinco semanas: a grade vai de 30/ago a 03/out,
       e sao esses dois dias de fora que ficariam sem pontinho se o pedido
       fosse "de 01 a 30 de setembro". */
    const grade = montarMes(2026, 8, '2026-09-10')

    expect(pontasDaGrade(grade)).toEqual({ de: '2026-08-30', ate: '2026-10-03' })
  })

  /* O teto do contrato e de 62 dias. Seis semanas dao 42 — folga confortavel,
     mas vale conferir que a grade maior possivel ainda passa. */
  it('a grade mais longa cabe no teto do intervalo aceito pela api', () => {
    const grade = montarMes(2026, 4, '2026-05-10')
    const { de, ate } = pontasDaGrade(grade)

    const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000

    expect(dias).toBe(41)
  })
})
