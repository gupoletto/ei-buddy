/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — MODULO FINANCEIRO
 * ============================================================================
 *
 *  | Funcao                | Endpoint esperado                | Disparo         |
 *  |-----------------------|----------------------------------|-----------------|
 *  | salvarTitulo          | POST/PUT /financeiro/titulos     | submit do form  |
 *  | salvarPlanoContas     | POST/PUT /financeiro/planos      | submit          |
 *  | salvarCustoFixo       | POST/PUT /financeiro/custos-fixos| submit          |
 *  | gerarContasDeCustosFixos | POST /financeiro/custos-fixos/gerar | botao      |
 *  | exportar              | GET  /financeiro/titulos/export  | botao exportar  |
 *
 * BAIXA E ESTORNO SAIRAM DESTA LISTA — sao reais desde a NR-081, no fim do
 * arquivo. O aviso que morava aqui dizia que a baixa nao podia ser um UPDATE
 * no titulo, e o servidor concorda: cada baixa e uma linha propria, e o estorno
 * e outra linha, negativa, apontando para a primeira. Nunca um DELETE.
 */

import { contasPagar, planoContas, custosFixos, bancos, clientes } from './mock-data'
import { pedir, type Resultado } from './http'
import type { CustoFixo, PlanoContas, StatusTitulo } from './types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* -------------------------------------------------------------------------- */
/* Listas para os campos "(T)"                                                */
/* -------------------------------------------------------------------------- */

/** SUBSTITUIR POR: GET /bancos */
export const NOMES_BANCOS = bancos.map((b) => b.nome)

/** SUBSTITUIR POR: GET /financeiro/planos */
export const NOMES_PLANOS = planoContas.map((p) => p.nome)

/** SUBSTITUIR POR: GET /fornecedores */
export const NOMES_FORNECEDORES = [...new Set(contasPagar.map((c) => c.fornecedor))].sort()

/** SUBSTITUIR POR: GET /clientes */
export const NOMES_CLIENTES = clientes.map((c) => c.nome)

export const TIPOS_RECEBIMENTO = [
  { valor: 'debito', rotulo: 'Cartão de débito' },
  { valor: 'credito', rotulo: 'Cartão de crédito' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'carteira', rotulo: 'Carteira' },
] as const

/* -------------------------------------------------------------------------- */
/* Estado das listas                                                          */
/* -------------------------------------------------------------------------- */

/** SUBSTITUIR POR: GET /financeiro/planos */
export function listarPlanos(): PlanoContas[] {
  return planoContas.map((p) => ({ ...p }))
}

/** SUBSTITUIR POR: GET /financeiro/custos-fixos */
export function listarCustosFixos(): CustoFixo[] {
  return custosFixos.map((c) => ({ ...c }))
}

/* -------------------------------------------------------------------------- */
/* Gravacao de titulos                                                        */
/* -------------------------------------------------------------------------- */

export type DadosTituloPagar = {
  banco: string
  planoContas: string
  fornecedor: string
  vencimento: string
  valor: number
  descricao: string
}

export type DadosTituloReceber = {
  banco: string
  cliente: string
  emissao: string
  vencimento: string
  referente: string
  tipo: string
  valor: number
}

/** SUBSTITUIR POR: POST /financeiro/titulos */
export async function salvarTitulo(
  dados: DadosTituloPagar | DadosTituloReceber,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await delay(800)
  void dados
  return { ok: true, id: `tit-${Date.now()}` }
}

/* -------------------------------------------------------------------------- */
/* Plano de contas e custos fixos                                             */
/* -------------------------------------------------------------------------- */

/** SUBSTITUIR POR: POST/PUT /financeiro/planos */
export async function salvarPlanoContas(
  nome: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await delay(600)
  if (!nome.trim()) return { ok: false, error: 'Informe o nome do plano de conta.' }
  return { ok: true, id: `pc-${Date.now()}` }
}

export type DadosCustoFixo = {
  id?: string
  nome: string
  diaVencimento: number
  valor: number
  planoContasNome: string
  bancoNome: string
}

/** SUBSTITUIR POR: POST/PUT /financeiro/custos-fixos */
export async function salvarCustoFixo(
  dados: DadosCustoFixo,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await delay(700)

  if (!dados.nome.trim()) return { ok: false, error: 'Informe o nome do custo fixo.' }
  if (dados.diaVencimento < 1 || dados.diaVencimento > 31) {
    return { ok: false, error: 'O dia do vencimento deve estar entre 1 e 31.' }
  }
  if (dados.valor <= 0) return { ok: false, error: 'Informe um valor maior que zero.' }

  return { ok: true, id: dados.id ?? `cf-${Date.now()}` }
}

/** SUBSTITUIR POR: DELETE /financeiro/custos-fixos/:id */
export async function excluirCustoFixo(id: string): Promise<{ ok: true }> {
  await delay(500)
  void id
  return { ok: true }
}

/**
 * SUBSTITUIR POR: POST /financeiro/custos-fixos/gerar
 *
 * Gera as contas a pagar do mes a partir dos custos fixos. O servidor
 * precisa ser idempotente por (custo fixo, competencia): rodar duas vezes
 * no mesmo mes nao pode duplicar a conta.
 */
export async function gerarContasDeCustosFixos(
  custos: CustoFixo[],
  competencia: string,
): Promise<{ ok: true; geradas: number; jaExistiam: number }> {
  await delay(1100)
  void competencia

  /* No exemplo, os que ja tem conta lancada no mes ficam de fora. */
  const jaLancados = new Set(contasPagar.map((c) => c.fornecedor.toLowerCase()))
  const geradas = custos.filter((c) => !jaLancados.has(c.nome.toLowerCase())).length

  return { ok: true, geradas, jaExistiam: custos.length - geradas }
}

/* -------------------------------------------------------------------------- */
/* Exportacao (previsto, ainda nao implementado)                              */
/* -------------------------------------------------------------------------- */

export type FormatoExportacao = 'csv' | 'pdf'

/**
 * SUBSTITUIR POR: GET /financeiro/titulos/export?formato=
 *
 * A estrutura ja existe para que a exportacao entre sem mexer nas telas: o
 * botao chama esta funcao e o servidor devolve o arquivo pronto. Gerar CSV
 * no cliente daria pressa, mas PDF nao — e ter dois caminhos diferentes
 * para a mesma acao acaba divergindo.
 */
export async function exportar(formato: FormatoExportacao): Promise<{ ok: false; error: string }> {
  await delay(400)
  return {
    ok: false,
    error: `Exportação em ${formato.toUpperCase()} entra quando o backend expuser o endpoint.`,
  }
}

/* -------------------------------------------------------------------------- */
/* Utilitarios de status                                                      */
/* -------------------------------------------------------------------------- */

/** Dias a partir dos quais o titulo entra em "a vencer em breve". */
export const DIAS_A_VENCER = 5

export type SituacaoVisual = 'aberto' | 'aVencer' | 'vencido' | 'quitado' | 'parcial'

/**
 * Situacao para efeito de cor, combinando status e proximidade do
 * vencimento — e o que a listagem usa para pintar o badge.
 */
export function situacaoDoTitulo(
  status: StatusTitulo,
  vencimento: string,
  diasAte: number,
): SituacaoVisual {
  if (status === 'pago') return 'quitado'
  if (status === 'vencido' || diasAte < 0) return 'vencido'
  if (status === 'parcial') return 'parcial'
  if (diasAte <= DIAS_A_VENCER) return 'aVencer'
  return 'aberto'
}

export const ROTULO_SITUACAO: Record<SituacaoVisual, string> = {
  aberto: 'Em aberto',
  aVencer: 'A vencer',
  vencido: 'Vencido',
  quitado: 'Quitado',
  parcial: 'Baixa parcial',
}

/* -------------------------------------------------------------------------- */
/* Contas a pagar contra a api — NR-074                                       */
/* -------------------------------------------------------------------------- */

/** Onde a conta cai em relacao a hoje — RF-061. */
export type FaixaDeVencimento = 'overdue' | 'today' | 'week' | 'month' | 'later'

export const ROTULO_FAIXA: Record<FaixaDeVencimento, string> = {
  overdue: 'Vencidas',
  today: 'Vencem hoje',
  week: 'Próximos 7 dias',
  month: 'Este mês',
  later: 'Mais adiante',
}

export type ContaAPagar = {
  id: string
  supplier: string
  description: string
  amountCents: number
  settledAmountCents: number
  dueDate: string
  status: 'open' | 'partially_settled' | 'settled' | 'cancelled'
  /** Classificacao contabil. Nulo enquanto ninguem classificou. */
  accountId: string | null
  recurrenceId: string | null
  occurrenceNumber: number | null
  occurrenceCount: number | null
}

export type GrupoDeVencimento = {
  faixa: FaixaDeVencimento
  payables: ContaAPagar[]
  /** Soma do que AINDA falta pagar, nao do valor original. */
  totalCents: number
}

export type ContasAPagarAgrupadas = {
  grupos: GrupoDeVencimento[]
  totalCents: number
  /** RF-062: o destaque na abertura do sistema. */
  temVencidas: boolean
}

/**
 * O mesmo `Resultado` de `lib/http`, sob o nome que as telas de contas ja
 * usam. Alias e nao copia: um segundo tipo com a mesma forma passaria a
 * divergir na primeira vez que um deles ganhasse um campo.
 */
export type ResultadoContas<T> = Resultado<T>

/**
 * A lista agrupada — RF-061, RF-062.
 *
 * O agrupamento e o TOTAL vem do servidor. A tela nao soma nada: somar aqui
 * daria um numero que pode divergir do que o relatorio mostra, e "quanto
 * preciso ter em caixa esta semana" nao pode ter duas respostas.
 */
export const carregarContasAPagar = (): Promise<ResultadoContas<ContasAPagarAgrupadas>> =>
  pedir<ContasAPagarAgrupadas>('/api/contas-a-pagar')

/** Lancar — RF-055, RF-057. Devolve quantas ocorrencias entraram. */
export const lancarContaAPagar = (entrada: {
  supplier: string
  description: string
  amountCents: number
  dueDate: string
  accountId?: string
  recurrence?: { frequency: 'weekly' | 'monthly'; occurrences: number }
}): Promise<ResultadoContas<{ payables: ContaAPagar[]; count: number }>> =>
  pedir('/api/contas-a-pagar', { method: 'POST', body: JSON.stringify(entrada) })

/* -------------------------------------------------------------------------- */
/* Contas a receber contra a api — NR-081                                     */
/* -------------------------------------------------------------------------- */

/**
 * O recebivel como a api o descreve.
 *
 * Esta lista era MOCK ate agora, ao lado de uma lista de contas a pagar real —
 * duas telas irmas, uma com dado do banco e outra com dado inventado, e nada na
 * interface dizendo qual era qual. A rota `GET /contas-a-receber` existe desde
 * a NR-074; faltava o cliente.
 */
export type ContaAReceber = {
  id: string
  saleId: string | null
  customerId: string | null
  /** Nulo quando a venda saiu sem identificar o cliente — o balcao permite. */
  customerName: string | null
  description: string
  amountCents: number
  /** Liquido previsto, ja sem a tarifa da adquirente — RF-063. */
  netAmountCents: number
  settledAmountCents: number
  dueDate: string
  installmentNumber: number
  installmentCount: number
  status: 'open' | 'partially_settled' | 'settled' | 'cancelled'
}

export type GrupoDeRecebimento = {
  faixa: FaixaDeVencimento
  receivables: ContaAReceber[]
  totalCents: number
}

export type ContasAReceberAgrupadas = {
  grupos: GrupoDeRecebimento[]
  totalCents: number
  temVencidas: boolean
}

export const carregarContasAReceber = (): Promise<ResultadoContas<ContasAReceberAgrupadas>> =>
  pedir<ContasAReceberAgrupadas>('/api/contas-a-receber')

/* -------------------------------------------------------------------------- */
/* Baixa e estorno contra a api — NR-081, RF-059, RF-066, RF-067              */
/* -------------------------------------------------------------------------- */

export type TipoDeTitulo = 'pagar' | 'receber'

/**
 * Uma linha do historico de baixas.
 *
 * `amountCents` NEGATIVO e estorno, e nao um erro de sinal: o estorno nao apaga
 * a baixa, grava a linha oposta. A propriedade que isso preserva e util na
 * tela — somar as linhas da o saldo baixado, sempre.
 */
export type Baixa = {
  id: string
  payableId: string | null
  receivableId: string | null
  amountCents: number
  method: string | null
  bankAccount: string | null
  settledOn: string
  notes: string | null
  /** Preenchido na linha de estorno, apontando a baixa desfeita. */
  reversesId: string | null
  createdBy: string | null
  createdAt: string
}

const caminhoDoTitulo = (tipo: TipoDeTitulo, id: string) =>
  `/api/contas-a-${tipo}/${encodeURIComponent(id)}/baixas`

/**
 * O historico de baixas de um titulo — RF-067.
 *
 * A tela precisa dele para estornar: o estorno endereca a BAIXA, e a lista de
 * titulos nao traz os ids delas. Antes disto o botao "Estornar" chamava uma
 * funcao falsa que respondia `ok` sem nada acontecer no banco.
 */
export const carregarBaixas = (
  tipo: TipoDeTitulo,
  tituloId: string,
): Promise<ResultadoContas<Baixa[]>> => pedir<Baixa[]>(caminhoDoTitulo(tipo, tituloId))

/** Como o dinheiro ENTROU. Nao e a forma da venda — e a do recebimento. */
export type FormaDeRecebimento = 'cash' | 'pix' | 'debit' | 'credit' | 'wallet'

/**
 * As cinco do `paymentMethodSchema`, na ordem em que o balcao usa.
 *
 * Sem "outro": o contrato nao tem esse valor, e inventa-lo aqui daria um 400
 * na hora de confirmar, depois de a pessoa ja ter escolhido.
 */
export const FORMAS_DE_RECEBIMENTO: readonly { valor: FormaDeRecebimento; rotulo: string }[] = [
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cash', rotulo: 'Dinheiro' },
  { valor: 'debit', rotulo: 'Cartão de débito' },
  { valor: 'credit', rotulo: 'Cartão de crédito' },
  { valor: 'wallet', rotulo: 'Carteira digital' },
]

export type DadosDaBaixa = {
  /** Em CENTAVOS. A tela mostra reais; a fronteira converte uma vez so. */
  amountCents: number
  settledOn: string
  /** So em conta a pagar: de qual conta o dinheiro saiu. */
  bankAccount?: string
  /** So em recebivel: como o dinheiro entrou. */
  method?: FormaDeRecebimento
  notes?: string
}

/**
 * Baixa, total ou parcial — RF-059, RF-066.
 *
 * Uma funcao para os dois tipos porque a ROTA e simetrica; o que difere e o
 * corpo, e quem monta o corpo e a tela, que sabe qual titulo esta baixando.
 */
export const baixarTitulo = (
  tipo: TipoDeTitulo,
  tituloId: string,
  dados: DadosDaBaixa,
): Promise<ResultadoContas<Baixa>> =>
  pedir<Baixa>(caminhoDoTitulo(tipo, tituloId), {
    method: 'POST',
    body: JSON.stringify(dados),
  })

/**
 * Estorno — RF-067.
 *
 * Recebe o id da BAIXA, e nao o do titulo, e nao diz se ele e a pagar ou a
 * receber: o servidor procura nas duas tabelas. `motivo` e obrigatorio la, e
 * com razao — um estorno sem motivo e um numero que mudou sem explicacao, e a
 * pergunta "por que esse saldo mudou" e exatamente a que traz alguem ao
 * historico.
 */
export const estornarBaixa = (baixaId: string, motivo: string): Promise<ResultadoContas<Baixa>> =>
  pedir<Baixa>(`/api/baixas/${encodeURIComponent(baixaId)}/estorno`, {
    method: 'POST',
    body: JSON.stringify({ reason: motivo }),
  })
