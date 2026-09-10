import { chamarApi, type Resposta } from './api'

/**
 * Chamados de suporte — NR-082, US-062.
 *
 * A tela do celular era inteira de mentira: dois chamados escritos no codigo,
 * `abrirChamado` esperando 800ms e empilhando um objeto no `useState`. O lojista
 * descrevia o problema, lia "O time responde por aqui e por e-mail", e ninguem
 * do outro lado recebia nada — o chamado morria quando o app fechava.
 *
 * As rotas existem desde a NR-080, com banco e painel do suporte do outro lado.
 * Faltava o cliente.
 *
 * Os nomes em portugues seguem o web (`suporte-api.ts` de lá): a traducao do que
 * vem da api acontece na BORDA, aqui embaixo, e as telas falam uma lingua so.
 */

export type StatusChamado = 'open' | 'waiting' | 'closed'

export type CategoriaChamado = 'financeiro' | 'cadastro' | 'vendas' | 'tecnico' | 'outro'

/**
 * As categorias do contrato, com o rotulo da tela.
 *
 * A tela mostrava `['Financeiro', 'Cadastro', 'Vendas', 'Tecnico', 'Outro']` e
 * mandava a STRING com maiuscula. Contra a api de verdade isso seria 400 em
 * toda abertura de chamado: o `ticketCategorySchema` e um enum em minusculas.
 */
export const CATEGORIAS: readonly { valor: CategoriaChamado; rotulo: string }[] = [
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

/** Os minimos do contrato, para a tela recusar ANTES de ir na rede. */
export const MINIMO_ASSUNTO = 5
export const MINIMO_DESCRICAO = 10

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
  /**
   * Vazio na LISTA, e preenchido no detalhe.
   *
   * A lista devolve `ticketSummary`, sem mensagens — de proposito: uma lista que
   * carrega toda conversa de todo chamado cresce sem limite. Quem quer a
   * conversa abre o chamado, e e o `abrirDetalhe` que a traz.
   */
  mensagens: MensagemChamado[]
}

/* -------------------------------------------------------------------------- */
/* Traducao na borda                                                          */
/* -------------------------------------------------------------------------- */

type MensagemDaApi = {
  id: string
  author: 'cliente' | 'suporte'
  authorName: string
  body: string
  attachment: string | null
  createdAt: string
}

type ChamadoDaApi = {
  id: string
  protocol: string
  subject: string
  category: CategoriaChamado
  status: StatusChamado
  createdAt: string
  updatedAt: string
  unread: number
  messages?: MensagemDaApi[]
}

const paraChamado = (t: ChamadoDaApi): Chamado => ({
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
  /** Quantos ainda nao foram encerrados — o numero do topo da tela. */
  abertos: number
  /** Somatorio das nao lidas. */
  naoLidas: number
}

export async function listarChamados(): Promise<Resposta<ListaDeChamados>> {
  const r = await chamarApi<{ tickets: ChamadoDaApi[]; open: number; unread: number }>(
    '/suporte/chamados',
  )

  if (!r.ok) return r

  return {
    ok: true,
    dados: {
      chamados: r.dados.tickets.map(paraChamado),
      abertos: r.dados.open,
      naoLidas: r.dados.unread,
    },
  }
}

/**
 * Abre o chamado e MARCA LIDO na mesma ida.
 *
 * `PATCH` e nao `GET`: quem marca lido e a acao de ABRIR, e nao a de olhar —
 * recarregar a lista nao pode apagar o aviso de resposta nova. E marcar e
 * devolver juntos evita o contador piscar, apagando depois que a conversa ja
 * apareceu na tela.
 *
 * A rota `GET /suporte/chamados/:id` existe para quem quer ler sem marcar; o
 * celular nao usa, porque aqui abrir a sanfona E ler.
 */
export async function abrirDetalhe(chamadoId: string): Promise<Resposta<Chamado>> {
  const r = await chamarApi<ChamadoDaApi>(`/suporte/chamados/${encodeURIComponent(chamadoId)}`, {
    method: 'PATCH',
  })

  return r.ok ? { ok: true, dados: paraChamado(r.dados) } : r
}

/* -------------------------------------------------------------------------- */
/* Acoes                                                                      */
/* -------------------------------------------------------------------------- */

export type DadosChamado = {
  assunto: string
  categoria: CategoriaChamado
  descricao: string
}

/**
 * Abre o chamado — US-062.
 *
 * Sem `attachment`, que o contrato aceita: mandar anexo exige seletor de
 * arquivo e um lugar para o arquivo ficar, e o campo do contrato guarda apenas
 * o NOME. Enviar um nome sem o arquivo faria o suporte procurar um anexo que
 * nao existe — pior que nao oferecer.
 */
export async function abrirChamado(dados: DadosChamado): Promise<Resposta<Chamado>> {
  const r = await chamarApi<ChamadoDaApi>('/suporte/chamados', {
    method: 'POST',
    body: {
      subject: dados.assunto.trim(),
      category: dados.categoria,
      body: dados.descricao.trim(),
    },
  })

  return r.ok ? { ok: true, dados: paraChamado(r.dados) } : r
}

/** Responde um chamado aberto. Devolve a conversa inteira, ja com a resposta. */
export async function responderChamado(
  chamadoId: string,
  texto: string,
): Promise<Resposta<Chamado>> {
  const r = await chamarApi<ChamadoDaApi>(
    `/suporte/chamados/${encodeURIComponent(chamadoId)}/mensagens`,
    { method: 'POST', body: { body: texto.trim() } },
  )

  return r.ok ? { ok: true, dados: paraChamado(r.dados) } : r
}
