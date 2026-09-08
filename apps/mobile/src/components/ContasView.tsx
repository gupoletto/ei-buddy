import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  BAIXA_SO_NO_WEB,
  ESTORNO_SO_NO_WEB,
  listarContasPagar,
  listarContasReceber,
  situacaoDoTitulo,
  ROTULO_SITUACAO,
  type Titulo,
} from '@/lib/financeiro-api'
import { daysUntil, describeDueDate, formatDate, formatMoney } from '@/lib/format'
import Cabecalho from '@/components/Cabecalho'
import Sanfona from '@/components/ui/Sanfona'
import { Etiqueta, Vazio } from '@/components/ui/Cartao'
import { cores, espaco, fonte, peso, raio } from '@/theme/tokens'

/**
 * Forma comum entre conta a pagar e a receber — vem pronta de `financeiro-api`.
 *
 * As duas telas sao a mesma estrutura com a contraparte trocada, e o mapeamento
 * mora num lugar so: fazer aqui obrigaria esta tela a conhecer o formato das
 * DUAS respostas da api, e a divergir da proxima tela que ler as mesmas listas.
 */
type Linha = Titulo

/**
 * Contas a pagar / a receber.
 *
 * As duas telas sao a mesma estrutura — muda a contraparte e o verbo —
 * entao compartilham este componente, como no web.
 *
 * Agrupado em sanfonas por situacao: no celular, uma lista corrida de
 * titulos mistura o que vence hoje com o que ja foi pago. Vencidos ficam
 * abertos por padrao, que e o que exige acao.
 */
export default function ContasView({ tipo }: { tipo: 'pagar' | 'receber' }) {
  const pagar = tipo === 'pagar'

  /*
   * Comeca VAZIO e busca no servidor.
   *
   * A tela lia `lib/mock-data`: as mesmas contas de exemplo para qualquer
   * loja, com o total no cabecalho somando dinheiro que nao existia. O lojista
   * abria "Contas a pagar" e via o vencimento de outra empresa.
   */
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)

  const buscar = useCallback(async () => {
    const r = await (pagar ? listarContasPagar() : listarContasReceber())
    setCarregando(false)
    setAtualizando(false)

    if (!r.ok) {
      setErro(r.message)
      return
    }

    setErro(null)
    setLinhas(r.dados.titulos)
  }, [pagar])

  useEffect(() => {
    /* `async` explicito: os `setState` vem todos depois do await, nunca
       sincronos no corpo do efeito. */
    void (async () => {
      await buscar()
    })()
  }, [buscar])

  const grupos = useMemo(() => {
    const abertos = linhas.filter((l) => l.status !== 'pago')
    return {
      vencidos: abertos.filter((l) => daysUntil(l.vencimento) < 0),
      aVencer: abertos.filter((l) => daysUntil(l.vencimento) >= 0),
      quitados: linhas.filter((l) => l.status === 'pago'),
    }
  }, [linhas])

  const soma = (lista: Linha[]) => lista.reduce((a, l) => a + (l.valor - l.baixado), 0)

  /*
   * A baixa e o estorno DIZEM que ainda nao acontecem aqui, em vez de fingir.
   *
   * Antes o botao chamava um `delay(800)` e respondia "baixado": o lojista
   * confirmava, a linha ficava verde, e o saldo continuava o mesmo no dia
   * seguinte. Um botao que nao faz nada e ruim; um que diz ter feito e pior,
   * porque a pessoa para de cobrar.
   *
   * O motivo esta em `financeiro-api`: as duas rotas exigem uma escolha — de
   * qual conta saiu, ou como o dinheiro entrou — que um `Alert` nao tem onde
   * oferecer.
   */
  function pedirBaixa(linha: Linha) {
    Alert.alert(pagar ? 'Baixar pagamento' : 'Baixar recebimento', BAIXA_SO_NO_WEB, [
      { text: 'Entendi' },
    ])
    void linha
  }

  function pedirEstorno(linha: Linha) {
    Alert.alert('Estornar baixa', ESTORNO_SO_NO_WEB, [{ text: 'Entendi' }])
    void linha
  }

  const totalAberto = soma([...grupos.vencidos, ...grupos.aVencer])

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho
        titulo={pagar ? 'Contas a pagar' : 'Contas a receber'}
        subtitulo={`${formatMoney(totalAberto)} em aberto`}
      />

      <ScrollView
        contentContainerStyle={estilos.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true)
              void buscar()
            }}
          />
        }
      >
        {carregando ? (
          <Vazio titulo="Carregando" descricao="Buscando os titulos da loja." />
        ) : erro !== null ? (
          <Vazio
            titulo="Nao foi possivel carregar"
            /* Puxar para atualizar continua valendo: no balcao o sinal cai, e
               o caminho de tentar de novo tem de estar a mao. */
            descricao={`${erro} Puxe para baixo para tentar de novo.`}
          />
        ) : linhas.length === 0 ? (
          <Vazio
            titulo={pagar ? 'Nenhuma conta a pagar' : 'Nenhuma conta a receber'}
            descricao="Lancamentos aparecem aqui conforme forem criados."
          />
        ) : (
          <>
            <Sanfona
              titulo="Vencidos"
              resumo={
                grupos.vencidos.length
                  ? `${grupos.vencidos.length} · ${formatMoney(soma(grupos.vencidos))}`
                  : 'nada em atraso'
              }
              etiqueta={
                grupos.vencidos.length > 0 ? (
                  <Etiqueta tom="atencao">{grupos.vencidos.length}</Etiqueta>
                ) : undefined
              }
              /* Abre sozinho: e o grupo que pede acao. */
              inicialAberta={grupos.vencidos.length > 0}
            >
              {grupos.vencidos.length === 0 ? (
                <Text style={estilos.vazioTexto}>Nada em atraso.</Text>
              ) : (
                grupos.vencidos.map((l) => (
                  <LinhaTitulo
                    key={l.id}
                    linha={l}
                    onBaixar={() => pedirBaixa(l)}
                    onEstornar={() => pedirEstorno(l)}
                  />
                ))
              )}
            </Sanfona>

            <Sanfona
              titulo="A vencer"
              resumo={`${grupos.aVencer.length} · ${formatMoney(soma(grupos.aVencer))}`}
              inicialAberta={grupos.vencidos.length === 0}
            >
              {grupos.aVencer.length === 0 ? (
                <Text style={estilos.vazioTexto}>Nada a vencer.</Text>
              ) : (
                grupos.aVencer.map((l) => (
                  <LinhaTitulo
                    key={l.id}
                    linha={l}
                    onBaixar={() => pedirBaixa(l)}
                    onEstornar={() => pedirEstorno(l)}
                  />
                ))
              )}
            </Sanfona>

            <Sanfona
              titulo={pagar ? 'Pagos' : 'Recebidos'}
              resumo={`${grupos.quitados.length} titulo(s)`}
            >
              {grupos.quitados.length === 0 ? (
                <Text style={estilos.vazioTexto}>Nada baixado ainda.</Text>
              ) : (
                grupos.quitados.map((l) => (
                  <LinhaTitulo
                    key={l.id}
                    linha={l}
                    onBaixar={() => pedirBaixa(l)}
                    onEstornar={() => pedirEstorno(l)}
                  />
                ))
              )}
            </Sanfona>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function LinhaTitulo({
  linha,
  onBaixar,
  onEstornar,
}: {
  linha: Linha
  onBaixar: () => void
  onEstornar: () => void
}) {
  const saldo = linha.valor - linha.baixado
  const quitado = linha.status === 'pago'
  const situacao = situacaoDoTitulo(linha.status, linha.vencimento, daysUntil(linha.vencimento))

  const tom =
    situacao === 'vencido'
      ? 'erro'
      : situacao === 'aVencer'
        ? 'atencao'
        : situacao === 'quitado'
          ? 'sucesso'
          : 'neutro'

  return (
    <View style={estilos.titulo}>
      <View style={estilos.tituloTopo}>
        <View style={estilos.tituloInfo}>
          <Text style={estilos.tituloNome} numberOfLines={1}>
            {linha.contraparte}
          </Text>
          <Text style={estilos.tituloApoio} numberOfLines={1}>
            {linha.descricao}
          </Text>
        </View>
        <Text style={estilos.tituloValor}>{formatMoney(quitado ? linha.valor : saldo)}</Text>
      </View>

      <View style={estilos.tituloRodape}>
        <View style={estilos.tituloSituacao}>
          <Etiqueta tom={tom}>{ROTULO_SITUACAO[situacao]}</Etiqueta>
          <Text style={estilos.tituloData}>
            {quitado ? formatDate(linha.vencimento) : describeDueDate(linha.vencimento)}
          </Text>
        </View>

        <Pressable
          onPress={quitado || linha.baixado > 0 ? onEstornar : onBaixar}
          style={[estilos.acao, quitado && estilos.acaoSecundaria]}
          accessibilityRole="button"
        >
          <Text style={[estilos.acaoTexto, quitado && estilos.acaoTextoSecundario]}>
            {quitado || linha.baixado > 0 ? 'Estornar' : 'Baixar'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: espaco.xxl },
  vazioTexto: { fontSize: fonte.pequeno, color: cores.textoFraco },

  titulo: {
    gap: espaco.md,
    paddingVertical: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  tituloTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  tituloInfo: { flex: 1, gap: 1 },
  tituloNome: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
  tituloApoio: { fontSize: fonte.micro, color: cores.textoFraco },
  tituloValor: { fontSize: fonte.corpo, fontWeight: peso.pesado, color: cores.texto },

  tituloRodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
  },
  tituloSituacao: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  tituloData: { fontSize: fonte.micro, color: cores.textoFraco },

  acao: {
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.acento,
    minHeight: 36,
    justifyContent: 'center',
  },
  acaoSecundaria: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: cores.borda,
  },
  acaoTexto: {
    fontSize: fonte.micro,
    fontWeight: peso.forte,
    color: cores.textoSobreAcento,
  },
  acaoTextoSecundario: { color: cores.textoFraco },
})
