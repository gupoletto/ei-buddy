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
 * SOBRE BAIXA E ESTORNO: no backend isto NAO pode ser um UPDATE no titulo.
 * Cada baixa precisa ser um lancamento proprio, com valor, data e autor, e
 * o estorno precisa ser outro lancamento que anula o primeiro — nunca um
 * DELETE. Sem esse historico nao ha como auditar por que um saldo mudou,
 * e conciliacao bancaria sem auditoria e chute.
 */

import { chamarApi, type Resposta } from './api'
import { contasPagar, contasReceber, planoContas, custosFixos, bancos, clientes } from './mock-data'
import type { ContaPagar, ContaReceber, CustoFixo, PlanoContas, StatusTitulo } from './types'

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
  { valor: 'debito', rotulo: 'Cartao de debito' },
  { valor: 'credito', rotulo: 'Cartao de credito' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'carteira', rotulo: 'Carteira' },
] as const

/* -------------------------------------------------------------------------- */
/* Estado das listas                                                          */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* As listas, de verdade — RF-061, RF-064, RF-066                             */
/* -------------------------------------------------------------------------- */

/**
 * Uma conta, a pagar ou a receber.
 *
 * Forma comum de proposito: as duas telas sao a mesma estrutura com a
 * contraparte trocada, e formas diferentes fariam o total significar uma coisa
 * numa e outra na outra.
 *
 * Valores em REAIS. A api fala em centavos inteiros (RNF-044) e a conversao
 * acontece aqui, na borda — deixar centavos subir faria cada tela dividir por
 * cem no lugar que lembrasse.
 */
export type Titulo = {
  id: string
  /** Fornecedor, na conta a pagar; cliente, na a receber. */
  contraparte: string
  descricao: string
  /** AAAA-MM-DD. */
  vencimento: string
  valor: number
  baixado: number
  status: StatusTitulo
}

export type ListaDeTitulos = {
  titulos: Titulo[]
  /** Soma do que AINDA falta, e nao do valor original. */
  total: number
  temVencidos: boolean
}

type GrupoDaApi<T> = { faixa: string; totalCents: number } & T

type PagarDaApi = {
  id: string
  supplier: string
  description: string
  amountCents: number
  settledAmountCents: number
  dueDate: string
  status: string
}

type ReceberDaApi = {
  id: string
  customerName: string | null
  description: string
  amountCents: number
  settledAmountCents: number
  dueDate: string
  status: string
}

const emReais = (centavos: number) => centavos / 100

/**
 * O status da api vira o da tela.
 *
 * A api nao tem "vencido": ela guarda `open` e deixa a data decidir, porque
 * vencido e uma leitura do calendario e nao um estado gravado — se fosse
 * coluna, alguem teria de varrer o banco a meia-noite para mante-la certa.
 * Quem pinta o vermelho e `situacaoDoTitulo`, com o vencimento em maos.
 */
const paraStatus = (status: string): StatusTitulo =>
  status === 'settled' ? 'pago' : status === 'partially_settled' ? 'parcial' : 'aberto'

/**
 * As contas a pagar da loja — RF-061.
 *
 * A api devolve agrupado por faixa de vencimento; aqui a lista e achatada,
 * porque a tela do celular reagrupa do seu jeito (sanfonas por situacao) e dois
 * agrupamentos empilhados so criariam duas verdades sobre a mesma conta.
 */
export async function listarContasPagar(): Promise<Resposta<ListaDeTitulos>> {
  const r = await chamarApi<{
    grupos: GrupoDaApi<{ payables: PagarDaApi[] }>[]
    totalCents: number
    temVencidas: boolean
  }>('/contas-a-pagar')

  if (!r.ok) return r

  return {
    ok: true,
    dados: {
      titulos: r.dados.grupos.flatMap((g) =>
        g.payables.map((p) => ({
          id: p.id,
          contraparte: p.supplier,
          descricao: p.description,
          vencimento: p.dueDate,
          valor: emReais(p.amountCents),
          baixado: emReais(p.settledAmountCents),
          status: paraStatus(p.status),
        })),
      ),
      total: emReais(r.dados.totalCents),
      temVencidos: r.dados.temVencidas,
    },
  }
}

/** As contas a receber da loja — RF-064, RF-066. */
export async function listarContasReceber(): Promise<Resposta<ListaDeTitulos>> {
  const r = await chamarApi<{
    grupos: GrupoDaApi<{ receivables: ReceberDaApi[] }>[]
    totalCents: number
    temVencidas: boolean
  }>('/contas-a-receber')

  if (!r.ok) return r

  return {
    ok: true,
    dados: {
      titulos: r.dados.grupos.flatMap((g) =>
        g.receivables.map((rec) => ({
          id: rec.id,
          /* Venda sem identificar o cliente e caminho normal no balcao: o
             rotulo diz isso em vez de deixar a linha sem contraparte. */
          contraparte: rec.customerName ?? 'Cliente nao identificado',
          descricao: rec.description,
          vencimento: rec.dueDate,
          valor: emReais(rec.amountCents),
          baixado: emReais(rec.settledAmountCents),
          status: paraStatus(rec.status),
        })),
      ),
      total: emReais(r.dados.totalCents),
      temVencidos: r.dados.temVencidas,
    },
  }
}

/** Os dados de exemplo, ainda usados pelas telas que nao tem rota. */
export function listarContasPagarDeExemplo(): ContaPagar[] {
  return contasPagar.map((c) => ({ ...c }))
}

export function listarContasReceberDeExemplo(): ContaReceber[] {
  return contasReceber.map((c) => ({ ...c }))
}

/** SUBSTITUIR POR: GET /financeiro/planos */
export function listarPlanos(): PlanoContas[] {
  return planoContas.map((p) => ({ ...p }))
}

/** SUBSTITUIR POR: GET /financeiro/custos-fixos */
export function listarCustosFixos(): CustoFixo[] {
  return custosFixos.map((c) => ({ ...c }))
}

/* -------------------------------------------------------------------------- */
/* Baixa e estorno                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Por que a baixa nao acontece no celular — RF-063, RF-064.
 *
 * As rotas existem desde a NR-029. O que falta nao e codigo: e a PERGUNTA que
 * cada uma faz.
 *
 * - `POST /contas-a-pagar/:id/baixas` exige `bankAccount` — de qual conta o
 *   dinheiro saiu. Sem isso a conciliacao bancaria nao fecha, e o campo nao tem
 *   padrao razoavel: chutar "a primeira conta" poe a saida na conta errada, e o
 *   erro so aparece no extrato do mes seguinte.
 * - `POST /contas-a-receber/:id/baixas` exige `method` — como o dinheiro
 *   entrou. Nao e a forma da venda, e a do recebimento: quem vendeu fiado pode
 *   receber em pix, e e isso que o relatorio de caixa mostra.
 *
 * A tela de hoje confirma num `Alert`, que nao tem onde escolher nada. Mandar
 * um padrao inventado seria pior que nao ter o botao: a baixa entraria com dado
 * errado, e dado financeiro errado com cara de certo e o que ninguem consegue
 * auditar depois.
 *
 * Ate esta tela ganhar a escolha, a baixa fica no web, que ja pergunta as duas
 * coisas. O que muda agora e o botao parar de MENTIR: ele era
 * `await delay(800)` seguido de `{ ok: true }`, e a tela respondia "baixado"
 * enquanto o saldo continuava o mesmo no dia seguinte.
 */
export const BAIXA_SO_NO_WEB =
  'A baixa precisa da conta bancaria (a pagar) ou da forma de recebimento (a receber). ' +
  'Enquanto esta tela nao pergunta, faca a baixa pelo Ei Buddy no computador.'

/**
 * O estorno, pelo mesmo motivo, tambem nao sai daqui.
 *
 * `POST /baixas/:id/estorno` aponta para a BAIXA e nao para o titulo — um
 * titulo com tres baixas nao diz sozinho qual desfazer —, e a lista de titulos
 * nao carrega as baixas de cada um. Sem elas, "estornar" no celular seria um
 * palpite sobre qual lancamento desfazer.
 */
export const ESTORNO_SO_NO_WEB =
  'O estorno aponta para uma baixa especifica, e esta tela mostra so o saldo. ' +
  'Faca o estorno pelo Ei Buddy no computador.'

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
    error: `Exportacao em ${formato.toUpperCase()} entra quando o backend expuser o endpoint.`,
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
