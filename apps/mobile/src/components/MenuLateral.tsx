import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import type { DrawerContentComponentProps } from 'expo-router/drawer'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { encerrarSessao } from '@/lib/session'
import { cores, espaco, fonte, peso, raio } from '@/theme/tokens'

type Item = { rota: string; rotulo: string }
type Grupo = { grupo: string; itens: Item[] }

/**
 * Modulos do app, agrupados como na sidebar do web.
 *
 * Sao doze destinos — nao cabem numa barra de abas, e uma lista corrida
 * de doze itens tambem nao ajuda ninguem. Por isso os grupos abrem e
 * fecham: quem vai ao financeiro nao precisa ver cadastro no caminho.
 */
const GRUPOS: Grupo[] = [
  {
    grupo: 'Operacao',
    itens: [
      { rota: '/inicio', rotulo: 'Tela principal' },
      { rota: '/pdv', rotulo: 'Nova venda' },
      { rota: '/vendas', rotulo: 'Vendas' },
      { rota: '/agenda', rotulo: 'Agenda' },
    ],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { rota: '/clientes', rotulo: 'Clientes' },
      { rota: '/catalogo', rotulo: 'Produtos' },
      { rota: '/empresa', rotulo: 'Empresa' },
    ],
  },
  {
    grupo: 'Financeiro',
    itens: [
      { rota: '/contas-a-pagar', rotulo: 'Contas a pagar' },
      { rota: '/contas-a-receber', rotulo: 'Contas a receber' },
      { rota: '/plano-de-contas', rotulo: 'Plano de contas' },
      { rota: '/dre', rotulo: 'Resultado' },
      { rota: '/relatorios', rotulo: 'Relatorios' },
    ],
  },
  {
    grupo: 'Mais',
    itens: [
      { rota: '/crm', rotulo: 'CRM' },
      { rota: '/assistente', rotulo: 'Assistente' },
      { rota: '/assinatura', rotulo: 'Assinatura' },
      { rota: '/suporte', rotulo: 'Suporte' },
    ],
  },
]

export default function MenuLateral(props: DrawerContentComponentProps) {
  const router = useRouter()
  const caminho = usePathname()
  const insets = useSafeAreaInsets()

  /* Abre ja no grupo onde a pessoa esta, para ela se localizar. */
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    const atual = GRUPOS.find((g) => g.itens.some((i) => caminho.endsWith(i.rota)))
    return new Set([atual?.grupo ?? 'Operacao'])
  })

  function alternarGrupo(grupo: string) {
    setAbertos((atual) => {
      const novo = new Set(atual)
      if (novo.has(grupo)) {
        novo.delete(grupo)
      } else {
        novo.add(grupo)
      }
      return novo
    })
  }

  function navegar(rota: string) {
    props.navigation.closeDrawer()
    router.push(rota as never)
  }

  async function sair() {
    await encerrarSessao()
    props.navigation.closeDrawer()
    router.replace('/login')
  }

  return (
    <View style={[estilos.menu, { paddingTop: insets.top + espaco.lg }]}>
      <View style={estilos.marca}>
        <Text style={estilos.marcaNome}>Ei Buddy</Text>
      </View>

      <ScrollView contentContainerStyle={estilos.lista}>
        {GRUPOS.map((g) => {
          const aberto = abertos.has(g.grupo)

          return (
            <View key={g.grupo} style={estilos.grupo}>
              <Pressable
                onPress={() => alternarGrupo(g.grupo)}
                style={estilos.grupoCabecalho}
                accessibilityRole="button"
                accessibilityState={{ expanded: aberto }}
              >
                <Text style={estilos.grupoTitulo}>{g.grupo}</Text>
                <Text style={[estilos.seta, aberto && estilos.setaAberta]}>⌄</Text>
              </Pressable>

              {aberto
                ? g.itens.map((i) => {
                    const ativo = caminho.endsWith(i.rota)
                    return (
                      <Pressable
                        key={i.rota}
                        onPress={() => navegar(i.rota)}
                        style={[estilos.item, ativo && estilos.itemAtivo]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: ativo }}
                      >
                        <Text style={[estilos.itemTexto, ativo && estilos.itemTextoAtivo]}>
                          {i.rotulo}
                        </Text>
                      </Pressable>
                    )
                  })
                : null}
            </View>
          )
        })}
      </ScrollView>

      <Pressable
        onPress={sair}
        style={[estilos.sair, { marginBottom: insets.bottom + espaco.md }]}
        accessibilityRole="button"
      >
        <Text style={estilos.sairTexto}>Sair</Text>
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  menu: { flex: 1, backgroundColor: '#0b1029' },

  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: espaco.lg,
    paddingBottom: espaco.lg,
  },
  marcaNome: { fontSize: fonte.medio, fontWeight: peso.pesado, color: cores.texto },

  lista: { paddingHorizontal: espaco.md, gap: espaco.sm, paddingBottom: espaco.lg },
  grupo: { gap: 2 },
  grupoCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaco.md,
    paddingVertical: espaco.md,
  },
  grupoTitulo: {
    fontSize: fonte.micro,
    fontWeight: peso.forte,
    color: cores.textoFraco,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  seta: { fontSize: 16, color: cores.textoFraco },
  setaAberta: { transform: [{ rotate: '180deg' }], color: cores.acento },

  item: {
    paddingHorizontal: espaco.md,
    paddingVertical: espaco.md,
    borderRadius: raio.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  itemAtivo: { backgroundColor: cores.sucessoFundo },
  itemTexto: { fontSize: fonte.pequeno, color: cores.textoFraco },
  itemTextoAtivo: { color: cores.acento, fontWeight: peso.forte },

  sair: {
    marginHorizontal: espaco.lg,
    paddingVertical: espaco.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.pill,
  },
  sairTexto: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.textoFraco },
})
