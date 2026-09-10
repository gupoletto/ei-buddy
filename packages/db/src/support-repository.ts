import type { TicketDetail, TicketMessage, TicketSummary } from '@na-regua/contracts'
import type { NewTicket, NewTicketMessage, SupportRepository } from '@na-regua/core'
import type { Sql, TransactionSql } from 'postgres'
import { withTenant } from './tenant.js'

/**
 * Chamados de suporte no banco — NR-080, US-062.
 *
 * ## As nao lidas sao uma CONTAGEM, e nao uma coluna
 *
 * `unread` sai de um `count(*) FILTER` sobre as mensagens do suporte posteriores
 * a `last_read_at`. Nao ha contador para incrementar nem para zerar.
 *
 * O chamado tem dois escritores — a equipe responde por um painel proprio, fora
 * do app — e um contador seria incrementado por um lado e zerado pelo outro, em
 * concorrencia. Ele passaria a divergir sem que ninguem conseguisse dizer qual
 * dos dois errou, e "3 respostas novas" numa conversa com duas e o tipo de erro
 * que so aparece quando ja nao da para reconstruir.
 *
 * Contagem derivada nao diverge, porque nao e guardada.
 */

const numero = (v: unknown): number => Number(v)

type LinhaChamado = {
  id: string
  protocol: string
  subject: string
  category: string
  status: string
  created_at: Date
  updated_at: Date
  unread: string
}

type LinhaMensagem = {
  id: string
  author: string
  author_name: string
  body: string
  attachment: string | null
  created_at: Date
}

const paraResumo = (l: LinhaChamado): TicketSummary => ({
  id: l.id,
  protocol: l.protocol,
  subject: l.subject,
  category: l.category as TicketSummary['category'],
  status: l.status as TicketSummary['status'],
  createdAt: l.created_at.toISOString(),
  updatedAt: l.updated_at.toISOString(),
  unread: numero(l.unread),
})

const paraMensagem = (l: LinhaMensagem): TicketMessage => ({
  id: l.id,
  author: l.author as TicketMessage['author'],
  authorName: l.author_name,
  body: l.body,
  attachment: l.attachment,
  createdAt: l.created_at.toISOString(),
})

/**
 * A contagem de nao lidas, em SQL, num lugar so.
 *
 * `last_read_at IS NULL` conta tudo: nunca abriu o detalhe, entao toda resposta
 * e nova. Repetir esta expressao na lista e no detalhe abriria espaco para as
 * duas discordarem — e o badge some numa tela e continua na outra.
 */
const NAO_LIDAS = (tx: Sql | TransactionSql) => tx`
  (SELECT count(*) FROM ticket_messages m
    WHERE m.ticket_id = t.id
      AND m.author = 'suporte'
      AND (t.last_read_at IS NULL OR m.created_at > t.last_read_at))
`

async function mensagensDe(
  tx: Sql | TransactionSql,
  ticketId: string,
): Promise<readonly TicketMessage[]> {
  const linhas = await tx<LinhaMensagem[]>`
    SELECT id, author, author_name, body, attachment, created_at
    FROM ticket_messages
    WHERE ticket_id = ${ticketId}
    ORDER BY created_at, id
  `
  return linhas.map(paraMensagem)
}

async function detalhe(
  tx: Sql | TransactionSql,
  ticketId: string,
): Promise<TicketDetail | undefined> {
  const [linha] = await tx<LinhaChamado[]>`
    SELECT t.id, t.protocol, t.subject, t.category, t.status, t.created_at, t.updated_at,
           ${NAO_LIDAS(tx)} AS unread
    FROM support_tickets t
    WHERE t.id = ${ticketId}
  `

  if (linha === undefined) return undefined

  return { ...paraResumo(linha), messages: [...(await mensagensDe(tx, ticketId))] }
}

export function createSupportRepository(sql: Sql): SupportRepository {
  return {
    list: async (companyId) => {
      const linhas = await withTenant(
        sql,
        companyId,
        (tx) => tx<LinhaChamado[]>`
          SELECT t.id, t.protocol, t.subject, t.category, t.status, t.created_at, t.updated_at,
                 ${NAO_LIDAS(tx)} AS unread
          FROM support_tickets t
          ORDER BY t.updated_at DESC, t.id
        `,
      )
      return linhas.map(paraResumo)
    },

    findById: async (companyId, ticketId) =>
      withTenant(sql, companyId, (tx) => detalhe(tx, ticketId)),

    /**
     * Chamado e primeira mensagem na MESMA transacao.
     *
     * Chamado sem mensagem seria um assunto sem conteudo: a equipe abriria o
     * detalhe e nao teria o que ler, e o lojista veria o protocolo achando que
     * contou o problema.
     *
     * O protocolo vem da sequencia no formato `AAAA-NNNN`. O ano sai do
     * carimbo do chamado, e nao de `now()`: o resto da linha usa `createdAt` do
     * contexto, e misturar os dois faria um chamado aberto as 23h59 de 31 de
     * dezembro receber protocolo do ano seguinte.
     */
    open: async (chamado: NewTicket) =>
      withTenant(sql, chamado.companyId, async (tx) => {
        const [proximo] = await tx<{ n: string }[]>`
          SELECT nextval('support_ticket_protocol_seq')::text AS n
        `
        const protocolo = `${chamado.createdAt.getFullYear()}-${String(proximo!.n).padStart(4, '0')}`

        const [criado] = await tx<{ id: string }[]>`
          INSERT INTO support_tickets
            (company_id, protocol, subject, category, created_by, created_at, updated_at)
          VALUES (${chamado.companyId}, ${protocolo}, ${chamado.subject}, ${chamado.category},
                  ${chamado.createdBy}, ${chamado.createdAt}, ${chamado.createdAt})
          RETURNING id
        `

        await tx`
          INSERT INTO ticket_messages
            (company_id, ticket_id, author, author_name, body, attachment, created_at)
          VALUES (${chamado.companyId}, ${criado!.id}, 'cliente', ${chamado.authorName},
                  ${chamado.body}, ${chamado.attachment}, ${chamado.createdAt})
        `

        const d = await detalhe(tx, criado!.id)
        if (d === undefined) throw new Error('O chamado nao foi gravado.')
        return d
      }),

    /**
     * A resposta do lojista REABRE o chamado.
     *
     * Um chamado que continua `respondido` depois de o cliente escrever some da
     * fila da equipe: para eles, "respondido" quer dizer "ja tratei". Voltar
     * para `andamento` e o que faz a mensagem chegar a alguem.
     *
     * `encerrado` tambem reabre: o lojista que escreve num chamado fechado esta
     * dizendo que o problema voltou, e obriga-lo a abrir outro perderia o
     * historico que explica o caso.
     */
    reply: async (mensagem: NewTicketMessage) =>
      withTenant(sql, mensagem.companyId, async (tx) => {
        const [existe] = await tx<{ id: string }[]>`
          SELECT id FROM support_tickets WHERE id = ${mensagem.ticketId}
        `
        if (existe === undefined) return undefined

        await tx`
          INSERT INTO ticket_messages
            (company_id, ticket_id, author, author_name, body, attachment, created_at)
          VALUES (${mensagem.companyId}, ${mensagem.ticketId}, 'cliente', ${mensagem.authorName},
                  ${mensagem.body}, ${mensagem.attachment}, ${mensagem.createdAt})
        `

        await tx`
          UPDATE support_tickets
             SET status = 'waiting', updated_at = ${mensagem.createdAt}
           WHERE id = ${mensagem.ticketId}
        `

        return detalhe(tx, mensagem.ticketId)
      }),

    /**
     * Marca lido ate `at`.
     *
     * `GREATEST` para nao ANDAR PARA TRAS: duas abas abertas, a segunda
     * carregada antes, e um `SET last_read_at = at` cru faria o badge
     * ressuscitar mensagens que a pessoa ja tinha visto. Marcar lido e
     * monotonico por natureza.
     *
     * `updated_at` NAO muda: ler nao e atividade no chamado, e mexer nele
     * jogaria o chamado para o topo da lista toda vez que alguem abrisse.
     */
    markRead: async (companyId, ticketId, at) => {
      await withTenant(
        sql,
        companyId,
        (tx) => tx`
          UPDATE support_tickets
             SET last_read_at = GREATEST(COALESCE(last_read_at, ${at}), ${at})
           WHERE id = ${ticketId}
        `,
      )
    },
  }
}
