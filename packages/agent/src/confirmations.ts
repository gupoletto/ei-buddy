import { randomUUID } from 'node:crypto'
import type { ConfirmationStore, PendingConfirmation } from './types.js'

/**
 * Confirmacoes em memoria — o esqueleto da NR-061.
 *
 * A tabela `confirmations` ja existe no Postgres; persistir la e a NR-061.
 * Aqui o laço de `processMessage` ja se comporta como a RF-103/104 pedem, para
 * o runtime ser testavel sem WhatsApp e sem migration nova.
 */
export class InMemoryConfirmations implements ConfirmationStore {
  private readonly itens = new Map<string, PendingConfirmation>()

  async put(pending: PendingConfirmation): Promise<void> {
    for (const [id, atual] of this.itens) {
      if (atual.conversationKey === pending.conversationKey) this.itens.delete(id)
    }
    this.itens.set(pending.id, pending)
  }

  async getOpen(conversationKey: string, _now: Date): Promise<PendingConfirmation | undefined> {
    for (const pending of this.itens.values()) {
      if (pending.conversationKey === conversationKey) return pending
    }
    return undefined
  }

  async resolve(id: string, _decision: 'accepted' | 'rejected' | 'expired'): Promise<void> {
    this.itens.delete(id)
  }
}

export function novaConfirmacao(dados: Omit<PendingConfirmation, 'id'>): PendingConfirmation {
  return { id: randomUUID(), ...dados }
}
