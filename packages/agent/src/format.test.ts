import { describe, expect, it } from 'vitest'
import { chaveDaConversa, diaIso, formatarCentavos, mesDoDia } from './format.js'

describe('format', () => {
  it('formata centavos pelo money do dominio', () => {
    expect(formatarCentavos(1_990)).toMatch(/R\$/)
  })

  it('corta o dia no fuso da loja, nao em UTC', () => {
    expect(diaIso(new Date('2026-09-12T02:30:00.000Z'), 'America/Sao_Paulo')).toBe('2026-09-11')
  })

  it('abre o mes civil a partir de uma data ISO', () => {
    expect(mesDoDia('2026-09-11')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('cai no proprio valor quando a data nao e AAAA-MM-DD', () => {
    expect(mesDoDia('hoje')).toEqual({ from: 'hoje', to: 'hoje' })
  })

  it('isola conversa de WhatsApp da do aplicativo', () => {
    expect(chaveDaConversa({ channel: 'app', companyId: 'e1', userId: 'u1' })).toBe('app:e1:u1')
    expect(
      chaveDaConversa({
        channel: 'whatsapp',
        companyId: 'e1',
        userId: 'u1',
        peer: '5511',
      }),
    ).toBe('wa:e1:5511')
  })
})
