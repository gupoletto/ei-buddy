import { pedir, type Resultado } from './http'

/**
 * Chamados de suporte — NR-080, US-062.
 *
 * Este modulo era inteiro de mentira: `listarChamados()` devolvia uma conversa
 * escrita no codigo, `abrirChamado` esperava 900ms e inventava um protocolo com
 * `Math.random()`, e o badge de "resposta nova" na navegacao contava mensagens
 * de um chamado que nao existia. O lojista abria um chamado, via o numero na
 * confirmacao, e ninguem do outro lado recebia nada.
 *
 * Os nomes em portugues e o formato do modelo ficaram: as telas ja falam essa
 * lingua, e traduzir tudo junto enterraria a revisao da parte que importa.
 * A traducao do que vem da api acontece na BORDA, aqui embaixo.
 */

export type StatusChamado = 'open' | 'waiting' | 'closed'

export type CategoriaChamado = 'financeiro' | 'cadastro' | 'vendas' | 'tecnico' | 'outro'

export const CATEGORIAS: { valor: CategoriaChamado; rotulo: string }[] = [
  { valor: 'financeiro', rotulo: 'Financeiro' },
  { valor: 'cadastro', rotulo: 'Cadastro' },
  { valor: 'vendas', rotulo: 'Vendas' },
  { valor: 'tecnico', rotulo: 'Técnico' },
  { valor: 'outro', rotulo: 'Outro' },
]

export const ROTULO_STATUS: Record<StatusChamado, string> = {
  open: 'Aberto',
  waiting: 'Aguardando',
  closed: 'Encerrado',
}

export type MensagemChamado = {
  id: string
  autor: 'cliente' | 'suporte'
  autorNome: string
  texto: string
  /** Nome do arquivo anexado, quando houver. */
  anexo: string | null
  data: string
}

export type Chamado = {
  id: string
  protocolo: string
  assunto: string
  categoria: CategoriaChamado
  status: StatusChamado
  abertoEm: string
  atualizadoEm: string
  /** Respostas do suporte que o lojista ainda nao viu. */
  naoLidas: number
  mensagens: MensagemChamado[]
}

/* -------------------------------------------------------------------------- */
/* Traducao na borda                                                          */
/* -------------------------------------------------------------------------- */

type TicketDaApi = {
  id: string
  protocol: string
  subject: string
  category: CategoriaChamado
  status: StatusChamado
  createdAt: string
  updatedAt: string
  unread: number
  messages?: {
    id: string
    author: 'cliente' | 'suporte'
    authorName: string
    body: string
    attachment: string | null
    createdAt: string
  }[]
}

const paraChamado = (t: TicketDaApi): Chamado => ({
  id: t.id,
  protocolo: t.protocol,
  assunto: t.subject,
  categoria: t.category,
  status: t.status,
  abertoEm: t.createdAt,
  atualizadoEm: t.updatedAt,
  naoLidas: t.unread,
  mensagens: (t.messages ?? []).map((m) => ({
    id: m.id,
    autor: m.author,
    autorNome: m.authorName,
    texto: m.body,
    anexo: m.attachment,
    data: m.createdAt,
  })),
})

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export type ListaDeChamados = {
  chamados: Chamado[]
  /** Quantos ainda nao foram encerrados. */
  abertos: number
  /** Somatorio das nao lidas — o que acende o sino da barra. */
  naoLidas: number
}

export async function listarChamados(): Promise<Resultado<ListaDeChamados>> {
  const r = await pedir<{ tickets: TicketDaApi[]; open: number; unread: number }>(
    '/api/suporte/chamados',
  )

  return r.ok
    ? {
        ok: true,
        dados: {
          chamados: r.dados.tickets.map(paraChamado),
          abertos: r.dados.open,
          naoLidas: r.dados.unread,
        },
      }
    : r
}

/**
 * Abre o detalhe e MARCA LIDO na mesma ida.
 *
 * `PATCH` e nao `GET`: recarregar a tela nao pode apagar o aviso de resposta
 * nova — quem marca e a acao de abrir, e nao a de olhar. E marcar e devolver
 * juntos evita o badge piscar, apagando depois que a conversa ja apareceu.
 */
export async function abrirDetalhe(chamadoId: string): Promise<Resultado<Chamado>> {
  const r = await pedir<TicketDaApi>(`/api/suporte/chamados/${chamadoId}`, { method: 'PATCH' })
  return r.ok ? { ok: true, dados: paraChamado(r.dados) } : r
}

/* -------------------------------------------------------------------------- */
/* Acoes                                                                      */
/* -------------------------------------------------------------------------- */

export type DadosChamado = {
  assunto: string
  categoria: CategoriaChamado
  descricao: string
  anexo: string | null
}

export async function abrirChamado(dados: DadosChamado): Promise<Resultado<Chamado>> {
  const r = await pedir<TicketDaApi>('/api/suporte/chamados', {
    method: 'POST',
    body: JSON.stringify({
      subject: dados.assunto.trim(),
      category: dados.categoria,
      body: dados.descricao.trim(),
      ...(dados.anexo === null ? {} : { attachment: dados.anexo }),
    }),
  })

  return r.ok ? { ok: true, dados: paraChamado(r.dados) } : r
}

export async function responderChamado(
  chamadoId: string,
  texto: string,
  anexo: string | null,
): Promise<Resultado<Chamado>> {
  const r = await pedir<TicketDaApi>(`/api/suporte/chamados/${chamadoId}/mensagens`, {
    method: 'POST',
    body: JSON.stringify({
      body: texto.trim(),
      ...(anexo === null ? {} : { attachment: anexo }),
    }),
  })

  return r.ok ? { ok: true, dados: paraChamado(r.dados) } : r
}
