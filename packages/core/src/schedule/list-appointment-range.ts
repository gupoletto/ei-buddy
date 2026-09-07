import type { AppointmentOutput, ListAppointmentRangeInput } from '@na-regua/contracts'
import type { ExecutionContext } from '../context.js'
import type { AppointmentRepository } from '../ports/appointment-repository.js'

export type ListAppointmentRangeDeps = {
  readonly appointments: AppointmentRepository
}

export type RangeAgenda = {
  readonly from: string
  readonly to: string
  readonly appointments: readonly AppointmentOutput[]
}

/**
 * A agenda de um intervalo — o calendario do mes.
 *
 * Separado de `listDayAppointments` porque responde outra pergunta. A do dia e
 * "o que tenho agora", e vem com `isEmpty` para a tela distinguir agenda livre
 * de falha de carga. Esta e "onde ha algo marcado", e alimenta os pontinhos da
 * grade — ali uma lista vazia nao precisa de resposta especial, porque o mes
 * sem nada marcado se desenha igual.
 *
 * Uma chamada so, e nao trinta e uma. Montar o mes dia a dia daria trinta e uma
 * idas ao banco para desenhar uma tela, e a grade ainda pega as bordas das
 * semanas vizinhas — passariam de quarenta.
 *
 * Leitura: nao passa por `assertCanWrite`. `accountant` e somente leitura, e
 * ver a agenda e leitura.
 */
export async function listAppointmentRange(
  deps: ListAppointmentRangeDeps,
  ctx: ExecutionContext,
  input: ListAppointmentRangeInput,
): Promise<RangeAgenda> {
  /*
   * O intervalo fecha nos DOIS extremos, e `to` cobre o dia inteiro.
   *
   * Cortar em `T00:00` do dia final esconderia tudo o que esta marcado nele —
   * e quem pede "de 1 a 31" espera o dia 31 dentro. O mesmo cuidado de
   * `listDayAppointments`: quando o fuso da empresa entrar no contexto, e aqui
   * que ele se aplica; ate la o recorte e em UTC.
   */
  const from = new Date(`${input.from}T00:00:00.000Z`)
  const to = new Date(`${input.to}T23:59:59.999Z`)

  const appointments = await deps.appointments.listBetween(ctx.companyId, from, to)

  return { from: input.from, to: input.to, appointments }
}
