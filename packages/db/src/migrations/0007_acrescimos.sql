-- Baseline NR-089 / ADR-0006. Origem fundida: 0007_auditoria.sql, 0018_suporte.sql, 0024_anonimizacao_de_cliente.sql, 0025_vocabulario_da_trilha.sql.
-- Historia nova: nao editar as migrations 0001–0025 antigas — elas nao existem mais.

-- Trilha de auditoria somente-insercao — NR-025. RF-123, RF-124. US-061.
--
-- "Quero saber quem fez o que para resolver divergencia com meu funcionario."
-- Uma trilha que aceita correcao nao resolve divergencia nenhuma: quem tem
-- acesso para alterar o dado costuma ter acesso para alterar o registro do que
-- fez. Por isso a garantia mora AQUI, e nao no tipo do TypeScript — a porta em
-- `core` nao oferece update nem delete, mas o proximo `psql` ignoraria isso.

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SEM chave estrangeira para `companies`, e de proposito.
  --
  -- Toda outra tabela de negocio referencia a empresa com ON DELETE RESTRICT.
  -- Aqui isso criaria uma amarra circular: as linhas nunca podem ser apagadas
  -- (e o ponto da tabela), entao a FK tornaria a empresa indeletavel para
  -- sempre. Prova nao pode depender da existencia daquilo que ela prova.
  --
  -- A coluna continua sendo `company_id` e continua sujeita a RLS: o
  -- isolamento entre lojas vale igual, so a integridade referencial e que sai.
  company_id  uuid NOT NULL,

  -- Nome da entidade no glossario: `Customer`, `Sale`, `Product`.
  entity      text NOT NULL,
  entity_id   uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'cancelled')),

  -- O trio da US-061: quem, por onde, quando.
  --
  -- `actor_id` tambem sem FK, pelo mesmo motivo — e porque o autor pode ser
  -- desligado da empresa sem que o que ele fez deixe de valer.
  actor_id    uuid NOT NULL,
  -- app | whatsapp. `text` + CHECK, como o resto do schema; enum nativo nao
  -- volta atras, e canal e a lista mais provavel de crescer.
  channel     text NOT NULL CHECK (channel IN ('app', 'whatsapp')),
  occurred_at timestamptz NOT NULL,

  -- So os campos que mudaram, nao o registro inteiro — quem esta resolvendo
  -- divergencia com um funcionario nao quer diff, quer resposta.
  -- `jsonb` e nao `json`: consultavel por campo, e sem espaco em branco.
  before      jsonb,
  after       jsonb,

  created_at  timestamptz NOT NULL DEFAULT now(),

  -- `created` nao tem estado anterior; o resto tem.
  CONSTRAINT audit_logs_criacao_sem_antes
    CHECK (action <> 'created' OR before IS NULL)
);

COMMENT ON TABLE audit_logs IS
  'Trilha de auditoria somente-insercao (RF-123, RF-124). UPDATE e DELETE sao bloqueados por gatilho.';

-- A pergunta que a tela faz: "o que aconteceu com este cliente?", do mais
-- recente para o mais antigo.
CREATE INDEX audit_logs_por_entidade
  ON audit_logs (company_id, entity, entity_id, occurred_at DESC);

-- A outra pergunta: "o que o Joao fez ontem?" — a que resolve a divergencia.
CREATE INDEX audit_logs_por_autor ON audit_logs (company_id, actor_id, occurred_at DESC);

SELECT enable_tenant_isolation('audit_logs');

-- ---------------------------------------------------------------------------
-- Somente insercao — RF-124
-- ---------------------------------------------------------------------------

-- Por que gatilho, e nao `REVOKE UPDATE, DELETE`:
--
-- REVOKE depende de a aplicacao conectar com um papel que nao seja o dono da
-- tabela. Em muitos ambientes ela conecta com o mesmo papel que criou o schema
-- — foi exatamente o caso que a CI pegou com RLS (ver o README de `db`) — e o
-- dono ignora a propria concessao. O gatilho vale para o dono tambem.
--
-- Superusuario ainda consegue escapar, desligando gatilho ou usando
-- `session_replication_role = replica`. Isso e aceito: quem tem superusuario ja
-- pode reescrever o banco inteiro, e nenhuma barreira dentro do banco resolve
-- isso — a barreira ali e nao dar superusuario a aplicacao.
CREATE OR REPLACE FUNCTION audit_logs_somente_insercao() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs e somente-insercao: % nao e permitido.', TG_OP
    USING HINT = 'Trilha que aceita correcao deixa de ser prova — RF-124.';
END
$$;

COMMENT ON FUNCTION audit_logs_somente_insercao() IS
  'Recusa UPDATE, DELETE e TRUNCATE em audit_logs (RF-124).';

CREATE TRIGGER audit_logs_sem_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_somente_insercao();

CREATE TRIGGER audit_logs_sem_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_somente_insercao();

-- TRUNCATE nao dispara gatilho de linha — ele nao percorre linha nenhuma, que
-- e justamente o que o torna rapido. Sem este terceiro gatilho, um
-- `TRUNCATE audit_logs` apagaria a trilha inteira passando por cima dos outros
-- dois. Por isso `FOR EACH STATEMENT`.
CREATE TRIGGER audit_logs_sem_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_somente_insercao();


-- Chamados de suporte — NR-080, US-062.
--
-- A tela de suporte existia inteira sobre `lib/mock-data`: o lojista abria um
-- chamado, via a confirmacao com numero de protocolo, e nada era gravado. O
-- badge de "resposta nova" na navegacao contava mensagens de uma conversa
-- inventada.
--
-- ## Duas tabelas, e nao uma
--
-- O chamado e a CONVERSA, e as mensagens sao dela. A equipe de suporte responde
-- de FORA do app, por um painel proprio: se as respostas morassem num campo do
-- chamado, o painel e o cliente reescreveriam a mesma linha em concorrencia, e
-- a ultima escrita apagaria a outra.

-- ---------------------------------------------------------------------------
-- O numero que a pessoa fala ao telefone
-- ---------------------------------------------------------------------------
--
-- `AAAA-NNNN`, com sequencia GLOBAL e nao por empresa. O protocolo existe para
-- a equipe de suporte localizar o chamado sem perguntar de qual loja ele e —
-- e uma sequencia por empresa faria dois chamados diferentes terem o mesmo
-- numero, o que derrota o proposito.
--
-- O que isso revela e quantos chamados a plataforma ja teve. E um vazamento
-- pequeno e conhecido, e o contrario — protocolo ambiguo no telefone — custa
-- mais caro todos os dias.

CREATE SEQUENCE support_ticket_protocol_seq;

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------

CREATE TABLE support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  protocol      text NOT NULL,
  subject       text NOT NULL CHECK (length(btrim(subject)) >= 5),

  -- `text` + CHECK, como o resto do schema. Enum nativo nao volta atras, e
  -- categoria de chamado e das listas mais provaveis de crescer.
  category      text NOT NULL
                  CHECK (category IN ('financeiro', 'cadastro', 'vendas', 'tecnico', 'outro')),

  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'waiting', 'closed')),

  -- Quando o LOJISTA leu por ultimo. Nao ha contador de nao lidas.
  --
  -- Um contador seria denormalizacao com dois donos: o painel do suporte
  -- incrementa ao responder, o app zera ao abrir, e as duas escritas correm em
  -- concorrencia — e o numero passa a divergir sem que ninguem consiga dizer
  -- qual dos dois errou. O carimbo tem um dono so (o app) e as nao lidas viram
  -- uma CONTAGEM: mensagens do suporte depois desta data. Contagem derivada nao
  -- diverge, porque nao e guardada.
  --
  -- Nulo = nunca abriu o detalhe. Toda resposta conta como nao lida.
  last_read_at  timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Unico GLOBAL, e nao por empresa: e o que o protocolo promete ao telefone.
CREATE UNIQUE INDEX support_tickets_protocolo_unico ON support_tickets (protocol);

-- A lista da tela, do mais recente para tras.
CREATE INDEX support_tickets_por_atualizacao
  ON support_tickets (company_id, updated_at DESC);

-- Os que ainda estao vivos — o numero do topo da tela e do sino.
CREATE INDEX support_tickets_em_aberto
  ON support_tickets (company_id, status)
  WHERE status <> 'closed';

SELECT enable_tenant_isolation('support_tickets');

-- ---------------------------------------------------------------------------
-- ticket_messages
-- ---------------------------------------------------------------------------

CREATE TABLE ticket_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  ticket_id    uuid NOT NULL REFERENCES support_tickets (id) ON DELETE RESTRICT,

  -- Quem falou. `suporte` vem do painel administrativo, `cliente` vem do app.
  author       text NOT NULL CHECK (author IN ('cliente', 'suporte')),

  -- Nome de quem escreveu, COPIADO no instante. Nao e referencia viva: quem
  -- respondeu pode sair da equipe, e a conversa tem de continuar dizendo quem
  -- falou — a mesma razao de `sale_items` copiar descricao e preco.
  author_name  text NOT NULL,

  body         text NOT NULL CHECK (length(btrim(body)) >= 1),

  -- Nome do arquivo anexado. O arquivo em si ainda nao tem onde morar: nao ha
  -- decisao de armazenamento (DEC-009), e inventar um caminho local seria
  -- criar um anexo que some no primeiro deploy.
  attachment   text,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- A conversa, na ordem em que foi dita.
CREATE INDEX ticket_messages_por_chamado
  ON ticket_messages (company_id, ticket_id, created_at);

SELECT enable_tenant_isolation('ticket_messages');

COMMENT ON TABLE support_tickets IS
  'Chamados de suporte (NR-080, US-062). Nao lidas sao CONTADAS a partir de last_read_at, nunca guardadas.';


-- Marca de anonimizacao no cliente — NR-086, RF-127, RF-128.
--
-- `core` tem o caso de uso desde a NR-031 e a porta pede `anonymizedAt` — e a
-- coluna nunca existiu. Consequencia: nao havia como implementar
-- `DataSubjectRepository`, e por isso o direito de exclusao (LGPD art. 18, VI)
-- nao tinha caminho no produto.
--
-- ## Por que a data importa, e nao um booleano
--
-- Porque a segunda chamada precisa responder QUANDO. O caso de uso recusa
-- reanonimizar com "este cliente ja foi anonimizado em <data>" — e a data e o
-- que o titular pergunta quando cobra o atendimento do pedido dele. Com um
-- booleano, a resposta seria "ja foi", que nao serve de comprovante.
--
-- ## Por que a linha nao e apagada
--
-- Apagar o cliente destruiria as vendas que apontam para ele: os totais de
-- periodos ja fechados mudariam retroativamente, o DRE deixaria de bater, e a
-- obrigacao de guardar a venda por cinco anos seria descumprida. O `id` fica,
-- os valores ficam, os campos pessoais somem — RF-128.
--
-- O titular pediu exclusao e recebe anonimizacao. A diferenca esta escrita no
-- comprovante que o caso de uso devolve.

ALTER TABLE customers ADD COLUMN anonymized_at timestamptz;

-- `ON DELETE SET NULL` como o resto do schema: quem anonimizou pode sair da
-- empresa depois, e o cadastro dele ser removido. A anonimizacao continua
-- registrada — perder QUEM e aceitavel, perder QUE ACONTECEU nao seria.
ALTER TABLE customers ADD COLUMN anonymized_by uuid REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN customers.anonymized_at IS
  'Quando os dados pessoais foram substituidos a pedido do titular (RF-127). Nulo enquanto nao houve pedido.';

-- Indice parcial: a esmagadora maioria e nula, e a unica consulta que interessa
-- e "quais foram anonimizados" — para o relatorio de atendimento a titulares.
CREATE INDEX customers_anonimizados
  ON customers (company_id, anonymized_at)
  WHERE anonymized_at IS NOT NULL;


-- O vocabulario da trilha cresce — NR-087, RF-123, US-061.
--
-- ## O problema
--
-- A 0007 fechou `action` em quatro verbos de CRUD. Cinco eventos que NAO sao
-- CRUD vinham sendo gravados como o verbo mais proximo, com o nome real
-- escondido em `after.event`:
--
--   session_started, session_ended  -> action = 'updated'   (entidade User)
--   access_granted                  -> action = 'created'   (entidade User)
--   anonymized                      -> action = 'updated'   (entidade Customer)
--   data_export                     -> action = 'created'   (entidade Company)
--
-- Tres arquivos de `core` traziam o mesmo comentario admitindo a gambiarra e
-- dizendo que crescer o vocabulario era uma migration. E esta.
--
-- ## Por que isso nao era estetico
--
-- A US-061 e "quero saber quem fez o que para resolver divergencia com meu
-- funcionario". Com o vocabulario antigo, perguntar "o que foi alterado neste
-- usuario" devolvia LOGINS, e "quais usuarios foram criados" devolvia tambem
-- quem so ganhou acesso a mais uma loja. A trilha respondia a pergunta errada,
-- e o filtro certo exigia saber do truque do `after.event` — que nenhum indice
-- alcanca.
--
-- ## Por que agora
--
-- Porque agora e de graca. A trilha vivia em memoria ate esta tarefa: nao ha
-- uma linha gravada em lugar nenhum. Depois do primeiro registro em producao,
-- renomear acao vira migracao de dado — e migracao de dado numa tabela
-- somente-insercao, cujos gatilhos recusam UPDATE, seria uma tabela nova e uma
-- copia.
--
-- ## O CHECK e recriado, e nao alterado
--
-- Postgres nao tem `ALTER CONSTRAINT` para mudar a expressao de um CHECK.
-- Derrubar e recriar e o caminho, e e seguro aqui porque a tabela esta vazia —
-- num banco com dados, o `ADD CONSTRAINT` validaria as linhas existentes e
-- falharia se alguma tivesse valor fora da lista nova. Como a lista so CRESCE,
-- nem isso aconteceria.

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    -- Os quatro de CRUD, como antes.
    'created', 'updated', 'deleted', 'cancelled',
    -- Os cinco que estavam escondidos em `after.event`.
    'access_granted', 'anonymized', 'data_export', 'session_started', 'session_ended'
  ));

-- O CHECK de "criacao nao tem antes" continua valendo, e continua sendo sobre
-- `created` apenas: os verbos novos tambem nascem sem estado anterior, mas por
-- razoes proprias — `anonymized` de proposito (guardar o antes preservaria o
-- dado que o titular pediu para excluir), e os outros porque nao ha antes.
-- Amarra-los ao mesmo CHECK esconderia essa diferenca.

COMMENT ON COLUMN audit_logs.action IS
  'Verbo do evento. Quatro de CRUD mais cinco de dominio (NR-087). Evento novo entra aqui, e nao em after.event.';

-- ---------------------------------------------------------------------------
-- Colunas do recorte 0909 que a main ainda nao tinha (ADR-0006).
-- Endereco ja nasceu como postal_code / neighborhood / street_number no 0002.
-- ---------------------------------------------------------------------------

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS opted_reforma_hibrida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city_ibge_code text,
  ADD COLUMN IF NOT EXISTS whatsapp_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS collection_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS payments_customer_id text,
  ADD COLUMN IF NOT EXISTS city_ibge_code text;

CREATE UNIQUE INDEX IF NOT EXISTS customers_company_payments_customer_idx
  ON customers (company_id, payments_customer_id)
  WHERE payments_customer_id IS NOT NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS codigo_tributacao_nacional_iss text,
  ADD COLUMN IF NOT EXISTS codigo_nbs text;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_kind_check,
  ADD CONSTRAINT products_kind_check CHECK (kind IN ('product', 'service'));

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS pix_payload text,
  ADD COLUMN IF NOT EXISTS bank_slip_url text,
  ADD COLUMN IF NOT EXISTS identification_field text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS card_token_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_idx
  ON payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_event_id_idx
  ON payments (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'nfce',
  ADD COLUMN IF NOT EXISTS provider_ref text,
  ADD COLUMN IF NOT EXISTS provider_status_code text,
  ADD COLUMN IF NOT EXISTS provider_message text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb,
  ADD COLUMN IF NOT EXISTS xml_path text,
  ADD COLUMN IF NOT EXISTS qr_code text;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_kind_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_kind_check CHECK (kind IN ('nfce', 'nfse'));

ALTER TABLE ledger_accounts
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Recorte A–J que a main nao tinha: CRM, assistente, SaaS, outbox, webhooks.

CREATE TABLE crm_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers (id) ON DELETE RESTRICT,
  title text NOT NULL,
  board_column text NOT NULL,
  comments jsonb NOT NULL DEFAULT '[]',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_cards_column_check CHECK (board_column IN ('afazer', 'andamento', 'concluido'))
);

CREATE INDEX crm_cards_company_column_idx ON crm_cards (company_id, board_column);
SELECT enable_tenant_isolation('crm_cards');

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  channel text NOT NULL,
  number_from text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_channel_check CHECK (channel IN ('whatsapp', 'web', 'app'))
);

CREATE INDEX conversations_company_created_idx ON conversations (company_id, created_at DESC);
SELECT enable_tenant_isolation('conversations');

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE RESTRICT,
  role text NOT NULL,
  body text NOT NULL,
  tool_calls jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX messages_company_conversation_idx ON messages (company_id, conversation_id);
SELECT enable_tenant_isolation('messages');

CREATE TABLE confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE RESTRICT,
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
SELECT enable_tenant_isolation('confirmations');

CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX partners_name_unique ON partners (name) WHERE deleted_at IS NULL;

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
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

SELECT enable_tenant_isolation('subscriptions');

CREATE TABLE subscription_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES subscriptions (id) ON DELETE RESTRICT,
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
SELECT enable_tenant_isolation('subscription_cycles');

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachments_company_entity_idx ON attachments (company_id, entity_type, entity_id);
SELECT enable_tenant_isolation('attachments');

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_company_key_unique UNIQUE (company_id, key)
);

SELECT enable_tenant_isolation('idempotency_keys');

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX outbox_company_pending_idx ON outbox (company_id, created_at)
  WHERE published_at IS NULL;

SELECT enable_tenant_isolation('outbox');

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  company_id uuid REFERENCES companies (id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, event_id)
);

-- Inbox: insert ainda sem tenant. USING so filtra quando o contexto existe;
-- WITH CHECK (true) deixa o webhook gravar antes do match (db_0909).
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_events
  USING (
    current_setting('app.company_id', true) IS NOT NULL
    AND current_setting('app.company_id', true) <> ''
    AND company_id = current_setting('app.company_id', true)::uuid
  )
  WITH CHECK (true);

-- outstanding_cents (db_0909) e o saldo em aberto. A main gravava
-- settled_amount_cents; a coluna gerada espelha a conta sem mudar os writers.
ALTER TABLE receivables
  ADD COLUMN outstanding_cents bigint
    GENERATED ALWAYS AS (amount_cents - settled_amount_cents) STORED;

ALTER TABLE payables
  ADD COLUMN outstanding_cents bigint
    GENERATED ALWAYS AS (amount_cents - settled_amount_cents) STORED;

-- Colunas 0909 da trilha, derivadas do snapshot (balance_after / quantity_delta).
ALTER TABLE inventory_movements
  ADD COLUMN stock_after integer GENERATED ALWAYS AS (balance_after) STORED,
  ADD COLUMN stock_before integer GENERATED ALWAYS AS (balance_after - quantity_delta) STORED;

-- kind 0909 acompanha type da main (receita/despesa/...).
UPDATE ledger_accounts SET kind = type WHERE kind IS NULL;


