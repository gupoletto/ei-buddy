import type { AuditEntryOutput } from '@na-regua/contracts'
import type { CompanyId } from '../context.js'
import type { AuditTrail, NewAuditEntry } from '../ports/audit-trail.js'

/**
 * Trilha em memoria — somente insercao, como a de verdade.
 *
 * O array e exposto como leitura para o teste conferir o que foi gravado, e nao
 * ha metodo nenhum para apagar ou corrigir. Um falso que permitisse alterar
 * deixaria passar um caso de uso que altera, e o teste diria que a propriedade
 * de somente-insercao existe quando so o banco a teria.
 */
export class InMemoryAuditTrail implements AuditTrail {
  /* Sem `readonly`: `desfazerAte` precisa encurtar o array. O que protege a
     regra de somente-insercao e a PORTA nao ter metodo de apagar, e nao o
     modificador aqui. */
  private entradas: (AuditEntryOutput & { readonly companyId: CompanyId })[] = []
  private sequencia = 0
  /** Liga para simular a trilha indisponivel no meio da transacao. */
  falharAoGravar = false

  async record(entrada: NewAuditEntry): Promise<AuditEntryOutput> {
    if (this.falharAoGravar) throw new Error('trilha de auditoria indisponivel')

    this.sequencia += 1
    const gravada = {
      id: `aud-${this.sequencia}`,
      companyId: entrada.companyId,
      entity: entrada.entity,
      entityId: entrada.entityId,
      action: entrada.action,
      actorId: entrada.actorId,
      channel: entrada.channel,
      occurredAt: entrada.occurredAt.toISOString(),
      before: entrada.before,
      after: entrada.after,
    }
    this.entradas.push(gravada)
    return gravada
  }

  /**
   * A marca do estado atual, para o falso de unidade de trabalho desfazer.
   *
   * ## Isto NAO e uma brecha na regra de somente-insercao
   *
   * A porta `AuditTrail` continua com um metodo so, entao nenhum caso de uso
   * alcanca isto — o tipo dele nao tem. Quem usa e o falso do banco, para
   * simular o que o banco faz: rollback de transacao leva a trilha junto.
   *
   * ## E por que o falso precisa simular
   *
   * Porque desde a NR-087 a trilha entra na transacao do caso de uso. Um falso
   * que guardasse a entrada mesmo depois de o rollback acontecer diria que a
   * propriedade nao existe — e o teste passaria a aprovar exatamente o defeito
   * que a mudanca foi feita para impedir: trilha registrando o que nao houve.
   */
  marcaDeTransacao(): number {
    return this.entradas.length
  }

  /** Desfaz o que foi gravado depois da marca. So o falso do banco chama. */
  desfazerAte(marca: number): void {
    this.entradas.length = marca
  }

  /** O que a empresa do contexto enxerga. Filtra de verdade — RLS em memoria. */
  daEmpresa(companyId: CompanyId): readonly AuditEntryOutput[] {
    return this.entradas.filter((e) => e.companyId === companyId)
  }

  get total(): number {
    return this.entradas.length
  }
}
