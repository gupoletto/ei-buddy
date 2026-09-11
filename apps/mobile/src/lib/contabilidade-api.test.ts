import { describe, expect, it, vi } from 'vitest'

/**
 * O plano de contas do celular — NR-077, RF-081, RF-082.
 *
 * A tela de Plano de contas lia dados de exemplo mesmo depois de o web ja
 * falar com `GET /contas-contabeis` de verdade — cada conta mostrava um
 * "gasto no mes" inventado, igual para toda loja.
 */

let resposta: { ok: boolean; dados?: unknown; message?: string }

vi.mock('./api', () => ({
  chamarApi: vi.fn(() => Promise.resolve(resposta)),
}))

const { carregarPlano, mesLocal } = await import('./contabilidade-api.js')

describe('carregarPlano', () => {
  it('devolve as contas quando a api responde', async () => {
    resposta = {
      ok: true,
      dados: { accounts: [{ id: 'c1', name: 'Vendas', type: 'revenue', isDefault: true }] },
    }

    const r = await carregarPlano()

    expect(r).toEqual({
      ok: true,
      dados: { accounts: [{ id: 'c1', name: 'Vendas', type: 'revenue', isDefault: true }] },
    })
  })

  it('repassa o erro em vez de lancar', async () => {
    resposta = { ok: false, message: 'Sem conexao.' }

    expect(await carregarPlano()).toEqual({ ok: false, erro: 'Sem conexao.' })
  })
})

describe('mesLocal', () => {
  /* O defeito que isto evita: `toISOString()` sobre a meia-noite local
     converteria para UTC e, dependendo do fuso, o mes poderia comecar ou
     terminar no dia errado — o mesmo cuidado do "hoje" na agenda. */
  it('vai do dia 1 ao ultimo dia do mes', () => {
    expect(mesLocal(new Date(2026, 8, 15))).toEqual({ de: '2026-09-01', ate: '2026-09-30' })
  })

  it('acerta o ultimo dia de fevereiro em ano bissexto', () => {
    expect(mesLocal(new Date(2028, 1, 10)).ate).toBe('2028-02-29')
  })

  it('acerta o ultimo dia de fevereiro fora de ano bissexto', () => {
    expect(mesLocal(new Date(2026, 1, 10)).ate).toBe('2026-02-28')
  })

  it('acerta dezembro, o mes que vira o ano', () => {
    expect(mesLocal(new Date(2026, 11, 5))).toEqual({ de: '2026-12-01', ate: '2026-12-31' })
  })
})
