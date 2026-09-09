import { describe, expect, it } from 'vitest'
import { isAppError } from '../app-error.js'
import { InMemoryAuditTrail } from '../audit/fakes.js'
import type { ExecutionContext } from '../context.js'
import { InMemoryReconciliation } from './fakes.js'
import { createEntryFromTransaction, reconcile, undoReconciliation } from './reconcile.js'
import { listBankTransactions } from './list-transactions.js'
import { JANELA_DE_DIAS, suggestMatches } from './suggest-matches.js'

const AGORA = new Date('2026-09-15T12:00:00.000Z')
const EMPRESA = 'empresa-1'

function contexto(over: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    companyId: EMPRESA,
    userId: 'usuario-1',
    role: 'owner',
    channel: 'app',
    requestId: 'req-1',
    now: AGORA,
    ...over,
  }
}

function cenario() {
  /* A MESMA trilha, por dentro da transacao — NR-087. */
  const audit = new InMemoryAuditTrail()
  const repo = new InMemoryReconciliation(audit)
  return { deps: { uow: repo, queries: repo, audit }, repo, audit }
}

async function pegaErro(fn: () => Promise<unknown>) {
  try {
    await fn()
    return undefined
  } catch (e) {
    return e
  }
}

describe('sugerir lancamentos compativeis — RF-078', () => {
  it('sugere a conta a pagar de mesmo valor e mesma data', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })

    const s = await suggestMatches(deps, contexto(), { transactionId: t.id })

    expect(s).toHaveLength(1)
    expect(s[0]!.entry.counterparty).toBe('Copel')
    expect(s[0]!.daysApart).toBe(0)
    expect(s[0]!.confidencePoints).toBe(100)
  })

  /*
   * O ponto da assimetria data/valor. A conta venceu no sabado dia 12 e o banco
   * debitou na segunda dia 14: nada aconteceu com o dinheiro, mudou o dia do
   * registro.
   */
  it('aceita a data deslizando dentro da janela, com menos confianca', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-14',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-12',
    })

    const s = await suggestMatches(deps, contexto(), { transactionId: t.id })

    expect(s).toHaveLength(1)
    expect(s[0]!.daysApart).toBe(2)
    expect(s[0]!.confidencePoints).toBe(80)
  })

  it('nao sugere nada fora da janela', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-20',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: somaDias('2026-09-20', -(JANELA_DE_DIAS + 1)),
    })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  /* Valor diferente e informacao, e nao ruido para tolerar. */
  it('nao sugere valor diferente, nem por um centavo', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_001,
      dueDate: '2026-09-10',
    })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  /*
   * O caso que faria a conciliacao ser inutil no varejo se estivesse errado:
   * quase toda venda e no cartao, e o recebivel de R$ 100 chega no banco como
   * R$ 97,50. Comparar com o bruto nao casaria nenhuma delas.
   */
  it('casa recebivel de cartao pelo liquido, nao pelo bruto', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'credit',
      amountCents: 9_750,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'receivable',
      counterparty: 'PagMaxx',
      amountCents: 10_000,
      netAmountCents: 9_750,
      dueDate: '2026-09-10',
    })

    const s = await suggestMatches(deps, contexto(), { transactionId: t.id })

    expect(s).toHaveLength(1)
    expect(s[0]!.expectedAmountCents).toBe(9_750)
  })

  it('nao casa o bruto quando existe liquido previsto', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'credit',
      amountCents: 10_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'receivable',
      counterparty: 'PagMaxx',
      amountCents: 10_000,
      netAmountCents: 9_750,
      dueDate: '2026-09-10',
    })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  it('debito nao sugere recebivel, mesmo com valor e data iguais', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'receivable',
      counterparty: 'Cliente',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  /*
   * Duas contas identicas: o sistema NAO sabe qual e. 50% em cada uma faz o
   * lojista abrir e conferir; 100% nas duas o faria clicar na primeira.
   */
  it('divide a confianca entre lancamentos indistinguiveis', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    for (const fornecedor of ['Copel', 'Sanepar']) {
      repo.adicionarLancamento(EMPRESA, {
        entryKind: 'payable',
        counterparty: fornecedor,
        amountCents: 48_000,
        dueDate: '2026-09-10',
      })
    }

    const s = await suggestMatches(deps, contexto(), { transactionId: t.id })

    expect(s).toHaveLength(2)
    expect(s.map((x) => x.confidencePoints)).toEqual([50, 50])
  })

  it('ordena pela maior confianca', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'longe',
      amountCents: 48_000,
      dueDate: '2026-09-13',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'no dia',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })

    const s = await suggestMatches(deps, contexto(), { transactionId: t.id })

    expect(s.map((x) => x.entry.counterparty)).toEqual(['no dia', 'longe'])
  })

  it('nao sugere lancamento cancelado', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
      status: 'cancelled',
    })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  it('nao sugere lancamento ja conciliado com outra transacao', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
      reconciled: true,
    })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  /* Ela ja tem resposta. Trocar por outra passa pelo desfazer, que deixa
     rastro. */
  it('transacao ja conciliada nao tem sugestao', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    const l = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })
    await reconcile(deps, contexto(), { transactionId: t.id, entryKind: 'payable', entryId: l.id })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  it('nao enxerga lancamento de outra empresa', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarLancamento('empresa-2', {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toEqual([])
  })

  it('recusa transacao de outra empresa como nao encontrada', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao('empresa-2', {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })

    const erro = await pegaErro(() => suggestMatches(deps, contexto(), { transactionId: t.id }))

    expect(isAppError(erro) && erro.code).toBe('NOT_FOUND')
  })
})

describe('conciliar — RF-079', () => {
  function comCandidato() {
    const c = cenario()
    const t = c.repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    const l = c.repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })
    return { ...c, t, l }
  }

  it('amarra os dois e tira a transacao da fila', async () => {
    const { deps, repo, t, l } = comCandidato()

    await reconcile(deps, contexto(), { transactionId: t.id, entryKind: 'payable', entryId: l.id })

    expect(repo.transacao(t.id)!.reconciledEntryId).toBe(l.id)
    expect(repo.transacao(t.id)!.reconciledEntryKind).toBe('payable')
    expect(repo.lancamento(l.id)!.reconciled).toBe(true)
  })

  it('registra na auditoria, no historico do lancamento', async () => {
    const { deps, audit, t, l } = comCandidato()

    await reconcile(deps, contexto(), { transactionId: t.id, entryKind: 'payable', entryId: l.id })

    const [entrada] = audit.daEmpresa(EMPRESA)
    expect(entrada!.entity).toBe('Payable')
    expect(entrada!.entityId).toBe(l.id)
    expect((entrada!.after as Record<string, unknown>).bankTransactionId).toBe(t.id)
  })

  it('recusa conciliar de novo o que ja esta conciliado', async () => {
    const { deps, t, l } = comCandidato()
    await reconcile(deps, contexto(), { transactionId: t.id, entryKind: 'payable', entryId: l.id })

    const erro = await pegaErro(() =>
      reconcile(deps, contexto(), { transactionId: t.id, entryKind: 'payable', entryId: l.id }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
  })

  /*
   * O caminho a mao precisa das mesmas recusas que a sugestao: uma tela nova ou
   * uma chamada direta de API nao passa pelo filtro de `suggestMatches`.
   */
  it('recusa casar debito com recebivel', async () => {
    const { deps, repo, t } = comCandidato()
    const rec = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'receivable',
      counterparty: 'Cliente',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })

    const erro = await pegaErro(() =>
      reconcile(deps, contexto(), {
        transactionId: t.id,
        entryKind: 'receivable',
        entryId: rec.id,
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('VALIDATION_FAILED')
    expect(isAppError(erro) && erro.message).toContain('conta a pagar')
  })

  it('recusa valor diferente e diz os dois numeros', async () => {
    const { deps, repo, t } = comCandidato()
    const outro = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 47_000,
      dueDate: '2026-09-10',
    })

    const erro = await pegaErro(() =>
      reconcile(deps, contexto(), {
        transactionId: t.id,
        entryKind: 'payable',
        entryId: outro.id,
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('VALIDATION_FAILED')
    expect(isAppError(erro) && erro.message).toContain('R$ 480,00')
    expect(isAppError(erro) && erro.message).toContain('R$ 470,00')
  })

  it('aceita valor diferente do bruto quando o liquido bate', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'credit',
      amountCents: 9_750,
      postedOn: '2026-09-10',
    })
    const l = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'receivable',
      counterparty: 'PagMaxx',
      amountCents: 10_000,
      netAmountCents: 9_750,
      dueDate: '2026-09-10',
    })

    await reconcile(deps, contexto(), {
      transactionId: t.id,
      entryKind: 'receivable',
      entryId: l.id,
    })

    expect(repo.transacao(t.id)!.reconciledEntryId).toBe(l.id)
  })

  it('recusa lancamento cancelado', async () => {
    const { deps, repo, t } = comCandidato()
    const cancelado = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
      status: 'cancelled',
    })

    const erro = await pegaErro(() =>
      reconcile(deps, contexto(), {
        transactionId: t.id,
        entryKind: 'payable',
        entryId: cancelado.id,
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
  })

  it('recusa lancamento ja conciliado com outra transacao', async () => {
    const { deps, repo, t } = comCandidato()
    const ocupado = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
      reconciled: true,
    })

    const erro = await pegaErro(() =>
      reconcile(deps, contexto(), {
        transactionId: t.id,
        entryKind: 'payable',
        entryId: ocupado.id,
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
  })

  /* Duas abas: a leitura passou nas duas, e quem decide e a escrita. */
  it('perde a corrida com outra aba sem gravar', async () => {
    const { deps, repo, t, l } = comCandidato()
    repo.conciliadaPorOutro = true

    const erro = await pegaErro(() =>
      reconcile(deps, contexto(), { transactionId: t.id, entryKind: 'payable', entryId: l.id }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
    expect(repo.lancamento(l.id)!.reconciled).toBe(false)
  })

  it('recusa quem so pode ler', async () => {
    const { deps, t, l } = comCandidato()

    const erro = await pegaErro(() =>
      reconcile(deps, contexto({ role: 'accountant' }), {
        transactionId: t.id,
        entryKind: 'payable',
        entryId: l.id,
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })

  it('o contador consegue ver as sugestoes', async () => {
    const { deps, t } = comCandidato()

    expect(
      await suggestMatches(deps, contexto({ role: 'accountant' }), { transactionId: t.id }),
    ).toHaveLength(1)
  })
})

describe('criar lancamento a partir da transacao — RF-079', () => {
  it('cria a conta a pagar com valor e data do extrato, e concilia', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 3_200,
      postedOn: '2026-09-08',
    })

    const { entryKind, entryId } = await createEntryFromTransaction(deps, contexto(), {
      transactionId: t.id,
      counterparty: 'Banco Cooperativo',
      description: 'Tarifa de manutencao de conta',
    })

    expect(entryKind).toBe('payable')
    const criado = repo.lancamento(entryId)!
    expect(criado.amountCents).toBe(3_200)
    /* Vencimento do dia do extrato, e nao `ctx.now` — quem concilia dia 15 o
       mes seguinte nao pode jogar a conta para o mes errado. */
    expect(criado.dueDate).toBe('2026-09-08')
    expect(repo.transacao(t.id)!.reconciledEntryId).toBe(entryId)
  })

  it('credito cria titulo a receber', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'credit',
      amountCents: 15_000,
      postedOn: '2026-09-08',
    })

    const { entryKind } = await createEntryFromTransaction(deps, contexto(), {
      transactionId: t.id,
      counterparty: 'Cliente antigo',
      description: 'Pagamento de divida antiga',
    })

    expect(entryKind).toBe('receivable')
  })

  it('registra a criacao na auditoria', async () => {
    const { deps, audit, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 3_200,
      postedOn: '2026-09-08',
    })

    await createEntryFromTransaction(deps, contexto(), {
      transactionId: t.id,
      counterparty: 'Banco Cooperativo',
      description: 'Tarifa',
    })

    const [entrada] = audit.daEmpresa(EMPRESA)
    expect(entrada!.action).toBe('created')
    expect((entrada!.after as Record<string, unknown>).createdFromBankTransaction).toBe(t.id)
  })

  /*
   * RNF-046 no caso que importa: se o vinculo falha depois de gravar, o
   * lancamento nao pode sobrar. Conta a pagar orfa no meio das contas do
   * lojista, com a transacao ainda na fila convidando a repetir, e pior que a
   * falha.
   */
  it('nao deixa lancamento orfao quando o vinculo falha', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 3_200,
      postedOn: '2026-09-08',
    })
    repo.conciliadaPorOutro = true

    const erro = await pegaErro(() =>
      createEntryFromTransaction(deps, contexto(), {
        transactionId: t.id,
        counterparty: 'Banco Cooperativo',
        description: 'Tarifa',
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
    expect(repo.quantosLancamentos()).toBe(0)
  })

  it('recusa quem so pode ler', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 3_200,
      postedOn: '2026-09-08',
    })

    const erro = await pegaErro(() =>
      createEntryFromTransaction(deps, contexto({ role: 'accountant' }), {
        transactionId: t.id,
        counterparty: 'Banco',
        description: 'Tarifa',
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })
})

describe('desfazer conciliacao — RF-080', () => {
  async function conciliado() {
    const c = cenario()
    const t = c.repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })
    const l = c.repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Copel',
      amountCents: 48_000,
      dueDate: '2026-09-10',
    })
    await reconcile(c.deps, contexto(), {
      transactionId: t.id,
      entryKind: 'payable',
      entryId: l.id,
    })
    return { ...c, t, l }
  }

  it('devolve os dois para a fila', async () => {
    const { deps, repo, t, l } = await conciliado()

    await undoReconciliation(deps, contexto(), {
      transactionId: t.id,
      reason: 'casei com a conta errada',
    })

    expect(repo.transacao(t.id)!.reconciledEntryId).toBeNull()
    expect(repo.transacao(t.id)!.reconciledEntryKind).toBeNull()
    expect(repo.lancamento(l.id)!.reconciled).toBe(false)
  })

  it('a transacao volta a receber sugestoes', async () => {
    const { deps, t } = await conciliado()

    await undoReconciliation(deps, contexto(), { transactionId: t.id, reason: 'errei' })

    expect(await suggestMatches(deps, contexto(), { transactionId: t.id })).toHaveLength(1)
  })

  it('guarda o motivo na auditoria', async () => {
    const { deps, audit, t } = await conciliado()

    await undoReconciliation(deps, contexto(), {
      transactionId: t.id,
      reason: 'era a conta de agua',
    })

    const ultima = audit.daEmpresa(EMPRESA).at(-1)!
    expect(ultima.action).toBe('cancelled')
    expect((ultima.after as Record<string, unknown>).reason).toBe('era a conta de agua')
  })

  it('recusa desfazer o que nao esta conciliado', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 48_000,
      postedOn: '2026-09-10',
    })

    const erro = await pegaErro(() =>
      undoReconciliation(deps, contexto(), { transactionId: t.id, reason: 'sei la' }),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
  })

  /* Desfazer a conferencia e uma coisa; apagar a conta e outra. */
  it('nao apaga o lancamento criado a partir da transacao', async () => {
    const { deps, repo } = cenario()
    const t = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 3_200,
      postedOn: '2026-09-08',
    })
    const { entryId } = await createEntryFromTransaction(deps, contexto(), {
      transactionId: t.id,
      counterparty: 'Banco',
      description: 'Tarifa',
    })

    await undoReconciliation(deps, contexto(), { transactionId: t.id, reason: 'nao era tarifa' })

    expect(repo.lancamento(entryId)).toBeDefined()
    expect(repo.lancamento(entryId)!.reconciled).toBe(false)
  })

  it('recusa quem so pode ler', async () => {
    const { deps, t } = await conciliado()

    const erro = await pegaErro(() =>
      undoReconciliation(deps, contexto({ role: 'accountant' }), {
        transactionId: t.id,
        reason: 'errei',
      }),
    )

    expect(isAppError(erro) && erro.code).toBe('FORBIDDEN')
  })
})

/** Mesma aritmetica em UTC do caso de uso, para o teste nao depender de fuso. */
function somaDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(a!, m! - 1, d!) + dias * 86_400_000).toISOString().slice(0, 10)
}

describe('a fila de conciliacao — NR-076', () => {
  it('lista o que falta conferir, da mais antiga para a mais nova', async () => {
    const { deps, repo } = cenario()

    repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 3_000,
      postedOn: '2026-09-10',
    })
    repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 1_000,
      postedOn: '2026-09-02',
    })

    const r = await listBankTransactions(deps.queries, contexto(), { scope: 'pending' })

    /* A ordem e o contrato: transacao antiga sem conferir e a que ja passou do
       mes que o contador fechou. */
    expect(r.transactions.map((t) => t.postedOn)).toEqual(['2026-09-02', '2026-09-10'])
    expect(r.pendingCount).toBe(2)
  })

  it('tira da fila o que ja foi conciliado', async () => {
    const { deps, repo } = cenario()

    const transacao = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 5_000,
      postedOn: '2026-09-10',
    })
    const conta = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Enel',
      amountCents: 5_000,
      dueDate: '2026-09-10',
    })

    await reconcile(deps, contexto(), {
      transactionId: transacao.id,
      entryKind: 'payable',
      entryId: conta.id,
    })

    const fila = await listBankTransactions(deps.queries, contexto(), { scope: 'pending' })
    expect(fila.transactions).toEqual([])
    expect(fila.pendingCount).toBe(0)
  })

  it('no recorte das conciliadas, diz COM O QUE cada uma casou', async () => {
    const { deps, repo } = cenario()

    const transacao = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 5_000,
      postedOn: '2026-09-10',
    })
    const conta = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Enel',
      description: 'Energia de agosto',
      amountCents: 5_000,
      dueDate: '2026-09-10',
    })

    await reconcile(deps, contexto(), {
      transactionId: transacao.id,
      entryKind: 'payable',
      entryId: conta.id,
    })

    const r = await listBankTransactions(deps.queries, contexto(), { scope: 'reconciled' })

    /* Sem isto o desfazer seria um salto no escuro: "desfazer R$ 50,00" nao
       diz se e essa mesmo (RF-080). */
    expect(r.transactions[0]?.reconciledWith).toEqual({
      kind: 'payable',
      id: conta.id,
      counterparty: 'Enel',
      description: 'Energia de agosto',
      dueDate: '2026-09-10',
    })
  })

  it('conta as pendentes mesmo quando quem pergunta olha as conciliadas', async () => {
    const { deps, repo } = cenario()

    const transacao = repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 5_000,
      postedOn: '2026-09-10',
    })
    const conta = repo.adicionarLancamento(EMPRESA, {
      entryKind: 'payable',
      counterparty: 'Enel',
      amountCents: 5_000,
      dueDate: '2026-09-10',
    })
    repo.adicionarTransacao(EMPRESA, {
      direction: 'debit',
      amountCents: 900,
      postedOn: '2026-09-11',
    })

    await reconcile(deps, contexto(), {
      transactionId: transacao.id,
      entryKind: 'payable',
      entryId: conta.id,
    })

    const r = await listBankTransactions(deps.queries, contexto(), { scope: 'reconciled' })

    /* A aba "conciliadas" cheia daria a impressao de que acabou. O numero e o
       que traz de volta para o trabalho. */
    expect(r.transactions).toHaveLength(1)
    expect(r.pendingCount).toBe(1)
  })

  it('nao mostra a fila de outra empresa', async () => {
    const { deps, repo } = cenario()

    repo.adicionarTransacao('empresa-2', {
      direction: 'debit',
      amountCents: 4_000,
      postedOn: '2026-09-09',
    })

    const r = await listBankTransactions(deps.queries, contexto(), { scope: 'pending' })

    expect(r.transactions).toEqual([])
  })

  it('deixa o contador ler — conciliar de olho e metade do trabalho dele', async () => {
    const { deps, repo } = cenario()

    repo.adicionarTransacao(EMPRESA, {
      direction: 'credit',
      amountCents: 7_000,
      postedOn: '2026-09-08',
    })

    const r = await listBankTransactions(deps.queries, contexto({ role: 'accountant' }), {
      scope: 'pending',
    })

    expect(r.transactions).toHaveLength(1)
  })
})
