/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — CRM
 * ============================================================================
 *
 *  | Funcao            | Endpoint esperado           | Disparo              |
 *  |-------------------|-----------------------------|----------------------|
 *  | listarCards       | GET  /crm/cards             | abertura da tela     |
 *  | criarCard         | POST /crm/cards             | novo lancamento      |
 *  | moverCard         | PATCH /crm/cards/:id        | arrastar / mover     |
 *  | comentarCard      | POST /crm/cards/:id/comentarios | comentario       |
 *  | concluirCard      | PATCH /crm/cards/:id        | marcar como concluido|
 *
 * ORIGEM DOS CARDS: o CRM nao e uma ilha. Pendencia e contato lancados na
 * tela de Clientes entram aqui como card na primeira coluna — por isso o
 * card guarda `origem`, para a tela mostrar de onde veio e o backend saber
 * o que sincronizar de volta.
 *
 * RESPONSAVEIS: o campo e uma LISTA desde ja, mesmo com um unico usuario
 * hoje. Conta compartilhada esta no roadmap, e migrar de campo unico para
 * lista depois exigiria mexer em dado gravado.
 */

import { contatosDoCliente, pendenciasDoCliente } from './clientes-api'
import { clientes } from './mock-data'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* -------------------------------------------------------------------------- */
/* Modelo                                                                     */
/* -------------------------------------------------------------------------- */

export type ColunaId = 'afazer' | 'andamento' | 'concluido'

export const COLUNAS: { id: ColunaId; titulo: string; descricao: string }[] = [
  { id: 'afazer', titulo: 'A fazer', descricao: 'Entrou e ainda não foi tratado' },
  { id: 'andamento', titulo: 'Em andamento', descricao: 'Alguém está cuidando' },
  { id: 'concluido', titulo: 'Concluído', descricao: 'Resolvido' },
]

export type TipoCard = 'pendencia' | 'contato'
export type OrigemCard = 'clientes' | 'financeiro' | 'crm'

export type Comentario = {
  id: string
  autor: string
  data: string
  texto: string
}

export type CardCrm = {
  id: string
  titulo: string
  descricao: string
  tipo: TipoCard
  coluna: ColunaId
  clienteId: string | null
  clienteNome: string
  data: string
  /** Lista desde ja — ver nota sobre conta compartilhada no topo. */
  responsaveis: string[]
  origem: OrigemCard
  comentarios: Comentario[]
}

export const ROTULO_ORIGEM: Record<OrigemCard, string> = {
  clientes: 'Lançado em Clientes',
  financeiro: 'Veio do Financeiro',
  crm: 'Criado no CRM',
}

/* -------------------------------------------------------------------------- */
/* Carga inicial                                                              */
/* -------------------------------------------------------------------------- */

/**
 * SUBSTITUIR POR: GET /crm/cards
 *
 * Enquanto nao ha backend, o quadro e montado a partir do que ja existe:
 * contatos e pendencias dos clientes viram cards, mais alguns lancados
 * direto no CRM. E assim que a integracao vai funcionar de verdade.
 */
export function listarCards(): CardCrm[] {
  const cards: CardCrm[] = []

  /* Contatos lancados na tela de Clientes */
  for (const cliente of clientes) {
    for (const contato of contatosDoCliente(cliente.id)) {
      cards.push({
        id: `crm-ct-${contato.id}`,
        titulo: contato.descricao,
        descricao: `Contato por ${contato.tipo}`,
        tipo: 'contato',
        /* Contato registrado ja aconteceu — entra como concluido. */
        coluna: 'concluido',
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        data: contato.data,
        responsaveis: ['Marina Alves'],
        origem: 'clientes',
        comentarios: [],
      })
    }

    /* Pendencia financeira em aberto vira card de acompanhamento */
    for (const pendencia of pendenciasDoCliente(cliente.id)) {
      if (pendencia.status === 'vencido') {
        cards.push({
          id: `crm-pd-${pendencia.id}`,
          titulo: `Cobrar ${pendencia.referente}`,
          descricao: `Título vencido de ${cliente.nome}`,
          tipo: 'pendencia',
          coluna: 'afazer',
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          data: pendencia.vencimento,
          responsaveis: [],
          origem: 'financeiro',
          comentarios: [],
        })
      }
    }
  }

  /* Lancamentos feitos direto no CRM */
  cards.push(
    {
      id: 'crm-1',
      titulo: 'Retomar contato com quem sumiu',
      descricao: 'Clientes sem comprar há mais de 60 dias — mandar catálogo.',
      tipo: 'contato',
      coluna: 'andamento',
      clienteId: 'cli-5',
      clienteNome: 'Carla Menezes',
      data: '2026-08-22',
      responsaveis: ['Marina Alves'],
      origem: 'crm',
      comentarios: [
        {
          id: 'cm-1',
          autor: 'Marina Alves',
          data: '2026-08-22',
          texto: 'Mandei o catálogo de agosto. Aguardando resposta.',
        },
      ],
    },
    {
      id: 'crm-2',
      titulo: 'Negociar prazo com Padaria Sol',
      descricao: 'Pedido grande para setembro, cliente pediu 45 dias.',
      tipo: 'pendencia',
      coluna: 'andamento',
      clienteId: 'cli-2',
      clienteNome: 'Padaria Sol LTDA',
      data: '2026-08-23',
      responsaveis: ['Marina Alves'],
      origem: 'crm',
      comentarios: [],
    },
    {
      id: 'crm-3',
      titulo: 'Levar amostra de azeite',
      descricao: 'Restaurante demonstrou interesse na linha importada.',
      tipo: 'contato',
      coluna: 'afazer',
      clienteId: 'cli-4',
      clienteNome: 'Restaurante Boa Mesa',
      data: '2026-08-26',
      responsaveis: [],
      origem: 'crm',
      comentarios: [],
    },
  )

  return cards
}

/** Pessoas que podem ser responsaveis. SUBSTITUIR POR: GET /equipe */
export const RESPONSAVEIS = ['Marina Alves', 'Joao Pedro', 'Equipe de vendas']

/* -------------------------------------------------------------------------- */
/* Acoes                                                                      */
/* -------------------------------------------------------------------------- */

export type DadosCard = {
  titulo: string
  descricao: string
  tipo: TipoCard
  clienteNome: string
  data: string
  responsaveis: string[]
}

/** SUBSTITUIR POR: POST /crm/cards */
export async function criarCard(
  dados: DadosCard,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await delay(700)

  if (!dados.titulo.trim()) return { ok: false, error: 'Informe o título.' }
  if (!dados.clienteNome.trim()) return { ok: false, error: 'Escolha o cliente.' }

  return { ok: true, id: `crm-${Date.now()}` }
}

/** SUBSTITUIR POR: PATCH /crm/cards/:id { coluna } */
export async function moverCard(id: string, coluna: ColunaId): Promise<{ ok: true }> {
  await delay(300)
  void id
  void coluna
  return { ok: true }
}

/** SUBSTITUIR POR: POST /crm/cards/:id/comentarios */
export async function comentarCard(
  id: string,
  texto: string,
): Promise<{ ok: true; comentario: Comentario } | { ok: false; error: string }> {
  await delay(500)
  void id

  if (!texto.trim()) return { ok: false, error: 'Escreva o comentário.' }

  return {
    ok: true,
    comentario: {
      id: `cm-${Date.now()}`,
      autor: 'Marina Alves',
      data: '2026-08-24',
      texto: texto.trim(),
    },
  }
}
