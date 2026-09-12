import type { CreateFixedCostInput, Role } from '@na-regua/contracts'
import { describe, expect, it } from 'vitest'
import { isAppError } from '../app-error.js'
import { InMemoryAuditTrail } from '../audit/fakes.js'
import type { ExecutionContext } from '../context.js'
import {
  createFixedCost,
  deleteFixedCost,
  listFixedCosts,
  updateFixedCost,
} from './manage-fixed-costs.js'
import { generateFixedCostPayables } from './generate-payables.js'
import { InMemoryFixedCostGenerator, InMemoryFixedCosts } from './fakes.js'

/** Hoje e 02/09/2026 para toda a suite. */
const AGORA = new Date('2026-09-02T12:00:00.000Z')

function contexto(over: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    companyId: 'empresa-1',
    userId: 'usuario-1',
    role: 'owner' as Role,
    channel: 'app',
    requestId: 'req-1',
    now: AGORA,
    ...over,
  }
}

function custo(over: Partial<CreateFixedCostInput> = {}): CreateFixedCostInput {
  return {
    name: 'Aluguel do ponto',
    amountCents: 150_000,
    dueDay: 5,
    ...over,
  }
}

function deps(audit = new InMemoryAuditTrail(), fixedCosts = new InMemoryFixedCosts()) {
  return { fixedCosts, audit }
}

describe('cadastrar custo fixo — NR-110', () => {
  it('grava nome, valor e dia', async () => {
    const d = deps()

    const gravado = await createFixedCost(d, contexto(), custo())

    expect(gravado.name).toBe('Aluguel do ponto')
    expect(gravado.amountCents).toBe(150_000)
    expect(gravado.dueDay).toBe(5)
  })

  it('nasce sem classificacao quando nao informada', async () => {
    const d = deps()

    const gravado = await createFixedCost(d, contexto(), custo())

    expect(gravado.accountId).toBeNull()
  })

  it('aceita classificacao na criacao', async () => {
    const d = deps()

    const gravado = await createFixedCost(d, contexto(), custo({ accountId: 'conta-1' }))

    expect(gravado.accountId).toBe('conta-1')
  })

  it('aparece na listagem', async () => {
    const d = deps()
    await createFixedCost(d, contexto(), custo())

    const lista = await listFixedCosts(d, contexto())

    expect(lista).toHaveLength(1)
  })

  it('accountant nao cadastra — e escrita', async () => {
    const d = deps()

    await expect(
      createFixedCost(d, contexto({ role: 'accountant' as Role }), custo()),
    ).rejects.toThrow(/somente de leitura/i)
  })

  it('accountant consulta a lista', async () => {
    const d = deps()
    await createFixedCost(d, contexto(), custo())

    const lista = await listFixedCosts(d, contexto({ role: 'accountant' as Role }))

    expect(lista).toHaveLength(1)
  })
})

describe('editar custo fixo — NR-110', () => {
  it('redefine nome, valor e dia', async () => {
    const d = deps()
    const criado = await createFixedCost(d, contexto(), custo())

    const editado = await updateFixedCost(
      d,
      contexto(),
      criado.id,
      custo({ name: 'Aluguel novo', amountCents: 180_000, dueDay: 10 }),
    )

    expect(editado.name).toBe('Aluguel novo')
    expect(editado.amountCents).toBe(180_000)
    expect(editado.dueDay).toBe(10)
  })

  it('custo de outra empresa responde NOT_FOUND', async () => {
    const d = deps()
    const criado = await createFixedCost(d, contexto({ companyId: 'empresa-1' }), custo())

    const erro = await updateFixedCost(
      d,
      contexto({ companyId: 'empresa-2' }),
      criado.id,
      custo(),
    ).catch((e: unknown) => e)

    expect(isAppError(erro) && erro.code).toBe('NOT_FOUND')
  })

  it('id inexistente responde NOT_FOUND', async () => {
    const d = deps()

    const erro = await updateFixedCost(d, contexto(), 'custo-fantasma', custo()).catch(
      (e: unknown) => e,
    )

    expect(isAppError(erro) && erro.code).toBe('NOT_FOUND')
  })

  it('accountant nao edita', async () => {
    const d = deps()
    const criado = await createFixedCost(d, contexto(), custo())

    await expect(
      updateFixedCost(d, contexto({ role: 'accountant' as Role }), criado.id, custo()),
    ).rejects.toThrow(/somente de leitura/i)
  })
})

describe('excluir custo fixo — NR-110', () => {
  it('sai da listagem', async () => {
    const d = deps()
    const criado = await createFixedCost(d, contexto(), custo())

    await deleteFixedCost(d, contexto(), criado.id)

    expect(await listFixedCosts(d, contexto())).toHaveLength(0)
  })

  it('id inexistente responde NOT_FOUND', async () => {
    const d = deps()

    const erro = await deleteFixedCost(d, contexto(), 'custo-fantasma').catch((e: unknown) => e)

    expect(isAppError(erro) && erro.code).toBe('NOT_FOUND')
  })

  it('accountant nao exclui', async () => {
    const d = deps()
    const criado = await createFixedCost(d, contexto(), custo())

    await expect(
      deleteFixedCost(d, contexto({ role: 'accountant' as Role }), criado.id),
    ).rejects.toThrow(/somente de leitura/i)
  })
})

describe('trilha de auditoria — RF-123', () => {
  it('cadastrar, editar e excluir deixam rastro', async () => {
    const audit = new InMemoryAuditTrail()
    const d = deps(audit)

    const criado = await createFixedCost(d, contexto(), custo())
    await updateFixedCost(d, contexto(), criado.id, custo({ name: 'Outro nome' }))
    await deleteFixedCost(d, contexto(), criado.id)

    expect(audit.total).toBe(3)
    expect(audit.daEmpresa('empresa-1').map((e) => e.action)).toEqual([
      'created',
      'updated',
      'deleted',
    ])
  })
})

/* ====================================================================== *
 * Gerar as contas do mes
 * ====================================================================== */

function depsGerar(
  audit = new InMemoryAuditTrail(),
  fixedCosts = new InMemoryFixedCosts(),
  generator = new InMemoryFixedCostGenerator(),
) {
  return { fixedCosts, generator, audit }
}

describe('gerar as contas do mes — NR-110', () => {
  it('gera uma conta por custo fixo', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo({ name: 'Aluguel' }))
    await createFixedCost(d, contexto(), custo({ name: 'Energia', dueDay: 15 }))

    const r = await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    expect(r.generated).toHaveLength(2)
    expect(r.alreadyExistedCount).toBe(0)
  })

  it('o vencimento cai no dia do custo fixo, dentro do mes pedido', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo({ dueDay: 15 }))

    const r = await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    expect(r.generated[0]?.dueDate).toBe('2026-09-15')
  })

  /*
   * O caso que `diasNoMes` existe para resolver: dia 31 nao existe em
   * fevereiro. Encaixar no ultimo dia do mes, e nao migrar para marco.
   */
  it('dia 31 num mes de 30 cai no ultimo dia — nao migra para o mes seguinte', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo({ dueDay: 31 }))

    const r = await generateFixedCostPayables(d, contexto(), { competencia: '2026-04' })

    expect(r.generated[0]?.dueDate).toBe('2026-04-30')
  })

  it('fevereiro bissexto: dia 31 cai em 29', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo({ dueDay: 31 }))

    const r = await generateFixedCostPayables(d, contexto(), { competencia: '2028-02' })

    expect(r.generated[0]?.dueDate).toBe('2028-02-29')
  })

  it('rodar duas vezes no mesmo mes nao duplica', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo())

    const primeira = await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })
    const segunda = await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    expect(primeira.generated).toHaveLength(1)
    expect(segunda.generated).toHaveLength(0)
    expect(segunda.alreadyExistedCount).toBe(1)
  })

  it('meses diferentes geram contas diferentes', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo())

    await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })
    const outubro = await generateFixedCostPayables(d, contexto(), { competencia: '2026-10' })

    expect(outubro.generated).toHaveLength(1)
  })

  it('sem custo fixo nenhum, nao gera nada e nao quebra', async () => {
    const d = depsGerar()

    const r = await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    expect(r.generated).toEqual([])
    expect(r.alreadyExistedCount).toBe(0)
  })

  it('a conta gerada leva o nome do custo fixo como fornecedor', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo({ name: 'Internet da loja' }))

    const r = await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    expect(r.generated[0]?.supplier).toBe('Internet da loja')
  })

  it('leva a classificacao do custo fixo', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo({ accountId: 'conta-energia' }))

    const r = await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    expect(r.generated[0]?.accountId).toBe('conta-energia')
  })

  it('accountant nao gera — e escrita', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto(), custo())

    await expect(
      generateFixedCostPayables(d, contexto({ role: 'accountant' as Role }), {
        competencia: '2026-09',
      }),
    ).rejects.toThrow(/somente de leitura/i)
  })

  it('deixa uma entrada na trilha, nao uma por conta gerada', async () => {
    const audit = new InMemoryAuditTrail()
    const d = depsGerar(audit)
    await createFixedCost(d, contexto(), custo({ name: 'A' }))
    await createFixedCost(d, contexto(), custo({ name: 'B' }))

    await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    /* As duas criacoes de custo fixo ja deixaram duas entradas; a geracao
       deixa UMA a mais, nao duas. */
    expect(audit.total).toBe(3)
  })

  it('nao gera e nao deixa rastro quando ja existia tudo', async () => {
    const audit = new InMemoryAuditTrail()
    const d = depsGerar(audit)
    await createFixedCost(d, contexto(), custo())
    await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })
    const antes = audit.total

    await generateFixedCostPayables(d, contexto(), { competencia: '2026-09' })

    expect(audit.total).toBe(antes)
  })

  it('isolamento: custo fixo de outra loja nao gera conta aqui', async () => {
    const d = depsGerar()
    await createFixedCost(d, contexto({ companyId: 'empresa-2' }), custo())

    const r = await generateFixedCostPayables(d, contexto({ companyId: 'empresa-1' }), {
      competencia: '2026-09',
    })

    expect(r.generated).toEqual([])
  })
})
