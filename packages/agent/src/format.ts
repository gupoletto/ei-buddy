import { Money } from '@na-regua/money'

export function formatarCentavos(cents: number): string {
  return Money.fromCents(cents).format()
}

export function diaIso(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function mesDoDia(isoDate: string): { from: string; to: string } {
  const [ano, mes] = isoDate.split('-')
  if (ano === undefined || mes === undefined) {
    return { from: isoDate, to: isoDate }
  }
  const ultimo = new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate()
  return {
    from: `${ano}-${mes}-01`,
    to: `${ano}-${mes}-${String(ultimo).padStart(2, '0')}`,
  }
}

export function chaveDaConversa(input: {
  readonly channel: string
  readonly companyId: string
  readonly userId: string
  readonly peer?: string
}): string {
  if (input.channel === 'whatsapp') {
    return `wa:${input.companyId}:${input.peer ?? ''}`
  }
  return `app:${input.companyId}:${input.userId}`
}
