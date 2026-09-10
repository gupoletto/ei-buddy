/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — MODULO DE CLIENTES
 * ============================================================================
 *
 *  | Funcao             | Endpoint esperado             | Disparo             |
 *  |--------------------|-------------------------------|---------------------|
 *  | buscarCpf          | GET  /pessoas/cpf/:cpf        | botao "Buscar dados"|
 *  | salvarCliente      | POST/PUT /clientes[/:id]      | submit do form      |
 *  | confirmarImportacao| POST /clientes/importar       | confirmacao da previa|
 *
 * SOBRE A CONSULTA DE CPF: diferente do CNPJ, dado de CPF nao e publico.
 * A consulta so pode existir se houver base contratada e base legal (LGPD)
 * para isso, e deve ficar no backend com registro de quem consultou o que.
 * O front apenas oferece o botao — se o backend responder 403, a tela trata
 * como "consulta indisponivel" e o cadastro segue manual.
 */

import type { Cliente } from './types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* -------------------------------------------------------------------------- */
/* Consulta de CPF                                                            */
/* -------------------------------------------------------------------------- */

export type CpfResult =
  { ok: true; nome: string } | { ok: false; error: string; indisponivel?: boolean }

/** SUBSTITUIR POR: GET /pessoas/cpf/:cpf */
export async function buscarCpf(cpf: string): Promise<CpfResult> {
  await delay(900)

  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) {
    return { ok: false, error: 'Informe o CPF completo antes de buscar.' }
  }

  /* Base de exemplo. Sem contrato de consulta, o backend devolve 403 e a
     tela mostra que a busca esta indisponivel — sem travar o cadastro. */
  const conhecidos: Record<string, string> = {
    '12345678900': 'Joana Ribeiro',
    '32165498711': 'Marcos Dias',
  }

  const nome = conhecidos[d]
  if (!nome) {
    return {
      ok: false,
      error: 'Consulta de CPF indisponível. Preencha o nome manualmente.',
      indisponivel: true,
    }
  }

  return { ok: true, nome }
}

/* -------------------------------------------------------------------------- */
/* Gravacao                                                                   */
/* -------------------------------------------------------------------------- */

export type DadosCliente = {
  id?: string
  tipoPessoa: 'fisica' | 'juridica'
  documento: string
  nome: string
  ddd: string
  celular: string
  email: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

/** SUBSTITUIR POR: POST /clientes (novo) ou PUT /clientes/:id (edicao) */
export async function salvarCliente(
  dados: DadosCliente,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await delay(900)
  return { ok: true, id: dados.id ?? `cli-${Date.now()}` }
}

/* -------------------------------------------------------------------------- */
/* Dados vinculados ao cliente (detalhe)                                      */
/* -------------------------------------------------------------------------- */

export type CompraCliente = {
  id: string
  numero: string
  data: string
  valor: number
  itens: number
  formaPagamento: string
}

export type PendenciaCliente = {
  id: string
  referente: string
  vencimento: string
  valor: number
  status: 'aberto' | 'vencido' | 'parcial'
}

export type ContatoCliente = {
  id: string
  data: string
  tipo: 'ligacao' | 'whatsapp' | 'visita' | 'observacao'
  descricao: string
}

/** SUBSTITUIR POR: GET /clientes/:id/compras */
export function comprasDoCliente(clienteId: string): CompraCliente[] {
  const base: Record<string, CompraCliente[]> = {
    'cli-1': [
      {
        id: 'v1',
        numero: '1842',
        data: '2026-08-24',
        valor: 86.9,
        itens: 6,
        formaPagamento: 'Pix',
      },
      {
        id: 'v2',
        numero: '1798',
        data: '2026-08-11',
        valor: 214.4,
        itens: 12,
        formaPagamento: 'Credito',
      },
      {
        id: 'v3',
        numero: '1755',
        data: '2026-07-29',
        valor: 132.0,
        itens: 8,
        formaPagamento: 'Dinheiro',
      },
    ],
    'cli-2': [
      {
        id: 'v4',
        numero: '1839',
        data: '2026-08-23',
        valor: 156.2,
        itens: 4,
        formaPagamento: 'Debito',
      },
      {
        id: 'v5',
        numero: '1801',
        data: '2026-08-12',
        valor: 4820.0,
        itens: 96,
        formaPagamento: 'Credito',
      },
    ],
    'cli-3': [
      {
        id: 'v6',
        numero: '1840',
        data: '2026-08-24',
        valor: 412.5,
        itens: 18,
        formaPagamento: 'Dinheiro',
      },
    ],
    'cli-4': [
      {
        id: 'v7',
        numero: '1702',
        data: '2026-06-02',
        valor: 2310.5,
        itens: 44,
        formaPagamento: 'Credito',
      },
    ],
  }
  return base[clienteId] ?? []
}

/** SUBSTITUIR POR: GET /clientes/:id/titulos (Contas a Receber) */
export function pendenciasDoCliente(clienteId: string): PendenciaCliente[] {
  const base: Record<string, PendenciaCliente[]> = {
    'cli-2': [
      {
        id: 'p1',
        referente: 'Pedido 8891',
        vencimento: '2026-08-25',
        valor: 4820.0,
        status: 'aberto',
      },
      {
        id: 'p2',
        referente: 'Pedido 8880',
        vencimento: '2026-09-05',
        valor: 3740.0,
        status: 'parcial',
      },
    ],
    'cli-4': [
      {
        id: 'p3',
        referente: 'Pedido 8874',
        vencimento: '2026-08-16',
        valor: 2310.5,
        status: 'vencido',
      },
    ],
    'cli-3': [
      {
        id: 'p4',
        referente: 'Venda 1840',
        vencimento: '2026-09-19',
        valor: 412.5,
        status: 'aberto',
      },
    ],
  }
  return base[clienteId] ?? []
}

/** SUBSTITUIR POR: GET /clientes/:id/contatos (CRM) */
export function contatosDoCliente(clienteId: string): ContatoCliente[] {
  const base: Record<string, ContatoCliente[]> = {
    'cli-2': [
      { id: 'c1', data: '2026-08-20', tipo: 'whatsapp', descricao: 'Enviado catalogo de agosto.' },
      {
        id: 'c2',
        data: '2026-08-14',
        tipo: 'ligacao',
        descricao: 'Confirmou pedido 8891 para o dia 25.',
      },
    ],
    'cli-4': [
      {
        id: 'c3',
        data: '2026-08-18',
        tipo: 'ligacao',
        descricao: 'Cobranca do pedido 8874. Prometeu pagar dia 22.',
      },
      {
        id: 'c4',
        data: '2026-06-02',
        tipo: 'visita',
        descricao: 'Visita ao restaurante, apresentada linha de azeites.',
      },
    ],
    'cli-5': [
      {
        id: 'c5',
        data: '2026-03-11',
        tipo: 'observacao',
        descricao: 'Compra pontual, sem recorrencia ate agora.',
      },
    ],
  }
  return base[clienteId] ?? []
}

/** Total em aberto do cliente — usado como indicador na listagem. */
export function pendenciaTotal(clienteId: string): number {
  return pendenciasDoCliente(clienteId).reduce((acc, p) => acc + p.valor, 0)
}

/** True quando ha titulo vencido — pinta o indicador em tom de alerta. */
export function temVencido(clienteId: string): boolean {
  return pendenciasDoCliente(clienteId).some((p) => p.status === 'vencido')
}

export type { Cliente }

/* -------------------------------------------------------------------------- */
/* Importacao                                                                 */
/* -------------------------------------------------------------------------- */

/** SUBSTITUIR POR: POST /clientes/importar */
export async function confirmarImportacaoClientes(
  registros: Record<string, string>[],
): Promise<void> {
  await delay(1200)
  void registros
}
