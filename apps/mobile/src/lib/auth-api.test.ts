import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Escolha de loja no login — US-059, RF-119.
 *
 * ## O defeito que estes testes guardam
 *
 * Quem tinha acesso a mais de uma loja caia na PRIMEIRA da lista, em silencio.
 * A consequencia nao e de conforto: a venda ou a conta lancada ia para a
 * empresa errada, com o isolamento por RLS funcionando perfeitamente — o que
 * torna o erro INVISIVEL. Nada falha, nada avisa, o dado so esta no lugar
 * errado.
 *
 * O teste central e o de que, com duas lojas, `entrar` NAO chama
 * `/auth/select-company`. Ele falha se alguem reintroduzir a escolha
 * automatica "para poupar um toque".
 */

const chamadas: { caminho: string; corpo?: unknown }[] = []
const gravadas: unknown[] = []

vi.mock('./api', () => ({
  chamarApi: vi.fn((caminho: string, opcoes?: { body?: unknown }) => {
    chamadas.push({ caminho, corpo: opcoes?.body })
    return Promise.resolve(resposta)
  }),
}))

vi.mock('./session', () => ({
  abrirSessao: vi.fn((sessao: unknown) => {
    gravadas.push(sessao)
    return Promise.resolve()
  }),
}))

type Resposta = { ok: boolean; dados?: unknown; message?: string }
let resposta: Resposta

const { entrar, escolherLoja } = await import('./auth-api.js')

const LOJAS = [
  { companyId: 'e1', companyName: 'Mercearia do Centro', role: 'owner' },
  { companyId: 'e2', companyName: 'Mercearia da Praia', role: 'accountant' },
]

const sessaoDaApi = (over: Record<string, unknown> = {}) => ({
  ok: true,
  dados: {
    token: 'tok-1',
    userId: 'usr-1',
    userName: 'Marina Alves',
    memberships: LOJAS,
    activeCompanyId: null,
    ...over,
  },
})

beforeEach(() => {
  chamadas.length = 0
  gravadas.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('entrar com VARIAS lojas', () => {
  beforeEach(() => {
    resposta = sessaoDaApi()
  })

  it('pede para escolher, em vez de escolher sozinho', async () => {
    const r = await entrar('marina@loja.com', 'senha123')

    expect(r.estado).toBe('escolher-loja')
    if (r.estado !== 'escolher-loja') return
    expect(r.lojas).toHaveLength(2)
    expect(r.nome).toBe('Marina Alves')
  })

  /*
   * O teste que impede a volta do defeito. A versao anterior chamava
   * `/auth/select-company` com `memberships[0]` sem perguntar nada.
   */
  it('NAO chama select-company sozinho', async () => {
    await entrar('marina@loja.com', 'senha123')

    expect(chamadas.map((c) => c.caminho)).toEqual(['/auth/login'])
  })

  /*
   * O token PRECISA estar guardado antes da escolha: a chamada de escolher e
   * autenticada, e sem ele sairia sem `Authorization` e tomaria 401.
   */
  it('guarda a sessao com empresaId nulo, para a escolha poder ser autenticada', async () => {
    await entrar('marina@loja.com', 'senha123')

    expect(gravadas).toHaveLength(1)
    expect(gravadas[0]).toMatchObject({ empresaId: null, empresa: '', lojas: LOJAS })
  })
})

describe('entrar com UMA loja', () => {
  beforeEach(() => {
    resposta = sessaoDaApi({
      memberships: [LOJAS[0]],
      activeCompanyId: 'e1',
    })
  })

  /* Perguntar entre uma opcao e cerimonia — a api ja escolheu. */
  it('entra direto, sem perguntar', async () => {
    const r = await entrar('marina@loja.com', 'senha123')

    expect(r.estado).toBe('pronto')
    expect(chamadas.map((c) => c.caminho)).toEqual(['/auth/login'])
  })

  it('grava a loja ativa na sessao', async () => {
    await entrar('marina@loja.com', 'senha123')

    expect(gravadas.at(-1)).toMatchObject({
      empresaId: 'e1',
      empresa: 'Mercearia do Centro',
    })
  })
})

describe('entrar sem loja nenhuma', () => {
  beforeEach(() => {
    resposta = sessaoDaApi({ memberships: [], activeCompanyId: null })
  })

  /* Entrar levaria a um painel vazio e sem explicacao. */
  it('falha dizendo o que fazer', async () => {
    const r = await entrar('marina@loja.com', 'senha123')

    expect(r.estado).toBe('falhou')
    if (r.estado !== 'falhou') return
    expect(r.erro).toContain('nao esta ligada a nenhuma loja')
  })

  it('nao guarda sessao', async () => {
    await entrar('marina@loja.com', 'senha123')

    expect(gravadas).toHaveLength(0)
  })
})

describe('credencial recusada', () => {
  /*
   * A mensagem vem da api e nao e reescrita aqui: ela e a MESMA para usuario
   * inexistente e senha errada, e a RF-120 pede nao revelar se a conta existe.
   */
  it('repassa a mensagem da api sem reescrever', async () => {
    resposta = { ok: false, message: 'E-mail, telefone ou senha incorretos.' }

    const r = await entrar('quem@nao.existe', 'errada')

    expect(r).toEqual({ estado: 'falhou', erro: 'E-mail, telefone ou senha incorretos.' })
  })
})

describe('escolherLoja', () => {
  beforeEach(() => {
    resposta = sessaoDaApi({ activeCompanyId: 'e2' })
  })

  it('chama select-company com a loja pedida', async () => {
    await escolherLoja('e2')

    expect(chamadas).toEqual([{ caminho: '/auth/select-company', corpo: { companyId: 'e2' } }])
  })

  it('grava a loja escolhida, e nao a primeira da lista', async () => {
    await escolherLoja('e2')

    expect(gravadas.at(-1)).toMatchObject({
      empresaId: 'e2',
      empresa: 'Mercearia da Praia',
    })
  })

  /* Serve tanto a escolha do login quanto a troca pelo menu — e a mesma
     operacao, e duas implementacoes seriam duas chances de divergir. */
  it('devolve pronto', async () => {
    expect((await escolherLoja('e2')).estado).toBe('pronto')
  })

  it('nao troca quando a api recusa', async () => {
    resposta = { ok: false, message: 'Loja nao encontrada.' }

    const r = await escolherLoja('e9')

    expect(r).toEqual({ estado: 'falhou', erro: 'Loja nao encontrada.' })
    expect(gravadas).toHaveLength(0)
  })
})
