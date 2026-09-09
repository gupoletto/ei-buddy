/**
 * Adapter de assinatura SaaS — a NOSSA mensalidade. Implementa
 * SubscriptionProvider sobre /v3/subscriptions da Asaas (ADR-0004).
 *
 * Separado de packages/payments de proposito: sao dois problemas de negocio
 * distintos — a nossa receita e o dinheiro do lojista.
 */
export const PLACEHOLDER = 'billing' as const
