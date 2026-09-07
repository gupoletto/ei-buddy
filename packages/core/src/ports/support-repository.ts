import type { TicketCategory, TicketDetail, TicketSummary } from '@na-regua/contracts'
import type { CompanyId, UserId } from '../context.js'

/**
 * Porta do suporte — NR-080, US-062.
 *
 * ## As nao lidas sao CONTADAS, nunca guardadas
 *
 * Nenhum metodo daqui incrementa ou zera contador. O que se grava e
 * `last_read_at`, e "nao lidas" e a contagem de mensagens do suporte depois
 * dessa data.
 *
 * A diferenca importa porque o chamado tem DOIS escritores: a equipe de suporte
 * responde por um painel proprio, fora do app. Um contador seria incrementado
 * por um lado e zerado pelo outro, em concorrencia — e passaria a divergir sem
 * que ninguem conseguisse dizer qual dos dois errou. O carimbo tem um dono so.
 */

export type NewTicket = {
  readonly companyId: CompanyId
  readonly subject: string
  readonly category: TicketCategory
  /** A primeira mensagem. Chamado sem corpo e chamado que ninguem consegue ler. */
  readonly body: string
  readonly attachment: string | null
  readonly authorName: string
  readonly createdBy: UserId
  readonly createdAt: Date
}

export type NewTicketMessage = {
  readonly companyId: CompanyId
  readonly ticketId: string
  readonly body: string
  readonly attachment: string | null
  readonly authorName: string
  readonly createdAt: Date
}

export type SupportRepository = {
  /** A lista da tela, do mais recente para tras, ja com as nao lidas contadas. */
  list(companyId: CompanyId): Promise<readonly TicketSummary[]>

  /** `undefined` quando nao existe OU e de outra empresa — nunca um erro. */
  findById(companyId: CompanyId, ticketId: string): Promise<TicketDetail | undefined>

  /**
   * Abre o chamado e grava a primeira mensagem na MESMA transacao.
   *
   * Chamado sem mensagem seria um assunto sem conteudo: a equipe abriria o
   * detalhe e nao teria o que ler. As duas coisas entram juntas ou nao entram.
   */
  open(chamado: NewTicket): Promise<TicketDetail>

  /**
   * Grava a resposta do LOJISTA e reabre o chamado.
   *
   * Reabre porque responder e dizer "isto nao terminou". Um chamado que
   * continua `respondido` depois de o cliente escrever some da fila da equipe.
   */
  reply(mensagem: NewTicketMessage): Promise<TicketDetail | undefined>

  /** Marca lido ate agora. Idempotente: marcar duas vezes nao muda nada. */
  markRead(companyId: CompanyId, ticketId: string, at: Date): Promise<void>
}
