import type { CompanyId, UserId } from '../context.js'

/**
 * Conexao entre lojistas por proximidade — ADR-0008, DEC-021.
 *
 * Duas portas porque sao dois problemas diferentes: `SupplierDirectory` e
 * leitura publica cross-tenant (quem vende o que, perto de onde), e
 * `ConnectionRequests` e o ciclo de vida do pedido, sempre amarrado a um
 * usuario especifico.
 */

export type SupplierSearchRow = {
  readonly companyId: CompanyId
  readonly companyName: string
  readonly neighborhood: string | null
  readonly city: string | null
  /** Nulo quando quem busca ainda nao tem coordenada resolvida — RF-02. */
  readonly distanceKm: number | null
  readonly products: readonly string[]
}

export type SupplierDirectory = {
  /** Quem vende `term`, perto da empresa que busca — nunca telefone/endereco. */
  search(requesterCompanyId: CompanyId, term: string): Promise<readonly SupplierSearchRow[]>
}

export type ConnectionDirection = 'sent' | 'received'
export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'expired'

export type ConnectionContact = {
  readonly phone: string
  readonly postalCode: string | null
  readonly street: string | null
  readonly streetNumber: string | null
  readonly complement: string | null
  readonly neighborhood: string | null
  readonly city: string | null
  readonly state: string | null
}

export type ConnectionRow = {
  readonly id: string
  readonly direction: ConnectionDirection
  readonly status: ConnectionStatus
  readonly otherCompanyId: CompanyId
  readonly otherCompanyName: string
  readonly createdAt: string
  readonly respondedAt: string | null
  readonly expiresAt: string
  /** So quando `status` e `accepted` — RF-03. */
  readonly contact: ConnectionContact | null
}

/** O que a fila de aviso precisa para notificar quem recebeu o pedido. */
export type NewConnectionRequest = {
  readonly id: string
  readonly targetCompanyId: CompanyId
  readonly targetPhone: string
  readonly targetCompanyName: string
}

/** A empresa alvo nao existe, esta inativa, ou nao tem `owner` ativo. */
export class TargetCompanyUnavailableError extends Error {}

/** Ja ha pedido pendente ou aceito entre as duas empresas — regra de negocio 2. */
export class ConnectionAlreadyExistsError extends Error {
  constructor() {
    super('Ja existe um pedido de conexao ativo com esta empresa.')
  }
}

/** O pedido/conexao referenciado nao existe. */
export class ConnectionNotFoundError extends Error {}

/**
 * A acao nao pode acontecer agora: quem chamou nao tem o direito, o pedido
 * ja foi respondido/encerrado, ou expirou. A mensagem ja vem pronta para a
 * tela — a funcao SQL escreve exatamente o que aconteceu.
 */
export class ConnectionActionRefusedError extends Error {}

export type ConnectionRequests = {
  /** Lanca `TargetCompanyUnavailableError` ou `ConnectionAlreadyExistsError`. */
  request(
    requesterUserId: UserId,
    requesterCompanyId: CompanyId,
    targetCompanyId: CompanyId,
  ): Promise<NewConnectionRequest>

  /**
   * Lanca `ConnectionNotFoundError` ou `ConnectionActionRefusedError` (quem
   * chamou nao e o destinatario, o pedido ja foi respondido, ou expirou).
   */
  respond(connectionId: string, userId: UserId, accept: boolean): Promise<void>

  /**
   * Cancela (pendente, so quem pediu) ou desfaz (aceita, qualquer um dos dois
   * lados). Mesmos erros de `respond`.
   */
  end(connectionId: string, userId: UserId): Promise<void>

  /** Todas as conexoes do usuario, dos dois lados — RF-05. */
  list(userId: UserId): Promise<readonly ConnectionRow[]>

  /** Pedidos recebidos e pendentes — alimenta o sino do painel. */
  pendingCount(userId: UserId): Promise<number>
}

/**
 * Avisa quem recebeu um pedido de conexao — RF-04.
 *
 * Porta separada de `ConnectionRequests`, no mesmo espirito de `InvoiceQueue`:
 * gravar o pedido e avisar por WhatsApp sao dois sistemas (Postgres e fila),
 * e falha em um nao pode ser tratada como falha no outro. Reaproveita a MESMA
 * fila `whatsapp-send` que `charge-overdue` ja usa — nao existe canal de
 * notificacao in-app persistido no projeto (ver ADR-0008).
 */
export type ConnectionNotifier = {
  notifyRequestReceived(
    params: NewConnectionRequest & { requesterCompanyName: string },
  ): Promise<void>
}
