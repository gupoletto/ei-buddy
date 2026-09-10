import { pedir, type Resultado } from './http'

/**
 * O painel do Super Admin — ADR-0007, RF-131.
 *
 * "Entrar como" e a troca de sessao auditada: depois de `entrarNaEmpresa`, o
 * `/api/session` GET passa a devolver a empresa escolhida, e toda tela de
 * negocio funciona normalmente — nenhuma delas sabe que quem esta do outro
 * lado e Super Admin.
 */

export type EmpresaListada = {
  id: string
  legalName: string
  tradeName: string | null
  cnpj: string
  isActive: boolean
  createdAt: string
}

export type SuperAdmin = {
  userId: string
  name: string
  email: string
  grantedAt: string
}

export const listarEmpresas = (): Promise<Resultado<{ companies: EmpresaListada[] }>> =>
  pedir('/api/admin/empresas')

export const entrarNaEmpresa = (
  companyId: string,
  justification: string,
): Promise<Resultado<{ activeCompanyId: string; role: string }>> =>
  pedir('/api/admin/entrar', {
    method: 'POST',
    body: JSON.stringify({ companyId, justification }),
  })

export const sairDoModoAdmin = (): Promise<Resultado<{ activeCompanyId: null }>> =>
  pedir('/api/admin/sair', { method: 'POST' })

export const listarSuperAdmins = (): Promise<Resultado<{ admins: SuperAdmin[] }>> =>
  pedir('/api/admin/super-admins')

export const convidarSuperAdmin = (
  email: string,
  name?: string,
): Promise<Resultado<{ userId: string; created: boolean; temporaryPassword?: string }>> =>
  pedir('/api/admin/super-admins', {
    method: 'POST',
    body: JSON.stringify(name === undefined ? { email } : { email, name }),
  })
