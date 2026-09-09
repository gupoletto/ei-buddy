import type { InventoryMovementOutput, MovementKind } from '@na-regua/contracts'
import type { CompanyId, UserId } from '../context.js'
import type { TransactionalAuditTrail } from './audit-trail.js'

/**
 * Portas do estoque — NR-023, RF-022 a RF-024.
 *
 * Como em `sale-writers`, a fronteira de transacao e o CASO DE USO
 * ([principio 6](../../../../docs/arquitetura/principios.md)): ajustar saldo e
 * gravar o movimento precisam entrar juntos ou nao entrar. Saldo mudado sem
 * movimento e a trilha mentindo; movimento sem saldo mudado e a mesma mentira
 * ao contrario.
 */

/**
 * Produto do ponto de vista do estoque.
 *
 * **Duas colunas aqui nao existem no schema.** `products` (`0002_cadastros`)
 * tem `stock_quantity integer NOT NULL DEFAULT 0` e nao tem `location`. Logo:
 *
 * - **`stockQuantity` anulavel** exige uma coluna que aceite nulo, ou um flag
 *   `tracks_stock`. Hoje o banco nao sabe dizer "sem controle de estoque" —
 *   ele so sabe dizer zero, e RF-022 pede que os dois sejam distinguiveis.
 * - **`location`** nao tem coluna nenhuma.
 *
 * A porta declara as duas assim mesmo, pelo mesmo motivo que
 * `CompanySettingsRepository` declara aliquota e tabela de tarifas sem tabela:
 * tornar a falta explicita e melhor que espalhar valor chutado pelo caso de
 * uso. Quem implementa hoje devolve `null` nas duas; quando as colunas
 * existirem, muda so o implementador — nem o caso de uso nem o teste.
 */
export type InventoryProductSnapshot = {
  readonly id: string
  readonly description: string
  readonly salePriceCents: number
  /** `null` = produto sem controle de estoque. NAO e zero — RF-022. */
  readonly stockQuantity: number | null
  readonly location: string | null
  readonly minStock: number | null
}

export type InventoryReader = {
  /** `undefined` quando nao existe OU e de outra empresa — nunca um erro. */
  findById(companyId: CompanyId, productId: string): Promise<InventoryProductSnapshot | undefined>
}

/** Uma linha da trilha. Nada aqui e atualizado depois — RF-124. */
export type NewInventoryMovement = {
  readonly companyId: CompanyId
  readonly productId: string
  readonly kind: MovementKind
  /** Assinado: negativo tira, positivo devolve. */
  readonly quantityDelta: number
  /** Saldo depois deste movimento. */
  readonly balanceAfter: number
  readonly reason: string | null
  readonly saleId: string | null
  readonly createdBy: UserId
  readonly createdAt: Date
}

/**
 * Escopo transacional emprestado pelo `InventoryUnitOfWork`.
 *
 * A leitura mora aqui dentro, e nao fora, de proposito: entre ler o saldo e
 * grava-lo cabe outra venda no balcao. Ler dentro da mesma transacao e o que
 * torna o ajuste uma decisao sobre o saldo que de fato vale.
 */
/*
 * Inclui a trilha (NR-087): auditar aqui e auditar DENTRO da transacao.
 * O motivo esta em `TransactionalAuditTrail` — fora dela, a trilha
 * sobrevive ao rollback e passa a registrar o que nao aconteceu, e uma
 * segunda conexao por transacao esgota o pool.
 */
export type InventoryTransaction = TransactionalAuditTrail & {
  readonly products: InventoryReader

  /**
   * Grava o saldo que passa a valer.
   *
   * Absoluto, e nao incremento, porque o ajuste de inventario e absoluto por
   * natureza: o lojista contou dezoito, entao sao dezoito. Somar um delta
   * calculado antes da transacao reintroduziria a corrida que ler aqui dentro
   * evitou.
   */
  setStock(productId: string, quantity: number): Promise<void>

  insertMovement(movimento: NewInventoryMovement): Promise<InventoryMovementOutput>
}

export type InventoryUnitOfWork = {
  /**
   * Abre a transacao com o tenant do contexto definido e empresta o escopo.
   *
   * `companyId` explicito: e ele que vira `app.company_id` na sessao, e a
   * politica de RLS nao funciona sem isso (ADR-0001).
   */
  transaction<T>(companyId: CompanyId, fn: (tx: InventoryTransaction) => Promise<T>): Promise<T>
}

/**
 * Leitura de estoque fora de transacao — RF-022.
 *
 * Consultar saldo no balcao e leitura pura e frequente; abrir transacao para
 * ela seria custo sem contrapartida.
 */
export type InventoryQueries = {
  readonly products: InventoryReader
}
