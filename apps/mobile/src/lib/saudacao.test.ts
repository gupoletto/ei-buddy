import { describe, expect, it } from 'vitest'
import { dataPorExtenso, hojeLocal, primeiroNome, saudacaoDaHora } from './periodo'

/**
 * A saudacao e a data da tela inicial — NR-013.
 *
 * As funcoes moram em `periodo.ts`, que nao importa NADA. Nao e organizacao: os
 * modulos que falam com a api carregam `react-native` na cadeia, e o vitest nao
 * analisa a sintaxe Flow que vem junto — uma conta escondida la seria uma conta
 * sem teste.
 *
 * O que se prova aqui e o que a tela errava: "Bom dia" as onze da noite, e um
 * "hoje" que saia de uma constante escrita no codigo.
 */

describe('saudacao pela hora', () => {
  it('de manha e bom dia', () => {
    expect(saudacaoDaHora(new Date(2026, 8, 7, 8, 0))).toBe('Bom dia')
    expect(saudacaoDaHora(new Date(2026, 8, 7, 11, 59))).toBe('Bom dia')
  })

  it('a tarde e boa tarde', () => {
    expect(saudacaoDaHora(new Date(2026, 8, 7, 12, 0))).toBe('Boa tarde')
    expect(saudacaoDaHora(new Date(2026, 8, 7, 17, 59))).toBe('Boa tarde')
  })

  it('a noite e boa noite — o caso que a tela errava', () => {
    /* A tela dizia "Bom dia" as 23h, para todo mundo, sempre. */
    expect(saudacaoDaHora(new Date(2026, 8, 7, 23, 0))).toBe('Boa noite')
    expect(saudacaoDaHora(new Date(2026, 8, 7, 18, 0))).toBe('Boa noite')
  })
})

describe('primeiro nome', () => {
  it('pega so o primeiro', () => {
    expect(primeiroNome('Maria Aparecida da Silva Santos')).toBe('Maria')
  })

  it('nome unico continua inteiro', () => {
    expect(primeiroNome('Marina')).toBe('Marina')
  })

  it('aguenta espaco sobrando', () => {
    expect(primeiroNome('  Ana   Paula ')).toBe('Ana')
  })
})

describe('hoje, do relogio e nao do codigo', () => {
  it('formata em AAAA-MM-DD com campos locais', () => {
    /* Mes 0 e janeiro; dia 5 tem de sair com zero a esquerda. */
    expect(hojeLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('nao recua um dia na virada — o defeito do `toISOString`', () => {
    /*
     * 1 de marco as 00h30 no fuso do Brasil e 28 de fevereiro em UTC. Com
     * `toISOString().slice(0,10)`, "vendido hoje" mostraria o movimento de
     * ontem ate as 21h.
     */
    expect(hojeLocal(new Date(2026, 2, 1, 0, 30))).toBe('2026-03-01')
  })

  it('fecha o ano no dia certo', () => {
    expect(hojeLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})

describe('data por extenso', () => {
  it('escreve o dia da semana e o mes em portugues', () => {
    /* 7 de setembro de 2026 e uma segunda-feira. */
    expect(dataPorExtenso(new Date(2026, 8, 7))).toBe('Segunda-feira, 7 de setembro')
  })

  it('acerta domingo e dezembro, as pontas dos dois vetores', () => {
    expect(dataPorExtenso(new Date(2026, 11, 6))).toBe('Domingo, 6 de dezembro')
  })
})
