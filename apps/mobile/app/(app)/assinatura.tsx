import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { formatDate, formatMoney } from '@/lib/format'
import Cabecalho from '@/components/Cabecalho'
import Sanfona from '@/components/ui/Sanfona'
import { Etiqueta } from '@/components/ui/Cartao'
import { cores, espaco, fonte, peso, raio } from '@/theme/tokens'

type Fatura = {
  id: string
  competencia: string
  vencimento: string
  valor: number
  status: 'pago' | 'aberto' | 'vencido'
}

/** SUBSTITUIR POR: GET /billing/invoices */
const FATURAS: Fatura[] = [
  { id: 'f-4', competencia: 'Agosto/2026', vencimento: '2026-09-10', valor: 149, status: 'aberto' },
  { id: 'f-3', competencia: 'Julho/2026', vencimento: '2026-07-10', valor: 149, status: 'pago' },
  { id: 'f-2', competencia: 'Junho/2026', vencimento: '2026-06-10', valor: 149, status: 'pago' },
  { id: 'f-1', competencia: 'Maio/2026', vencimento: '2026-05-10', valor: 149, status: 'pago' },
]

/**
 * Assinatura.
 *
 * Consulta do plano e das faturas. O pagamento em si fica no site: cobrar
 * dentro do app iOS esbarra na regra de compra dentro do aplicativo da
 * Apple, que exige o sistema de pagamento dela para produto digital. Isso
 * precisa de decisao de produto antes de existir aqui.
 */
export default function Assinatura() {
  const emAberto = FATURAS.filter((f) => f.status !== 'pago')
  const total = emAberto.reduce((a, f) => a + f.valor, 0)

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho titulo="Assinatura" subtitulo="Plano único · R$ 149/mês" />

      <ScrollView contentContainerStyle={estilos.conteudo}>
        <View style={estilos.situacao}>
          <View style={estilos.situacaoTopo}>
            <Text style={estilos.situacaoRotulo}>Situação</Text>
            <Etiqueta tom={emAberto.length > 0 ? 'atencao' : 'sucesso'}>
              {emAberto.length > 0 ? 'Fatura em aberto' : 'Em dia'}
            </Etiqueta>
          </View>
          <Text style={estilos.situacaoValor}>{formatMoney(total)}</Text>
          <Text style={estilos.situacaoApoio}>
            {emAberto.length > 0
              ? `${emAberto.length} fatura(s) aguardando pagamento`
              : 'Nenhuma fatura pendente'}
          </Text>
        </View>

        <View style={estilos.aviso}>
          <Text style={estilos.avisoTitulo}>Pagamento pelo site</Text>
          <Text style={estilos.avisoTexto}>
            O pagamento da mensalidade é feito no site. Cobrar assinatura dentro do app na App Store
            exige o sistema de pagamento da Apple — é uma decisão de produto que ainda não foi
            tomada.
          </Text>
        </View>

        <Sanfona titulo="Faturas" resumo={`${FATURAS.length} no histórico`} inicialAberta>
          {FATURAS.map((f) => (
            <View key={f.id} style={estilos.fatura}>
              <View style={estilos.faturaInfo}>
                <Text style={estilos.faturaNome}>{f.competencia}</Text>
                <Text style={estilos.faturaApoio}>vence {formatDate(f.vencimento)}</Text>
              </View>

              <Etiqueta
                tom={f.status === 'pago' ? 'sucesso' : f.status === 'vencido' ? 'erro' : 'atencao'}
              >
                {f.status === 'pago' ? 'Pago' : f.status === 'vencido' ? 'Vencido' : 'Em aberto'}
              </Etiqueta>

              <Text style={estilos.faturaValor}>{formatMoney(f.valor)}</Text>
            </View>
          ))}
        </Sanfona>

        <Sanfona titulo="O que o plano inclui" resumo="todos os módulos">
          {[
            'Todos os módulos: vendas, financeiro, estoque e fiscal',
            'Assistente em linguagem natural, sem limite',
            'Emissão ilimitada de NFC-e e NFS-e',
            'Conciliação bancária automática',
            'Usuários ilimitados por empresa',
            'Suporte humano em horário comercial',
          ].map((item) => (
            <View key={item} style={estilos.beneficio}>
              <Text style={estilos.beneficioMarca}>✓</Text>
              <Text style={estilos.beneficioTexto}>{item}</Text>
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

  situacao: {
    padding: espaco.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
    gap: espaco.xs,
  },
  situacaoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  situacaoRotulo: { fontSize: fonte.micro, color: cores.textoFraco },
  situacaoValor: { fontSize: 30, fontWeight: peso.pesado, color: cores.texto },
  situacaoApoio: { fontSize: fonte.micro, color: cores.textoFraco },

  aviso: {
    padding: espaco.lg,
    borderWidth: 1,
    borderColor: cores.atencao,
    borderRadius: raio.md,
    backgroundColor: cores.atencaoFundo,
    gap: espaco.xs,
  },
  avisoTitulo: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.atencao },
  avisoTexto: { fontSize: fonte.micro, lineHeight: 19, color: cores.textoFraco },

  fatura: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  faturaInfo: { flex: 1, gap: 1 },
  faturaNome: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
  faturaApoio: { fontSize: fonte.micro, color: cores.textoFraco },
  faturaValor: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },

  beneficio: { flexDirection: 'row', gap: espaco.sm, alignItems: 'flex-start' },
  beneficioMarca: { fontSize: fonte.pequeno, color: cores.acento, fontWeight: peso.pesado },
  beneficioTexto: { flex: 1, fontSize: fonte.micro, lineHeight: 19, color: cores.texto },
})
