import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Cabecalho from '@/components/Cabecalho'
import Botao from '@/components/ui/Botao'
import Campo from '@/components/ui/Campo'
import { salvarProduto } from '@/lib/produtos-api'
import { cores, espaco, fonte, peso } from '@/theme/tokens'

/**
 * Cadastro de produto no balcao — NR-070, RF-017, RF-019.
 *
 * Chega aqui de dois jeitos: pelo leitor, quando o codigo bipado nao existe na
 * loja (o `ean` vem na rota), ou a mao.
 *
 * **Curto de proposito.** O cadastro completo — fornecedor, categoria, NCM,
 * imagem — fica no web, onde ha teclado e tempo. Aqui e o minimo para o produto
 * entrar e poder ser vendido, porque quem esta cadastrando pelo celular tem
 * cliente esperando: descricao, preco de venda e custo.
 *
 * O estoque minimo entra com zero. Quem quiser alerta de reposicao configura no
 * web depois — pedir isso agora seria mais um campo entre a pessoa e a venda.
 *
 * ## A consequencia fiscal, dita em voz alta
 *
 * Produto cadastrado por aqui nasce SEM NCM, CFOP e CST/CSOSN (NR-042). Ele
 * vende normalmente, e a nota fiscal dele nao sai ate alguem completar a
 * classificacao no web — a emissao recusa antes de transmitir e diz qual
 * produto falta (RF-046).
 *
 * E a troca certa para o balcao com cliente esperando: a venda acontece, e o
 * que falta e um dado que so o contador costuma saber. Pedir tres codigos
 * fiscais aqui seria trocar uma venda perdida por uma nota adiada.
 */
export default function ProdutoNovoScreen() {
  const router = useRouter()
  /* Vem do leitor quando o codigo bipado nao esta cadastrado. */
  const { ean } = useLocalSearchParams<{ ean?: string }>()

  const [descricao, setDescricao] = useState('')
  const [precoVenda, setPrecoVenda] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    const venda = paraNumero(precoVenda)
    const custo = paraNumero(precoCusto)

    if (descricao.trim().length < 2) {
      setErro('Descreva o produto para poder cadastrar.')
      return
    }
    if (venda === null || venda <= 0) {
      setErro('Informe o preço de venda.')
      return
    }

    setErro(null)
    setSalvando(true)

    const r = await salvarProduto({
      codigo: '',
      descricao: descricao.trim(),
      ean: ean ?? '',
      ncm: '',
      categoria: '',
      fornecedor: '',
      precoVenda: venda,
      /* Custo em branco vira zero: o lojista nem sempre sabe na hora, e travar
         o cadastro por isso e travar a venda. A margem sai errada ate alguem
         preencher, e isso e melhor que produto nao cadastrado. */
      precoCusto: custo ?? 0,
      estoque: 0,
      estoqueMinimo: 0,
      imagem: null,
    })

    setSalvando(false)

    if (!r.ok) {
      setErro(r.error)
      return
    }

    Alert.alert('Produto cadastrado', descricao.trim(), [
      { text: 'OK', onPress: () => router.back() },
    ])
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho titulo="Novo produto" subtitulo={ean ? `Código ${ean}` : 'Cadastro rápido'} />

      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          {erro !== null ? <Text style={estilos.erro}>{erro}</Text> : null}

          <Campo
            rotulo="Descrição"
            valor={descricao}
            onChange={setDescricao}
            placeholder="Café torrado 500g"
          />

          <Campo
            rotulo="Preço de venda"
            valor={precoVenda}
            onChange={setPrecoVenda}
            placeholder="19,90"
            tipoTeclado="decimal-pad"
          />

          <Campo
            rotulo="Preço de custo"
            valor={precoCusto}
            onChange={setPrecoCusto}
            placeholder="12,00"
            tipoTeclado="decimal-pad"
          />

          <View style={estilos.acoes}>
            <Botao onPress={() => void salvar()} carregando={salvando} largura>
              {salvando ? 'Salvando...' : 'Cadastrar'}
            </Botao>
          </View>

          <Text style={estilos.nota}>
            Fornecedor, categoria e foto ficam no computador. Aqui é o básico para o produto já
            poder ser vendido.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/**
 * Aceita virgula e ponto.
 *
 * No teclado decimal do celular brasileiro sai virgula; quem digita rapido as
 * vezes usa ponto. Recusar um dos dois seria transformar habito em erro.
 */
function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, '').replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: espaco.xxl },
  acoes: { marginTop: espaco.sm },
  erro: {
    color: cores.erro,
    fontSize: fonte.pequeno,
    fontWeight: peso.forte,
  },
  nota: {
    marginTop: espaco.md,
    color: cores.textoFraco,
    fontSize: fonte.micro,
  },
})
