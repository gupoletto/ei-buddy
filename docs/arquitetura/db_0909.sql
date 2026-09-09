-- Snapshot documental (2026-09-09), NAO e migration.
--
-- Origem: docs/arquitetura/db_0909.sql da branch asaas_teste.
-- O schema que roda de verdade esta em packages/db/src/migrations/
-- (0001_tenant_isolation … incrementais). Este arquivo descreve o recorte
-- alvo com company_integrations (Focus + Asaas 1:0..1). Nao aplicar com
-- `pnpm db:migrate`.
--
-- Catalogo em prosa: docs/arquitetura/esquema-postgresql.md
-- Duvidas: docs/arquitetura/integracoes/duvidas-db.md

-- Schema do recorte A–J (v2). Dominio da loja + capacidades (fiscal, payments,
-- billing). Vendor (Focus, Asaas, CEP) fica no adapter; no banco so slug
-- *_provider e ids externos. Sem tabelas *_asaas / *_focus.
-- Satelite company_integrations 1:0..1: linha so quando fiscal ou KYC comeca.
-- deleted_at em toda tabela com created_at ou updated_at (nulo = vigente).
-- RLS com FORCE: o dono da tabela tambem obedece. Superuser continua bypass
-- — a aplicacao usa naregua_app (NOSUPERUSER).
-- Split (DEC-018) nao tem tabela: wallet_id ja esta em company_integrations.

CREATE TABLE companies (
  id uuid PRIMARY KEY,
  legal_name text NOT NULL,
  trade_name text,
  cnpj text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  state_registration text,
  municipal_registration text,
  street text NOT NULL,
  street_number text NOT NULL,
  complement text,
  neighborhood text NOT NULL,
  postal_code text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  city_ibge_code text,
  tax_regime text NOT NULL,
  opted_reforma_hibrida boolean NOT NULL DEFAULT false,
  tax_rate numeric(7, 4),
  whatsapp_linked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_tax_regime_check CHECK (
    tax_regime IN ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real')
  )
);

CREATE UNIQUE INDEX companies_cnpj_unique ON companies (cnpj) WHERE deleted_at IS NULL;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  -- Nulo so entre o cadastro da conta e /app/empresa (jornada A).
  company_id uuid REFERENCES companies (id),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role IN ('owner', 'staff', 'platform_admin'))
);

CREATE UNIQUE INDEX users_email_unique ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX users_company_id_idx ON users (company_id);

-- Linha so existe quando a empresa inicia fiscal (A1/CSC/flags) ou KYC de pagamentos.
CREATE TABLE company_integrations (
  company_id uuid PRIMARY KEY REFERENCES companies (id),
  fiscal_provider text,
  fiscal_company_id text,
  fiscal_token_secret_ref text,
  fiscal_nfce_enabled boolean,
  fiscal_nfse_enabled boolean,
  fiscal_certificate_status text,
  fiscal_certificate_expires_at timestamptz,
  fiscal_has_nfce_csc boolean,
  payments_provider text,
  payments_onboarding_status text,
  payments_account_id text,
  payments_wallet_id text,
  payments_api_key_secret_ref text,
  payments_webhook_auth_secret_ref text,
  payments_estimated_monthly_income_cents bigint,
  billing_customer_id text,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_integrations_certificate_status_check CHECK (
    fiscal_certificate_status IS NULL
    OR fiscal_certificate_status IN ('missing', 'valid', 'expired', 'rejected')
  ),
  CONSTRAINT company_integrations_onboarding_status_check CHECK (
    payments_onboarding_status IS NULL
    OR payments_onboarding_status IN ('not_started', 'pending', 'approved', 'rejected')
  )
);

CREATE UNIQUE INDEX company_integrations_payments_account_id_idx
  ON company_integrations (payments_account_id)
  WHERE payments_account_id IS NOT NULL;

CREATE TABLE customers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  name text NOT NULL,
  document text,
  phone text,
  email text,
  notes text,
  wallet_limit_cents bigint NOT NULL DEFAULT 0,
  wallet_balance_cents bigint NOT NULL DEFAULT 0,
  collection_consent_at timestamptz,
  payments_customer_id text,
  street text,
  street_number text,
  complement text,
  neighborhood text,
  postal_code text,
  city text,
  state text,
  city_ibge_code text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_address_complete_check CHECK (
    (
      street IS NULL
      AND street_number IS NULL
      AND neighborhood IS NULL
      AND postal_code IS NULL
      AND city IS NULL
      AND state IS NULL
    )
    OR (
      street IS NOT NULL
      AND street_number IS NOT NULL
      AND neighborhood IS NOT NULL
      AND postal_code IS NOT NULL
      AND city IS NOT NULL
      AND state IS NOT NULL
    )
  )
);

CREATE INDEX customers_company_created_idx ON customers (company_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX customers_company_document_idx ON customers (company_id, document)
  WHERE document IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX customers_company_phone_idx ON customers (company_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX customers_company_payments_customer_idx
  ON customers (company_id, payments_customer_id)
  WHERE payments_customer_id IS NOT NULL;

CREATE TABLE products (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  kind text NOT NULL,
  description text NOT NULL,
  barcode text,
  unit_of_measure text NOT NULL,
  sale_price_cents bigint NOT NULL,
  cost_price_cents bigint NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  tax_rate numeric(7, 4),
  category text,
  supplier text,
  ncm text,
  codigo_tributacao_nacional_iss text,
  codigo_nbs text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_kind_check CHECK (kind IN ('product', 'service')),
  CONSTRAINT products_kind_fiscal_check CHECK (
    (kind = 'product' AND codigo_tributacao_nacional_iss IS NULL AND codigo_nbs IS NULL)
    OR (kind = 'service' AND ncm IS NULL)
  )
);

CREATE INDEX products_company_created_idx ON products (company_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX products_company_barcode_idx ON products (company_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  product_id uuid NOT NULL REFERENCES products (id),
  quantity_delta integer NOT NULL,
  stock_before integer NOT NULL,
  stock_after integer NOT NULL,
  reason text NOT NULL,
  sale_id uuid,
  purchase_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_stock_snapshot_check
    CHECK (stock_after = stock_before + quantity_delta),
  CONSTRAINT inventory_movements_origin_exclusive_check
    CHECK (sale_id IS NULL OR purchase_id IS NULL)
);

CREATE INDEX inventory_movements_company_created_idx ON inventory_movements (company_id, created_at DESC);

CREATE TABLE sales (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  customer_id uuid REFERENCES customers (id),
  number integer NOT NULL,
  status text NOT NULL,
  gross_amount_cents bigint NOT NULL,
  discount_cents bigint NOT NULL DEFAULT 0,
  tax_amount_cents bigint NOT NULL,
  card_fee_amount_cents bigint NOT NULL,
  net_amount_cents bigint NOT NULL,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_status_check CHECK (status IN ('open', 'settled', 'cancelled', 'returned')),
  CONSTRAINT sales_company_number_unique UNIQUE (company_id, number)
);

CREATE INDEX sales_company_created_idx ON sales (company_id, created_at DESC);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  sale_id uuid NOT NULL REFERENCES sales (id),
  product_id uuid NOT NULL REFERENCES products (id),
  quantity integer NOT NULL,
  unit_price_cents bigint NOT NULL,
  discount_cents bigint NOT NULL DEFAULT 0,
  ncm text,
  codigo_tributacao_nacional_iss text,
  codigo_nbs text
);

CREATE INDEX sale_items_company_sale_idx ON sale_items (company_id, sale_id);

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES sales (id);

CREATE TABLE payments (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  sale_id uuid NOT NULL REFERENCES sales (id),
  method text NOT NULL,
  amount_cents bigint NOT NULL,
  installments integer,
  brand text,
  provider_payment_id text,
  provider_status text,
  provider_event_id text,
  checkout_url text,
  pix_payload text,
  bank_slip_url text,
  identification_field text,
  due_date date,
  card_token_ref text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_method_check CHECK (method IN ('cash', 'pix', 'boleto', 'debit', 'credit', 'wallet'))
);

CREATE INDEX payments_company_sale_idx ON payments (company_id, sale_id);
CREATE UNIQUE INDEX payments_provider_payment_id_idx ON payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE UNIQUE INDEX payments_provider_event_id_idx ON payments (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE TABLE invoices (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  sale_id uuid NOT NULL REFERENCES sales (id),
  kind text NOT NULL,
  status text NOT NULL,
  provider_ref text NOT NULL,
  provider_status_code text,
  provider_message text,
  provider_payload jsonb,
  number text,
  xml_path text,
  danfe_url text,
  access_key text,
  series text,
  qr_code text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_kind_check CHECK (kind IN ('nfce', 'nfse')),
  CONSTRAINT invoices_status_check CHECK (
    status IN ('processing', 'authorized', 'rejected', 'contingency', 'cancelled')
  ),
  CONSTRAINT invoices_company_provider_ref_unique UNIQUE (company_id, provider_ref)
);

CREATE INDEX invoices_company_sale_idx ON invoices (company_id, sale_id);

-- D — financeiro. overdue e regra em domain (RF-056), nao coluna.
-- Conta bancaria da baixa (RF-059) fica de fora: DEC-005.
CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_accounts_kind_check CHECK (
    kind IN ('revenue', 'deduction', 'cost', 'expense', 'asset', 'liability')
  ),
  CONSTRAINT ledger_accounts_company_code_unique UNIQUE (company_id, code)
);

CREATE TABLE receivables (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  sale_id uuid REFERENCES sales (id),
  payment_id uuid REFERENCES payments (id),
  customer_id uuid REFERENCES customers (id),
  ledger_account_id uuid REFERENCES ledger_accounts (id),
  origin text NOT NULL,
  amount_cents bigint NOT NULL,
  outstanding_cents bigint NOT NULL,
  due_date date NOT NULL,
  collection_url text,
  last_collection_sent_at timestamptz,
  last_collection_channel text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receivables_origin_check CHECK (origin IN ('sale', 'manual'))
);

CREATE INDEX receivables_company_due_idx ON receivables (company_id, due_date)
  WHERE outstanding_cents > 0;

CREATE TABLE payables (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  ledger_account_id uuid REFERENCES ledger_accounts (id),
  template_id uuid REFERENCES payables (id),
  supplier text,
  description text NOT NULL,
  amount_cents bigint NOT NULL,
  outstanding_cents bigint NOT NULL,
  due_date date NOT NULL,
  is_template boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payables_company_due_idx ON payables (company_id, due_date)
  WHERE outstanding_cents > 0 AND is_template = false;

CREATE TABLE settlements (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  receivable_id uuid REFERENCES receivables (id),
  payable_id uuid REFERENCES payables (id),
  amount_cents bigint NOT NULL,
  settled_at timestamptz NOT NULL,
  reversed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlements_one_target_check CHECK (
    (receivable_id IS NOT NULL AND payable_id IS NULL)
    OR (receivable_id IS NULL AND payable_id IS NOT NULL)
  )
);

CREATE INDEX settlements_company_created_idx ON settlements (company_id, created_at DESC);

-- E — agenda e CRM
CREATE TABLE appointments (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  customer_id uuid REFERENCES customers (id),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  reminder_minutes integer,
  cancelled_at timestamptz,
  reminder_sent_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX appointments_company_starts_idx ON appointments (company_id, starts_at);

CREATE TABLE crm_cards (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  customer_id uuid REFERENCES customers (id),
  title text NOT NULL,
  board_column text NOT NULL,
  comments jsonb NOT NULL DEFAULT '[]',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_cards_column_check CHECK (board_column IN ('afazer', 'andamento', 'concluido'))
);

CREATE INDEX crm_cards_company_column_idx ON crm_cards (company_id, board_column);

-- I — suporte
CREATE TABLE support_tickets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  protocol text NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open', 'waiting', 'closed')),
  CONSTRAINT support_tickets_company_protocol_unique UNIQUE (company_id, protocol)
);

CREATE TABLE ticket_messages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  ticket_id uuid NOT NULL REFERENCES support_tickets (id),
  author_role text NOT NULL,
  body text NOT NULL,
  attachment_id uuid,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_messages_author_check CHECK (author_role IN ('owner', 'staff', 'platform_admin'))
);

CREATE INDEX ticket_messages_company_ticket_idx ON ticket_messages (company_id, ticket_id);

-- J — assistente
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  channel text NOT NULL,
  number_from text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_channel_check CHECK (channel IN ('whatsapp', 'web', 'app'))
);

CREATE INDEX conversations_company_created_idx ON conversations (company_id, created_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  conversation_id uuid NOT NULL REFERENCES conversations (id),
  role text NOT NULL,
  body text NOT NULL,
  tool_calls jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX messages_company_conversation_idx ON messages (company_id, conversation_id);

CREATE TABLE confirmations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  conversation_id uuid NOT NULL REFERENCES conversations (id),
  action text NOT NULL,
  payload jsonb,
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  decision text,
  CONSTRAINT confirmations_decision_check CHECK (
    decision IS NULL OR decision IN ('accepted', 'rejected', 'expired')
  )
);

CREATE INDEX confirmations_company_expires_idx ON confirmations (company_id, expires_at);

-- H — assinatura SaaS (conta-pai do billing). Cupom e da plataforma, sem tenant.
-- partners: quem emite o cupom (Clube X). Nao e split de pagamentos.
CREATE TABLE partners (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX partners_name_unique ON partners (name) WHERE deleted_at IS NULL;

CREATE TABLE coupons (
  id uuid PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES partners (id),
  code text NOT NULL,
  kind text NOT NULL,
  percent numeric(7, 4),
  amount_cents bigint,
  expires_at timestamptz,
  revoked_at timestamptz,
  discount_cycles integer,
  max_redemptions integer,
  redeemed_count integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_kind_check CHECK (kind IN ('percent', 'amount')),
  CONSTRAINT coupons_value_check CHECK (
    (kind = 'percent' AND percent IS NOT NULL AND amount_cents IS NULL)
    OR (kind = 'amount' AND amount_cents IS NOT NULL AND percent IS NULL)
  ),
  CONSTRAINT coupons_discount_cycles_check CHECK (
    discount_cycles IS NULL OR discount_cycles >= 1
  )
);

CREATE UNIQUE INDEX coupons_code_unique ON coupons (code) WHERE deleted_at IS NULL;
CREATE INDEX coupons_partner_id_idx ON coupons (partner_id);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  plan_code text NOT NULL,
  status text NOT NULL,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  coupon_id uuid REFERENCES coupons (id),
  restricted_at timestamptz,
  cancelled_at timestamptz,
  provider_subscription_id text,
  provider_status text,
  provider_event_id text,
  next_due_date date,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_company_unique UNIQUE (company_id),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('trial', 'active', 'overdue', 'restricted', 'cancelled')
  )
);

CREATE UNIQUE INDEX subscriptions_provider_subscription_id_idx
  ON subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE subscription_cycles (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  subscription_id uuid NOT NULL REFERENCES subscriptions (id),
  amount_cents bigint NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL,
  provider_payment_id text,
  paid_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_cycles_status_check CHECK (
    status IN ('pending', 'paid', 'failed', 'refunded')
  )
);

CREATE INDEX subscription_cycles_company_due_idx ON subscription_cycles (company_id, due_date);

-- Plataforma
CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  storage_path text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachments_company_entity_idx ON attachments (company_id, entity_type, entity_id);

ALTER TABLE ticket_messages
  ADD CONSTRAINT ticket_messages_attachment_id_fkey
  FOREIGN KEY (attachment_id) REFERENCES attachments (id);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_company_key_unique UNIQUE (company_id, key)
);

CREATE TABLE outbox (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  topic text NOT NULL,
  payload jsonb NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX outbox_company_pending_idx ON outbox (company_id, created_at)
  WHERE published_at IS NULL;

-- Somente insercao (RF-124). UPDATE/DELETE revogados do papel da aplicacao.
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users (id),
  channel text NOT NULL,
  request_id text,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  CONSTRAINT audit_logs_channel_check CHECK (channel IN ('app', 'whatsapp', 'api', 'job'))
);

CREATE INDEX audit_logs_company_occurred_idx ON audit_logs (company_id, occurred_at DESC);

-- Inbox de webhook: company_id preenchido depois de casar o evento.
-- Sem RLS no insert (a API ainda nao tem tenant). Ver dados.md.
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL,
  company_id uuid REFERENCES companies (id),
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, event_id)
);

CREATE OR REPLACE FUNCTION find_login_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  password_hash text,
  role text,
  name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.company_id, u.password_hash, u.role, u.name
  FROM users u
  WHERE u.email = p_email
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION find_login_by_email(text) FROM PUBLIC;

-- Jornada A: conta existe antes da empresa. RLS em users exige tenant;
-- estas funcoes rodam como dono da tabela (BYPASS / superuser da migration).
CREATE OR REPLACE FUNCTION register_owner(
  p_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_password_hash text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO users (id, name, email, phone, password_hash, role)
  VALUES (p_id, p_name, p_email, p_phone, p_password_hash, 'owner');
$$;

REVOKE ALL ON FUNCTION register_owner(uuid, text, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION attach_user_company(p_user_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
     SET company_id = p_company_id, updated_at = now()
   WHERE id = p_user_id
     AND company_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user cannot be attached to company';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION attach_user_company(uuid, uuid) FROM PUBLIC;

-- RLS em toda tabela de negocio. webhook_events fica de fora no insert.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'company_integrations',
    'customers',
    'products',
    'inventory_movements',
    'sales',
    'sale_items',
    'payments',
    'invoices',
    'ledger_accounts',
    'receivables',
    'payables',
    'settlements',
    'appointments',
    'crm_cards',
    'support_tickets',
    'ticket_messages',
    'conversations',
    'messages',
    'confirmations',
    'subscriptions',
    'subscription_cycles',
    'attachments',
    'idempotency_keys',
    'outbox',
    'audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (company_id = current_setting(''app.company_id'')::uuid)
         WITH CHECK (company_id = current_setting(''app.company_id'')::uuid)',
      t
    );
  END LOOP;

  ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
  ALTER TABLE companies FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON companies
    USING (id = current_setting('app.company_id')::uuid)
    WITH CHECK (id = current_setting('app.company_id')::uuid);
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'naregua_app') THEN
    GRANT USAGE ON SCHEMA public TO naregua_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO naregua_app;
    REVOKE UPDATE, DELETE ON TABLE audit_logs FROM naregua_app;
    GRANT EXECUTE ON FUNCTION find_login_by_email(text) TO naregua_app;
    GRANT EXECUTE ON FUNCTION register_owner(uuid, text, text, text, text) TO naregua_app;
    GRANT EXECUTE ON FUNCTION attach_user_company(uuid, uuid) TO naregua_app;
  END IF;
END
$$;
