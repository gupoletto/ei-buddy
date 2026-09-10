import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { gerarContasDeCustosFixos, listarCustosFixos, listarPlanos } from '@/lib/financeiro-api'
import { formatMoney } from '@/lib/format'
import Cabecalho from '@/components/Cabecalho'
import Sanfona from '@/components/ui/Sanfona'
import Botao from '@/components/ui/Botao'
import { Etiqueta } from '@/components/ui/Cartao'
import { cores, espaco, fonte, peso } from '@/theme/tokens'

/**
 * Plano de contas e custos fixos.
 *
 * Consulta e a acao de gerar as contas do mes. Criar e editar plano
 * ficam no web — sao cadastros feitos uma vez, com calma.
 */
export default function PlanoDeContas() {
  const [planos] = useState(() => listarPlanos())
  const [custos] = useState(() => listarCustosFixos())
  const [gerando, setGerando] = useState(false)

  const totalFixos = custos.reduce((a, c) => a + c.valor, 0)
  const gastoMes = planos.filter((p) => p.tipo === 'despesa').reduce((a, p) => a + p.gastoMes, 0)

  async function gerar() {
    setGerando(true)
    /* SUBSTITUIR POR: POST /financeiro/custos-fixos/gerar — o servidor
       precisa ser idempotente por (custo fixo, competencia). */
    const r = await gerarContasDeCustosFixos(custos, '2026-08')
    setGerando(false)

    Alert.alert(
      'Contas geradas',
      r.jaExistiam > 0
        ? `${r.geradas} gerada(s). ${r.jaExistiam} já existiam neste mês e foram puladas.`
        : `${r.geradas} conta(s) a pagar gerada(s) para agosto.`,
    )
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho titulo="Plano de contas" subtitulo={`${formatMoney(gastoMes)} de gasto no mês`} />

      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Sanfona
          titulo="Custos fixos"
          resumo={`${custos.length} · ${formatMoney(totalFixos)} por mês`}
          inicialAberta
        >
          {custos.map((c) => (
            <View key={c.id} style={estilos.linha}>
              <View style={estilos.dia}>
                <Text style={estilos.diaTexto}>{c.diaVencimento}</Text>
              </View>
              <View style={estilos.linhaInfo}>
                <Text style={estilos.linhaNome} numberOfLines={1}>
                  {c.nome}
                </Text>
                <Text style={estilos.linhaApoio} numberOfLines={1}>
                  {c.planoContasNome} · {c.bancoNome}
                </Text>
              </View>
              <Text style={estilos.linhaValor}>{formatMoney(c.valor)}</Text>
            </View>
          ))}

          <Botao onPress={gerar} carregando={gerando} largura>
            {gerando ? 'Gerando...' : 'Gerar contas a pagar do mês'}
          </Botao>
        </Sanfona>

        <Sanfona titulo="Planos de conta" resumo={`${planos.length} cadastrados`}>
          {planos.map((p) => (
            <View key={p.id} style={estilos.linha}>
              <View style={estilos.linhaInfo}>
                <Text style={estilos.linhaNome}>{p.nome}</Text>
              </View>
              <Etiqueta tom={p.tipo === 'receita' ? 'sucesso' : 'neutro'}>
                {p.tipo === 'receita' ? 'Receita' : 'Despesa'}
              </Etiqueta>
              <Text style={estilos.linhaValor}>{formatMoney(p.gastoMes)}</Text>
            </View>
          ))}
        </Sanfona>
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: espaco.xxl },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  dia: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.campo,
  },
  diaTexto: { fontSize: fonte.micro, fontWeight: peso.forte, color: cores.acento },
  linhaInfo: { flex: 1, gap: 1 },
  linhaNome: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
  linhaApoio: { fontSize: fonte.micro, color: cores.textoFraco },
  linhaValor: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
})
