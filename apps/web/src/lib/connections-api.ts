import { pedir, type Resultado } from './http'

/**
 * Conexao entre lojistas por proximidade — ADR-0008, DEC-021.
 *
 * Buscar fornecedor de um insumo perto de voce, e pedir conexao para liberar
 * o contato. Antes do aceite dos dois lados, so nome da empresa,
 * bairro/cidade e distancia aparecem — telefone e endereco completo so depois.
 */

export type Fornecedor = {
  companyId: string
  companyName: string
  neighborhood: string | null
  city: string | null
  distanceKm: number | null
  products: string[]
}

/** Empresas que outras do seu ramo ja conectaram — filtragem colaborativa, sem IA (ADR-0008). */
export type SugestaoDeFornecedor = {
  companyId: string
  companyName: string
  neighborhood: string | null
  city: string | null
  distanceKm: number | null
  /** Quantas empresas do seu ramo ja tem conexao aceita com esta. */
  peerCount: number
}

export type ConexaoContato = {
  phone: string
  postalCode: string | null
  street: string | null
  streetNumber: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
}

export type Conexao = {
  id: string
  direction: 'sent' | 'received'
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  otherCompanyId: string
  otherCompanyName: string
  createdAt: string
  respondedAt: string | null
  expiresAt: string
  contact: ConexaoContato | null
}

export const buscarFornecedores = (termo: string): Promise<Resultado<{ results: Fornecedor[] }>> =>
  pedir(`/api/fornecedores?termo=${encodeURIComponent(termo)}`)

export const buscarSugestoes = (): Promise<Resultado<{ suggestions: SugestaoDeFornecedor[] }>> =>
  pedir('/api/fornecedores/sugestoes')

export const pedirConexao = (targetCompanyId: string): Promise<Resultado<{ id: string }>> =>
  pedir('/api/conexoes', { method: 'POST', body: JSON.stringify({ targetCompanyId }) })

export const listarConexoes = (): Promise<Resultado<{ connections: Conexao[] }>> =>
  pedir('/api/conexoes')

export const contarConexoesPendentes = (): Promise<Resultado<{ count: number }>> =>
  pedir('/api/conexoes/pendentes')

export const aceitarConexao = (id: string): Promise<Resultado<{ ok: true }>> =>
  pedir(`/api/conexoes/${id}/aceitar`, { method: 'POST' })

export const recusarConexao = (id: string): Promise<Resultado<{ ok: true }>> =>
  pedir(`/api/conexoes/${id}/recusar`, { method: 'POST' })

export const encerrarConexao = (id: string): Promise<Resultado<{ ok: true }>> =>
  pedir(`/api/conexoes/${id}/encerrar`, { method: 'POST' })
