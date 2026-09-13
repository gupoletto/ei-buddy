import { describe, expect, it } from 'vitest'
import { InMemoryPlatformAdminAccess } from '../auth/fakes.js'
import { InMemoryWaitlist } from './fakes.js'
import { submitWaitlistEntry } from './submit-waitlist-entry.js'
import { getWaitlistStats, listWaitlistEntries } from './waitlist-admin.js'

const AGORA = new Date('2026-09-13T12:00:00.000Z')
const ADMIN_ID = 'user-admin'
const NAO_ADMIN_ID = 'user-comum'

function cenario() {
  const waitlist = new InMemoryWaitlist()
  const platformAdmin = new InMemoryPlatformAdminAccess({ aoEntrar: () => {}, aoSair: () => {} })
  platformAdmin.tornarSuperAdmin(ADMIN_ID)
  return { deps: { waitlist, platformAdmin }, waitlist }
}

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

describe('listWaitlistEntries — NR-111', () => {
  it('quem nao e Super Admin recebe recusa, e nao a lista', async () => {
    const { deps } = cenario()

    await expect(
      listWaitlistEntries(deps, NAO_ADMIN_ID, { offset: 0, limite: 20 }),
    ).rejects.toThrow('Super Admin')
  })

  it('Super Admin ve a lista, mais nova primeiro', async () => {
    const { deps, waitlist } = cenario()
    await submitWaitlistEntry({ waitlist }, minimo, new Date('2026-09-10T12:00:00.000Z'))
    await submitWaitlistEntry(
      { waitlist },
      { ...minimo, name: 'Joao Lima' },
      new Date('2026-09-12T12:00:00.000Z'),
    )

    const r = await listWaitlistEntries(deps, ADMIN_ID, { offset: 0, limite: 20 })

    expect(r.total).toBe(2)
    expect(r.entries[0]!.name).toBe('Joao Lima')
  })

  it('busca por termo estreita o total, e nao so a pagina', async () => {
    const { deps, waitlist } = cenario()
    await submitWaitlistEntry({ waitlist }, minimo, AGORA)
    await submitWaitlistEntry({ waitlist }, { ...minimo, name: 'Joao Lima' }, AGORA)

    const r = await listWaitlistEntries(deps, ADMIN_ID, { termo: 'maria', offset: 0, limite: 20 })

    expect(r.total).toBe(1)
    expect(r.entries[0]!.name).toBe('Maria Souza')
  })
})

describe('getWaitlistStats — NR-111', () => {
  it('quem nao e Super Admin recebe recusa, e nao os agregados', async () => {
    const { deps } = cenario()

    await expect(getWaitlistStats(deps, NAO_ADMIN_ID)).rejects.toThrow('Super Admin')
  })

  it('agrega dificuldades, sistema e valor justo por contagem', async () => {
    const { deps, waitlist } = cenario()
    await submitWaitlistEntry(
      { waitlist },
      { ...minimo, painPoints: ['cash_flow'] as const, usesSystem: 'complicated' as const },
      AGORA,
    )
    await submitWaitlistEntry(
      { waitlist },
      {
        ...minimo,
        name: 'Joao Lima',
        painPoints: ['cash_flow', 'marketing'] as const,
        usesSystem: 'complicated' as const,
      },
      AGORA,
    )

    const r = await getWaitlistStats(deps, ADMIN_ID)

    expect(r.total).toBe(2)
    expect(r.painPoints).toEqual([
      { value: 'cash_flow', count: 2 },
      { value: 'marketing', count: 1 },
    ])
    expect(r.usesSystem).toEqual([{ value: 'complicated', count: 2 }])
  })

  it('agrupa por dia, em ordem crescente', async () => {
    const { deps, waitlist } = cenario()
    await submitWaitlistEntry({ waitlist }, minimo, new Date('2026-09-12T09:00:00.000Z'))
    await submitWaitlistEntry(
      { waitlist },
      { ...minimo, name: 'Joao Lima' },
      new Date('2026-09-12T20:00:00.000Z'),
    )
    await submitWaitlistEntry(
      { waitlist },
      { ...minimo, name: 'Ana Paula' },
      new Date('2026-09-13T09:00:00.000Z'),
    )

    const r = await getWaitlistStats(deps, ADMIN_ID)

    expect(r.perDay).toEqual([
      { date: '2026-09-12', count: 2 },
      { date: '2026-09-13', count: 1 },
    ])
  })

  it('sem nenhuma resposta, os agregados vem vazios e o total zero', async () => {
    const { deps } = cenario()

    const r = await getWaitlistStats(deps, ADMIN_ID)

    expect(r).toEqual({ total: 0, painPoints: [], usesSystem: [], fairPrice: [], perDay: [] })
  })
})
