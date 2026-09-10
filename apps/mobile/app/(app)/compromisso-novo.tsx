import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Cabecalho from '@/components/Cabecalho'
import Botao from '@/components/ui/Botao'
import Campo from '@/components/ui/Campo'
import { hojeLocal, marcarCompromisso } from '@/lib/agenda-api'
import { cores, espaco, fonte, peso } from '@/theme/tokens'

/**
 * Marcar compromisso — NR-078, US-043, RF-089 e RF-091.
 *
 * Titulo, dia, hora e lembrete. Sem vinculo a cliente: escolher cliente exige
 * uma busca que a api ainda nao expoe (a mesma falta que impede o fiado no
 * PDV), e um seletor alimentado pelo mock mandaria um id que o servidor nao
 * conhece.
 */
export default function CompromissoNovoScreen() {
  const router = useRouter()

  const [titulo, setTitulo] = useState('')
  const [dia, setDia] = useState(hojeLocal())
  const [hora, setHora] = useState('')
  const [lembrete, setLembrete] = useState('30')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    const quando = montarInstante(dia, hora)

    if (titulo.trim().length < 2) {
      setErro('Diga do que se trata.')
      return
    }
    if (quando === null) {
      setErro('Confira o dia (AAAA-MM-DD) e a hora (HH:MM).')
      return
    }

    const minutos = lembrete.trim() === '' ? undefined : Number(lembrete)
    if (minutos !== undefined && (!Number.isInteger(minutos) || minutos < 1)) {
      setErro('O lembrete é em minutos inteiros, a partir de 1.')
      return
    }

    setErro(null)
    setSalvando(true)

    const r = await marcarCompromisso({
      titulo: titulo.trim(),
      quando,
      ...(minutos === undefined ? {} : { lembreteMinutosAntes: minutos }),
    })

    setSalvando(false)

    if (!r.ok) {
      /* A api recusa lembrete que cairia no passado, entre outras coisas. A
         mensagem dela ja explica; repetir em outras palavras so criaria duas
         versoes da mesma regra. */
      setErro(r.erro)
      return
    }

    Alert.alert('Compromisso marcado', titulo.trim(), [
      { text: 'OK', onPress: () => router.back() },
    ])
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho titulo="Novo compromisso" subtitulo="Entrega, visita, pagamento" />

      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          {erro !== null ? <Text style={estilos.erro}>{erro}</Text> : null}

          <Campo
            rotulo="O que é"
            valor={titulo}
            onChange={setTitulo}
            placeholder="Entrega da Padaria Sol"
          />

          <Campo rotulo="Dia" valor={dia} onChange={setDia} placeholder="2026-09-10" />

          <Campo
            rotulo="Hora"
            valor={hora}
            onChange={setHora}
            placeholder="14:00"
            tipoTeclado="numeric"
          />

          <Campo
            rotulo="Lembrar quantos minutos antes"
            valor={lembrete}
            onChange={setLembrete}
            dica="Deixe em branco para não lembrar."
            tipoTeclado="numeric"
          />

          <Botao onPress={() => void salvar()} carregando={salvando} largura>
            {salvando ? 'Marcando...' : 'Marcar'}
          </Botao>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/**
 * Monta o instante a partir de dia e hora LOCAIS.
 *
 * `new Date(\`${dia}T${hora}\`)` sem fuso e interpretado como local pelo
 * JavaScript — que e o que se quer aqui, porque o lojista digitou a hora do
 * relogio dele. A conversao para UTC acontece em `marcarCompromisso`, num lugar
 * so.
 *
 * Devolve `null` em vez de `Invalid Date`: comparacao com `Invalid Date` e
 * sempre falsa, e isso ja causou uma agenda vazia se passando por resposta
 * certa do outro lado do sistema.
 */
function montarInstante(dia: string, hora: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return null

  const d = new Date(`${dia}T${hora}:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: espaco.xxl },
  erro: { color: cores.erro, fontSize: fonte.pequeno, fontWeight: peso.forte },
})
