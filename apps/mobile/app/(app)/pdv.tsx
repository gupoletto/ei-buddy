import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Cabecalho from '@/components/Cabecalho'
import {
  fecharVenda,
  margemEmPontos,
  novaChaveDeVenda,
  type VendaRegistrada,
  FORMAS,
  paraItemCarrinho,
  produtoPorEan,
  subtotalCarrinho,
  subtotalItem,
  type ItemCarrinho,
} from '@/lib/vendas-api'
import { buscarEan } from '@/lib/produtos-api'
import type { FormaPagamento } from '@/lib/types'
import { formatMoney } from '@/lib/format'
import Botao from '@/components/ui/Botao'
import { Vazio } from '@/components/ui/Cartao'
import LeitorCodigo from '@/components/LeitorCodigo'
import { cores, espaco, fonte, peso, raio } from '@/theme/tokens'

/**
 * PDV simplificado.
 *
 * Versao de balcao: bipar, conferir e fechar. Desconto, orcamento em PDF,
 * multiplas formas de pagamento e emissao fiscal ficam no web — no
 * celular, cada passo a mais e um cliente esperando na fila.
 */
export default function Pdv() {
  const router = useRouter()
  const [itens, setItens] = useState<ItemCarrinho[]>([])
  const [lendo, setLendo] = useState(false)
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const [fechando, setFechando] = useState(false)
  /** A ultima venda fechada, com a decomposicao — US-020. */
  const [resumo, setResumo] = useState<VendaRegistrada | null>(null)
  /**
   * A chave do fechamento em andamento — RNF-043.
   *
   * Guardada em `ref` e nao em estado: ela nao muda o que a tela desenha, e um
   * `setState` aqui provocaria render a toa no meio do fechamento. O que
   * importa e que ela SOBREVIVA entre tentativas — gerar uma nova a cada toque
   * faria o reenvio virar uma segunda venda.
   */
  const chaveDoFechamento = useRef<string | null>(null)

  const total = subtotalCarrinho(itens)
  const quantidade = itens.reduce((acc, i) => acc + i.quantidade, 0)

  /**
   * Bipou: procura na api, nao no catalogo em memoria.
   *
   * A lista carregada na tela pode estar velha em relacao ao que outro operador
   * acabou de cadastrar — e no balcao isso significa dizer "nao existe" para um
   * produto que existe.
   */
  async function adicionarPorCodigo(codigo: string) {
    setLendo(false)

    const r = await buscarEan(codigo)

    if (r.situacao === 'erro') {
      Alert.alert('Não deu para ler', r.mensagem)
      return
    }

    if (r.situacao === 'novo') {
      Alert.alert('Produto não cadastrado', `O código ${r.ean} não está no catálogo desta loja.`, [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cadastrar',
          onPress: () => router.push({ pathname: '/produto-novo', params: { ean: r.ean } }),
        },
      ])
      return
    }

    /* Achou na api. O carrinho ainda usa o produto do catalogo local para
       preco e estoque — trocar isso e a NR-073, que traz o resumo com liquido.
       Aqui o ganho e nao inventar item que a loja nao tem. */
    const produto = produtoPorEan(codigo)
    if (!produto) {
      Alert.alert('Produto sem dados locais', r.descricao)
      return
    }

    setItens((atual) => {
      const existe = atual.find((i) => i.produtoId === produto.id)
      if (existe) {
        return atual.map((i) =>
          i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i,
        )
      }
      return [...atual, paraItemCarrinho(produto)]
    })
  }

  function mudarQuantidade(produtoId: string, delta: number) {
    setItens((atual) =>
      atual
        .map((i) => (i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0),
    )
  }

  function cancelar() {
    Alert.alert('Cancelar a venda', 'O carrinho será esvaziado.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar venda',
        style: 'destructive',
        onPress: () => setItens([]),
      },
    ])
  }

  /**
   * Fecha a venda — RF-036, RNF-043.
   *
   * A chave de idempotencia e gerada UMA VEZ, quando o operador confirma, e
   * reusada em toda tentativa deste fechamento. E o que faz o reenvio depois de
   * uma falha de rede devolver a MESMA venda em vez de criar uma segunda.
   *
   * So e descartada quando a venda entra — a partir dai, o proximo fechamento e
   * outra venda e merece chave nova.
   */
  async function confirmar() {
    /*
     * Fiado exige cliente identificado — o contrato recusa sem ele.
     *
     * E o app AINDA NAO consegue identificar: nao ha rota de listar clientes na
     * api, nem caso de uso em `core` para isso. Um seletor alimentado pelo mock
     * local mandaria um id que o servidor nao conhece, e a venda falharia com
     * uma mensagem que nao explica nada.
     *
     * Entao a recusa e explicita e diz onde fazer. Melhor que um seletor que
     * parece funcionar e quebra no fechamento, com o cliente na frente.
     */
    if (forma === 'carteira') {
      Alert.alert(
        'Fiado ainda não pelo app',
        'Venda no fiado precisa de cliente identificado, e a busca de clientes ' +
          'ainda não existe aqui. Feche esta venda pelo computador.',
      )
      return
    }

    chaveDoFechamento.current ??= novaChaveDeVenda()
    setFechando(true)

    const r = await fecharVenda(
      itens,
      [{ id: 'p1', forma, valor: total, status: 'confirmado' }],
      chaveDoFechamento.current,
      {},
    )

    setFechando(false)

    if (!r.ok) {
      /* NAO limpa a chave: a proxima tentativa e do MESMO fechamento. */
      Alert.alert(
        'Não deu para fechar',
        `${r.erro}

O carrinho continua aqui. Tente de novo.`,
      )
      return
    }

    chaveDoFechamento.current = null
    setItens([])

    Alert.alert(
      r.venda.reenvio ? 'Venda já registrada' : 'Venda registrada',
      r.venda.reenvio
        ? `Esta venda já tinha entrado (número ${r.venda.numero}). Nada foi duplicado.`
        : `Número ${r.venda.numero}` +
            (r.venda.trocoCentavos > 0
              ? `
Troco: ${formatMoney(r.venda.trocoCentavos / 100)}`
              : ''),
    )
  }

  function fechar() {
    const rotulo = FORMAS.find((f) => f.valor === forma)?.rotulo ?? forma

    Alert.alert(
      'Fechar a venda',
      `${quantidade} item(ns) · ${formatMoney(total)}
Pagamento em ${rotulo}.`,

      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Fechar', onPress: () => void confirmar() },
      ],
    )
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho
        titulo="Venda"
        subtitulo={quantidade === 0 ? 'Carrinho vazio' : `${quantidade} item(ns)`}
        acao={<Botao onPress={() => setLendo(true)}>Bipar</Botao>}
      />

      {resumo !== null ? <ResumoDaVenda venda={resumo} onFechar={() => setResumo(null)} /> : null}

      {itens.length === 0 ? (
        <Vazio
          titulo="Nada no carrinho"
          descricao="Bipe o código de barras do produto para começar."
          acao={<Botao onPress={() => setLendo(true)}>Bipar produto</Botao>}
        />
      ) : (
        <FlatList
          data={itens}
          keyExtractor={(i) => i.produtoId}
          contentContainerStyle={estilos.lista}
          renderItem={({ item }) => (
            <View style={estilos.item}>
              <View style={estilos.itemInfo}>
                <Text style={estilos.itemNome} numberOfLines={2}>
                  {item.descricao}
                </Text>
                <Text style={estilos.itemUnitario}>{formatMoney(item.precoUnitario)} un</Text>
              </View>

              <View style={estilos.contador}>
                <Pressable
                  onPress={() => mudarQuantidade(item.produtoId, -1)}
                  style={estilos.contadorBotao}
                  accessibilityLabel={`Diminuir ${item.descricao}`}
                >
                  <Text style={estilos.contadorSinal}>−</Text>
                </Pressable>

                <Text style={estilos.contadorValor}>{item.quantidade}</Text>

                <Pressable
                  onPress={() => mudarQuantidade(item.produtoId, 1)}
                  style={estilos.contadorBotao}
                  accessibilityLabel={`Aumentar ${item.descricao}`}
                >
                  <Text style={estilos.contadorSinal}>+</Text>
                </Pressable>
              </View>

              <Text style={estilos.itemSubtotal}>{formatMoney(subtotalItem(item))}</Text>
            </View>
          )}
        />
      )}

      {itens.length > 0 ? (
        <View style={estilos.rodape}>
          {/* Formas online (Pix, cartao) exigem link de pagamento; no
              balcao com fila, dinheiro e o caminho rapido. As demais
              entram quando o PSP estiver ligado. */}
          <View style={estilos.formas}>
            {FORMAS.filter((f) => !f.online).map((f) => (
              <Pressable
                key={f.valor}
                onPress={() => setForma(f.valor)}
                style={[estilos.forma, forma === f.valor && estilos.formaAtiva]}
              >
                <Text style={[estilos.formaTexto, forma === f.valor && estilos.formaTextoAtivo]}>
                  {f.rotulo}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={estilos.totalLinha}>
            <Text style={estilos.totalRotulo}>Total</Text>
            <Text style={estilos.totalValor}>{formatMoney(total)}</Text>
          </View>

          <View style={estilos.acoes}>
            <Botao variante="perigo" onPress={cancelar}>
              Cancelar
            </Botao>
            <View style={estilos.acaoPrincipal}>
              {/* O toque duplo aqui e SEGURO por causa da chave de
                  idempotencia — a segunda requisicao devolve a mesma venda.
                  O estado de carregando existe para a pessoa saber que algo
                  esta acontecendo, nao para proteger o servidor. */}
              <Botao onPress={fechar} carregando={fechando} largura>
                {fechando ? 'Fechando...' : 'Fechar venda'}
              </Botao>
            </View>
          </View>
        </View>
      ) : null}

      <LeitorCodigo
        aberto={lendo}
        onLer={(codigo) => void adicionarPorCodigo(codigo)}
        onFechar={() => setLendo(false)}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  /* Resumo da venda — US-020. */
  resumo: {
    margin: espaco.lg,
    padding: espaco.lg,
    borderRadius: raio.md,
    backgroundColor: cores.superficieAlta,
    gap: espaco.sm,
  },
  resumoTitulo: { fontSize: fonte.corpo, fontWeight: peso.pesado, color: cores.texto },
  resumoAviso: { fontSize: fonte.micro, color: cores.textoFraco },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between' },
  resumoRotulo: { fontSize: fonte.pequeno, color: cores.textoFraco },
  resumoValor: { fontSize: fonte.pequeno, color: cores.texto },
  resumoDestaque: { fontWeight: peso.pesado, color: cores.texto },
  resumoMargem: {
    fontSize: fonte.pequeno,
    fontWeight: peso.forte,
    color: cores.acento,
    marginTop: espaco.sm,
  },
  tela: { flex: 1, backgroundColor: cores.fundo },

  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: espaco.lg,
  },
  titulo: { fontSize: fonte.display, fontWeight: peso.pesado, color: cores.texto },
  subtitulo: { fontSize: fonte.pequeno, color: cores.textoFraco },

  lista: {
    paddingHorizontal: espaco.lg,
    gap: espaco.sm,
    paddingBottom: espaco.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    padding: espaco.md,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
  },
  itemInfo: { flex: 1, gap: 2 },
  itemNome: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
  itemUnitario: { fontSize: fonte.micro, color: cores.textoFraco },

  contador: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  contadorBotao: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
  },
  contadorSinal: { fontSize: 20, color: cores.texto },
  contadorValor: {
    minWidth: 26,
    textAlign: 'center',
    fontSize: fonte.medio,
    fontWeight: peso.forte,
    color: cores.texto,
  },
  itemSubtotal: {
    minWidth: 72,
    textAlign: 'right',
    fontSize: fonte.corpo,
    fontWeight: peso.forte,
    color: cores.texto,
  },

  rodape: {
    padding: espaco.lg,
    gap: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  formas: { flexDirection: 'row', gap: espaco.sm },
  forma: {
    flex: 1,
    paddingVertical: espaco.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
  },
  formaAtiva: { backgroundColor: cores.sucessoFundo, borderColor: cores.acento },
  formaTexto: { fontSize: fonte.pequeno, color: cores.textoFraco },
  formaTextoAtivo: { color: cores.acento, fontWeight: peso.forte },

  totalLinha: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalRotulo: { fontSize: fonte.corpo, color: cores.textoFraco },
  totalValor: { fontSize: 30, fontWeight: peso.pesado, color: cores.texto },

  acoes: { flexDirection: 'row', gap: espaco.sm },
  acaoPrincipal: { flex: 1 },
})

/**
 * O resumo da venda fechada — US-020, RF-040 a RF-042.
 *
 * Bruto, custo, imposto, tarifa, liquido e margem. Todos vem do SERVIDOR: o
 * imposto usa a aliquota da empresa e a tarifa usa a tabela do cadastro.
 * Recalcular aqui daria dois numeros para a mesma venda, e o que o lojista
 * veria dependeria de qual tela ele abriu.
 *
 * Fica na tela ate ele dispensar. Um alerta que se fecha sozinho nao cumpre
 * "quero ver quanto sobra" — ninguem le liquido de passagem.
 */
function ResumoDaVenda({ venda, onFechar }: { venda: VendaRegistrada; onFechar: () => void }) {
  const margem = margemEmPontos(venda)

  return (
    <View style={estilos.resumo}>
      <Text style={estilos.resumoTitulo}>
        {venda.reenvio ? `Venda ${venda.numero} — já registrada` : `Venda ${venda.numero}`}
      </Text>

      {venda.reenvio ? (
        <Text style={estilos.resumoAviso}>Esta venda já tinha entrado. Nada foi duplicado.</Text>
      ) : null}

      <LinhaResumo rotulo="Bruto" centavos={venda.brutoCentavos} />
      <LinhaResumo rotulo="Custo" centavos={venda.custoCentavos} />
      <LinhaResumo rotulo="Imposto" centavos={venda.impostoCentavos} />
      <LinhaResumo rotulo="Tarifa de cartão" centavos={venda.tarifaCentavos} />
      <LinhaResumo rotulo="Líquido" centavos={venda.liquidoCentavos} destaque />

      <Text style={estilos.resumoMargem}>
        {/* Ponto e virgula na margem: 12,4% e 12,6% sao diferentes na conta do
            mes, e arredondar para inteiro apagaria isso. */}
        Margem: {margem === null ? '—' : `${margem.toString().replace('.', ',')}%`}
      </Text>

      {venda.trocoCentavos > 0 ? (
        <LinhaResumo rotulo="Troco" centavos={venda.trocoCentavos} destaque />
      ) : null}

      <Botao variante="secundario" onPress={onFechar} largura>
        Nova venda
      </Botao>
    </View>
  )
}

function LinhaResumo({
  rotulo,
  centavos,
  destaque = false,
}: {
  rotulo: string
  centavos: number
  destaque?: boolean
}) {
  return (
    <View style={estilos.resumoLinha}>
      <Text style={[estilos.resumoRotulo, destaque && estilos.resumoDestaque]}>{rotulo}</Text>
      <Text style={[estilos.resumoValor, destaque && estilos.resumoDestaque]}>
        {formatMoney(centavos / 100)}
      </Text>
    </View>
  )
}
