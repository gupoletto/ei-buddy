import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { entrar } from '@/lib/auth-api'
import { validateCredential, validateLoginPassword } from '@/lib/validation'
import Botao from '@/components/ui/Botao'
import Campo from '@/components/ui/Campo'
import { cores, espaco, fonte, peso, raio } from '@/theme/tokens'

export default function Login() {
  const router = useRouter()

  const [credencial, setCredencial] = useState('')
  const [senha, setSenha] = useState('')
  const [erroCredencial, setErroCredencial] = useState<string | null>(null)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function submeter() {
    const eCred = validateCredential(credencial)
    const eSenha = validateLoginPassword(senha)
    setErroCredencial(eCred)
    setErroSenha(eSenha)
    if (eCred || eSenha) return

    setErroGeral(null)
    setCarregando(true)

    const r = await entrar(credencial, senha)

    if (!r.ok) {
      setErroGeral(r.erro)
      setCarregando(false)
      return
    }

    /* `entrar` ja guardou a sessao e o token — inclusive a escolha de loja,
       que precisa do token da primeira resposta para ser autenticada. Chamar
       `abrirSessao` aqui de novo sobrescreveria com dados incompletos. */
    /* replace e nao push: voltar do app para o login nao faz sentido. */
    router.replace('/inicio')
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'bottom']}>
      {/* No iOS o teclado cobre o campo de senha sem isto. */}
      <KeyboardAvoidingView
        style={estilos.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <Text style={estilos.marcaNome}>Ei Buddy</Text>
          </View>

          <View style={estilos.cabecalho}>
            <Text style={estilos.titulo}>Entrar</Text>
            <Text style={estilos.subtitulo}>Acesse o balcao do seu negocio.</Text>
          </View>

          {erroGeral ? (
            <View style={estilos.alerta} accessibilityRole="alert">
              <Text style={estilos.alertaTexto}>{erroGeral}</Text>
            </View>
          ) : null}

          <View style={estilos.campos}>
            <Campo
              rotulo="E-mail ou telefone"
              valor={credencial}
              onChange={(v) => {
                setCredencial(v)
                if (erroCredencial) setErroCredencial(validateCredential(v))
              }}
              erro={erroCredencial}
              placeholder="voce@empresa.com.br"
              tipoTeclado="email-address"
              autoCap="none"
              editavel={!carregando}
            />

            <Campo
              rotulo="Senha"
              valor={senha}
              onChange={(v) => {
                setSenha(v)
                if (erroSenha) setErroSenha(validateLoginPassword(v))
              }}
              erro={erroSenha}
              senha
              autoCap="none"
              editavel={!carregando}
            />
          </View>

          <Botao onPress={submeter} carregando={carregando} largura>
            {carregando ? 'Entrando...' : 'Entrar'}
          </Botao>

          {/* --------------------------------------------------------------
              APOIO A DEMONSTRACAO — remover ao ligar o backend.
             -------------------------------------------------------------- */}
          <View style={estilos.demo}>
            <Text style={estilos.demoTitulo}>Modo demonstracao</Text>
            <Text style={estilos.demoTexto}>Qualquer e-mail com senha de 6+ caracteres entra.</Text>
          </View>

          <Text style={estilos.rodape}>
            Criar conta e gerenciar assinatura ficam no site — este app e o balcao.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: espaco.xl,
    gap: espaco.xl,
  },

  marca: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  marcaNome: {
    fontSize: fonte.titulo,
    fontWeight: peso.pesado,
    color: cores.texto,
  },

  cabecalho: { gap: espaco.sm },
  titulo: {
    fontSize: fonte.display,
    fontWeight: peso.pesado,
    color: cores.texto,
  },
  subtitulo: { fontSize: fonte.corpo, color: cores.textoFraco },

  alerta: {
    padding: espaco.lg,
    borderWidth: 1,
    borderColor: cores.erro,
    borderRadius: raio.sm,
    backgroundColor: cores.erroFundo,
  },
  alertaTexto: { fontSize: fonte.pequeno, color: cores.erro },

  campos: { gap: espaco.lg },

  demo: {
    padding: espaco.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: cores.borda,
    borderRadius: raio.sm,
    gap: espaco.xs,
  },
  demoTitulo: {
    fontSize: fonte.micro,
    fontWeight: peso.forte,
    color: cores.textoFraco,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  demoTexto: { fontSize: fonte.pequeno, color: cores.textoFraco },

  rodape: {
    fontSize: fonte.micro,
    color: cores.textoFraco,
    textAlign: 'center',
    lineHeight: 18,
  },
})
