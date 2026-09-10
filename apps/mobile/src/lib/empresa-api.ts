/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — TELA DE EMPRESA
 * ============================================================================
 *
 * Tudo aqui e SIMULADO. Cada funcao marca onde entra a chamada real.
 *
 *  | Funcao              | Endpoint esperado              | Disparo            |
 *  |---------------------|--------------------------------|--------------------|
 *  | buscarCep           | GET /enderecos/cep/:cep        | CEP completo (8)   |
 *  | buscarCnpj          | GET /empresas/cnpj/:cnpj       | botao "Buscar dados"|
 *  | enviarCertificado   | POST /empresa/certificado      | upload do .pfx     |
 *  | salvarEmpresa       | PUT  /empresa                  | submit do form     |
 *
 * DECISAO: as consultas de CEP e CNPJ passam pelo NOSSO backend, e nao
 * direto do navegador para ViaCEP/ReceitaWS. Motivos:
 *   - a chave e a cota do servico ficam no servidor, nao expostas no bundle;
 *   - da para cachear (CEP muda pouco) e nao estourar limite de terceiro;
 *   - o front nao quebra se o fornecedor for trocado.
 *
 * O CERTIFICADO DIGITAL NUNCA DEVE SER PROCESSADO NO NAVEGADOR. O arquivo
 * .pfx e a senha vao direto para o backend por HTTPS; a validade exibida na
 * tela vem da resposta do servidor, que e quem abre o certificado. O front
 * so mostra o resultado.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* -------------------------------------------------------------------------- */
/* CEP                                                                        */
/* -------------------------------------------------------------------------- */

export type EnderecoCep = {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

export type CepResult = { ok: true; endereco: EnderecoCep } | { ok: false; error: string }

/** SUBSTITUIR POR: GET /enderecos/cep/:cep */
export async function buscarCep(cep: string): Promise<CepResult> {
  await delay(700)

  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) {
    return { ok: false, error: 'CEP incompleto.' }
  }

  /* Base de exemplo: alguns CEPs reconhecidos, o resto devolve nao
     encontrado para exercitar o caminho de erro da tela. */
  const conhecidos: Record<string, EnderecoCep> = {
    '80010010': {
      logradouro: 'Rua das Flores',
      bairro: 'Centro',
      cidade: 'Curitiba',
      uf: 'PR',
    },
    '80020100': {
      logradouro: 'Avenida Sete de Setembro',
      bairro: 'Centro',
      cidade: 'Curitiba',
      uf: 'PR',
    },
    '01310100': {
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
    },
  }

  const encontrado = conhecidos[digits]
  if (!encontrado) {
    return { ok: false, error: 'CEP não encontrado.' }
  }

  return { ok: true, endereco: encontrado }
}

/* -------------------------------------------------------------------------- */
/* CNPJ                                                                       */
/* -------------------------------------------------------------------------- */

export type DadosCnpj = {
  razaoSocial: string
  nomeFantasia: string
  ramoAtividade: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  uf: string
}

export type CnpjResult = { ok: true; dados: DadosCnpj } | { ok: false; error: string }

/** SUBSTITUIR POR: GET /empresas/cnpj/:cnpj */
export async function buscarCnpj(cnpj: string): Promise<CnpjResult> {
  await delay(1100)

  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) {
    return { ok: false, error: 'Informe o CNPJ completo antes de buscar.' }
  }

  return {
    ok: true,
    dados: {
      razaoSocial: 'Mercearia Sol Nascente LTDA',
      nomeFantasia: 'Mercearia Sol Nascente',
      ramoAtividade: 'Comércio varejista de alimentos',
      cep: '80010-010',
      logradouro: 'Rua das Flores',
      numero: '482',
      bairro: 'Centro',
      cidade: 'Curitiba',
      uf: 'PR',
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Certificado digital                                                        */
/* -------------------------------------------------------------------------- */

export type StatusCertificado = 'ausente' | 'valido' | 'expirado'

export type Certificado = {
  status: StatusCertificado
  nomeArquivo: string
  /** Data de expiracao no formato ISO (AAAA-MM-DD). */
  validoAte: string
  titular: string
}

export type UploadResult = { ok: true; certificado: Certificado } | { ok: false; error: string }

/**
 * SUBSTITUIR POR: POST /empresa/certificado (multipart)
 *
 * O backend abre o .pfx com a senha, extrai titular e validade, e guarda o
 * arquivo cifrado. Se a senha estiver errada, devolve 422 — e por isso que
 * a tela precisa tratar o erro de senha separadamente do erro de rede.
 */
export async function enviarCertificado(arquivo: File, senha: string): Promise<UploadResult> {
  await delay(1500)

  if (!senha) {
    return { ok: false, error: 'Informe a senha do certificado.' }
  }

  const nome = arquivo.name.toLowerCase()
  if (!nome.endsWith('.pfx') && !nome.endsWith('.p12')) {
    return { ok: false, error: 'O certificado precisa ser um arquivo .pfx ou .p12.' }
  }

  /* Senha de exemplo para exercitar o caminho de erro. */
  if (senha === 'errada') {
    return { ok: false, error: 'Senha do certificado incorreta.' }
  }

  return {
    ok: true,
    certificado: {
      status: 'valido',
      nomeArquivo: arquivo.name,
      validoAte: '2027-03-14',
      titular: 'MERCEARIA SOL NASCENTE LTDA',
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Gravacao                                                                   */
/* -------------------------------------------------------------------------- */

export type DadosEmpresa = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  inscricaoEstadual: string
  inscricaoMunicipal: string
  ramoAtividade: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  ddd: string
  celular: string
  conexoesHabilitadas: boolean
}

/** SUBSTITUIR POR: PUT /empresa */
export async function salvarEmpresa(
  dados: DadosEmpresa,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await delay(900)
  void dados
  return { ok: true }
}

/** Segmentos oferecidos no seletor de ramo de atividade. */
export const RAMOS_ATIVIDADE = [
  'Comércio varejista de alimentos',
  'Mercearia e minimercado',
  'Restaurante e lanchonete',
  'Padaria e confeitaria',
  'Moda e vestuário',
  'Calçados e acessórios',
  'Farmácia e saúde',
  'Salão de beleza e estética',
  'Casa, construção e ferragens',
  'Papelaria e informática',
  'Pet shop',
  'Oficina e autopeças',
  'Serviços em geral',
  'Outro',
]

export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
]
