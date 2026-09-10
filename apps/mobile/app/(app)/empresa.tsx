import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { buscarCep, salvarEmpresa } from '@/lib/empresa-api'
import { empresa as empresaMock } from '@/lib/mock-data'
import { maskCelular, maskCEP, maskCNPJ, validateCNPJ } from '@/lib/validation'
import Cabecalho from '@/components/Cabecalho'
import Sanfona from '@/components/ui/Sanfona'
import Campo from '@/components/ui/Campo'
import Botao from '@/components/ui/Botao'
import { Etiqueta } from '@/components/ui/Cartao'
import { cores, espaco, fonte } from '@/theme/tokens'

/**
 * Dados da empresa.
 *
 * Formulario longo — no web sao quatro cartoes lado a lado. Aqui cada
 * bloco e uma sanfona, senao vira uma rolagem de trinta campos.
 *
 * O certificado digital fica so no web: enviar arquivo .pfx pelo celular
 * e trabalhoso e a senha nao deveria ser digitada em teclado de toque.
 */
export default function Empresa() {
  const [campos, setCampos] = useState({
    cnpj: empresaMock.cnpj,
    razaoSocial: empresaMock.razaoSocial,
    nomeFantasia: empresaMock.nomeFantasia,
    inscricaoEstadual: empresaMock.inscricaoEstadual,
    inscricaoMunicipal: empresaMock.inscricaoMunicipal,
    ramoAtividade: empresaMock.ramoAtividade,
    cep: empresaMock.endereco.cep,
    logradouro: empresaMock.endereco.logradouro,
    numero: empresaMock.endereco.numero,
    complemento: empresaMock.endereco.complemento ?? '',
    bairro: empresaMock.endereco.bairro,
    cidade: empresaMock.endereco.cidade,
    uf: empresaMock.endereco.uf as string,
    ddd: empresaMock.ddd,
    celular: empresaMock.celular,
  })

  const [erroCnpj, setErroCnpj] = useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [salvando, setSalvando] = useState(false)

  function set<K extends keyof typeof campos>(chave: K, valor: string) {
    setCampos((c) => ({ ...c, [chave]: valor }))
  }

  async function preencherPorCep(cep: string) {
    if (cep.replace(/\D/g, '').length !== 8) return

    setBuscandoCep(true)
    /* SUBSTITUIR POR: GET /enderecos/cep/:cep */
    const r = await buscarCep(cep)
    setBuscandoCep(false)

    if (!r.ok) {
      Alert.alert('CEP', r.error)
      return
    }

    /* Numero e complemento continuam com quem preencheu — o CEP nao os
       conhece, e sobrescrever apagaria o que ja foi digitado. */
    setCampos((c) => ({
      ...c,
      logradouro: r.endereco.logradouro,
      bairro: r.endereco.bairro,
      cidade: r.endereco.cidade,
      uf: r.endereco.uf,
    }))
  }

  async function salvar() {
    const erro = validateCNPJ(campos.cnpj)
    setErroCnpj(erro)
    if (erro) {
      Alert.alert('Confira o CNPJ', erro)
      return
    }

    setSalvando(true)
    /* SUBSTITUIR POR: PUT /empresa */
    const r = await salvarEmpresa({ ...campos, conexoesHabilitadas: false } as never)
    setSalvando(false)

    Alert.alert(r.ok ? 'Salvo' : 'Não deu certo', r.ok ? 'Dados da empresa atualizados.' : r.error)
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top']}>
      <Cabecalho titulo="Empresa" subtitulo={campos.nomeFantasia} />

      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Sanfona titulo="Identificação" resumo={campos.cnpj} inicialAberta>
          <Campo
            rotulo="CNPJ"
            valor={campos.cnpj}
            onChange={(v) => {
              set('cnpj', maskCNPJ(v))
              if (erroCnpj) setErroCnpj(null)
            }}
            erro={erroCnpj}
            tipoTeclado="numeric"
          />
          <Campo
            rotulo="Razão social"
            valor={campos.razaoSocial}
            onChange={(v) => set('razaoSocial', v)}
          />
          <Campo
            rotulo="Nome fantasia"
            valor={campos.nomeFantasia}
            onChange={(v) => set('nomeFantasia', v)}
          />
          <Campo
            rotulo="Ramo de atividade"
            valor={campos.ramoAtividade}
            onChange={(v) => set('ramoAtividade', v)}
          />
          <Campo
            rotulo="Inscrição estadual"
            valor={campos.inscricaoEstadual}
            onChange={(v) => set('inscricaoEstadual', v)}
          />
          <Campo
            rotulo="Inscrição municipal"
            valor={campos.inscricaoMunicipal}
            onChange={(v) => set('inscricaoMunicipal', v)}
          />
        </Sanfona>

        <Sanfona titulo="Endereço" resumo={`${campos.cidade}/${campos.uf}`}>
          <Campo
            rotulo="CEP"
            valor={campos.cep}
            onChange={(v) => {
              const m = maskCEP(v)
              set('cep', m)
              void preencherPorCep(m)
            }}
            dica={buscandoCep ? 'Buscando endereço...' : undefined}
            tipoTeclado="numeric"
          />
          <Campo
            rotulo="Logradouro"
            valor={campos.logradouro}
            onChange={(v) => set('logradouro', v)}
          />
          <Campo
            rotulo="Número"
            valor={campos.numero}
            onChange={(v) => set('numero', v)}
            tipoTeclado="numeric"
          />
          <Campo
            rotulo="Complemento"
            valor={campos.complemento}
            onChange={(v) => set('complemento', v)}
          />
          <Campo rotulo="Bairro" valor={campos.bairro} onChange={(v) => set('bairro', v)} />
          <Campo rotulo="Cidade" valor={campos.cidade} onChange={(v) => set('cidade', v)} />
          <Campo
            rotulo="UF"
            valor={campos.uf}
            onChange={(v) => set('uf', v.toUpperCase().slice(0, 2))}
            autoCap="characters"
          />
        </Sanfona>

        <Sanfona titulo="Contato" resumo={`(${campos.ddd}) ${campos.celular}`}>
          <Campo
            rotulo="DDD"
            valor={campos.ddd}
            onChange={(v) => set('ddd', v.replace(/\D/g, '').slice(0, 2))}
            tipoTeclado="numeric"
          />
          <Campo
            rotulo="Celular / WhatsApp"
            valor={campos.celular}
            onChange={(v) => set('celular', maskCelular(v))}
            tipoTeclado="phone-pad"
          />
        </Sanfona>

        <Sanfona titulo="Certificado digital" resumo="gerenciado no site">
          <View style={estilos.aviso}>
            <Etiqueta tom="atencao">Só no site</Etiqueta>
            <Text style={estilos.avisoTexto}>
              O envio do certificado A1 é a senha ficam no site. Arquivo .pfx pelo celular é
              trabalhoso, e senha de certificado não deveria ser digitada em teclado de toque.
            </Text>
          </View>
        </Sanfona>

        <Botao onPress={salvar} carregando={salvando} largura>
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </Botao>
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espaco.lg, gap: espaco.md, paddingBottom: espaco.xxl },
  aviso: { gap: espaco.sm },
  avisoTexto: {
    fontSize: fonte.micro,
    lineHeight: 19,
    color: cores.textoFraco,
  },
})
