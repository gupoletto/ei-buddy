import { describe, expect, it } from 'vitest'
import { isAppError } from '../app-error.js'
import { InMemoryAuditTrail } from '../audit/fakes.js'
import type { ExecutionContext } from '../context.js'
import { anonymizeCustomer, NOME_ANONIMIZADO } from './anonymize-customer.js'
import { COLECOES_DA_EXPORTACAO, exportCompanyData } from './export-company-data.js'
import { InMemoryDataSubjects, InMemoryExportSink, InMemoryExportSource } from './fakes.js'

const AGORA = new Date('2026-10-02T15:00:00.000Z')
const EMPRESA = 'empresa-1'

function contexto(over: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    companyId: EMPRESA,
    userId: 'usr-1',
    role: 'owner',
    channel: 'app',
    requestId: 'req-1',
    now: AGORA,
    ...over,
  }
}

async function pegaErro(fn: () => Promise<unknown>) {
  try {
    await fn()
    return undefined
  } catch (e) {
    return e
  }
}

function cenarioDeExportacao() {
  const source = new InMemoryExportSource(COLECOES_DA_EXPORTACAO)
  const sink = new InMemoryExportSink()
  const audit = new InMemoryAuditTrail()
  return { deps: { source, sink, audit }, source, sink, audit }
}

describe('exportar tudo — RF-125', () => {
  it('devolve manifesto com todas as colecoes', async () => {
    const { deps } = cenarioDeExportacao()

    const r = await exportCompanyData(deps, contexto())

    expect(r.manifest.collections.map((c) => c.name)).toEqual([...COLECOES_DA_EXPORTACAO])
    expect(r.manifest.formatVersion).toBe(1)
    expect(r.location).toContain('http')
  })

  it('conta as linhas de cada colecao no manifesto', async () => {
    const { deps, source } = cenarioDeExportacao()
    source.semear(EMPRESA, 'sales', 5)
    source.semear(EMPRESA, 'customers', 3)

    const r = await exportCompanyData(deps, contexto())

    const porNome = new Map(r.manifest.collections.map((c) => [c.name, c.rows]))
    expect(porNome.get('sales')).toBe(5)
    expect(porNome.get('customers')).toBe(3)
    expect(porNome.get('products')).toBe(0)
  })

  /*
   * O ponto do desenho paginado: o pico de memoria e uma pagina, e nao a
   * colecao. Um caso de uso que ignorasse o cursor traria so as primeiras
   * linhas de cada tabela — num pacote que parece completo.
   */
  it('percorre TODAS as paginas, nao so a primeira', async () => {
    const { deps, source, sink } = cenarioDeExportacao()
    source.tamanhoDaPagina = 2
    source.semear(EMPRESA, 'sales', 7)

    await exportCompanyData(deps, contexto())

    expect(sink.linhasDe('sales')).toBe(7)
    /* 7 linhas em paginas de 2 = quatro escritas. */
    expect(sink.escritas.filter((e) => e.collection === 'sales')).toHaveLength(4)
  })

  it('nao escreve pagina vazia', async () => {
    const { deps, sink } = cenarioDeExportacao()

    await exportCompanyData(deps, contexto())

    expect(sink.escritas).toHaveLength(0)
  })

  it('exporta so os dados da empresa do contexto', async () => {
    const { deps, source, sink } = cenarioDeExportacao()
    source.semear(EMPRESA, 'sales', 2)
    source.semear('empresa-2', 'sales', 9)

    await exportCompanyData(deps, contexto())

    expect(sink.linhasDe('sales')).toBe(2)
  })

  /*
   * Uma tabela de negocio nova nasceria fora da exportacao em silencio, e o
   * lojista receberia um pacote que PARECE completo — o pior desfecho para um
   * direito de portabilidade, porque ninguem descobre pelo uso.
   */
  it('falha alto quando o repositorio nao sabe ler uma colecao', async () => {
    const { deps, source } = cenarioDeExportacao()
    source.esquecer('inventory_movements')

    const erro = await pegaErro(() => exportCompanyData(deps, contexto()))

    expect(String(erro)).toContain('inventory_movements')
  })

  it('confere antes de escrever, para nao entregar meio pacote', async () => {
    const { deps, source, sink } = cenarioDeExportacao()
    source.semear(EMPRESA, 'sales', 5)
    source.esquecer('sales')

    await pegaErro(() => exportCompanyData(deps, contexto()))

    expect(sink.escritas).toHaveLength(0)
  })

  /*
   * Uma copia integral da base saindo do sistema e o evento que alguem vai
   * querer reconstituir depois de um vazamento.
   */
  it('audita a exportacao com quem, quando e quanto', async () => {
    const { deps, source, audit } = cenarioDeExportacao()
    source.semear(EMPRESA, 'sales', 4)
    source.semear(EMPRESA, 'products', 6)

    await exportCompanyData(deps, contexto())

    const [entrada] = audit.daEmpresa(EMPRESA)
    expect(entrada!.actorId).toBe('usr-1')
    expect(entrada!.action).toBe('data_export')
    expect(entrada!.after).toMatchObject({ totalRows: 10 })
  })

  describe('quem pode', () => {
    /* `seguranca.md`: o contador tem acesso somente de leitura e EXPORTACAO. */
    it('o contador exporta — e o trabalho dele', async () => {
      const { deps } = cenarioDeExportacao()

      const r = await exportCompanyData(deps, contexto({ role: 'accountant' }))

      expect(r.manifest.companyId).toBe(EMPRESA)
    })

    /* Dar a base inteira a cada funcionario seria um ponto de exfiltracao por
       pessoa contratada. */
    it('staff nao exporta', async () => {
      const { deps } = cenarioDeExportacao()

      const erro = await pegaErro(() => exportCompanyData(deps, contexto({ role: 'staff' })))

      expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
    })

    /* ADR-0002: uma mensagem que devolve a base inteira e o pior caso de um
       numero roubado. */
    it('ninguem exporta pelo WhatsApp', async () => {
      const { deps } = cenarioDeExportacao()

      const erro = await pegaErro(() => exportCompanyData(deps, contexto({ channel: 'whatsapp' })))

      expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
      expect(isAppError(erro) && erro.message).toContain('aplicativo')
    })
  })
})

function cenarioDeAnonimizacao(
  cliente: Parameters<InMemoryDataSubjects['adicionar']>[1] = {},
  volumes: Parameters<InMemoryDataSubjects['adicionar']>[2] = {},
) {
  const subjects = new InMemoryDataSubjects()
  const audit = new InMemoryAuditTrail()
  const alvo = subjects.adicionar(EMPRESA, cliente, volumes)
  return { deps: { subjects, audit }, subjects, audit, alvo }
}

const pedido = { reason: 'Pedido de exclusao do titular por e-mail em 02/10/2026' }

describe('anonimizar cliente — RF-127', () => {
  it('substitui os campos pessoais', async () => {
    const { deps, subjects, alvo } = cenarioDeAnonimizacao()

    await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    const depois = subjects.cliente(alvo.id)!
    expect(depois.name).toBe(NOME_ANONIMIZADO)
    expect([depois.phone, depois.email, depois.taxId]).toEqual([null, null, null])
  })

  /*
   * RF-128: o `id` fica. Trocar o id quebraria as vendas que apontam para ele —
   * exatamente o que a exigencia de manter totais e relatorios corretos
   * proibe.
   */
  it('mantem o id, para as vendas continuarem apontando', async () => {
    const { deps, subjects, alvo } = cenarioDeAnonimizacao()

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(r.customerId).toBe(alvo.id)
    expect(subjects.cliente(alvo.id)).toBeDefined()
  })

  /* Nome visivel em vez de vazio: a tela mostra o cliente em venda antiga, e
     campo vazio pareceria dado corrompido. */
  it('o nome substituto e legivel', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao()

    await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(NOME_ANONIMIZADO).toMatch(/\w/)
  })

  it('marca quando foi anonimizado', async () => {
    const { deps, subjects, alvo } = cenarioDeAnonimizacao()

    await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(subjects.cliente(alvo.id)!.anonymizedAt).toBe(AGORA.toISOString())
  })

  it('recusa cliente de outra empresa como nao encontrado', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao()

    const erro = await pegaErro(() =>
      anonymizeCustomer(deps, contexto({ companyId: 'empresa-2' }), {
        customerId: alvo.id,
        ...pedido,
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('NOT_FOUND')
  })

  /*
   * Responder "ok" na segunda chamada faria o comprovante sair com a data de
   * hoje para uma operacao de meses atras — e num pedido de titular a data e o
   * que importa.
   */
  it('recusa anonimizar de novo, dizendo a data da primeira', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({ anonymizedAt: '2026-05-11T10:00:00.000Z' })

    const erro = await pegaErro(() =>
      anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
    expect(isAppError(erro) && erro.message).toContain('2026-05-11')
  })
})

describe('o comprovante — RF-127, RF-128', () => {
  it('lista o que ficou, com o motivo', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({}, { salesPreserved: 14 })

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    const vendas = r.preserved.find((p) => p.what === 'vendas')!
    expect(vendas.rows).toBe(14)
    expect(vendas.because).toContain('cinco anos')
  })

  /*
   * O XML da nota e assinado: alterar invalida a assinatura e destroi o proprio
   * documento que a lei obriga a guardar. O CPF ali tem base legal de obrigacao
   * legal — o pedido de exclusao nao o alcanca, e prometer o contrario seria
   * mentir para o titular.
   */
  it('declara os documentos fiscais como preservados, nao apagados', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({}, { fiscalDocumentsPreserved: 2 })

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(r.preserved.map((p) => p.what)).toContain('documentos fiscais')
    expect(r.deleted.map((d) => d.what)).not.toContain('documentos fiscais')
  })

  /* Texto livre nao da para higienizar com confianca: o nome aparece no meio da
     frase. Apagar e o unico jeito honesto de cumprir o pedido. */
  it('declara as conversas como apagadas, nao preservadas', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({}, { messagesDeleted: 27 })

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(r.deleted).toEqual([{ what: 'conversas de WhatsApp', rows: 27 }])
  })

  it('lista os campos que foram substituidos', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao()

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(r.scrubbedFields).toEqual(
      expect.arrayContaining(['name', 'document', 'phone', 'email', 'notes']),
    )
  })

  /* "mora ao lado da farmacia, pede sempre pelo filho" e dado pessoal tanto
     quanto o telefone. */
  it('apaga as observacoes livres tambem', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao()

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(r.scrubbedFields).toContain('notes')
  })
})

describe('a auditoria da anonimizacao — RF-127', () => {
  it('registra quando e por quem, com o motivo', async () => {
    const { deps, audit, alvo } = cenarioDeAnonimizacao()

    await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    const [entrada] = audit.daEmpresa(EMPRESA)
    expect(entrada!.entityId).toBe(alvo.id)
    expect(entrada!.actorId).toBe('usr-1')
    expect(entrada!.occurredAt).toBe(AGORA.toISOString())
    expect(entrada!.action).toBe('anonymized')
    expect(entrada!.after).toMatchObject({ reason: pedido.reason })
  })

  /*
   * O teste mais importante deste arquivo.
   *
   * A trilha e IMUTAVEL (RF-124) e a anonimizacao nao a alcanca. Gravar os
   * valores antigos no `before`, como toda outra alteracao faz, criaria uma
   * copia PERMANENTE de exatamente o dado que o titular pediu para excluir, no
   * unico lugar do sistema de onde ele nunca sairia — o pedido de exclusao
   * viraria o registro definitivo do dado excluido.
   */
  it('NAO guarda os valores antigos na trilha', async () => {
    const { deps, audit, alvo } = cenarioDeAnonimizacao({
      name: 'Joana Ribeiro',
      phone: '41988887777',
      email: 'joana@exemplo.com',
      taxId: '12345678909',
    })

    await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    const [entrada] = audit.daEmpresa(EMPRESA)
    expect(entrada!.before).toBeNull()

    const gravado = JSON.stringify(entrada)
    for (const pessoal of ['Joana Ribeiro', '41988887777', 'joana@exemplo.com', '12345678909']) {
      expect(gravado, `dado pessoal na trilha: ${pessoal}`).not.toContain(pessoal)
    }
  })
})

describe('quem pode anonimizar', () => {
  it.each([['staff'], ['accountant']] as const)('%s nao anonimiza', async (role) => {
    const { deps, alvo } = cenarioDeAnonimizacao()

    const erro = await pegaErro(() =>
      anonymizeCustomer(deps, contexto({ role }), { customerId: alvo.id, ...pedido }),
    )

    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })

  /* ADR-0002: exfiltracao e exclusao completa numa mensagem. */
  it('ninguem anonimiza pelo WhatsApp', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao()

    const erro = await pegaErro(() =>
      anonymizeCustomer(deps, contexto({ channel: 'whatsapp' }), {
        customerId: alvo.id,
        ...pedido,
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })

  it('nem toca no cliente quando o papel nao permite', async () => {
    const { deps, subjects, alvo } = cenarioDeAnonimizacao()

    await pegaErro(() =>
      anonymizeCustomer(deps, contexto({ role: 'staff' }), { customerId: alvo.id, ...pedido }),
    )

    expect(subjects.cliente(alvo.id)!.name).toBe('Joana Ribeiro')
  })
})

describe('fiado em aberto barra a anonimizacao', () => {
  /*
   * Anonimizar o devedor apagaria a unica forma de cobrar: a divida
   * continuaria na contabilidade da loja, sem ninguem a quem cobrar, e o
   * pedido de exclusao teria funcionado como perdao de divida. A LGPD permite
   * reter o necessario para o exercicio de direitos.
   */
  it('recusa quem ainda deve', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({ walletBalanceCents: 4_500 })

    const erro = await pegaErro(() =>
      anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
    expect(isAppError(erro) && erro.message).toContain('fiado em aberto')
  })

  it('a recusa diz o que fazer, porque ha caminho', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({ walletBalanceCents: 100 })

    const erro = await pegaErro(() =>
      anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido }),
    )

    expect(isAppError(erro) && erro.message).toContain('Receba o valor ou baixe a divida')
  })

  it('nao mexe em nada quando recusa', async () => {
    const { deps, subjects, alvo } = cenarioDeAnonimizacao({ walletBalanceCents: 100 })

    await pegaErro(() => anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido }))

    expect(subjects.cliente(alvo.id)!.phone).toBe('41988887777')
  })

  it('passa depois de a divida ser zerada', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({ walletBalanceCents: 0 })

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(r.customerId).toBe(alvo.id)
  })

  /* Saldo negativo e credito do cliente na loja, nao divida dele. */
  it('saldo negativo nao barra', async () => {
    const { deps, alvo } = cenarioDeAnonimizacao({ walletBalanceCents: -500 })

    const r = await anonymizeCustomer(deps, contexto(), { customerId: alvo.id, ...pedido })

    expect(r.customerId).toBe(alvo.id)
  })
})
