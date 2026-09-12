import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  carregarDre,
  carregarPlano,
  mesLocal,
  type ContaContabil,
  type Dre,
} from '@/lib/contabilidade-api'
import { formatMoney } from '@/lib/format'
import Cabecalho from '@/components/Cabecalho'
import Sanfona from '@/components/ui/Sanfona'
import { Etiqueta, Vazio } from '@/components/ui/Cartao'
import Botao from '@/components/ui/Botao'
import { cores, espaco, fonte, peso } from '@/theme/tokens'

/**
 * Plano de contas — NR-077, RF-081 a RF-086.
 *
 * A tela lia `financeiro-api.ts`: um plano de exemplo com um "gasto no mês"
 * inventado por conta, mesmo depois de o web já falar com `/contas-contabeis`
 * e `/relatorios/dre` de verdade. Agora busca as duas.
 *
 * Criar, renomear e apagar conta continuam so no web — sao cadastros feitos
 * uma vez, com calma, e a tela ja dizia isso antes de ficar real; a decisão
 * nao muda aqui.
 */
export default function PlanoDeContas() {
  const [contas, setContas] = useState<ContaContabil[]>([])
  const [dre, setDre] = useState<Dre | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    const { de, ate } = mesLocal()
    /* As duas chamadas em paralelo: sao independentes, e encadea-las somaria
       as duas latencias antes de a tela desenhar. */
    const [rPlano, rDre] = await Promise.all([carregarPlano(), carregarDre(de, ate)])

    setCarregando(false)

    if (!rPlano.ok) {
      setErro(rPlano.erro)
      return
    }

    setErro(null)
    setContas(rPlano.dados.accounts)
    /* O DRE pode falhar sem derrubar a tela: o plano — o que se veio ver — ja
       chegou. Sem ele, cada conta so perde o "no mes" ao lado do nome. */
    setDre(rDre.ok ? rDre.dados : null)
  }, [])

  useEffect(() => {
    void (async () => {
      await buscar()
    })()
  }, [buscar])

  /* O valor de cada conta no mes, pela mesma agregacao do DRE — nunca somado
     aqui de novo. Contas sem lancamento no periodo ficam de fora do mapa, e
     por isso o valor padrao e zero. */
  const porConta = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const linha of dre?.lines ?? []) {
      if (linha.accountId !== null) mapa.set(linha.accountId, linha.amountCents)
    }
    return mapa
  }, [dre])

  const gastoMes = useMemo(
    () =>
      contas
        .filter((c) => c.type === 'expense' || c.type === 'cost')
        .reduce((acc, c) => acc + (porConta.get(c.id) ?? 0), 0) / 100,
    [contas, porConta],
  )

  if (carregando) {
    return (
      <SafeAreaView style={estilos.tela} edges={['top']}>
        <Cabecalho titulo="Plano de contas" />
        <Vazio titulo="Carregando" descricao="Buscando o plano de contas." />
      </SafeAreaView>
    )
  }

  if (erro !== null) {
    return (
      <SafeAreaView style={estilos.tela} edges={['top']}>
        <Cabecalho titulo="Plano de contas" />
        <Vazio
          titulo="Não foi possível carregar"
          descricao={erro}
          acao={<Botao onPress={() => void buscar()}>Tentar de novo</Botao>}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho titulo="Plano de contas" subtitulo={`${formatMoney(gastoMes)} de gasto no mês`} />

      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Sanfona
          titulo="Custos fixos"
          resumo="ainda não disponível aqui"
          etiqueta={<Etiqueta tom="neutro">Web</Etiqueta>}
        >
          <Text style={estilos.avisoTexto}>
            Custo fixo recorrente e a geração das contas do mês já funcionam no computador
            (Financeiro → Plano de contas) — essa tela aqui ainda não tem o cadastro pronto.
          </Text>
        </Sanfona>

        <Sanfona titulo="Planos de conta" resumo={`${contas.length} cadastrados`} inicialAberta>
          {contas.length === 0 ? (
            <Vazio
              titulo="Nenhuma conta cadastrada"
              descricao="Cadastre o plano de contas pelo Ei Buddy no computador."
            />
          ) : (
            contas.map((c) => (
              <View key={c.id} style={estilos.linha}>
                <View style={estilos.linhaInfo}>
                  <Text style={estilos.linhaNome}>{c.name}</Text>
                </View>
                <Etiqueta tom={c.type === 'revenue' ? 'sucesso' : 'neutro'}>
                  {ROTULO_DO_TIPO[c.type]}
                </Etiqueta>
                <Text style={estilos.linhaValor}>
                  {formatMoney((porConta.get(c.id) ?? 0) / 100)}
                </Text>
              </View>
            ))
          )}
        </Sanfona>
      </ScrollView>
    </SafeAreaView>
  )
}

const ROTULO_DO_TIPO: Record<ContaContabil['type'], string> = {
  revenue: 'Receita',
  deduction: 'Dedução',
  cost: 'Custo',
  expense: 'Despesa',
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: espaco.xxl },

  avisoTexto: { fontSize: fonte.pequeno, color: cores.textoFraco, lineHeight: 20 },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  linhaInfo: { flex: 1, gap: 1 },
  linhaNome: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
  linhaValor: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
})
