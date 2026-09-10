import { useMemo, useState } from 'react'
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Cabecalho from '@/components/Cabecalho'
import { clientes } from '@/lib/mock-data'
import { pendenciaTotal, temVencido } from '@/lib/clientes-api'
import { daysUntil, formatDate, formatMoney } from '@/lib/format'
import type { Cliente } from '@/lib/types'
import { Etiqueta, Vazio } from '@/components/ui/Cartao'
import Botao from '@/components/ui/Botao'
import { cores, espaco, fonte, peso, raio } from '@/theme/tokens'

/** Sem comprar ha mais que isto = cliente inativo. */
const INATIVO_APOS_DIAS = 60

/**
 * Consulta rapida de clientes.
 *
 * Somente leitura de proposito: cadastro completo e edicao ficam no web.
 * O que se precisa no balcao e responder "quem e essa pessoa e ela deve
 * alguma coisa?" — e conseguir ligar ou mandar mensagem na hora.
 */
export default function Clientes() {
  const [busca, setBusca] = useState('')
  const [soPendencia, setSoPendencia] = useState(false)

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')

    return clientes.filter((c) => {
      if (soPendencia && pendenciaTotal(c.id) <= 0) return false
      if (!termo) return true

      /* Compara documento so por digitos: quem digita sem pontuacao
         precisa achar o cliente cadastrado com pontuacao. */
      return (
        c.nome.toLowerCase().includes(termo) ||
        (digitos.length > 0 && c.documento.replace(/\D/g, '').includes(digitos))
      )
    })
  }, [busca, soPendencia])

  const comPendencia = clientes.filter((c) => pendenciaTotal(c.id) > 0).length

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho
        titulo="Clientes"
        subtitulo={`${clientes.length} cadastrados · ${comPendencia} com pendência`}
      />

      <View style={estilos.barra}>
        <TextInput
          style={estilos.busca}
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por nome ou CPF/CNPJ"
          placeholderTextColor={cores.textoFraco}
          accessibilityLabel="Buscar cliente"
        />
      </View>

      <View style={estilos.filtros}>
        <Pressable
          onPress={() => setSoPendencia(false)}
          style={[estilos.chip, !soPendencia && estilos.chipAtivo]}
        >
          <Text style={[estilos.chipTexto, !soPendencia && estilos.chipTextoAtivo]}>Todos</Text>
        </Pressable>
        <Pressable
          onPress={() => setSoPendencia(true)}
          style={[estilos.chip, soPendencia && estilos.chipAtivo]}
        >
          <Text style={[estilos.chipTexto, soPendencia && estilos.chipTextoAtivo]}>
            Com pendência
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={lista}
        keyExtractor={(c) => c.id}
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => <LinhaCliente cliente={item} />}
        ListEmptyComponent={
          <Vazio
            titulo="Nenhum cliente encontrado"
            descricao="Tente outro termo ou limpe o filtro."
            acao={
              <Botao
                variante="secundario"
                onPress={() => {
                  setBusca('')
                  setSoPendencia(false)
                }}
              >
                Limpar
              </Botao>
            }
          />
        }
      />
    </SafeAreaView>
  )
}

function LinhaCliente({ cliente }: { cliente: Cliente }) {
  const pendente = pendenciaTotal(cliente.id)
  const vencido = temVencido(cliente.id)
  const inativo =
    cliente.ultimaCompra && Math.abs(daysUntil(cliente.ultimaCompra)) > INATIVO_APOS_DIAS

  const numero = `55${cliente.ddd}${cliente.celular.replace(/\D/g, '')}`

  return (
    <View style={estilos.cliente}>
      <View style={estilos.clienteTopo}>
        <View style={estilos.avatar}>
          <Text style={estilos.avatarTexto}>{cliente.nome.slice(0, 2).toUpperCase()}</Text>
        </View>

        <View style={estilos.clienteInfo}>
          <Text style={estilos.clienteNome} numberOfLines={1}>
            {cliente.nome}
          </Text>
          <Text style={estilos.clienteDoc}>{cliente.documento}</Text>
        </View>

        {pendente > 0 ? (
          <Etiqueta tom={vencido ? 'atencao' : 'neutro'}>{formatMoney(pendente)}</Etiqueta>
        ) : (
          <Etiqueta tom="sucesso">Em dia</Etiqueta>
        )}
      </View>

      <View style={estilos.clienteRodape}>
        <Text style={estilos.clienteUltima}>
          {cliente.ultimaCompra
            ? `Última compra ${formatDate(cliente.ultimaCompra)}`
            : 'Nunca comprou'}
          {inativo ? ' · sumiu' : ''}
        </Text>

        {/* Abrir o WhatsApp direto: no balcao, cobrar ou avisar acontece
            na hora, nao depois. */}
        <Pressable
          onPress={() => Linking.openURL(`https://wa.me/${numero}`)}
          style={estilos.acao}
          accessibilityRole="button"
          accessibilityLabel={`Enviar WhatsApp para ${cliente.nome}`}
        >
          <Text style={estilos.acaoTexto}>WhatsApp</Text>
        </Pressable>
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },

  cabecalho: { paddingHorizontal: espaco.lg, paddingTop: espaco.md, gap: 2 },
  titulo: { fontSize: fonte.display, fontWeight: peso.pesado, color: cores.texto },
  subtitulo: { fontSize: fonte.pequeno, color: cores.textoFraco },

  barra: { padding: espaco.lg, paddingBottom: espaco.sm },
  busca: {
    minHeight: 48,
    paddingHorizontal: espaco.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.pill,
    backgroundColor: cores.campo,
    color: cores.texto,
    fontSize: fonte.corpo,
  },

  filtros: { flexDirection: 'row', gap: espaco.sm, paddingHorizontal: espaco.lg },
  chip: {
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.sm,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.pill,
  },
  chipAtivo: { backgroundColor: cores.sucessoFundo, borderColor: cores.acento },
  chipTexto: { fontSize: fonte.pequeno, color: cores.textoFraco },
  chipTextoAtivo: { color: cores.acento, fontWeight: peso.forte },

  lista: { padding: espaco.lg, gap: espaco.sm },
  cliente: {
    gap: espaco.md,
    padding: espaco.lg,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
  },
  clienteTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.primaria,
  },
  avatarTexto: { fontSize: fonte.pequeno, fontWeight: peso.forte, color: cores.texto },
  clienteInfo: { flex: 1, gap: 2 },
  clienteNome: { fontSize: fonte.corpo, fontWeight: peso.forte, color: cores.texto },
  clienteDoc: { fontSize: fonte.micro, color: cores.textoFraco },

  clienteRodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    paddingTop: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  clienteUltima: { flex: 1, fontSize: fonte.micro, color: cores.textoFraco },
  acao: {
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.sm,
    borderRadius: raio.pill,
    backgroundColor: cores.sucessoFundo,
  },
  acaoTexto: { fontSize: fonte.micro, fontWeight: peso.forte, color: cores.acento },
})
