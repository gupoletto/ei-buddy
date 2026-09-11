import {
  ConnectionActionRefusedError,
  ConnectionAlreadyExistsError,
  ConnectionNotFoundError,
  TargetCompanyUnavailableError,
  type ConnectionContact,
  type ConnectionRequests,
  type ConnectionRow,
  type ConnectionStatus,
  type NewConnectionRequest,
  type SupplierDirectory,
  type SupplierSearchRow,
  type SupplierSuggestionRow,
} from '@na-regua/core'
import type { Sql } from 'postgres'

/**
 * Implementacao de `SupplierDirectory`/`ConnectionRequests` — ADR-0008.
 *
 * Cada metodo e uma chamada a uma funcao `SECURITY DEFINER` da migration
 * 0009. Mesmo molde de `platform-admin-repository.ts`: nenhuma logica de
 * autorizacao mora aqui, so traducao de forma de dado e de erro.
 */

/** Erro do Postgres para violacao de indice unico. */
const VIOLACAO_DE_UNICIDADE = '23505'

function ehErroDoPostgres(erro: unknown): erro is { code: string; message: string } {
  return typeof erro === 'object' && erro !== null && 'code' in erro
}

type LinhaDeBusca = {
  company_id: string
  company_name: string
  neighborhood: string | null
  city: string | null
  distance_km: string | null
  products: string[]
}

const paraResultadoDeBusca = (l: LinhaDeBusca): SupplierSearchRow => ({
  companyId: l.company_id,
  companyName: l.company_name,
  neighborhood: l.neighborhood,
  city: l.city,
  /* `numeric` volta como string no postgres.js, para nao perder precisao. */
  distanceKm: l.distance_km === null ? null : Number(l.distance_km),
  products: l.products,
})

type LinhaDeSugestao = {
  company_id: string
  company_name: string
  neighborhood: string | null
  city: string | null
  distance_km: string | null
  peer_count: number
}

const paraSugestao = (l: LinhaDeSugestao): SupplierSuggestionRow => ({
  companyId: l.company_id,
  companyName: l.company_name,
  neighborhood: l.neighborhood,
  city: l.city,
  distanceKm: l.distance_km === null ? null : Number(l.distance_km),
  peerCount: l.peer_count,
})

export function createSupplierDirectory(sql: Sql): SupplierDirectory {
  return {
    search: async (requesterCompanyId, term) => {
      const linhas = await sql<LinhaDeBusca[]>`
        SELECT * FROM company_connections_search(${requesterCompanyId}, ${term})
      `
      return linhas.map(paraResultadoDeBusca)
    },

    suggest: async (requesterCompanyId) => {
      const linhas = await sql<LinhaDeSugestao[]>`
        SELECT * FROM company_connections_suggestions(${requesterCompanyId})
      `
      return linhas.map(paraSugestao)
    },
  }
}

type LinhaDeLista = {
  id: string
  direction: string
  status: string
  other_company_id: string
  other_company_name: string
  created_at: Date
  responded_at: Date | null
  expires_at: Date
  other_phone: string | null
  other_postal_code: string | null
  other_street: string | null
  other_street_number: string | null
  other_complement: string | null
  other_neighborhood: string | null
  other_city: string | null
  other_state: string | null
}

const paraContato = (l: LinhaDeLista): ConnectionContact | null => {
  if (l.other_phone === null) return null

  return {
    phone: l.other_phone,
    postalCode: l.other_postal_code,
    street: l.other_street,
    streetNumber: l.other_street_number,
    complement: l.other_complement,
    neighborhood: l.other_neighborhood,
    city: l.other_city,
    state: l.other_state,
  }
}

const paraConexao = (l: LinhaDeLista): ConnectionRow => ({
  id: l.id,
  direction: l.direction as ConnectionRow['direction'],
  status: l.status as ConnectionStatus,
  otherCompanyId: l.other_company_id,
  otherCompanyName: l.other_company_name,
  createdAt: l.created_at.toISOString(),
  respondedAt: l.responded_at === null ? null : l.responded_at.toISOString(),
  expiresAt: l.expires_at.toISOString(),
  contact: paraContato(l),
})

export function createConnectionRequests(sql: Sql): ConnectionRequests {
  return {
    request: async (requesterUserId, requesterCompanyId, targetCompanyId) => {
      try {
        const [linha] = await sql<
          {
            id: string
            target_company_id: string
            target_phone: string
            target_company_name: string
          }[]
        >`
          SELECT * FROM company_connections_request(
            ${requesterUserId}, ${requesterCompanyId}, ${targetCompanyId}
          )
        `
        const resultado: NewConnectionRequest = {
          id: linha!.id,
          targetCompanyId: linha!.target_company_id,
          targetPhone: linha!.target_phone,
          targetCompanyName: linha!.target_company_name,
        }
        return resultado
      } catch (erro) {
        if (ehErroDoPostgres(erro) && erro.code === VIOLACAO_DE_UNICIDADE) {
          throw new ConnectionAlreadyExistsError()
        }
        if (ehErroDoPostgres(erro)) {
          throw new TargetCompanyUnavailableError(erro.message)
        }
        throw erro
      }
    },

    respond: async (connectionId, userId, accept) => {
      await chamarComTraducaoDeErro(
        () => sql`SELECT company_connections_respond(${connectionId}, ${userId}, ${accept})`,
      )
    },

    end: async (connectionId, userId) => {
      await chamarComTraducaoDeErro(
        () => sql`SELECT company_connections_end(${connectionId}, ${userId})`,
      )
    },

    list: async (userId) => {
      const linhas = await sql<LinhaDeLista[]>`SELECT * FROM company_connections_list(${userId})`
      return linhas.map(paraConexao)
    },

    pendingCount: async (userId) => {
      const [linha] = await sql<{ company_connections_pending_count: number }[]>`
        SELECT company_connections_pending_count(${userId})
      `
      return linha?.company_connections_pending_count ?? 0
    },
  }
}

/**
 * `respond`/`end` lancam via `RAISE EXCEPTION` (PL/pgSQL), nunca por indice —
 * so tem os dois casos: "nao encontrado" (mensagem termina em
 * "encontrado.") ou qualquer outra recusa (ja respondido, nao autorizado,
 * expirado, ja encerrado). Distinguir pela MENSAGEM e o que da para fazer sem
 * inventar um SQLSTATE por caso — a funcao ja escreve o texto certo para a
 * tela.
 */
async function chamarComTraducaoDeErro(consulta: () => Promise<unknown>): Promise<void> {
  try {
    await consulta()
  } catch (erro) {
    if (ehErroDoPostgres(erro)) {
      if (erro.message.includes('nao encontrado')) {
        throw new ConnectionNotFoundError(erro.message)
      }
      throw new ConnectionActionRefusedError(erro.message)
    }
    throw erro
  }
}
