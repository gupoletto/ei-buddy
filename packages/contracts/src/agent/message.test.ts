import { describe, expect, it } from 'vitest'
import { agentMessageInputSchema, agentReplySchema } from './message.js'

describe('mensagem ao assistente', () => {
  it('aceita texto e apara as bordas', () => {
    expect(agentMessageInputSchema.parse({ text: '  quanto vendi hoje?  ' }).text).toBe(
      'quanto vendi hoje?',
    )
  })

  it.each(['', '   ', { text: '' }])('recusa vazio (%j)', (entrada) => {
    expect(agentMessageInputSchema.safeParse(entrada).success).toBe(false)
  })

  it('recusa campo extra', () => {
    expect(agentMessageInputSchema.safeParse({ text: 'oi', canal: 'whatsapp' }).success).toBe(false)
  })

  it('aceita resposta com confirmacao opcional', () => {
    const r = agentReplySchema.parse({
      kind: 'confirmation',
      text: 'Confirma a venda?',
      confirmationId: 'conf-1',
    })
    expect(r.confirmationId).toBe('conf-1')
  })
})
