import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = {
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}

const createdStamp = {
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey(),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name'),
    cnpj: text('cnpj').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    stateRegistration: text('state_registration'),
    municipalRegistration: text('municipal_registration'),
    street: text('street').notNull(),
    streetNumber: text('street_number').notNull(),
    complement: text('complement'),
    neighborhood: text('neighborhood').notNull(),
    postalCode: text('postal_code').notNull(),
    city: text('city').notNull(),
    state: text('state').notNull(),
    cityIbgeCode: text('city_ibge_code'),
    taxRegime: text('tax_regime').notNull(),
    optedReformaHibrida: boolean('opted_reforma_hibrida').notNull().default(false),
    taxRate: numeric('tax_rate', { precision: 7, scale: 4 }),
    whatsappLinkedAt: timestamp('whatsapp_linked_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('companies_cnpj_unique').on(t.cnpj).where(sql`${t.deletedAt} IS NULL`)],
)

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id').references(() => companies.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_unique').on(t.email).where(sql`${t.deletedAt} IS NULL`),
    index('users_company_id_idx').on(t.companyId),
  ],
)

export const companyIntegrations = pgTable(
  'company_integrations',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id),
    fiscalProvider: text('fiscal_provider'),
    fiscalCompanyId: text('fiscal_company_id'),
    fiscalTokenSecretRef: text('fiscal_token_secret_ref'),
    fiscalNfceEnabled: boolean('fiscal_nfce_enabled'),
    fiscalNfseEnabled: boolean('fiscal_nfse_enabled'),
    fiscalCertificateStatus: text('fiscal_certificate_status'),
    fiscalCertificateExpiresAt: timestamp('fiscal_certificate_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    fiscalHasNfceCsc: boolean('fiscal_has_nfce_csc'),
    paymentsProvider: text('payments_provider'),
    paymentsOnboardingStatus: text('payments_onboarding_status'),
    paymentsAccountId: text('payments_account_id'),
    paymentsWalletId: text('payments_wallet_id'),
    paymentsApiKeySecretRef: text('payments_api_key_secret_ref'),
    paymentsWebhookAuthSecretRef: text('payments_webhook_auth_secret_ref'),
    paymentsEstimatedMonthlyIncomeCents: bigint('payments_estimated_monthly_income_cents', {
      mode: 'number',
    }),
    billingCustomerId: text('billing_customer_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('company_integrations_payments_account_id_idx')
      .on(t.paymentsAccountId)
      .where(sql`${t.paymentsAccountId} IS NOT NULL`),
  ],
)

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    document: text('document'),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    walletLimitCents: bigint('wallet_limit_cents', { mode: 'number' }).notNull().default(0),
    walletBalanceCents: bigint('wallet_balance_cents', { mode: 'number' }).notNull().default(0),
    collectionConsentAt: timestamp('collection_consent_at', { withTimezone: true, mode: 'date' }),
    paymentsCustomerId: text('payments_customer_id'),
    street: text('street'),
    streetNumber: text('street_number'),
    complement: text('complement'),
    neighborhood: text('neighborhood'),
    postalCode: text('postal_code'),
    city: text('city'),
    state: text('state'),
    cityIbgeCode: text('city_ibge_code'),
    ...timestamps,
  },
  (t) => [
    index('customers_company_created_idx')
      .on(t.companyId, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
    index('customers_company_document_idx')
      .on(t.companyId, t.document)
      .where(sql`${t.document} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    index('customers_company_phone_idx')
      .on(t.companyId, t.phone)
      .where(sql`${t.phone} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    uniqueIndex('customers_company_payments_customer_idx')
      .on(t.companyId, t.paymentsCustomerId)
      .where(sql`${t.paymentsCustomerId} IS NOT NULL`),
  ],
)

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    kind: text('kind').notNull(),
    description: text('description').notNull(),
    barcode: text('barcode'),
    unitOfMeasure: text('unit_of_measure').notNull(),
    salePriceCents: bigint('sale_price_cents', { mode: 'number' }).notNull(),
    costPriceCents: bigint('cost_price_cents', { mode: 'number' }).notNull(),
    stock: integer('stock').notNull().default(0),
    minStock: integer('min_stock').notNull().default(0),
    taxRate: numeric('tax_rate', { precision: 7, scale: 4 }),
    category: text('category'),
    supplier: text('supplier'),
    ncm: text('ncm'),
    codigoTributacaoNacionalIss: text('codigo_tributacao_nacional_iss'),
    codigoNbs: text('codigo_nbs'),
    ...timestamps,
  },
  (t) => [
    index('products_company_created_idx')
      .on(t.companyId, t.createdAt)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex('products_company_barcode_idx')
      .on(t.companyId, t.barcode)
      .where(sql`${t.barcode} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
)

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    customerId: uuid('customer_id').references(() => customers.id),
    number: integer('number').notNull(),
    status: text('status').notNull(),
    grossAmountCents: bigint('gross_amount_cents', { mode: 'number' }).notNull(),
    discountCents: bigint('discount_cents', { mode: 'number' }).notNull().default(0),
    taxAmountCents: bigint('tax_amount_cents', { mode: 'number' }).notNull(),
    cardFeeAmountCents: bigint('card_fee_amount_cents', { mode: 'number' }).notNull(),
    netAmountCents: bigint('net_amount_cents', { mode: 'number' }).notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    unique('sales_company_number_unique').on(t.companyId, t.number),
    index('sales_company_created_idx').on(t.companyId, t.createdAt),
  ],
)

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantityDelta: integer('quantity_delta').notNull(),
    stockBefore: integer('stock_before').notNull(),
    stockAfter: integer('stock_after').notNull(),
    reason: text('reason').notNull(),
    saleId: uuid('sale_id').references(() => sales.id),
    purchaseId: uuid('purchase_id'),
    ...createdStamp,
  },
  (t) => [index('inventory_movements_company_created_idx').on(t.companyId, t.createdAt)],
)

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    discountCents: bigint('discount_cents', { mode: 'number' }).notNull().default(0),
    ncm: text('ncm'),
    codigoTributacaoNacionalIss: text('codigo_tributacao_nacional_iss'),
    codigoNbs: text('codigo_nbs'),
  },
  (t) => [index('sale_items_company_sale_idx').on(t.companyId, t.saleId)],
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    method: text('method').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    installments: integer('installments'),
    brand: text('brand'),
    providerPaymentId: text('provider_payment_id'),
    providerStatus: text('provider_status'),
    providerEventId: text('provider_event_id'),
    checkoutUrl: text('checkout_url'),
    pixPayload: text('pix_payload'),
    bankSlipUrl: text('bank_slip_url'),
    identificationField: text('identification_field'),
    dueDate: date('due_date', { mode: 'date' }),
    cardTokenRef: text('card_token_ref'),
    ...createdStamp,
  },
  (t) => [
    index('payments_company_sale_idx').on(t.companyId, t.saleId),
    uniqueIndex('payments_provider_payment_id_idx')
      .on(t.providerPaymentId)
      .where(sql`${t.providerPaymentId} IS NOT NULL`),
    uniqueIndex('payments_provider_event_id_idx')
      .on(t.providerEventId)
      .where(sql`${t.providerEventId} IS NOT NULL`),
  ],
)

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    providerRef: text('provider_ref').notNull(),
    providerStatusCode: text('provider_status_code'),
    providerMessage: text('provider_message'),
    providerPayload: jsonb('provider_payload'),
    number: text('number'),
    xmlPath: text('xml_path'),
    danfeUrl: text('danfe_url'),
    accessKey: text('access_key'),
    series: text('series'),
    qrCode: text('qr_code'),
    ...timestamps,
  },
  (t) => [
    unique('invoices_company_provider_ref_unique').on(t.companyId, t.providerRef),
    index('invoices_company_sale_idx').on(t.companyId, t.saleId),
  ],
)

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
  },
  (t) => [unique('ledger_accounts_company_code_unique').on(t.companyId, t.code)],
)

export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    saleId: uuid('sale_id').references(() => sales.id),
    paymentId: uuid('payment_id').references(() => payments.id),
    customerId: uuid('customer_id').references(() => customers.id),
    ledgerAccountId: uuid('ledger_account_id').references(() => ledgerAccounts.id),
    origin: text('origin').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    outstandingCents: bigint('outstanding_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date', { mode: 'date' }).notNull(),
    collectionUrl: text('collection_url'),
    lastCollectionSentAt: timestamp('last_collection_sent_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastCollectionChannel: text('last_collection_channel'),
    ...timestamps,
  },
  (t) => [index('receivables_company_due_idx').on(t.companyId, t.dueDate)],
)

export const payables = pgTable(
  'payables',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    ledgerAccountId: uuid('ledger_account_id').references(() => ledgerAccounts.id),
    templateId: uuid('template_id').references((): AnyPgColumn => payables.id),
    supplier: text('supplier'),
    description: text('description').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    outstandingCents: bigint('outstanding_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date', { mode: 'date' }).notNull(),
    isTemplate: boolean('is_template').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('payables_company_due_idx').on(t.companyId, t.dueDate)],
)

export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    receivableId: uuid('receivable_id').references(() => receivables.id),
    payableId: uuid('payable_id').references(() => payables.id),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }).notNull(),
    reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'date' }),
    ...createdStamp,
  },
  (t) => [index('settlements_company_created_idx').on(t.companyId, t.createdAt)],
)

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    customerId: uuid('customer_id').references(() => customers.id),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    reminderMinutes: integer('reminder_minutes'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (t) => [index('appointments_company_starts_idx').on(t.companyId, t.startsAt)],
)

export const crmCards = pgTable(
  'crm_cards',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    customerId: uuid('customer_id').references(() => customers.id),
    title: text('title').notNull(),
    boardColumn: text('board_column').notNull(),
    comments: jsonb('comments').notNull().default([]),
    ...timestamps,
  },
  (t) => [index('crm_cards_company_column_idx').on(t.companyId, t.boardColumn)],
)

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    protocol: text('protocol').notNull(),
    category: text('category').notNull(),
    subject: text('subject').notNull(),
    status: text('status').notNull(),
    ...timestamps,
  },
  (t) => [unique('support_tickets_company_protocol_unique').on(t.companyId, t.protocol)],
)

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    storagePath: text('storage_path').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    ...createdStamp,
  },
  (t) => [index('attachments_company_entity_idx').on(t.companyId, t.entityType, t.entityId)],
)

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id),
    authorRole: text('author_role').notNull(),
    body: text('body').notNull(),
    attachmentId: uuid('attachment_id').references(() => attachments.id),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    ...createdStamp,
  },
  (t) => [index('ticket_messages_company_ticket_idx').on(t.companyId, t.ticketId)],
)

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    channel: text('channel').notNull(),
    numberFrom: text('number_from'),
    ...timestamps,
  },
  (t) => [index('conversations_company_created_idx').on(t.companyId, t.createdAt)],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: text('role').notNull(),
    body: text('body').notNull(),
    toolCalls: jsonb('tool_calls'),
    ...createdStamp,
  },
  (t) => [index('messages_company_conversation_idx').on(t.companyId, t.conversationId)],
)

export const confirmations = pgTable(
  'confirmations',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    action: text('action').notNull(),
    payload: jsonb('payload'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    decision: text('decision'),
  },
  (t) => [index('confirmations_company_expires_idx').on(t.companyId, t.expiresAt)],
)

export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('partners_name_unique').on(t.name).where(sql`${t.deletedAt} IS NULL`)],
)

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id),
    code: text('code').notNull(),
    kind: text('kind').notNull(),
    percent: numeric('percent', { precision: 7, scale: 4 }),
    amountCents: bigint('amount_cents', { mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    discountCycles: integer('discount_cycles'),
    maxRedemptions: integer('max_redemptions'),
    redeemedCount: integer('redeemed_count').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('coupons_code_unique').on(t.code).where(sql`${t.deletedAt} IS NULL`),
    index('coupons_partner_id_idx').on(t.partnerId),
  ],
)

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id)
      .unique(),
    planCode: text('plan_code').notNull(),
    status: text('status').notNull(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
    currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true, mode: 'date' }),
    couponId: uuid('coupon_id').references(() => coupons.id),
    restrictedAt: timestamp('restricted_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    providerSubscriptionId: text('provider_subscription_id'),
    providerStatus: text('provider_status'),
    providerEventId: text('provider_event_id'),
    nextDueDate: date('next_due_date', { mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('subscriptions_provider_subscription_id_idx')
      .on(t.providerSubscriptionId)
      .where(sql`${t.providerSubscriptionId} IS NOT NULL`),
  ],
)

export const subscriptionCycles = pgTable(
  'subscription_cycles',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    dueDate: date('due_date', { mode: 'date' }).notNull(),
    status: text('status').notNull(),
    providerPaymentId: text('provider_payment_id'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    ...createdStamp,
  },
  (t) => [index('subscription_cycles_company_due_idx').on(t.companyId, t.dueDate)],
)

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response'),
    ...createdStamp,
  },
  (t) => [unique('idempotency_keys_company_key_unique').on(t.companyId, t.key)],
)

export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    ...createdStamp,
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('outbox_company_pending_idx').on(t.companyId, t.createdAt)],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    channel: text('channel').notNull(),
    requestId: text('request_id'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
  },
  (t) => [index('audit_logs_company_occurred_idx').on(t.companyId, t.occurredAt)],
)

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    companyId: uuid('company_id').references(() => companies.id),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [unique('webhook_events_provider_event_unique').on(t.provider, t.eventId)],
)
