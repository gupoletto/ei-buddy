-- Baseline NR-089 / ADR-0006. Origem fundida: 0015_credenciais_fiscais.sql.
-- Historia nova: nao editar as migrations 0001–0025 antigas — elas nao existem mais.

-- Credenciais fiscais da empresa — NR-042. RF-004, RNF-022.
--
-- O que falta para o emissor Focus NFe sair do papel: cada lojista tem a
-- propria conta no provedor, com o proprio token, e nao havia onde guarda-lo.
--
-- ## Tabela separada, e nao colunas em `companies`
--
-- Tres razoes, e nenhuma e estetica:
--
-- 1. `companies` e lida em quase toda consulta. Segredo cifrado numa coluna
--    dela viajaria junto o tempo todo, para lugar nenhum — e a chance de
--    aparecer num log de consulta cresce com o numero de lugares que a leem.
-- 2. Conceder acesso a esta tabela e uma decisao propria. Com tudo em
--    `companies`, quem pode ler o nome fantasia pode ler o certificado.
-- 3. A maioria das empresas nao emite nota no primeiro dia. Linha ausente e
--    mais honesto que colunas nulas numa tabela que todo mundo consulta.
--
-- ## Tudo aqui e cifrado em AES-256-GCM antes de entrar
--
-- Ver `secret-box.ts`. O `company_id` entra como dado autenticado: mover a
-- linha de uma empresa para outra dentro do banco NAO da a ela o token do
-- vizinho — a decifragem falha.

CREATE TABLE company_fiscal_credentials (
  -- A empresa E a chave: uma conta de emissor por lojista.
  company_id            uuid PRIMARY KEY REFERENCES companies (id) ON DELETE RESTRICT,

  -- Token do Focus NFe, cifrado. Vai como usuario do Basic, senha vazia.
  focus_token           text,

  -- Certificado A1 (PKCS#12) e a senha dele, os dois cifrados — RF-004.
  -- O binario entra em base64 ANTES de cifrar: `text` guarda os dois passos sem
  -- que ninguem precise lembrar de decodificar na ordem certa.
  certificate           text,
  certificate_password  text,

  -- Vencimento do certificado, EM CLARO de proposito.
  --
  -- E o unico campo aqui que nao e segredo, e precisa ser consultavel: a
  -- RF-004 manda avisar 30 dias antes, e uma varredura que tivesse de decifrar
  -- todos os certificados para achar os que vencem seria uma varredura que
  -- mantem segredo em memoria sem necessidade.
  certificate_expires_at date,

  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES users (id) ON DELETE SET NULL,

  -- Certificado sem senha nao abre, e senha sem certificado nao serve. Os dois
  -- andam juntos ou nenhum entra.
  CONSTRAINT fiscal_certificado_completo
    CHECK (num_nonnulls(certificate, certificate_password) IN (0, 2)),

  -- Certificado guardado sem vencimento tornaria o aviso da RF-004 impossivel —
  -- e o lojista descobriria o vencimento quando a nota parasse de sair.
  CONSTRAINT fiscal_certificado_tem_validade
    CHECK ((certificate IS NULL) = (certificate_expires_at IS NULL))
);

COMMENT ON TABLE company_fiscal_credentials IS
  'Token do emissor e certificado A1, cifrados (RF-004, RNF-022). Um por empresa.';

COMMENT ON COLUMN company_fiscal_credentials.certificate_expires_at IS
  'Em claro: a varredura de vencimento (RF-004) nao pode precisar decifrar tudo.';

-- A varredura da RF-004: quem vence nos proximos 30 dias.
--
-- Sem `WHERE`, porque a consulta e por FAIXA de data e nao por um estado — e
-- toda linha desta tabela e candidata. A tabela e pequena por natureza: uma
-- linha por empresa que emite.
CREATE INDEX company_fiscal_credentials_por_vencimento
  ON company_fiscal_credentials (company_id, certificate_expires_at)
  WHERE certificate_expires_at IS NOT NULL;

SELECT enable_tenant_isolation('company_fiscal_credentials');

-- ---------------------------------------------------------------------------
-- company_integrations — satélite 1:0..1 (ADR-0006). Metadata, não o cofre.
-- Linha só quando fiscal ou KYC de pagamentos começa. Token/A1 continuam em
-- company_fiscal_credentials.
-- ---------------------------------------------------------------------------

CREATE TABLE company_integrations (
  company_id uuid PRIMARY KEY REFERENCES companies (id) ON DELETE RESTRICT,
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

SELECT enable_tenant_isolation('company_integrations');

COMMENT ON TABLE company_integrations IS
  'Satelite fiscal+pagamentos+billing (db_0909). Segredo cifrado mora em company_fiscal_credentials.';

