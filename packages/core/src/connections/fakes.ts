import type { CompanyId, UserId } from '../context.js'
import type {
  ConnectionNotifier,
  ConnectionRequests,
  ConnectionRow,
  NewConnectionRequest,
  SupplierDirectory,
  SupplierSearchRow,
} from '../ports/connections.js'

/**
 * Falsos de `connections`, controlaveis pelo teste — ADR-0008.
 *
 * Diferente dos falsos de `registration/fakes.ts`, estes NAO reimplementam
 * as regras de negocio da funcao SQL (duplicado, dono ativo, expiracao —
 * essas ja tem cobertura de verdade em `packages/db/src/connections.test.ts`,
 * contra o Postgres real). O que estes falsos testam e o que e de `core`:
 * autorizacao, traducao de erro, e orquestracao (avisar depois de gravar).
 */
export class InMemoryConnectionRequests implements ConnectionRequests {
  /** Erro ou resultado do PROXIMO `request()` — o teste decide qual dos dois. */
  requestResult: NewConnectionRequest | Error = {
    id: 'conn-1',
    targetCompanyId: 'emp-2',
    targetPhone: '41988880000',
    targetCompanyName: 'Empresa Alvo',
  }
  respondError: Error | undefined
  endError: Error | undefined
  listResult: readonly ConnectionRow[] = []
  pendingCountResult = 0

  readonly chamadas: { readonly metodo: string; readonly args: readonly unknown[] }[] = []

  async request(
    requesterUserId: UserId,
    requesterCompanyId: CompanyId,
    targetCompanyId: CompanyId,
  ): Promise<NewConnectionRequest> {
    this.chamadas.push({
      metodo: 'request',
      args: [requesterUserId, requesterCompanyId, targetCompanyId],
    })
    if (this.requestResult instanceof Error) throw this.requestResult
    return this.requestResult
  }

  async respond(connectionId: string, userId: UserId, accept: boolean): Promise<void> {
    this.chamadas.push({ metodo: 'respond', args: [connectionId, userId, accept] })
    if (this.respondError !== undefined) throw this.respondError
  }

  async end(connectionId: string, userId: UserId): Promise<void> {
    this.chamadas.push({ metodo: 'end', args: [connectionId, userId] })
    if (this.endError !== undefined) throw this.endError
  }

  async list(userId: UserId): Promise<readonly ConnectionRow[]> {
    this.chamadas.push({ metodo: 'list', args: [userId] })
    return this.listResult
  }

  async pendingCount(userId: UserId): Promise<number> {
    this.chamadas.push({ metodo: 'pendingCount', args: [userId] })
    return this.pendingCountResult
  }
}

export class InMemoryConnectionNotifier implements ConnectionNotifier {
  deveFalhar = false
  readonly avisos: (NewConnectionRequest & { requesterCompanyName: string })[] = []

  async notifyRequestReceived(
    params: NewConnectionRequest & { requesterCompanyName: string },
  ): Promise<void> {
    this.avisos.push(params)
    if (this.deveFalhar) throw new Error('Fila de aviso indisponivel (simulado).')
  }
}

export class InMemorySupplierDirectory implements SupplierDirectory {
  resultado: readonly SupplierSearchRow[] = []
  readonly chamadas: { readonly requesterCompanyId: CompanyId; readonly term: string }[] = []

  async search(requesterCompanyId: CompanyId, term: string): Promise<readonly SupplierSearchRow[]> {
    this.chamadas.push({ requesterCompanyId, term })
    return this.resultado
  }
}
