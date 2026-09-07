/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — ASSISTENTE
 * ============================================================================
 *
 *  | Funcao          | Endpoint esperado          | Disparo                |
 *  |-----------------|----------------------------|------------------------|
 *  | enviarMensagem  | POST /assistente/mensagens | envio no chat          |
 *  | registrarUso    | POST /assistente/uso       | apos cada interacao    |
 *  | listarHistorico | GET  /assistente/conversas | abertura da tela       |
 *
 * MESMA CONVERSA EM VARIOS CANAIS. O modelo abaixo — `Mensagem` com
 * `canal` e `Contexto` separado do historico — existe para que a conversa
 * do app e a do WhatsApp sejam a MESMA thread no servidor. Se o contexto
 * morasse na tela, o assistente esqueceria tudo ao trocar de canal, que e
 * exatamente o que o produto promete evitar.
 *
 * A INTERPRETACAO E DO SERVIDOR. O reconhecimento de intencao aqui e um
 * mock por palavra-chave, so para a tela poder ser exercitada. No produto
 * quem entende a frase e o modelo, no backend, com acesso aos dados e as
 * ferramentas — nunca o navegador.
 *
 * ACAO SEMPRE CONFIRMA. Consulta responde direto; qualquer coisa que grave
 * (cadastrar, baixar titulo, enviar mensagem ao cliente) devolve
 * `confirmacao` e so executa depois do aceite explicito.
 */

import { clientes, contasPagar, produtos } from './mock-data'
import { carregarHistorico } from './vendas-api'
import { daysUntil, formatMoney } from './format'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* -------------------------------------------------------------------------- */
/* Modelo de conversa                                                         */
/* -------------------------------------------------------------------------- */

export type Canal = 'app' | 'whatsapp'

/** Bloco rico dentro de uma resposta — a tela decide como desenhar. */
export type BlocoResposta =
  | { tipo: 'texto'; texto: string }
  | {
      tipo: 'tabela'
      titulo: string
      colunas: string[]
      linhas: string[][]
    }
  | {
      tipo: 'lista'
      titulo: string
      itens: { rotulo: string; valor: string; destaque?: boolean }[]
    }
  | {
      tipo: 'indicador'
      rotulo: string
      valor: string
      apoio?: string
    }
  | {
      tipo: 'confirmacao'
      pergunta: string
      acao: string
    }

export type Mensagem = {
  id: string
  autor: 'usuario' | 'assistente'
  canal: Canal
  texto: string
  blocos?: BlocoResposta[]
  data: string
}

/**
 * Memoria de curto prazo da conversa.
 *
 * Guarda a ultima entidade citada para resolver pronome: perguntar
 * "o que ele comprou" logo depois de falar de um cliente precisa
 * funcionar, senao a conversa vira uma sequencia de comandos soltos.
 */
export type Contexto = {
  clienteId: string | null
  clienteNome: string | null
  produtoId: string | null
  produtoNome: string | null
}

export const CONTEXTO_VAZIO: Contexto = {
  clienteId: null,
  clienteNome: null,
  produtoId: null,
  produtoNome: null,
}

/* -------------------------------------------------------------------------- */
/* Aprendizado                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Registro de uso, base para personalizar sugestoes depois.
 *
 * SUBSTITUIR POR: POST /assistente/uso — o servidor agrega por usuario e
 * devolve os comandos mais usados para ordenar os chips. Guardar isto no
 * navegador nao serve: a mesma pessoa usa o WhatsApp e outro aparelho.
 */
export type RegistroUso = {
  intencao: string
  texto: string
  data: string
}

const usoDaSessao: RegistroUso[] = []

export function registrarUso(intencao: string, texto: string): void {
  usoDaSessao.push({ intencao, texto, data: new Date().toISOString() })
}

/** Comandos mais repetidos nesta sessao — prototipo do ranking real. */
export function comandosMaisUsados(limite = 3): string[] {
  const contagem = new Map<string, number>()
  for (const r of usoDaSessao) {
    contagem.set(r.texto, (contagem.get(r.texto) ?? 0) + 1)
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([texto]) => texto)
}

/* -------------------------------------------------------------------------- */
/* Reconhecimento de intencao (mock)                                          */
/* -------------------------------------------------------------------------- */

/** Remove acento e caixa para comparar sem depender de digitacao exata. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Procura um cliente citado no texto. */
function acharCliente(texto: string) {
  const t = normalizar(texto)
  return (
    clientes.find((c) => t.includes(normalizar(c.nome))) ??
    clientes.find((c) => {
      const primeiro = normalizar(c.nome).split(' ')[0]
      return primeiro.length > 3 && t.includes(primeiro)
    }) ??
    null
  )
}

export type Resposta = {
  texto: string
  blocos: BlocoResposta[]
  contexto: Contexto
  intencao: string
}

/**
 * SUBSTITUIR POR: POST /assistente/mensagens
 *
 * Recebe a pergunta e o contexto corrente e devolve a resposta com o
 * contexto atualizado. Manter esta assinatura faz o backend entrar sem
 * mexer na tela.
 */
export async function enviarMensagem(texto: string, contexto: Contexto): Promise<Resposta> {
  await delay(900)

  const t = normalizar(texto)
  const ctx: Contexto = { ...contexto }

  /* Se a frase cita um cliente, ele passa a ser o assunto da conversa. */
  const clienteCitado = acharCliente(texto)
  if (clienteCitado) {
    ctx.clienteId = clienteCitado.id
    ctx.clienteNome = clienteCitado.nome
  }

  /* --- Faturamento --- */
  if (t.includes('faturamento') || t.includes('quanto vendi')) {
    /*
     * O numero e DE VERDADE, mesmo com o assistente ainda sendo um esboco.
     *
     * Antes saia de `listarVendas()`, que era `lib/mock-data` filtrado por uma
     * data fixa de 2026: o lojista perguntava "quanto vendi hoje" e recebia o
     * faturamento de outra pessoa, num dia que nao era hoje. O runtime do
     * agente espera a DEC-007, mas a resposta desta pergunta nao — ela sai da
     * mesma consulta que a tela de vendas usa, entao as duas concordam.
     */
    const agora = new Date()
    const dois = (n: number) => String(n).padStart(2, '0')
    const hojeIso = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`

    const r = await carregarHistorico({
      termo: '',
      de: hojeIso,
      ate: hojeIso,
      pagina: 1,
      porPagina: 1,
    })

    const totalHoje = r.ok ? r.dados.resumo.faturamento : 0
    const hoje = { length: r.ok ? r.dados.resumo.quantidade : 0 }

    return {
      intencao: 'faturamento',
      texto: `Hoje voce vendeu ${formatMoney(totalHoje)} em ${hoje.length} vendas.`,
      contexto: ctx,
      blocos: [
        {
          tipo: 'indicador',
          rotulo: 'Faturamento hoje',
          valor: formatMoney(totalHoje),
          apoio: `${hoje.length} vendas`,
        },
        {
          tipo: 'tabela',
          titulo: 'Ultimos meses',
          colunas: ['Mes', 'Faturamento', 'Vendas'],
          linhas: [
            ['Agosto', 'R$ 64.200', '312'],
            ['Julho', 'R$ 58.940', '287'],
            ['Junho', 'R$ 61.310', '301'],
          ],
        },
      ],
    }
  }

  /* --- Ranking de clientes --- */
  if (t.includes('ranking') && (t.includes('cliente') || t.includes('clientes'))) {
    const ordenados = [...clientes].sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 5)
    return {
      intencao: 'ranking_clientes',
      texto: 'Seus cinco maiores clientes por valor acumulado:',
      contexto: ctx,
      blocos: [
        {
          tipo: 'tabela',
          titulo: 'Ranking de clientes',
          colunas: ['Cliente', 'Compras', 'Total'],
          linhas: ordenados.map((c) => [c.nome, String(c.totalCompras), formatMoney(c.valorTotal)]),
        },
      ],
    }
  }

  /* --- Ranking de produtos --- */
  if (t.includes('ranking') && t.includes('produto')) {
    return {
      intencao: 'ranking_produtos',
      texto: 'Produtos mais vendidos no mes:',
      contexto: ctx,
      blocos: [
        {
          tipo: 'tabela',
          titulo: 'Mais vendidos',
          colunas: ['Produto', 'Qtd', 'Faturamento'],
          linhas: [
            ['Leite integral 1L', '412', 'R$ 2.467'],
            ['Cafe torrado 500g', '268', 'R$ 5.869'],
            ['Acucar mascavo 1kg', '196', 'R$ 2.528'],
          ],
        },
      ],
    }
  }

  /* --- Produtos lucrativos --- */
  if (t.includes('lucrativ')) {
    const ordenados = [...produtos]
      .map((p) => ({ p, margem: ((p.precoVenda - p.precoCusto) / p.precoVenda) * 100 }))
      .sort((a, b) => b.margem - a.margem)
      .slice(0, 4)

    return {
      intencao: 'produtos_lucrativos',
      texto: 'Os produtos com maior margem hoje:',
      contexto: ctx,
      blocos: [
        {
          tipo: 'tabela',
          titulo: 'Maior margem',
          colunas: ['Produto', 'Custo', 'Venda', 'Margem'],
          linhas: ordenados.map(({ p, margem }) => [
            p.descricao,
            formatMoney(p.precoCusto),
            formatMoney(p.precoVenda),
            `${margem.toFixed(1).replace('.', ',')}%`,
          ]),
        },
      ],
    }
  }

  /* --- Reposicao de estoque --- */
  if (t.includes('reposic') || t.includes('estoque')) {
    const faltando = produtos.filter((p) => p.estoque < p.estoqueMinimo)
    return {
      intencao: 'reposicao',
      texto:
        faltando.length > 0
          ? `${faltando.length} produtos estao abaixo do minimo.`
          : 'Nenhum produto abaixo do minimo.',
      contexto: ctx,
      blocos: [
        {
          tipo: 'lista',
          titulo: 'Precisa repor',
          itens: faltando.map((p) => ({
            rotulo: p.descricao,
            valor: `${p.estoque} un · minimo ${p.estoqueMinimo}`,
            destaque: true,
          })),
        },
      ],
    }
  }

  /* --- Produtos sem venda --- */
  if (t.includes('sem venda') || t.includes('nao vende')) {
    const parados = produtos.filter((p) => p.diasSemVenda > 30)
    return {
      intencao: 'produtos_parados',
      texto: `${parados.length} produto(s) sem sair ha mais de 30 dias.`,
      contexto: ctx,
      blocos: [
        {
          tipo: 'lista',
          titulo: 'Parados no estoque',
          itens: parados.map((p) => ({
            rotulo: p.descricao,
            valor: `${p.diasSemVenda} dias · ${p.estoque} un paradas`,
          })),
        },
      ],
    }
  }

  /* --- Contas a pagar --- */
  if (t.includes('pagar')) {
    const abertas = contasPagar.filter((c) => c.status !== 'pago')
    const hoje = abertas.filter((c) => daysUntil(c.vencimento) === 0)
    const vencidas = abertas.filter((c) => daysUntil(c.vencimento) < 0)
    const totalHoje = hoje.reduce((a, c) => a + (c.valor - c.valorPago), 0)

    return {
      intencao: 'contas_pagar',
      texto:
        hoje.length > 0
          ? `Voce tem ${hoje.length} conta(s) vencendo hoje, somando ${formatMoney(totalHoje)}.`
          : 'Nada vencendo hoje.',
      contexto: ctx,
      blocos: [
        {
          tipo: 'lista',
          titulo: 'Vence hoje',
          itens: hoje.map((c) => ({
            rotulo: c.fornecedor,
            valor: formatMoney(c.valor - c.valorPago),
          })),
        },
        ...(vencidas.length > 0
          ? ([
              {
                tipo: 'lista',
                titulo: 'Em atraso',
                itens: vencidas.map((c) => ({
                  rotulo: c.fornecedor,
                  valor: `${formatMoney(c.valor - c.valorPago)} · ${Math.abs(daysUntil(c.vencimento))} dias`,
                  destaque: true,
                })),
              },
            ] as BlocoResposta[])
          : []),
      ],
    }
  }

  /* --- Clientes inativos --- */
  if (t.includes('nao compram') || t.includes('sumiram') || t.includes('inativ')) {
    const inativos = clientes.filter(
      (c) => c.ultimaCompra && Math.abs(daysUntil(c.ultimaCompra)) > 60,
    )
    return {
      intencao: 'clientes_inativos',
      texto: `${inativos.length} cliente(s) sem comprar ha mais de 60 dias.`,
      contexto: ctx,
      blocos: [
        {
          tipo: 'lista',
          titulo: 'Sumiram',
          itens: inativos.map((c) => ({
            rotulo: c.nome,
            valor: `ha ${Math.abs(daysUntil(c.ultimaCompra!))} dias`,
          })),
        },
        {
          tipo: 'confirmacao',
          pergunta: 'Quer que eu mande um WhatsApp para eles com o catalogo?',
          acao: 'enviar_catalogo_inativos',
        },
      ],
    }
  }

  /* --- Contexto: "o que ele comprou" / divida do cliente --- */
  if (
    t.includes('o que ele comprou') ||
    t.includes('o que ela comprou') ||
    t.includes('ultima compra') ||
    t.includes('devendo') ||
    t.includes('deve')
  ) {
    if (!ctx.clienteId) {
      return {
        intencao: 'sem_contexto',
        texto: 'De qual cliente voce esta falando? Diga o nome que eu busco.',
        contexto: ctx,
        blocos: [],
      }
    }

    const cliente = clientes.find((c) => c.id === ctx.clienteId)!
    /*
     * As compras deste cliente, do historico DE VERDADE.
     *
     * A busca do historico casa por nome do cliente, numero da venda ou
     * descricao do item — aqui o nome basta. `porPagina` alto porque a lista
     * abaixo mostra as ultimas, e paginar dentro de uma resposta de chat nao
     * tem para onde ir.
     */
    const historico = await carregarHistorico({
      termo: cliente.nome,
      de: '',
      ate: '',
      pagina: 1,
      porPagina: 20,
    })
    const compras = historico.ok ? historico.dados.vendas : []

    if (t.includes('devendo') || t.includes('deve')) {
      return {
        intencao: 'divida_cliente',
        texto: `Situacao de ${cliente.nome}:`,
        contexto: ctx,
        blocos: [
          {
            tipo: 'indicador',
            rotulo: 'Total ja comprado',
            valor: formatMoney(cliente.valorTotal),
            apoio: `${cliente.totalCompras} compras`,
          },
        ],
      }
    }

    return {
      intencao: 'compras_cliente',
      texto: `As ultimas compras de ${cliente.nome}:`,
      contexto: ctx,
      blocos: [
        compras.length > 0
          ? {
              tipo: 'tabela',
              titulo: `Compras de ${cliente.nome}`,
              colunas: ['Venda', 'Itens', 'Total'],
              linhas: compras.map((v) => [
                `#${v.numero}`,
                String(v.itens.reduce((a, i) => a + i.quantidade, 0)),
                formatMoney(v.total),
              ]),
            }
          : { tipo: 'texto', texto: 'Nenhuma compra registrada para este cliente.' },
      ],
    }
  }

  /* --- Cliente citado, sem outra intencao --- */
  if (clienteCitado) {
    return {
      intencao: 'resumo_cliente',
      texto: `${clienteCitado.nome} esta cadastrado. O que voce quer saber?`,
      contexto: ctx,
      blocos: [
        {
          tipo: 'lista',
          titulo: clienteCitado.nome,
          itens: [
            { rotulo: 'Documento', valor: clienteCitado.documento },
            { rotulo: 'Compras', valor: String(clienteCitado.totalCompras) },
            { rotulo: 'Total gasto', valor: formatMoney(clienteCitado.valorTotal) },
          ],
        },
        { tipo: 'texto', texto: 'Pergunte, por exemplo: o que ele comprou?' },
      ],
    }
  }

  /* --- Acao de cadastro --- */
  if (t.includes('cadastr')) {
    return {
      intencao: 'cadastrar_cliente',
      texto: 'Posso cadastrar. Me passe nome e telefone.',
      contexto: ctx,
      blocos: [
        {
          tipo: 'confirmacao',
          pergunta: 'Quer abrir o formulario completo de cadastro?',
          acao: 'abrir_cadastro_cliente',
        },
      ],
    }
  }

  /* --- Nao entendeu --- */
  return {
    intencao: 'desconhecida',
    texto:
      'Ainda nao sei responder isso. Tente uma das sugestoes abaixo, ou pergunte sobre vendas, clientes, produtos ou contas.',
    contexto: ctx,
    blocos: [],
  }
}
