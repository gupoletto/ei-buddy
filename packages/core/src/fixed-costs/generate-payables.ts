import type { GenerateFixedCostPayablesInput, PayableOutput } from '@na-regua/contracts'
import { diasNoMes } from '@na-regua/domain'
import { assertCanWrite } from '../authorization.js'
import type { ExecutionContext } from '../context.js'
import type { AuditTrail } from '../ports/audit-trail.js'
import type {
  FixedCostPayableGenerator,
  FixedCostRepository,
} from '../ports/fixed-cost-repository.js'

export type GenerateFixedCostPayablesDeps = {
  readonly fixedCosts: FixedCostRepository
  readonly generator: FixedCostPayableGenerator
  readonly audit: AuditTrail
}

export type GenerateFixedCostPayablesResult = {
  readonly generated: readonly PayableOutput[]
  /** Quantos custos fixos ja tinham conta gerada para este mes. */
  readonly alreadyExistedCount: number
}

/**
 * Gera as contas a pagar do mes, a partir dos custos fixos — NR-110.
 *
 * Idempotente por (custo fixo, vencimento): rodar duas vezes no mesmo mes nao
 * duplica a conta — a garantia vem do indice unico da migration, e o
 * `generator` so devolve quem de fato entrou.
 *
 * **O dia do vencimento e ajustado ao mes, nunca migra.** Um custo fixo que
 * vence todo dia 31 nao existe em fevereiro — `diasNoMes` encaixa no ULTIMO
 * dia daquele mes, a mesma regra que `ocorrenciasDaRecorrencia` ja usa para
 * conta a pagar recorrente (ver `packages/domain`).
 */
export async function generateFixedCostPayables(
  deps: GenerateFixedCostPayablesDeps,
  ctx: ExecutionContext,
  input: GenerateFixedCostPayablesInput,
): Promise<GenerateFixedCostPayablesResult> {
  assertCanWrite(ctx)

  const [ano, mes] = input.competencia.split('-').map(Number) as [number, number]
  const ultimoDiaDoMes = diasNoMes(ano, mes)

  const custos = await deps.fixedCosts.list(ctx.companyId)

  const drafts = custos.map((custo) => {
    const dia = Math.min(custo.dueDay, ultimoDiaDoMes)
    const dueDate = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

    return {
      fixedCostId: custo.id,
      companyId: ctx.companyId,
      supplier: custo.name,
      description: custo.name,
      amountCents: custo.amountCents,
      dueDate,
      accountId: custo.accountId,
      createdBy: ctx.userId,
      createdAt: ctx.now,
    }
  })

  const geradas = drafts.length === 0 ? [] : await deps.generator.generate(drafts)

  if (geradas.length > 0) {
    /* Uma entrada para a geracao inteira, e nao uma por conta: dez linhas
       identicas na trilha escondem as que importam — mesmo criterio de
       `createPayable` com recorrencia. */
    await deps.audit.record({
      companyId: ctx.companyId,
      entity: 'FixedCost',
      /* Nao ha UM custo fixo dono da geracao — e um lote. A primeira conta
         gerada serve de representante, mesmo criterio que `createPayable`
         usa quando uma recorrencia nao tem id proprio. */
      entityId: geradas[0]!.id,
      action: 'created',
      actorId: ctx.userId,
      channel: ctx.channel,
      occurredAt: ctx.now,
      before: null,
      after: { competencia: input.competencia, count: geradas.length },
    })
  }

  return { generated: geradas, alreadyExistedCount: drafts.length - geradas.length }
}
