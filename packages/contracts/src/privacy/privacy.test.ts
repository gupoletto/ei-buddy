import { describe, expect, it } from 'vitest'
import {
  anonymizationReceiptSchema,
  anonymizeCustomerInputSchema,
  exportCollectionSchema,
  exportManifestSchema,
} from './privacy.js'

describe('colecoes da exportacao — RF-125', () => {
  /*
   * A lista e fechada e verificavel: da para afirmar num teste que nenhuma
   * colecao de negocio ficou de fora, o que "exportar tudo" nao permitiria.
   * Quando uma tabela nova nascer, ela entra aqui — e o teste do caso de uso
   * que compara a lista com o repositorio e o que impede o esquecimento.
   */
  it.each([
    'company',
    'customers',
    'products',
    'sales',
    'sale_items',
    'payments',
    'receivables',
    'payables',
    'settlements',
    'inventory_movements',
    'appointments',
    'ledger_accounts',
    'bank_transactions',
    'audit_logs',
  ])('cobre %s', (c) => {
    expect(exportCollectionSchema.parse(c)).toBe(c)
  })

  /* Tabela de controle interno nao e dado do titular: entregaria mais do que
     ele pediu e menos do que ele entende. */
  it.each(['schema_migrations', 'counters', 'sessions'])('nao cobre %s', (c) => {
    expect(exportCollectionSchema.safeParse(c).success).toBe(false)
  })
})

describe('manifesto do pacote — RNF-050', () => {
  const valido = {
    companyId: 'empresa-1',
    generatedAt: '2026-10-02T15:00:00.000Z',
    formatVersion: 1,
    collections: [{ name: 'sales', rows: 1_482, file: 'sales.jsonl' }],
  }

  it('aceita o manifesto minimo', () => {
    expect(exportManifestSchema.parse(valido).collections[0]!.rows).toBe(1_482)
  })

  it('aceita colecao vazia — zero linhas e resposta, nao ausencia', () => {
    expect(
      exportManifestSchema.safeParse({
        ...valido,
        collections: [{ name: 'appointments', rows: 0, file: 'appointments.jsonl' }],
      }).success,
    ).toBe(true)
  })

  /*
   * Quem escreveu um importador contra o pacote de hoje precisa saber que o de
   * amanha mudou de forma. A versao e do FORMATO, entao um numero diferente
   * significa formato diferente — e o schema recusa qualquer outro.
   */
  it.each([2, 0, '1'])('recusa versao de formato %s', (formatVersion) => {
    expect(exportManifestSchema.safeParse({ ...valido, formatVersion }).success).toBe(false)
  })

  it('recusa instante sem fuso', () => {
    expect(
      exportManifestSchema.safeParse({ ...valido, generatedAt: '2026-10-02T15:00:00' }).success,
    ).toBe(false)
  })

  it('recusa colecao que nao existe', () => {
    expect(
      exportManifestSchema.safeParse({
        ...valido,
        collections: [{ name: 'tudo', rows: 1, file: 'x.jsonl' }],
      }).success,
    ).toBe(false)
  })

  it('recusa contagem negativa', () => {
    expect(
      exportManifestSchema.safeParse({
        ...valido,
        collections: [{ name: 'sales', rows: -1, file: 'sales.jsonl' }],
      }).success,
    ).toBe(false)
  })
})

describe('pedido de anonimizacao — RF-127', () => {
  const valido = {
    customerId: 'cli-1',
    reason: 'Pedido de exclusao do titular por e-mail em 02/10/2026',
  }

  it('aceita o pedido com motivo', () => {
    expect(anonymizeCustomerInputSchema.parse(valido).customerId).toBe('cli-1')
  })

  it('apara o motivo', () => {
    expect(
      anonymizeCustomerInputSchema.parse({ ...valido, reason: `  ${valido.reason}  ` }).reason,
    ).toBe(valido.reason)
  })

  /*
   * A operacao e IRREVERSIVEL e o pedido do titular e o fundamento legal dela.
   * Sem motivo registrado sobra uma pessoa apagada da base sem nada que
   * explique por quem foi pedido — que e o que a fiscalizacao pergunta depois.
   */
  it('exige motivo', () => {
    const { reason: _fora, ...sem } = valido
    expect(anonymizeCustomerInputSchema.safeParse(sem).success).toBe(false)
  })

  it.each(['', '   ', 'pediu', 'lgpd'])('recusa motivo vazio ou curto: "%s"', (reason) => {
    expect(anonymizeCustomerInputSchema.safeParse({ ...valido, reason }).success).toBe(false)
  })

  /*
   * `strict` importa aqui mais que na maioria: um campo extra aceito em
   * silencio seria uma promessa que o caso de uso nao cumpre, numa operacao que
   * nao da para desfazer.
   */
  it('recusa campo desconhecido', () => {
    expect(anonymizeCustomerInputSchema.safeParse({ ...valido, alsoDelete: 'sales' }).success).toBe(
      false,
    )
  })
})

describe('comprovante da anonimizacao — RF-127, RF-128', () => {
  const valido = {
    customerId: 'cli-1',
    anonymizedAt: '2026-10-02T15:00:00.000Z',
    anonymizedBy: 'usr-1',
    scrubbedFields: ['name', 'phone', 'email', 'document', 'notes'],
    preserved: [
      { what: 'vendas', rows: 14, because: 'Registro fiscal: cinco anos de retencao obrigatoria.' },
    ],
    deleted: [{ what: 'conversas de WhatsApp', rows: 27 }],
  }

  it('aceita o comprovante completo', () => {
    expect(anonymizationReceiptSchema.parse(valido).preserved[0]!.rows).toBe(14)
  })

  /*
   * O titular pediu exclusao e recebeu anonimizacao, e a diferenca precisa
   * estar escrita. Um "ok" nao serve como resposta a ele nem a ANPD.
   */
  it('o que foi preservado vem com o motivo', () => {
    const r = anonymizationReceiptSchema.parse(valido)
    expect(r.preserved[0]!.because).toContain('retencao')
  })

  it('recusa preservado sem motivo', () => {
    expect(
      anonymizationReceiptSchema.safeParse({
        ...valido,
        preserved: [{ what: 'vendas', rows: 14 }],
      }).success,
    ).toBe(false)
  })

  it('aceita nada apagado — pode nao haver conversa', () => {
    expect(anonymizationReceiptSchema.safeParse({ ...valido, deleted: [] }).success).toBe(true)
  })

  it('recusa instante sem fuso', () => {
    expect(
      anonymizationReceiptSchema.safeParse({ ...valido, anonymizedAt: '02/10/2026' }).success,
    ).toBe(false)
  })
})
