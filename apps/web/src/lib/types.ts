/**
 * Modelos de dominio do produto, derivados do mapeamento de modulos
 * da apresentacao (docs/ZapGestor_Apresentacao.pdf).
 *
 * Estes tipos existem para a camada de UI. Quando o backend expuser os
 * contratos reais, eles devem ser substituidos pelos schemas de
 * `packages/contracts` — as telas nao precisam mudar se os campos baterem.
 */

export type UF =
  | 'AC'
  | 'AL'
  | 'AM'
  | 'AP'
  | 'BA'
  | 'CE'
  | 'DF'
  | 'ES'
  | 'GO'
  | 'MA'
  | 'MG'
  | 'MS'
  | 'MT'
  | 'PA'
  | 'PB'
  | 'PE'
  | 'PI'
  | 'PR'
  | 'RJ'
  | 'RN'
  | 'RO'
  | 'RR'
  | 'RS'
  | 'SC'
  | 'SE'
  | 'SP'
  | 'TO'

export type Endereco = {
  cep: string
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  uf: UF
}

/** Modulo: Empresa */
export type Empresa = {
  id: string
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  inscricaoEstadual: string
  inscricaoMunicipal: string
  ramoAtividade: string
  ddd: string
  celular: string
  email: string
  endereco: Endereco
  /** "Comissoes habilitaveis" do mapeamento original. */
  comissaoHabilitada: boolean
  comissaoPercentual: number
}

/** Modulo: Clientes / CRM */
export type Cliente = {
  id: string
  nome: string
  /** CPF ou CNPJ, ja formatado para exibicao. */
  documento: string
  tipoPessoa: 'fisica' | 'juridica'
  ddd: string
  celular: string
  email?: string
  endereco: Endereco
  ultimaCompra: string | null
  totalCompras: number
  valorTotal: number
}

/** Modulo: Produtos */
export type Produto = {
  id: string
  codigo: string
  descricao: string
  ean: string
  ncm: string
  categoria: string
  fornecedor: string
  precoCusto: number
  precoVenda: number
  estoque: number
  estoqueMinimo: number
  /** Dias desde a ultima venda — alimenta "produtos sem venda ha X tempo". */
  diasSemVenda: number
}

export type FormaPagamento = 'pix' | 'debito' | 'credito' | 'dinheiro' | 'carteira'

export type ItemVenda = {
  produtoId: string
  descricao: string
  quantidade: number
  precoUnitario: number
  desconto: number
}

export type StatusVenda = 'concluida' | 'cancelada' | 'em_aberto'
export type TipoNota = 'nfce' | 'nfse' | 'sem_nota'

/** Modulo: Vendas */
export type Venda = {
  id: string
  numero: string
  clienteId: string | null
  clienteNome: string
  data: string
  itens: ItemVenda[]
  subtotal: number
  desconto: number
  total: number
  formaPagamento: FormaPagamento
  status: StatusVenda
  nota: TipoNota
  /** Calculados no fechamento: custo, imposto e tarifa de cartao. */
  custoTotal: number
  imposto: number
  tarifaCartao: number
  valorLiquido: number
}

export type StatusTitulo = 'aberto' | 'pago' | 'parcial' | 'vencido'

/** Modulo: Contas a Pagar */
export type ContaPagar = {
  id: string
  fornecedor: string
  planoContasId: string
  planoContasNome: string
  bancoId: string
  bancoNome: string
  vencimento: string
  valor: number
  valorPago: number
  descricao: string
  status: StatusTitulo
}

/** Modulo: Contas a Receber */
export type ContaReceber = {
  id: string
  clienteId: string
  clienteNome: string
  bancoId: string
  bancoNome: string
  emissao: string
  vencimento: string
  referente: string
  tipo: FormaPagamento
  valor: number
  valorRecebido: number
  status: StatusTitulo
}

/** Modulo: Bancos */
export type Banco = {
  id: string
  nome: string
  agencia: string
  conta: string
  saldo: number
  /** Integracao via Open Finance. */
  integrado: boolean
  ultimaConciliacao: string | null
}

/** Modulo: Agenda */
export type TipoCompromisso = 'cobranca' | 'entrega' | 'reuniao' | 'pagamento'

export type Compromisso = {
  id: string
  titulo: string
  data: string
  hora: string
  tipo: TipoCompromisso
  clienteNome?: string
  concluido: boolean
}
