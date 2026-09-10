import { describe, expect, it } from 'vitest'
import { isAppError } from '../app-error.js'
import {
  FakeIdentityProvider,
  InMemoryPlatformAdminAccess,
  InMemorySessionIssuer,
  InMemoryUserDirectory,
} from './fakes.js'
import {
  enterCompany,
  exitCompany,
  grantPlatformAdmin,
  listCompanies,
  listPlatformAdmins,
  type PlatformAdminDeps,
} from './platform-admin.js'

/**
 * Casos de uso do Super Admin — ADR-0007, RF-131.
 *
 * O que se prova aqui: "core confere ANTES de repassar" — cada operacao
 * recusa quem nao e Super Admin sem sequer chamar a porta de verdade.
 */

function cenario() {
  const users = new InMemoryUserDirectory()
  const sessions = new InMemorySessionIssuer()
  const provider = new FakeIdentityProvider()
  const access = new InMemoryPlatformAdminAccess({
    aoEntrar: (token, companyId) => {
      const claims = sessions.claimsDe(token)
      if (claims === undefined) return
      sessions.sobrescreverClaims(token, { userId: claims.userId, companyId, role: 'owner' })
    },
    aoSair: (token) => {
      const claims = sessions.claimsDe(token)
      if (claims === undefined) return
      sessions.sobrescreverClaims(token, { userId: claims.userId, companyId: null })
    },
  })

  const deps: PlatformAdminDeps = { access, sessions, users, registrar: provider }
  return { deps, access, sessions, users, provider }
}

const EMPRESA = 'empresa-super-admin'

describe('entrar numa empresa — ADR-0007', () => {
  it('recusa quem nao e Super Admin', async () => {
    const { deps, sessions } = cenario()
    const token = await sessions.issue({ userId: 'usr-comum', companyId: null }, futuro())

    const erro = await pegaErro(() =>
      enterCompany(deps, { userId: 'usr-comum', companyId: null }, token, {
        companyId: EMPRESA,
        justification: 'Investigando um chamado de suporte',
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })

  it('Super Admin entra: a sessao passa a valer como owner da empresa', async () => {
    const { deps, sessions, access } = cenario()
    access.tornarSuperAdmin('usr-admin')
    access.adicionarEmpresa({
      id: EMPRESA,
      legalName: 'Loja X',
      tradeName: null,
      cnpj: '00000000000000',
      isActive: true,
      createdAt: new Date().toISOString(),
    })

    const token = await sessions.issue({ userId: 'usr-admin', companyId: null }, futuro())

    const claims = await enterCompany(deps, { userId: 'usr-admin', companyId: null }, token, {
      companyId: EMPRESA,
      justification: 'Cliente pediu ajuda no chat de suporte',
    })

    expect(claims).toEqual({ userId: 'usr-admin', companyId: EMPRESA, role: 'owner' })
    expect(access.acessosRegistrados()).toEqual([
      { token, companyId: EMPRESA, justification: 'Cliente pediu ajuda no chat de suporte' },
    ])
  })
})

describe('sair do modo Super Admin', () => {
  it('devolve a sessao ao estado sem empresa', async () => {
    const { deps, sessions, access } = cenario()
    access.tornarSuperAdmin('usr-admin')
    access.adicionarEmpresa({
      id: EMPRESA,
      legalName: 'Loja X',
      tradeName: null,
      cnpj: '00000000000000',
      isActive: true,
      createdAt: new Date().toISOString(),
    })
    const token = await sessions.issue({ userId: 'usr-admin', companyId: null }, futuro())
    await enterCompany(deps, { userId: 'usr-admin', companyId: null }, token, {
      companyId: EMPRESA,
      justification: 'Justificativa valida para o teste',
    })

    const claims = await exitCompany(deps, token)

    expect(claims).toEqual({ userId: 'usr-admin', companyId: null })
  })
})

describe('a visao geral da plataforma', () => {
  it('recusa listar empresas para quem nao e Super Admin', async () => {
    const { deps } = cenario()

    const erro = await pegaErro(() => listCompanies(deps, 'usr-comum'))
    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })

  it('recusa listar Super Admins para quem nao e um', async () => {
    const { deps } = cenario()

    const erro = await pegaErro(() => listPlatformAdmins(deps, 'usr-comum'))
    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })
})

describe('conceder Super Admin', () => {
  it('recusa quando quem concede nao e Super Admin', async () => {
    const { deps } = cenario()

    const erro = await pegaErro(() =>
      grantPlatformAdmin(deps, 'usr-comum', { email: 'daniel@exemplo.com' }),
    )
    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })

  it('quem ja tem conta so ganha a capacidade — sem senha temporaria', async () => {
    const { deps, access, users } = cenario()
    access.tornarSuperAdmin('usr-admin')
    const existente = users.adicionarUsuario({ name: 'Daniel', email: 'daniel@exemplo.com' })

    const resultado = await grantPlatformAdmin(deps, 'usr-admin', { email: 'daniel@exemplo.com' })

    expect(resultado).toEqual({ userId: existente.id, created: false })
    expect(await access.isPlatformAdmin(existente.id)).toBe(true)
  })

  it('e-mail novo: cria a conta, concede, e devolve a senha temporaria UMA vez', async () => {
    const { deps, access, users } = cenario()
    access.tornarSuperAdmin('usr-admin')

    const resultado = await grantPlatformAdmin(deps, 'usr-admin', {
      email: 'novo-admin@exemplo.com',
      name: 'Novo Admin',
    })

    expect(resultado.created).toBe(true)
    expect(resultado.temporaryPassword).toBeDefined()
    expect(resultado.temporaryPassword!.length).toBeGreaterThan(10)
    expect(await access.isPlatformAdmin(resultado.userId)).toBe(true)

    const criado = await users.findByEmail('novo-admin@exemplo.com')
    expect(criado?.name).toBe('Novo Admin')
  })
})

function futuro(): Date {
  return new Date(Date.now() + 3_600_000)
}

async function pegaErro(fn: () => Promise<unknown>) {
  try {
    await fn()
    return undefined
  } catch (e) {
    return e
  }
}
