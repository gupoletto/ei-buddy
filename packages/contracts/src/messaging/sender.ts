import { z } from 'zod'
import { dateTimeSchema, idSchema } from '../common/primitives.js'

/**
 * Envio e recebimento de mensagem — RF-015, RF-016, RF-094, RF-095.
 *
 * Contrato entre `core` e o adapter `whatsapp`, pelo mesmo motivo estrutural
 * das outras portas: `adapter-nao-importa-core` proibe `whatsapp` de conhecer
 * `core`, entao o vocabulario comum mora aqui.
 */

/**
 * Numero de WhatsApp, so digitos, com codigo do pais.
 *
 * Normaliza para o formato com `55` na frente: o cadastro guarda DDD + numero
 * (`phoneSchema`), o provedor exige codigo do pais, e a diferenca entre os dois
 * e a origem classica de "a mensagem nao chegou e ninguem sabe por que".
 */
export const whatsappNumberSchema = z
  .string()
  .transform((v) => {
    const digitos = v.replace(/\D/g, '')
    /* 10 ou 11 digitos = DDD + numero, sem pais. 55 e o unico pais do MVP. */
    return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos
  })
  .refine((d) => d.length === 12 || d.length === 13, {
    message: 'Numero de WhatsApp invalido. Use DDD e numero.',
  })

/**
 * Base do envio.
 *
 * **Campo obrigatorio de proposito.** O README do adapter exige que ele "nao
 * ofereca caminho que contorne" o consentimento (RF-016), e mensagem a cliente
 * final sem consentimento registrado e sancao da ANPD, nao deslize de estilo
 * (ameaca T3 do modelo de ameacas).
 *
 * Isto **nao verifica** consentimento — quem verifica e `core`, que tem o
 * cadastro do cliente. O que o campo faz e tornar o esquecimento
 * inexpressavel: nao existe chamada de envio sem declarar a base.
 *
 * - `customer_opt_in` — cliente registrou consentimento; `recordedAt` e quando.
 * - `own_user` — destinatario e a propria lojista, usuaria do sistema. Nao e
 *   marketing para terceiro, e o sistema respondendo a quem o operou.
 * - `service_reply` — resposta dentro de uma conversa que o cliente iniciou.
 */
export const messageConsentSchema = z.discriminatedUnion('basis', [
  z.object({ basis: z.literal('customer_opt_in'), recordedAt: dateTimeSchema }).strict(),
  z.object({ basis: z.literal('own_user') }).strict(),
  z.object({ basis: z.literal('service_reply'), inboundAt: dateTimeSchema }).strict(),
])

export type MessageConsent = z.infer<typeof messageConsentSchema>

const envelopeBase = {
  companyId: idSchema,
  to: whatsappNumberSchema,
  consent: messageConsentSchema,
  /**
   * Idempotencia do envio. A fila reprocessa, e mensagem duplicada e o lojista
   * parecendo insistente com o cliente dele.
   */
  idempotencyKey: idSchema,
  requestedAt: dateTimeSchema,
}

export const sendTextRequestSchema = z
  .object({
    ...envelopeBase,
    body: z.string().trim().min(1, 'Mensagem vazia.').max(4096, 'Mensagem muito longa.'),
  })
  .strict()

export type SendTextRequest = z.infer<typeof sendTextRequestSchema>

/** Tipos de midia que o MVP envia: comprovante, DANFE e foto de produto. */
export const mediaKindSchema = z.enum(['image', 'document'], {
  error: 'Tipo de midia invalido.',
})
export type MediaKind = z.infer<typeof mediaKindSchema>

export const sendMediaRequestSchema = z
  .object({
    ...envelopeBase,
    kind: mediaKindSchema,
    /** URL publica do arquivo. O provedor baixa dela; nao aceita bytes. */
    url: z.string().url('Link da midia invalido.'),
    caption: z.string().trim().max(1024, 'Legenda muito longa.').optional(),
    /** O provedor mostra ao cliente; sem ele o documento chega como "arquivo". */
    filename: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

export type SendMediaRequest = z.infer<typeof sendMediaRequestSchema>

/**
 * Por que o provedor recusou um envio.
 *
 * Sao recusas por destinatario, nao falhas de infraestrutura, e cada uma pede
 * tratamento diferente em `core`:
 *
 * - `invalid_number` — corrigir o cadastro; retentar nao resolve.
 * - `not_on_whatsapp` — o numero existe e nao tem WhatsApp; usar outro canal.
 * - `blocked_by_recipient` — o cliente bloqueou a loja. Equivale a opt-out.
 * - `outside_service_window` — passou a janela de 24h desde a ultima mensagem
 *   do cliente, e fora dela so mensagem de modelo aprovado sai. **Nao e erro
 *   nosso e retentar nao resolve**; e a regra do provedor.
 * - `rate_limited` — retentar mais tarde, com recuo.
 */
export const sendRejectionReasonSchema = z.enum([
  'invalid_number',
  'not_on_whatsapp',
  'blocked_by_recipient',
  'outside_service_window',
  'rate_limited',
])
export type SendRejectionReason = z.infer<typeof sendRejectionReasonSchema>

/**
 * Resultado do envio.
 *
 * Uniao discriminada, como nas outras portas: recusa por destinatario e
 * RESULTADO, nao excecao. "Numero nao tem WhatsApp" nao pode desfazer a venda
 * que gerou o comprovante.
 */
export const sendResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('sent'),
      /** Id do provedor, para correlacionar com o recibo de entrega. */
      messageId: idSchema,
      to: z.string().min(1),
      sentAt: dateTimeSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('rejected'),
      reason: sendRejectionReasonSchema,
      /** Mensagem em PT-BR para a tela — RNF-054. */
      message: z.string().min(1),
    })
    .strict(),
])

export type SendResult = z.infer<typeof sendResultSchema>

/**
 * Mensagem recebida.
 *
 * O adapter entrega os fatos e **nao interpreta**: nao decide se o numero esta
 * vinculado (RF-094, RF-095) nem se o texto e um pedido de opt-out. As duas
 * coisas dependem de cadastro, que e de `core`. Adapter que interpreta e
 * adapter que precisa ser reescrito quando a regra muda.
 */
export const inboundMessageSchema = z
  .object({
    /** Id do provedor. Chave de idempotencia: webhook e reentregue. */
    providerMessageId: idSchema,
    /** Quem mandou. Para `core` decidir se esta vinculado a alguma empresa. */
    from: whatsappNumberSchema,
    /** Numero da loja que recebeu — e por ele que `core` acha a empresa. */
    to: whatsappNumberSchema,
    text: z.string().nullable(),
    media: z
      .object({ kind: mediaKindSchema, url: z.string().url(), filename: z.string().nullable() })
      .strict()
      .nullable(),
    receivedAt: dateTimeSchema,
  })
  .strict()

export type InboundMessage = z.infer<typeof inboundMessageSchema>

/**
 * Resultado da leitura de um webhook de mensagem.
 *
 * Mesma divisao em quatro casos do webhook de pagamento, e pelo mesmo motivo:
 * cada um pede um codigo HTTP diferente, e `invalid_signature` em especial
 * **nao** responde 200.
 *
 * `ignored` cobre o que o provedor manda e nao nos interessa — recibo de
 * entrega, atualizacao de status, evento de outra versao da API. Responder 4xx
 * a isso faria o provedor reentregar para sempre.
 */
export const inboundReadResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('accepted'), message: inboundMessageSchema }).strict(),
  z.object({ status: z.literal('ignored'), reason: z.string().min(1) }).strict(),
  z.object({ status: z.literal('invalid_signature') }).strict(),
  z.object({ status: z.literal('malformed'), reason: z.string().min(1) }).strict(),
])

export type InboundReadResult = z.infer<typeof inboundReadResultSchema>
