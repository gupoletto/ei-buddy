import { describe, expect, it } from 'vitest'
import { InMemoryWaitlist } from './fakes.js'
import { submitWaitlistEntry } from './submit-waitlist-entry.js'

const AGORA = new Date('2026-09-13T12:00:00.000Z')

const minimo = {
  name: 'Maria Souza',
  businessType: undefined,
  phone: '41998765432',
  expectation: 'Queria saber o que vendi no dia sem abrir planilha.',
  painPoints: [],
  painPointOther: undefined,
  usesSystem: undefined,
  usesSystemOther: undefined,
  fairPrice: undefined,
  wantsUpdates: true,
}

describe('submitWaitlistEntry — NR-111', () => {
  it('grava o minimo e devolve a resposta com id e data', async () => {
    const waitlist = new InMemoryWaitlist()

    const r = await submitWaitlistEntry({ waitlist }, minimo, AGORA)

    expect(r.name).toBe('Maria Souza')
    expect(r.businessType).toBeNull()
    expect(r.createdAt).toBe(AGORA.toISOString())
    expect(waitlist.todas()).toHaveLength(1)
  })

  it('campos opcionais ausentes viram nulo, e nao undefined', async () => {
    const waitlist = new InMemoryWaitlist()

    const r = await submitWaitlistEntry({ waitlist }, minimo, AGORA)

    expect(r.usesSystem).toBeNull()
    expect(r.usesSystemOther).toBeNull()
    expect(r.fairPrice).toBeNull()
    expect(r.painPointOther).toBeNull()
  })

  it('grava dificuldades, sistema e valor justo quando vierem', async () => {
    const waitlist = new InMemoryWaitlist()

    const r = await submitWaitlistEntry(
      { waitlist },
      {
        ...minimo,
        businessType: 'Mercearia',
        painPoints: ['cash_flow', 'other'] as const,
        painPointOther: 'Achar tempo para tudo',
        usesSystem: 'complicated' as const,
        fairPrice: 'from_30_to_49' as const,
      },
      AGORA,
    )

    expect(r.businessType).toBe('Mercearia')
    expect(r.painPoints).toEqual(['cash_flow', 'other'])
    expect(r.painPointOther).toBe('Achar tempo para tudo')
    expect(r.usesSystem).toBe('complicated')
    expect(r.fairPrice).toBe('from_30_to_49')
  })

  it('duas respostas da mesma pessoa nao se confundem — nao ha unicidade', async () => {
    const waitlist = new InMemoryWaitlist()

    await submitWaitlistEntry({ waitlist }, minimo, AGORA)
    await submitWaitlistEntry({ waitlist }, minimo, AGORA)

    expect(waitlist.todas()).toHaveLength(2)
  })
})
