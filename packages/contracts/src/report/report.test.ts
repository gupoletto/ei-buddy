import { describe, expect, it } from 'vitest'
import {
  catalogInputSchema,
  LIMITE_MAXIMO_DO_RANKING,
  PAGINA_MAXIMA_DO_CATALOGO,
  PAGINA_PADRAO_DO_CATALOGO,
  rankingInputSchema,
  revenueByMonthInputSchema,
} from '../index.js'

/**
 * Contratos de relatorio — NR-077, US-041.
 *
 * Estes schemas subiram sem teste, e a cobertura so denunciou quando a
 * migracao para o Zod 4 removeu os `errorMap` que mascaravam o numero. O que se
 * prova aqui e o que so o schema faz: recusar periodo invertido, converter o
 * que chega como TEXTO na query string, e nao deixar ninguem pedir o banco
 * inteiro pela barra de endereco.
 */

describe('periodo do faturamento — US-041', () => {
  it('aceita o periodo em ordem', () => {
    const r = revenueByMonthInputSchema.safeParse({ from: '2026-01-01', to: '2026-03-31' })

    expect(r.success).toBe(true)
  })

  it('aceita o mesmo dia nas duas pontas', () => {
    /* Um dia so e periodo legitimo: "quanto entrou hoje". */
    const r = revenueByMonthInputSchema.safeParse({ from: '2026-01-10', to: '2026-01-10' })

    expect(r.success).toBe(true)
  })

  it('recusa periodo invertido, apontando o campo', () => {
    const r = revenueByMonthInputSchema.safeParse({ from: '2026-03-01', to: '2026-01-31' })

    expect(r.success).toBe(false)
    /* O erro aponta `from`, e nao a raiz: o formulario precisa saber QUAL
       campo destacar, senao a mensagem aparece solta no topo da tela. */
    expect(r.error?.issues[0]?.path).toEqual(['from'])
  })

  it('recusa data que nao existe no calendario', () => {
    const r = revenueByMonthInputSchema.safeParse({ from: '2026-02-30', to: '2026-03-31' })

    expect(r.success).toBe(false)
  })

  it('recusa campo a mais, em vez de ignorar em silencio', () => {
    /* `.strict()`: um `limite` escrito errado tem de reclamar, e nao ser
       descartado — o relatorio voltaria com outro recorte sem ninguem ver. */
    const r = revenueByMonthInputSchema.safeParse({
      from: '2026-01-01',
      to: '2026-01-31',
      limite: 10,
    })

    expect(r.success).toBe(false)
  })
})

describe('ranking — US-041', () => {
  const periodo = { from: '2026-01-01', to: '2026-01-31' }

  it('converte o limite que chega como TEXTO na query', () => {
    /* Query string nao tem numero. Sem a coercao, o `LIMIT` iria como string
       para o banco. */
    const r = rankingInputSchema.safeParse({ ...periodo, limit: '5' })

    expect(r.success).toBe(true)
    expect(r.data?.limit).toBe(5)
  })

  it('usa o padrao quando ninguem pede limite', () => {
    const r = rankingInputSchema.safeParse(periodo)

    expect(r.data?.limit).toBe(10)
  })

  it('recusa limite acima do teto', () => {
    const r = rankingInputSchema.safeParse({ ...periodo, limit: LIMITE_MAXIMO_DO_RANKING + 1 })

    expect(r.success).toBe(false)
  })

  it('recusa limite zero ou negativo', () => {
    expect(rankingInputSchema.safeParse({ ...periodo, limit: 0 }).success).toBe(false)
    expect(rankingInputSchema.safeParse({ ...periodo, limit: -3 }).success).toBe(false)
  })

  it('recusa limite fracionado', () => {
    /* "2.5 posicoes" nao existe, e o banco arredondaria em silencio. */
    expect(rankingInputSchema.safeParse({ ...periodo, limit: 2.5 }).success).toBe(false)
  })

  it('recusa periodo invertido tambem aqui', () => {
    const r = rankingInputSchema.safeParse({ from: '2026-03-01', to: '2026-01-31' })

    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['from'])
  })
})

describe('catalogo do backoffice — NR-072', () => {
  it('usa pagina 1 e o tamanho padrao quando nada e pedido', () => {
    const r = catalogInputSchema.safeParse({})

    expect(r.data?.page).toBe(1)
    expect(r.data?.pageSize).toBe(PAGINA_PADRAO_DO_CATALOGO)
    /* `todos` e o padrao: abrir a tela mostra o catalogo, e nao um filtro. */
    expect(r.data?.stock).toBe('todos')
  })

  it('converte pagina e tamanho que chegam como texto', () => {
    const r = catalogInputSchema.safeParse({ page: '3', pageSize: '50' })

    expect(r.data?.page).toBe(3)
    expect(r.data?.pageSize).toBe(50)
  })

  it('recusa pagina zero — a primeira e a 1', () => {
    expect(catalogInputSchema.safeParse({ page: 0 }).success).toBe(false)
  })

  it('recusa pagina maior que o teto, para ninguem varrer o banco pela URL', () => {
    const r = catalogInputSchema.safeParse({ pageSize: PAGINA_MAXIMA_DO_CATALOGO + 1 })

    expect(r.success).toBe(false)
  })

  it('aceita os tres niveis de estoque e recusa o resto', () => {
    for (const stock of ['todos', 'baixo', 'esgotado']) {
      expect(catalogInputSchema.safeParse({ stock }).success).toBe(true)
    }
    expect(catalogInputSchema.safeParse({ stock: 'acabando' }).success).toBe(false)
  })
})
