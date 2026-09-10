/**
 * Comandos "Via WhatsApp" de cada modulo, em um lugar so.
 *
 * Antes cada tela carregava a propria lista. Reuni aqui porque o
 * Assistente precisa oferecer todas juntas — e porque uma lista repetida
 * em seis arquivos diverge na primeira vez que alguem reescreve um texto.
 *
 * A mesma lista alimenta os chips do assistente e os blocos das telas.
 */

export type GrupoComandos = {
  modulo: string
  comandos: string[]
}

export const COMANDOS_EMPRESA = [
  'Qual foi o faturamento mês a mês dos últimos meses',
  'Ranking dos clientes',
  'Ranking dos produtos',
  'Gerar DRE do mês',
]

export const COMANDOS_CLIENTES = [
  'Cadastra um cliente para mim',
  'O cliente X está cadastrado',
  'Quando foi a última compra do cliente X',
  'O que ele comprou',
  'O que o cliente X está devendo',
  'Envie um WhatsApp para o cliente dizendo...',
  'Quais clientes não compram há muito tempo',
  'Lançar uma pendência',
  'Lançar um contato',
]

export const COMANDOS_PRODUTOS = [
  'Quais produtos estão sem venda há muito tempo',
  'Envie WhatsApp oferecendo esses produtos para quem já comprou',
  'Ranking de produtos',
  'Produtos lucrativos',
  'Quais produtos precisam de reposição de estoque',
  'Gerar link com o catálogo e enviar para o cliente X',
]

export const COMANDOS_PAGAR = [
  'O que há para pagar hoje',
  'O que há para pagar até sexta',
  'Qual o total a pagar',
  'Resuma o total a pagar por plano de conta',
  'Baixe as contas a pagar para mim',
]

export const COMANDOS_RECEBER = [
  'O que há a receber, envie aviso para esses clientes',
  'O que está vencido, envie aviso para esses clientes',
  'Ranking por cliente',
  'Baixe para mim',
]

export const COMANDOS_PLANO_CONTAS = [
  'Ranking dos planos de conta',
  'Gastos mês a mês',
  'Gastos do plano de conta Fornecedores',
  'Gerar contas a pagar',
]

export const COMANDOS_VENDAS = [
  'Quanto vendi hoje',
  'Ranking de produtos mais vendidos',
  'Qual o ticket médio da semana',
  'Quais vendas foram estornadas',
]

/** Agrupado por modulo — usado pelos chips do Assistente. */
export const GRUPOS_COMANDOS: GrupoComandos[] = [
  { modulo: 'Vendas', comandos: COMANDOS_VENDAS },
  { modulo: 'Clientes', comandos: COMANDOS_CLIENTES },
  { modulo: 'Produtos', comandos: COMANDOS_PRODUTOS },
  { modulo: 'Financeiro', comandos: [...COMANDOS_PAGAR, ...COMANDOS_RECEBER] },
  { modulo: 'Plano de contas', comandos: COMANDOS_PLANO_CONTAS },
  { modulo: 'Empresa', comandos: COMANDOS_EMPRESA },
]

/** Sugestoes iniciais mostradas com a conversa vazia. */
export const COMANDOS_DESTAQUE = [
  'Quanto vendi hoje',
  'O que há para pagar hoje',
  'Quais produtos precisam de reposição de estoque',
  'Ranking dos clientes',
  'Quais clientes não compram há muito tempo',
]
