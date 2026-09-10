-- Baseline NR-089 / ADR-0006. Origem fundida: 0002_cadastros.sql, 0003_vendas_e_financeiro.sql, 0005_alinhar_regime_tributario.sql, 0006_agenda.sql, 0008_movimentos_de_estoque.sql, 0010_contas_a_pagar.sql, 0012_plano_de_contas.sql, 0013_notas_fiscais.sql, 0014_campos_fiscais_do_produto.sql, 0016_ordem_da_trilha_de_estoque.sql, 0019_endereco.sql, 0020_fim_e_local_do_compromisso.sql, 0021_dados_fiscais_da_empresa.sql.
-- Historia nova: nao editar as migrations 0001–0025 antigas — elas nao existem mais.

-- Schema de cadastros: empresa, acesso, cliente e produto — NR-008.
-- RF-001, RF-002, RF-005, RF-009, RF-016, RF-017, RF-018, RF-019.
--
-- Convencoes em docs/arquitetura/dados.md#convenções-de-schema: tabela plural
-- em snake_case, dinheiro em bigint de centavos, timestamptz em UTC com sufixo
-- _at, sem enum nativo (migrar dói), e todo indice comecando por company_id
-- porque com RLS toda consulta filtra por ele.
--
-- Nota sobre percentual: dados.md documenta `numeric(7,4)` com o exemplo
-- `0.1250 = 12,5%` (fracao), mas o `rateSchema` de contracts define percentual
-- em PONTOS (18 = 18%), e contracts e o contrato unico (principio 4). Aqui a
-- coluna guarda PONTOS PERCENTUAIS — 18.0000 e 18%. Guardar fracao de um lado
-- e ponto do outro e um erro de 100x esperando a primeira venda.

-- ---------------------------------------------------------------------------
-- Isolamento da tabela raiz
-- ---------------------------------------------------------------------------

-- `companies` e o tenant, entao a coluna que a identifica e o proprio `id` —
-- ela nao tem `company_id`. Por isso nao serve `enable_tenant_isolation`, que
-- exige aquela coluna. Funcao separada em vez de um parametro opcional na
-- outra: a raiz e um caso, nao uma variacao, e nomear o caso evita alguem
-- passar a opcao errada numa tabela comum.
CREATE OR REPLACE FUNCTION enable_root_tenant_isolation(alvo regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', alvo);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', alvo);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', alvo);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (id = current_company_id()) WITH CHECK (id = current_company_id())', alvo);
END
$$;

COMMENT ON FUNCTION enable_root_tenant_isolation(regclass) IS
  'Isolamento da tabela raiz do tenant, onde a coluna do tenant e o proprio id.';

-- ---------------------------------------------------------------------------
-- companies — a empresa
-- ---------------------------------------------------------------------------

CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name  text NOT NULL,
  trade_name  text,
  -- So digitos, normalizado por `contracts`. 14 caracteres exatos.
  cnpj        text NOT NULL,
  email       text NOT NULL,
  phone       text NOT NULL,
  -- Regime tributario — RF-003. `text` + CHECK, nao enum nativo.
  tax_regime  text NOT NULL DEFAULT 'simples'
                CHECK (tax_regime IN ('simples', 'presumido', 'real', 'mei')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_cnpj_digitos CHECK (cnpj ~ '^[0-9]{14}$')
);

-- Unico GLOBALMENTE, e nao por tenant: um CNPJ e uma empresa no pais inteiro.
-- RF-002 pede recusar CNPJ repetido "sem revelar dados da empresa existente" —
-- a recusa acontece aqui, e traduzir o erro sem vazar razao social e de `core`.
CREATE UNIQUE INDEX companies_cnpj_unico ON companies (cnpj);

SELECT enable_root_tenant_isolation('companies');

-- Consequencia de `FORCE ROW LEVEL SECURITY` com `WITH CHECK (id =
-- current_company_id())`: para INSERIR uma empresa, o tenant do contexto ja
-- tem de ser o id dela. Parece incomodo e e a propriedade que se quer — a
-- empresa nasce sob o proprio tenant:
--
--   const id = randomUUID()
--   await withTenant(sql, id, (tx) => tx`INSERT INTO companies (id, ...) VALUES (${id}, ...)`)
--
-- A alternativa seria uma politica de INSERT com `WITH CHECK (true)`, e ela
-- abriria exatamente o buraco que o resto do arquivo fecha: qualquer contexto
-- gravando linha de qualquer empresa. Ha teste cobrindo os dois lados.

-- ---------------------------------------------------------------------------
-- users — identidade da pessoa, nao da empresa
-- ---------------------------------------------------------------------------

-- Sem `company_id` de proposito: a mesma pessoa opera mais de uma loja
-- (RF-119/RF-120, NR-014), e uma identidade por empresa duplicaria a pessoa e
-- as credenciais dela. O vinculo mora em `company_users`.
CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  phone      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unico ON users (lower(email));

-- ---------------------------------------------------------------------------
-- company_users — quem acessa qual loja, com qual papel
-- ---------------------------------------------------------------------------

CREATE TABLE company_users (
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Os mesmos valores de `roleSchema` em contracts. `text` + CHECK em vez de
  -- tabela de dominio porque o conjunto e fechado e pequeno, e em vez de enum
  -- nativo porque acrescentar valor a enum no Postgres nao volta atras.
  role       text NOT NULL CHECK (role IN ('owner', 'staff', 'accountant', 'platform_admin')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

-- Achar as lojas de uma pessoa (a tela de trocar de empresa) sem varrer tudo.
CREATE INDEX company_users_por_usuario ON company_users (user_id);

SELECT enable_tenant_isolation('company_users');

-- Agora que `company_users` existe, `users` pode ser isolada por ela.
--
-- `users` nao tem `company_id`, mas isso NAO significa que ela possa ser lida
-- por qualquer tenant: e-mail e telefone sao dado pessoal. A politica diz que
-- so se enxerga a pessoa que tem vinculo com a empresa do contexto.
--
-- A subconsulta roda com a politica de `company_users` ativa, entao ela por si
-- ja esta restrita a empresa do contexto — e por isso a condicao e simples.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (EXISTS (SELECT 1 FROM company_users cu WHERE cu.user_id = users.id))
  WITH CHECK (true);

COMMENT ON POLICY tenant_isolation ON users IS
  'Enxerga apenas quem tem vinculo com a empresa do contexto, via company_users.';

-- ---------------------------------------------------------------------------
-- categories — existe porque products aponta para ela
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_nome_unico ON categories (company_id, lower(name));

SELECT enable_tenant_isolation('categories');

-- ---------------------------------------------------------------------------
-- customers — o cliente da loja
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  -- Nome e o unico obrigatorio — RF-009 pede "apenas nome e telefone", e no
  -- balcao o telefone as vezes vem depois. Exigir mais e travar a venda.
  name                text NOT NULL,
  document            text,
  phone               text,
  email               text,
  notes               text,
  -- Fiado — RF-013. Limite e o teto; saldo e quanto deve agora.
  wallet_limit_cents  bigint NOT NULL DEFAULT 0 CHECK (wallet_limit_cents >= 0),
  wallet_balance_cents bigint NOT NULL DEFAULT 0,
  -- Consentimento de mensagem — RF-016. Nulo = nunca houve manifestacao, que e
  -- diferente de opt-out: uma exige pedir, a outra proibe pedir de novo.
  whatsapp_consent_at timestamptz,
  whatsapp_opt_out_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Cliente sai da lista sem sair do historico de vendas — dados.md#exclusão.
  deleted_at          timestamptz
);

-- RF-010: detectar duplicado por telefone ou CPF. Parciais porque os dois
-- campos sao opcionais, e indice sobre um monte de NULL nao serve para nada.
CREATE INDEX customers_por_telefone ON customers (company_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX customers_por_documento ON customers (company_id, document)
  WHERE document IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX customers_por_nome ON customers (company_id, lower(name))
  WHERE deleted_at IS NULL;

SELECT enable_tenant_isolation('customers');

-- ---------------------------------------------------------------------------
-- products — o que a loja vende
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  description      text NOT NULL,
  -- EAN/GTIN lido no balcao — RF-017, RF-018. Opcional: granel nao tem.
  barcode          text,
  -- Codigo interno gerado quando nao ha codigo de barras — RF-019.
  internal_code    text NOT NULL,
  unit_of_measure  text NOT NULL
                     CHECK (unit_of_measure IN ('un','kg','g','l','ml','m','cm','cx','pct')),
  sale_price_cents bigint NOT NULL CHECK (sale_price_cents >= 0),
  cost_price_cents bigint NOT NULL DEFAULT 0 CHECK (cost_price_cents >= 0),
  -- PONTOS percentuais: 18.0000 e 18%. Ver a nota no topo do arquivo.
  tax_rate         numeric(7,4) CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)),
  -- Saldo atual. A trilha que o mantem sao os movimentos de estoque (NR-023);
  -- aqui fica o saldo para a consulta de balcao nao somar movimento a cada leitura.
  stock   integer NOT NULL DEFAULT 0,
  min_stock        integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  category_id      uuid REFERENCES categories (id) ON DELETE SET NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  deleted_at       timestamptz
);

-- Codigo de barras unico POR EMPRESA, nao global: duas lojas vendem o mesmo
-- produto, e o mesmo EAN nas duas e o caso normal.
CREATE UNIQUE INDEX products_barcode_unico ON products (company_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX products_codigo_interno_unico ON products (company_id, internal_code)
  WHERE deleted_at IS NULL;

CREATE INDEX products_por_descricao ON products (company_id, lower(description))
  WHERE deleted_at IS NULL;

-- Reposicao: quem esta abaixo do minimo. Parcial, porque a lista interessa so
-- para produto ativo.
CREATE INDEX products_abaixo_do_minimo ON products (company_id, stock)
  WHERE is_active AND deleted_at IS NULL;

SELECT enable_tenant_isolation('products');


-- Schema de vendas e financeiro — NR-020. RF-027 a RF-044, RF-063, RF-064.
--
-- Nao existe um `sales.status` que responda tudo. O lojista pergunta quatro
-- coisas independentes — a venda existe? a nota saiu? o dinheiro entrou? o job
-- falhou? — e elas tem ciclos separados: a venda fecha ANTES da nota, o fiado e
-- venda valida sem liquidacao, e o cartao presencial nao passa pelo PSP. Cada
-- pergunta mora numa tabela, e a tela compoe
-- (docs/arquitetura/dados.md#estados-da-venda).
--
-- Venda, nota e auditoria **nunca** recebem DELETE — RNF-040. Cancelamento e
-- devolucao sao linhas novas, nao ausencia de linha.

-- ---------------------------------------------------------------------------
-- Numeracao da venda, sequencial por empresa
-- ---------------------------------------------------------------------------

-- `coalesce(max(number),0)+1` daria numero repetido sob concorrencia: duas
-- vendas simultaneas leriam o mesmo maximo. Sequence do Postgres nao serve
-- porque a numeracao e POR EMPRESA e sequence e global. Um contador com upsert
-- atomico resolve os dois: a linha da empresa e travada pelo proprio UPDATE.
CREATE TABLE company_counters (
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  -- Qual contador. Hoje so `sale`; nota fiscal tem numeracao propria, do fisco.
  counter     text NOT NULL CHECK (counter IN ('sale')),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, counter)
);

SELECT enable_tenant_isolation('company_counters');

CREATE OR REPLACE FUNCTION next_counter(alvo text) RETURNS bigint
  LANGUAGE plpgsql
  AS $$
DECLARE
  proximo bigint;
BEGIN
  INSERT INTO company_counters (company_id, counter, last_number)
    VALUES (current_company_id(), alvo, 1)
  ON CONFLICT (company_id, counter)
    DO UPDATE SET last_number = company_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO proximo;

  RETURN proximo;
END
$$;

COMMENT ON FUNCTION next_counter(text) IS
  'Proximo numero sequencial da empresa do contexto, sem lacuna e sem repeticao sob concorrencia.';

-- ---------------------------------------------------------------------------
-- sales — a venda fechada
-- ---------------------------------------------------------------------------

CREATE TABLE sales (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  -- Sequencial por empresa. E o numero que o lojista fala ao telefone.
  number                bigint NOT NULL,
  -- Ausente = venda de balcao sem identificacao, que e a maioria — RF-033.
  customer_id           uuid REFERENCES customers (id) ON DELETE RESTRICT,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'settled', 'cancelled', 'returned')),
  -- Por onde a venda entrou. Os mesmos valores de `Channel` em core: a promessa
  -- do produto e que app e WhatsApp fazem a mesma coisa, e isso so e
  -- verificavel se a origem ficar registrada.
  channel               text NOT NULL DEFAULT 'app'
                          CHECK (channel IN ('app', 'whatsapp', 'api', 'job')),

  -- Dinheiro em centavos. Todos calculados por `domain` e persistidos aqui:
  -- recalcular na leitura mudaria o passado quando a tabela de tarifas mudar.
  gross_amount_cents    bigint NOT NULL CHECK (gross_amount_cents >= 0),
  discount_cents        bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  tax_amount_cents      bigint NOT NULL DEFAULT 0 CHECK (tax_amount_cents >= 0),
  card_fee_amount_cents bigint NOT NULL DEFAULT 0 CHECK (card_fee_amount_cents >= 0),
  -- Custo dos itens no momento da venda — base da margem, RF-040.
  cost_amount_cents     bigint NOT NULL DEFAULT 0 CHECK (cost_amount_cents >= 0),
  net_amount_cents      bigint NOT NULL,
  -- Troco de pagamento em dinheiro acima do total — RF-035.
  change_cents          bigint NOT NULL DEFAULT 0 CHECK (change_cents >= 0),
  surcharge_rate        numeric(7,4) CHECK (surcharge_rate IS NULL OR surcharge_rate >= 0),

  notes                 text,
  -- RF-036: reenvio do PDV nao pode virar segunda venda.
  idempotency_key       text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  -- RF-043. Sem `deleted_at`: venda cancelada continua existindo e aparecendo.
  cancelled_at          timestamptz,
  cancelled_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  cancel_reason         text,

  CONSTRAINT sales_cancelamento_completo
    CHECK ((cancelled_at IS NULL) = (status <> 'cancelled'))
);

CREATE UNIQUE INDEX sales_numero_unico ON sales (company_id, number);

-- Unico e PARCIAL: venda sem chave (a criada pelo backoffice, sem PDV) nao
-- deve colidir com outra sem chave.
CREATE UNIQUE INDEX sales_idempotencia_unica ON sales (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX sales_por_data ON sales (company_id, created_at DESC);
CREATE INDEX sales_por_cliente ON sales (company_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

SELECT enable_tenant_isolation('sales');

-- ---------------------------------------------------------------------------
-- sale_items — o que foi vendido, como estava no momento da venda
-- ---------------------------------------------------------------------------

CREATE TABLE sale_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  sale_id           uuid NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
  product_id        uuid REFERENCES products (id) ON DELETE RESTRICT,

  -- COPIA da descricao e do custo no instante da venda, nao referencia viva.
  -- Preco e custo de produto mudam; a venda tem de continuar dizendo o que foi
  -- cobrado e quanto custou naquele dia, senao a margem historica se reescreve
  -- sozinha a cada reajuste.
  description       text NOT NULL,
  unit_of_measure   text NOT NULL,
  quantity          integer NOT NULL CHECK (quantity > 0),
  unit_price_cents  bigint NOT NULL CHECK (unit_price_cents >= 0),
  cost_price_cents  bigint NOT NULL DEFAULT 0 CHECK (cost_price_cents >= 0),
  discount_cents    bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents       bigint NOT NULL CHECK (total_cents >= 0),
  -- Devolucao parcial — RF-044. Nunca maior que o vendido.
  returned_quantity integer NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sale_items_devolucao_ate_o_vendido CHECK (returned_quantity <= quantity)
);

CREATE INDEX sale_items_por_venda ON sale_items (company_id, sale_id);
-- RF-029 ordena busca de produto por volume de vendas; e tambem o ranking de
-- produto do relatorio (US-041).
CREATE INDEX sale_items_por_produto ON sale_items (company_id, product_id)
  WHERE product_id IS NOT NULL;

SELECT enable_tenant_isolation('sale_items');

-- ---------------------------------------------------------------------------
-- payments — como a venda foi paga
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  sale_id         uuid NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
  -- Os mesmos valores de `paymentMethodSchema` em contracts.
  method          text NOT NULL
                    CHECK (method IN ('cash', 'pix', 'debit', 'credit', 'wallet')),
  amount_cents    bigint NOT NULL CHECK (amount_cents > 0),
  -- So faz sentido em credito — RF-038. Ausente = a vista.
  installments    integer CHECK (installments IS NULL OR (installments >= 1 AND installments <= 21)),
  brand           text CHECK (brand IS NULL OR brand IN
                    ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'unknown')),
  card_fee_cents  bigint NOT NULL DEFAULT 0 CHECK (card_fee_cents >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Parcelamento fora do credito nao existe. A mesma regra esta em
  -- `paymentInputSchema`; aqui ela e imposta pelo banco, nao pela lembranca.
  CONSTRAINT payments_parcelamento_so_no_credito
    CHECK (method = 'credit' OR installments IS NULL)
);

CREATE INDEX payments_por_venda ON payments (company_id, sale_id);

SELECT enable_tenant_isolation('payments');

-- ---------------------------------------------------------------------------
-- receivables — o dinheiro a entrar
-- ---------------------------------------------------------------------------

CREATE TABLE receivables (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  -- Nulo em recebivel avulso (RF-065), que nao vem de venda.
  sale_id              uuid REFERENCES sales (id) ON DELETE RESTRICT,
  customer_id          uuid REFERENCES customers (id) ON DELETE RESTRICT,
  origin               text NOT NULL DEFAULT 'sale' CHECK (origin IN ('sale', 'manual')),
  description          text NOT NULL,

  -- Bruto e liquido separados — RF-063 pede o LIQUIDO previsto: o que cai na
  -- conta ja sem a tarifa da adquirente. Guardar so o bruto obrigaria a
  -- recalcular a tarifa na leitura, com a tabela de hoje sobre venda de ontem.
  amount_cents         bigint NOT NULL CHECK (amount_cents > 0),
  net_amount_cents     bigint NOT NULL CHECK (net_amount_cents >= 0),
  settled_amount_cents bigint NOT NULL DEFAULT 0 CHECK (settled_amount_cents >= 0),

  due_date             date NOT NULL,
  -- Parcela N de M, em credito parcelado — RF-038.
  installment_number   integer NOT NULL DEFAULT 1 CHECK (installment_number >= 1),
  installment_count    integer NOT NULL DEFAULT 1 CHECK (installment_count >= 1),

  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'partially_settled', 'settled', 'cancelled')),
  settled_at           timestamptz,

  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT receivables_parcela_valida CHECK (installment_number <= installment_count),
  CONSTRAINT receivables_baixa_ate_o_valor CHECK (settled_amount_cents <= amount_cents),
  CONSTRAINT receivables_liquidado_completo
    CHECK ((settled_at IS NULL) = (status <> 'settled'))
);

-- Parcial, e nao total: a consulta que importa e "o que vence e ainda nao foi
-- pago". Indice sobre recebivel liquidado seria custo de escrita sem leitura.
CREATE INDEX receivables_a_vencer ON receivables (company_id, due_date)
  WHERE status IN ('open', 'partially_settled');

CREATE INDEX receivables_por_cliente ON receivables (company_id, customer_id, due_date)
  WHERE customer_id IS NOT NULL AND status IN ('open', 'partially_settled');

CREATE INDEX receivables_por_venda ON receivables (company_id, sale_id)
  WHERE sale_id IS NOT NULL;

SELECT enable_tenant_isolation('receivables');

-- ---------------------------------------------------------------------------
-- settlements — as baixas, uma linha por recebimento
-- ---------------------------------------------------------------------------

-- Tabela propria, e nao um par de colunas no recebivel, porque a baixa e
-- PARCIAL (RF-066) e reversivel (RF-067): tres pagamentos parciais e um estorno
-- sao quatro fatos com data e autor, nao um campo sobrescrito quatro vezes.
CREATE TABLE settlements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  receivable_id  uuid NOT NULL REFERENCES receivables (id) ON DELETE RESTRICT,
  amount_cents   bigint NOT NULL CHECK (amount_cents <> 0),
  method         text NOT NULL
                   CHECK (method IN ('cash', 'pix', 'debit', 'credit', 'wallet', 'transfer')),
  settled_at     timestamptz NOT NULL DEFAULT now(),
  notes          text,
  -- Estorno da baixa — RF-067. Aponta para a baixa que ele desfaz, com valor
  -- negativo: a soma das linhas continua sendo o saldo recebido.
  reverses_id    uuid REFERENCES settlements (id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT settlements_estorno_e_negativo
    CHECK ((reverses_id IS NULL AND amount_cents > 0) OR (reverses_id IS NOT NULL AND amount_cents < 0))
);

CREATE INDEX settlements_por_recebivel ON settlements (company_id, receivable_id, settled_at);
CREATE UNIQUE INDEX settlements_um_estorno_por_baixa ON settlements (company_id, reverses_id)
  WHERE reverses_id IS NOT NULL;

SELECT enable_tenant_isolation('settlements');

-- ---------------------------------------------------------------------------
-- sale_returns — devolucao total ou parcial
-- ---------------------------------------------------------------------------

CREATE TABLE sale_returns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  sale_id      uuid NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX sale_returns_por_venda ON sale_returns (company_id, sale_id);

SELECT enable_tenant_isolation('sale_returns');

-- Quais itens voltaram, e quantos. RF-044 fala em "apenas os itens e o valor
-- proporcional" — sem detalhe por item nao ha como estornar o estoque certo,
-- nem saber o que ja voltou quando houver uma segunda devolucao parcial.
CREATE TABLE sale_return_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  sale_return_id uuid NOT NULL REFERENCES sale_returns (id) ON DELETE RESTRICT,
  sale_item_id   uuid NOT NULL REFERENCES sale_items (id) ON DELETE RESTRICT,
  quantity       integer NOT NULL CHECK (quantity > 0),
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sale_return_items_por_devolucao
  ON sale_return_items (company_id, sale_return_id);

SELECT enable_tenant_isolation('sale_return_items');


-- Alinha `companies.tax_regime` ao tipo `TaxRegime` de `domain` — RF-003, RF-041.
--
-- A 0002 criou o CHECK com 'simples', 'presumido', 'real', 'mei'. O
-- `TaxRegime` de `packages/domain` e 'simples_nacional', 'lucro_presumido',
-- 'lucro_real'. Ou seja: o banco aceitava valores que `domain` nao consegue
-- consumir, e a divergencia so apareceria no primeiro calculo de imposto de
-- uma venda de verdade — que e a NR-022, ou seja, agora.
--
-- `domain` manda, e nao por hierarquia: o valor existe para entrar num calculo,
-- e quem calcula e ele.
--
-- ## Sobre o 'mei', que sai daqui
--
-- MEI nao esta no `TaxRegime`, e nao e esquecimento de quem o escreveu: o MEI
-- paga DAS de valor FIXO mensal, e nao aliquota sobre a venda. O modelo de
-- `domain` e percentual (`defaultRate` em pontos por cem), e nao existe
-- percentual que represente um valor fixo.
--
-- Guardar 'mei' na coluna significaria uma empresa cadastravel cujo imposto o
-- sistema nao sabe calcular — e o publico do produto tem muito MEI. Isso e
-- decisao de produto, nao de schema, e sai daqui para nao ficar parecendo
-- resolvida. Ver o PR que introduziu esta migration.

ALTER TABLE companies DROP CONSTRAINT companies_tax_regime_check;

-- Traduz o que ja estiver gravado. Na pratica nao ha dado em producao ainda,
-- mas migration que assume banco vazio e migration que falha no dia em que
-- alguem restaura um dump.
UPDATE companies
   SET tax_regime = CASE tax_regime
                      WHEN 'simples'    THEN 'simples_nacional'
                      WHEN 'presumido'  THEN 'lucro_presumido'
                      WHEN 'real'       THEN 'lucro_real'
                      -- MEI vira Simples: e o regime mais proximo em aliquota,
                      -- e deixa a empresa operavel em vez de invalida. A
                      -- decisao sobre MEI de verdade fica em aberto.
                      WHEN 'mei'        THEN 'simples_nacional'
                      ELSE tax_regime
                    END
 WHERE tax_regime IN ('simples', 'presumido', 'real', 'mei');

ALTER TABLE companies
  ALTER COLUMN tax_regime SET DEFAULT 'simples_nacional';

ALTER TABLE companies
  ADD CONSTRAINT companies_tax_regime_check
  CHECK (tax_regime IN ('simples_nacional', 'lucro_presumido', 'lucro_real'));

COMMENT ON COLUMN companies.tax_regime IS
  'Regime tributario — mesmos valores de TaxRegime em packages/domain (RF-003, RF-041).';


-- Schema de agenda — NR-035. RF-089, RF-090, RF-091, RF-092, RF-093.
--
-- A porta que esta tabela atende ja existe: `AppointmentRepository` em
-- packages/core/src/ports/appointment-repository.ts, hoje com apenas um
-- repositorio em memoria por tras. As colunas aqui sao as daquela porta e as
-- do `appointmentOutputSchema` de contracts — nao uma modelagem nova.
--
-- Convencoes em docs/arquitetura/dados.md#convenções-de-schema: tabela plural
-- em snake_case, timestamptz em UTC com sufixo _at, sem enum nativo, e todo
-- indice comecando por company_id porque com RLS toda consulta filtra por ele.

-- ---------------------------------------------------------------------------
-- appointments — o compromisso da agenda
-- ---------------------------------------------------------------------------

CREATE TABLE appointments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  title                   text NOT NULL,

  -- Sempre UTC. O fuso e coisa de exibicao — quem monta "a agenda do dia"
  -- converte o dia do fuso da empresa para um intervalo em UTC e consulta por
  -- intervalo. Guardar o fuso aqui faria a mesma agenda mudar de conteudo
  -- conforme quem consulta, que e o oposto do que um compromisso e.
  starts_at               timestamptz NOT NULL,

  -- Vincula ao cliente para aparecer no cadastro dele — RF-090. Opcional: nem
  -- todo compromisso e com cliente (entrega, conferencia de estoque, banco).
  --
  -- `ON DELETE RESTRICT` como em `sales.customer_id`: cliente sai da lista por
  -- `deleted_at`, nunca por DELETE, e se um DELETE for tentado a agenda o
  -- impede em vez de perder silenciosamente o vinculo.
  customer_id             uuid REFERENCES customers (id) ON DELETE RESTRICT,

  notes                   text,

  -- Antecedencia do lembrete, em minutos — RF-091. NULL = sem lembrete.
  -- Quem de fato agenda o disparo e a porta `ReminderScheduler`; aqui fica o
  -- que o lojista pediu, para a agenda saber responder sem consultar a fila.
  reminder_minutes_before integer,

  -- `text` + CHECK, nao enum nativo: acrescentar valor a enum no Postgres nao
  -- volta atras. Os mesmos dois valores de `appointmentStatusSchema`.
  status                  text NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled', 'cancelled')),

  -- Nada e apagado: compromisso e cancelado — RNF-040. Por isso NAO existe
  -- `deleted_at` aqui, igual a `sales`: o cancelado continua existindo, some
  -- da agenda do dia e continua respondendo por id.
  cancelled_at            timestamptz,
  cancelled_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  cancel_reason           text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Os limites abaixo repetem os de `contracts`. Nao e redundancia inutil:
  -- contracts valida o que entra pela borda HTTP, e esta tabela tambem recebe
  -- escrita de migration, de script e do worker. A ultima linha de defesa
  -- precisa estar onde o dado mora.
  CONSTRAINT appointments_titulo_tamanho
    CHECK (char_length(btrim(title)) BETWEEN 2 AND 140),
  CONSTRAINT appointments_observacao_tamanho
    CHECK (notes IS NULL OR char_length(notes) <= 500),
  CONSTRAINT appointments_motivo_tamanho
    CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 280),

  -- 1 minuto a 7 dias, como `reminderMinutesBefore` em contracts. Zero seria
  -- "avise na hora", que nao lembra ninguem de nada.
  CONSTRAINT appointments_antecedencia_valida
    CHECK (reminder_minutes_before IS NULL
           OR reminder_minutes_before BETWEEN 1 AND 10080),

  -- As tres colunas de cancelamento andam juntas com o status. Sem isto,
  -- `status = 'cancelled'` sem `cancelled_at` (ou o contrario) entra no banco,
  -- e a agenda passa a ter duas respostas para "isso foi cancelado?".
  -- Mesmo formato do `sales_cancelamento_completo`.
  CONSTRAINT appointments_cancelamento_completo
    CHECK ((cancelled_at IS NULL) = (status <> 'cancelled'))
);

COMMENT ON TABLE appointments IS
  'Compromissos da agenda (RF-089 a RF-093). Cancelado nao e apagado — RNF-040.';

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------

-- A consulta principal: `listBetween(companyId, from, to)` — a agenda do dia,
-- em ordem de horario, sem os cancelados (RF-093).
--
-- Parcial em `status = 'scheduled'` porque e exatamente o recorte que a
-- consulta pede, e porque o cancelado nunca aparece nessa lista: mante-lo fora
-- do indice deixa o indice do tamanho da agenda viva, nao do historico.
CREATE INDEX appointments_por_periodo ON appointments (company_id, starts_at)
  WHERE status = 'scheduled';

-- RF-090: os compromissos de um cliente, no cadastro dele. Aqui SEM filtro de
-- status — a ficha do cliente mostra o que foi cancelado tambem, que e parte
-- do historico de atendimento dele.
CREATE INDEX appointments_por_cliente ON appointments (company_id, customer_id, starts_at)
  WHERE customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Isolamento
-- ---------------------------------------------------------------------------

SELECT enable_tenant_isolation('appointments');


-- Trilha de movimentacao de estoque — RF-022, RF-023, RF-024, RF-124.
--
-- O `core` ja grava movimento desde a NR-023: `decreaseStock` recebe a origem
-- (venda, autor, instante) e a porta `InventoryUnitOfWork` declara
-- `insertMovement`. Faltava a tabela — e sem ela nenhum dos dois tem onde
-- escrever, o que torna a rota de venda (NR-027) impossivel de ligar no banco.

-- ---------------------------------------------------------------------------
-- Somente-insercao, agora reutilizavel
-- ---------------------------------------------------------------------------

-- A 0007 criou `audit_logs_somente_insercao()` para uma tabela. Esta e a segunda
-- trilha imutavel do sistema, e vao existir outras: em vez de copiar o corpo,
-- a funcao passa a ser generica, e `TG_TABLE_NAME` diz de qual tabela se trata.
--
-- A `audit_logs` NAO foi migrada para ela de proposito: o gatilho dela funciona,
-- esta testado, e trocar mecanismo de protecao de trilha de auditoria sem
-- necessidade e risco sem retorno. Quando houver motivo, adota esta.
CREATE OR REPLACE FUNCTION trilha_somente_insercao() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION
    '% e somente-insercao: % nao e permitido.', TG_TABLE_NAME, TG_OP
    USING HINT = 'Corrija com um movimento novo, nao alterando o antigo — RF-124.';
END
$$;

COMMENT ON FUNCTION trilha_somente_insercao() IS
  'Recusa UPDATE, DELETE e TRUNCATE em tabela de trilha imutavel (RF-124).';

-- ---------------------------------------------------------------------------
-- inventory_movements
-- ---------------------------------------------------------------------------

CREATE TABLE inventory_movements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  product_id     uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,

  -- Um valor por CAUSA, nao por sinal — os mesmos de `movementKindSchema`.
  -- `entrada`/`saida` responderia o quanto e nunca o porque, e e o porque que
  -- faz alguem agir: "quanto sumiu por divergencia de inventario este mes?"
  kind           text NOT NULL
                   CHECK (kind IN ('adjustment', 'sale', 'sale_cancelled', 'sale_returned')),

  -- Assinado: negativo tira, positivo devolve. Nunca zero — movimento que nao
  -- move nada e ruido na trilha, e trilha com ruido e trilha que ninguem le.
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),

  -- Saldo DEPOIS deste movimento, gravado e nao recalculado. Com ele, a
  -- pergunta "qual era o saldo no dia 12?" e uma leitura; sem ele, e somar a
  -- trilha inteira e esperar que nenhuma linha tenha sumido.
  --
  -- Sem CHECK de nao-negativo: RF-028 deixa o operador vender sem saldo, e o
  -- balcao vende o que esta na prateleira quando a contagem do sistema atrasa.
  balance_after  integer NOT NULL,

  -- Obrigatorio no ajuste (RF-023 pede o motivo), nulo na baixa de venda, onde
  -- o motivo e a propria venda.
  reason         text,
  sale_id        uuid REFERENCES sales (id) ON DELETE RESTRICT,

  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,

  -- Movimento de venda aponta para a venda; ajuste manual tem motivo escrito.
  -- Sem isto, um ajuste sem motivo entraria e a trilha responderia "o saldo
  -- mudou" sem dizer por que — que e a unica coisa que se quer saber dela.
  CONSTRAINT inventory_movements_origem_declarada CHECK (
    (kind = 'adjustment' AND sale_id IS NULL AND reason IS NOT NULL)
    OR (kind <> 'adjustment' AND sale_id IS NOT NULL)
  )
);

-- Historico de um produto, do mais recente para tras: e a tela de "por que o
-- saldo esta assim?".
CREATE INDEX inventory_movements_por_produto
  ON inventory_movements (company_id, product_id, created_at DESC);

-- Os movimentos de uma venda, para o cancelamento saber o que devolver.
CREATE INDEX inventory_movements_por_venda
  ON inventory_movements (company_id, sale_id)
  WHERE sale_id IS NOT NULL;

SELECT enable_tenant_isolation('inventory_movements');

CREATE TRIGGER inventory_movements_sem_update
  BEFORE UPDATE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION trilha_somente_insercao();

CREATE TRIGGER inventory_movements_sem_delete
  BEFORE DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION trilha_somente_insercao();

-- TRUNCATE nao dispara gatilho de linha — nao percorre linha nenhuma, que e o
-- que o torna rapido. Sem este terceiro, um TRUNCATE apagaria a trilha inteira
-- passando por cima dos outros dois.
CREATE TRIGGER inventory_movements_sem_truncate
  BEFORE TRUNCATE ON inventory_movements
  FOR EACH STATEMENT EXECUTE FUNCTION trilha_somente_insercao();

COMMENT ON TABLE inventory_movements IS
  'Trilha de estoque somente-insercao (RF-022 a RF-024, RF-124). UPDATE, DELETE e TRUNCATE bloqueados por gatilho.';


-- Contas a pagar — NR-074. RF-055 a RF-062.
--
-- A NR-028 desenhou o caso de uso e a porta `PayableRepository` em `core`, com
-- repositorio em memoria. Esta e a tabela por tras — ela faltava: `receivables`
-- existe desde a 0003, mas o lado a PAGAR nunca teve schema.
--
-- Convencoes em docs/arquitetura/dados.md#convenções-de-schema: plural em
-- snake_case, dinheiro em bigint de centavos, timestamptz em UTC com sufixo
-- _at, sem enum nativo, e todo indice comecando por company_id.

CREATE TABLE payables (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  -- Texto livre, e nao id de fornecedor: nao existe cadastro de fornecedor no
  -- MVP, e exigir um travaria o lancamento da conta de luz.
  supplier             text NOT NULL,
  description          text NOT NULL,

  amount_cents         bigint NOT NULL CHECK (amount_cents > 0),
  settled_amount_cents bigint NOT NULL DEFAULT 0 CHECK (settled_amount_cents >= 0),

  -- Conta vence num DIA, nao num instante. `date` e nao timestamptz: com fuso,
  -- a mesma conta venceria em dias diferentes conforme quem consulta.
  due_date             date NOT NULL,

  -- Chave do arquivo no armazenamento, nao o arquivo — RF-055.
  attachment_key       text,
  -- Classificacao contabil, para o relatorio do contador.
  category             text,

  -- Recorrencia — RF-057. As ocorrencias sao LINHAS de verdade, e nao uma regra
  -- expandida na leitura: RF-058 pede alterar UMA sem afetar as demais, e
  -- ocorrencia que nao existe como linha nao tem onde guardar a alteracao.
  --
  -- Sem tabela `recurrences`: o id agrupa e nada mais precisa ser guardado
  -- sobre a serie. Criar a tabela agora seria uma junção a mais em toda
  -- consulta, para um dado que ninguem le.
  recurrence_id        uuid,
  occurrence_number    integer CHECK (occurrence_number IS NULL OR occurrence_number >= 1),
  occurrence_count     integer CHECK (occurrence_count IS NULL OR occurrence_count >= 1),

  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'partially_settled', 'settled', 'cancelled')),

  -- Nada e apagado: conta e cancelada — RNF-040. Sem `deleted_at`, igual a
  -- `sales` e a `appointments`.
  cancelled_at         timestamptz,
  cancelled_by         uuid REFERENCES users (id) ON DELETE SET NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Baixa nunca passa do valor: valor a maior digitado por engano viraria
  -- credito invisivel dentro do titulo, e o lojista so descobriria conferindo
  -- o extrato meses depois. A regra tambem vive em `domain` (`aplicarBaixa`);
  -- aqui e a ultima linha de defesa, para escrita que nao passe pelo caso de uso.
  CONSTRAINT payables_baixa_ate_o_valor CHECK (settled_amount_cents <= amount_cents),

  -- Status e valores nao podem discordar. Sem isto, `settled` com saldo aberto
  -- entra no banco e a lista de vencidos passa a mentir.
  CONSTRAINT payables_quitado_completo
    CHECK ((status = 'settled') = (settled_amount_cents >= amount_cents AND status <> 'cancelled')),

  CONSTRAINT payables_cancelamento_completo
    CHECK ((cancelled_at IS NULL) = (status <> 'cancelled')),

  -- Ocorrencia so faz sentido dentro de uma serie, e as tres andam juntas.
  CONSTRAINT payables_recorrencia_completa
    CHECK (num_nonnulls(recurrence_id, occurrence_number, occurrence_count) IN (0, 3)),

  CONSTRAINT payables_ocorrencia_valida
    CHECK (occurrence_number IS NULL OR occurrence_number <= occurrence_count)
);

COMMENT ON TABLE payables IS
  'Contas a pagar (RF-055 a RF-062). Cancelada nao e apagada — RNF-040.';

-- A consulta principal: o que esta em aberto, por vencimento — RF-061, RF-062.
-- Parcial porque quitada e cancelada nunca aparecem nessa lista, e mante-las
-- fora deixa o indice do tamanho do que se cobra, nao do historico.
CREATE INDEX payables_em_aberto ON payables (company_id, due_date)
  WHERE status IN ('open', 'partially_settled');

-- Encerrar a recorrencia precisa achar as ocorrencias da serie — RF-058.
CREATE INDEX payables_por_recorrencia ON payables (company_id, recurrence_id)
  WHERE recurrence_id IS NOT NULL;

SELECT enable_tenant_isolation('payables');

-- ---------------------------------------------------------------------------
-- Settlements unificados (db_0909): recebivel XOR pagavel — NR-092
-- ---------------------------------------------------------------------------
--
-- A tabela nasceu so para recebivel (`receivable_id NOT NULL`). Conta a pagar
-- existia em `payable_settlements`. O snapshot junta as duas com XOR; as
-- colunas de UI da main (`method`, `bank_account`, `reverses_id`, `notes`)
-- permanecem no mesmo CREATE/ALTER.

ALTER TABLE settlements ALTER COLUMN receivable_id DROP NOT NULL;
ALTER TABLE settlements ALTER COLUMN method DROP NOT NULL;
ALTER TABLE settlements
  ADD COLUMN payable_id uuid REFERENCES payables (id) ON DELETE RESTRICT,
  ADD COLUMN bank_account text,
  ADD COLUMN settled_on date;

ALTER TABLE settlements
  ADD CONSTRAINT settlements_one_target_check CHECK (
    (receivable_id IS NOT NULL AND payable_id IS NULL)
    OR (receivable_id IS NULL AND payable_id IS NOT NULL)
  );

CREATE INDEX settlements_por_pagavel
  ON settlements (company_id, payable_id, settled_at DESC)
  WHERE payable_id IS NOT NULL;


-- Plano de contas, classificacao e DRE — NR-032 e NR-077. RF-081 a RF-086.
--
-- `core` desenhou o plano de contas, a classificacao e o DRE na NR-032, todos
-- contra repositorio em memoria. Esta e a tabela por tras — ela faltava, e era
-- o que impedia o relatorio de existir. A NR-076 ja tinha esbarrado nisso: a
-- rota de conciliacao RECUSA `accountId` porque nao havia para onde apontar.
--
-- Convencoes em docs/arquitetura/dados.md#convenções-de-schema.

CREATE TABLE ledger_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  name        text NOT NULL,

  -- Quatro tipos, e nao a arvore contabil completa. O lojista nao quer plano de
  -- contas, quer saber se o mes fechou no azul (US-041) — e uma estrutura com
  -- grupos, subgrupos e codigo hierarquico exigiria que ele entendesse
  -- contabilidade para lancar a conta de luz. Quem precisa da estrutura inteira
  -- e o contador, e ele recebe a exportacao (RF-087).
  type        text NOT NULL CHECK (type IN ('revenue', 'deduction', 'cost', 'expense')),

  -- Conta do plano padrao nao pode ser apagada — RF-081, RF-082.
  is_default  boolean NOT NULL DEFAULT false,

  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL
);

COMMENT ON TABLE ledger_accounts IS
  'Plano de contas por empresa (RF-081, RF-082). Quatro tipos, sem hierarquia.';

-- `lower(name)`: "Aluguel" e "aluguel" sao a mesma conta. Sem isto o lojista
-- criaria a segunda sem perceber e o DRE mostraria a despesa partida em duas
-- linhas que somam certo e leem errado.
CREATE UNIQUE INDEX ledger_accounts_nome_unico ON ledger_accounts (company_id, lower(name));

-- A tela do plano agrupa por tipo e ordena por nome dentro dele.
CREATE INDEX ledger_accounts_por_tipo ON ledger_accounts (company_id, type, name);

SELECT enable_tenant_isolation('ledger_accounts');

-- ---------------------------------------------------------------------------
-- A classificacao do lancamento — RF-083
-- ---------------------------------------------------------------------------

ALTER TABLE payables    ADD COLUMN account_id uuid REFERENCES ledger_accounts (id) ON DELETE RESTRICT;
ALTER TABLE receivables ADD COLUMN account_id uuid REFERENCES ledger_accounts (id) ON DELETE RESTRICT;

COMMENT ON COLUMN payables.account_id IS
  'Conta contabil do lancamento (RF-083). Nulo cai em "Sem classificacao" no DRE.';

-- `ON DELETE RESTRICT` e a metade da RF-082 que o banco garante: apagar conta
-- com lancamento nao pode ser possivel. O caso de uso ja recusa com uma
-- mensagem boa ("esta conta tem 42 lancamentos"), e aqui e a ultima linha de
-- defesa — sem ela, um `DELETE` fora do caso de uso deixaria lancamentos
-- apontando para conta que nao existe, e o DRE somaria errado sem avisar.

-- Contar os lancamentos de uma conta (RF-082) e a consulta desses indices.
-- Parciais porque lancamento sem classificacao nunca e procurado por conta.
CREATE INDEX payables_por_conta ON payables (company_id, account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX receivables_por_conta ON receivables (company_id, account_id)
  WHERE account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- `payables.category` sai de cena
-- ---------------------------------------------------------------------------
--
-- Ela nasceu na 0010 (NR-074) como "classificacao contabil, para o relatorio do
-- contador" — texto livre, invencao minha: a RF-055 nao pede campo nenhum de
-- categoria. Agora que a classificacao de verdade existe, manter as duas daria
-- DUAS respostas para "como esta conta esta classificada", e elas divergiriam
-- na primeira vez que alguem editasse uma so. O DRE leria uma e a tela de
-- contas mostraria a outra.
--
-- `DROP` e nao backfill: a coluna nunca teve dado em producao (o produto nao
-- subiu), e converter texto livre em id de conta exigiria adivinhar o que o
-- lojista quis dizer — que e a decisao que a tela de classificacao existe para
-- ele tomar.
ALTER TABLE payables DROP COLUMN category;


-- Notas fiscais emitidas — NR-042. RF-045, RF-050, RF-052, RF-053, RF-054.
--
-- A "guarda de XML" da tarefa. Ela nao e conveniencia: e o que torna o adapter
-- do provedor possivel, e o que sobra quando o provedor sai de cena.
--
-- ## Por que o adapter precisa desta tabela
--
-- A porta `InvoiceIssuer` cancela por CHAVE DE ACESSO. O Focus NFe cancela por
-- REFERENCIA (`DELETE /nfce/{ref}`), e a referencia e o nosso `saleId`. Nao ha
-- endpoint que traduza uma na outra. Sem guardar o par, cancelar seria
-- impossivel — e a alternativa (mudar a porta para carregar `saleId`) faria o
-- vocabulario do provedor vazar para dentro do nucleo.
--
-- ## Por que ela sobrevive ao provedor
--
-- O XML autorizado e o documento fiscal. Ele precisa ficar por cinco anos
-- (guarda legal) e nao pode depender de a conta do provedor continuar ativa,
-- nem de a API dele continuar respondendo. Guardar so o `caminho_xml` seria
-- guardar um link para a casa de outra pessoa.
--
-- Convencoes em docs/arquitetura/dados.md#convenções-de-schema.

CREATE TABLE invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  -- A venda que originou a nota. E TAMBEM a `ref` enviada ao provedor: ele
  -- exige unicidade por token, e a venda ja e unica por empresa.
  sale_id           uuid NOT NULL REFERENCES sales (id) ON DELETE RESTRICT,

  -- Nulos ate a SEFAZ responder. Em contingencia a chave existe e o protocolo
  -- ainda nao — por isso os dois nao andam juntos.
  access_key        text CHECK (access_key IS NULL OR access_key ~ '^[0-9]{44}$'),
  number            integer CHECK (number IS NULL OR number > 0),
  series            integer NOT NULL CHECK (series > 0),

  status            text NOT NULL
                      CHECK (status IN ('authorized', 'contingency', 'rejected', 'cancelled')),

  -- O documento fiscal em si. `text` e nao referencia a arquivo: ver o
  -- cabecalho — link para a casa de outra pessoa nao e guarda.
  xml               text,
  danfe_url         text,

  -- Rejeicao guardada para a tela explicar (RF-047) sem consultar o provedor.
  rejection_code    text,
  rejection_message text,

  -- Cancelamento — RF-050. O XML do evento e outro documento, e vale por si.
  cancellation_xml  text,
  cancellation_protocol text,
  cancelled_at      timestamptz,

  issued_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Autorizada e contingencia TEM chave e numero; rejeitada nao tem nenhum dos
  -- dois. Sem isto, uma rejeicao gravada com chave nula e status errado faria a
  -- tela de estado fiscal (RF-054) mentir sobre a venda.
  CONSTRAINT invoices_autorizada_tem_chave
    CHECK (
      (status IN ('authorized', 'contingency', 'cancelled'))
        = (access_key IS NOT NULL AND number IS NOT NULL)
    ),

  CONSTRAINT invoices_rejeitada_tem_motivo
    CHECK ((status = 'rejected') = (rejection_code IS NOT NULL)),

  CONSTRAINT invoices_cancelamento_completo
    CHECK ((cancelled_at IS NULL) = (status <> 'cancelled'))
);

COMMENT ON TABLE invoices IS
  'Notas fiscais e seus XMLs (RF-045 a RF-054). O XML fica aqui, nao no provedor.';

-- Uma venda, uma nota. E a idempotencia da RNF-043 no lugar onde ela pesa mais:
-- nota duplicada nao e inconveniencia, e problema fiscal. O caso de uso ja
-- devolve a existente, e aqui o banco garante contra escrita que nao passe por
-- ele — inclusive contra dois workers processando o mesmo job.
CREATE UNIQUE INDEX invoices_uma_por_venda ON invoices (company_id, sale_id);

-- A busca do cancelamento: chave -> referencia. Parcial porque nota rejeitada
-- nao tem chave e nunca e procurada assim.
CREATE UNIQUE INDEX invoices_por_chave ON invoices (company_id, access_key)
  WHERE access_key IS NOT NULL;

-- A fila de retransmissao — RF-053, "em ORDEM quando a SEFAZ voltar".
-- Ordenada por emissao: contingencia transmitida fora de ordem gera lacuna de
-- numeracao, que a SEFAZ recusa.
CREATE INDEX invoices_em_contingencia ON invoices (company_id, issued_at)
  WHERE status = 'contingency';

SELECT enable_tenant_isolation('invoices');


-- Campos fiscais do produto — NR-042. RF-046.
--
-- O emissor Focus NFe entrou na 0013, e a nota nao sai sem estes tres campos:
-- `IssueInvoiceRequest.items` exige NCM, CFOP e CST/CSOSN por item, e a RF-046
-- manda validar os tres ANTES de transmitir. Faltavam todos no cadastro — a
-- tabela so tinha `tax_rate`, que serve ao calculo do imposto e nao ao
-- documento.
--
-- Sem esta migration, o adapter existe e nao tem o que enviar.

-- ---------------------------------------------------------------------------
-- NCM — a classificacao da mercadoria
-- ---------------------------------------------------------------------------
--
-- Oito digitos, tabela federal. Nulo enquanto o lojista nao informa: exigir no
-- cadastro travaria o balcao no dia da instalacao, e a RF-017 pede cadastro
-- rapido. Quem cobra e a EMISSAO, que recusa antes de transmitir e diz qual
-- produto falta classificar.
ALTER TABLE products ADD COLUMN ncm text
  CHECK (ncm IS NULL OR ncm ~ '^[0-9]{8}$');

COMMENT ON COLUMN products.ncm IS
  'Classificacao fiscal da mercadoria, 8 digitos (RF-046). Nulo ate o lojista informar.';

-- ---------------------------------------------------------------------------
-- CFOP — a natureza da operacao
-- ---------------------------------------------------------------------------
--
-- Quatro digitos. Fica no PRODUTO e nao fixo na emissao porque ele muda com o
-- que se vende: 5102 e revenda de mercadoria, 5405 e revenda com substituicao
-- tributaria ja recolhida, e uma mercearia tem os dois na mesma prateleira.
--
-- Cravar 5102 para tudo emitiria nota errada em cigarro, refrigerante e cerveja
-- — que sao exatamente os itens de maior giro de um mercadinho.
ALTER TABLE products ADD COLUMN cfop text
  CHECK (cfop IS NULL OR cfop ~ '^[0-9]{4}$');

COMMENT ON COLUMN products.cfop IS
  'Natureza da operacao, 4 digitos (RF-046). Varia por produto: revenda comum e ST diferem.';

-- ---------------------------------------------------------------------------
-- CST ou CSOSN — a situacao tributaria
-- ---------------------------------------------------------------------------
--
-- DOIS digitos no regime normal (CST) e TRES no Simples (CSOSN). Sao codigos de
-- tabelas diferentes para a mesma pergunta, e qual deles vale sai do
-- `tax_regime` da empresa, que ja existe desde a 0002.
--
-- Por isso a coluna aceita os dois tamanhos em vez de ter duas colunas: um
-- produto tem UMA situacao tributaria por vez, e a empresa tem um regime por
-- vez. Duas colunas dariam a chance de as duas estarem preenchidas e
-- discordarem, e a nota sairia com a que alguem escolhesse ler.
ALTER TABLE products ADD COLUMN tax_situation_code text
  CHECK (tax_situation_code IS NULL OR tax_situation_code ~ '^[0-9]{2,3}$');

COMMENT ON COLUMN products.tax_situation_code IS
  'CST (2 digitos, regime normal) ou CSOSN (3, Simples) — RF-046. Qual vale sai de companies.tax_regime.';


-- Ordem total na trilha de estoque — RF-124, NR-023.
--
-- O defeito: `inventory_movements` ordenava por `created_at DESC`, e
-- `created_at` vem do INSTANTE DA REQUISICAO (`ctx.now`), nao de `now()`. Dois
-- movimentos da mesma requisicao nascem com o mesmo carimbo, e o desempate
-- caia num uuid aleatorio — a trilha voltava fora de ordem.
--
-- Isso nao e detalhe de teste. A trilha existe para responder "por que o saldo
-- esta assim", e ela responde mostrando o saldo apos cada movimento: 0 -> 10 ->
-- 8 -> 25. Fora de ordem, ela mostra 8 depois de 25 e a sequencia deixa de
-- explicar coisa nenhuma. Acontece exatamente onde mais doi: importacao de
-- planilha e ajuste em lote, que gravam varios movimentos num instante so.
--
-- A correcao e dar a trilha uma ordem TOTAL, que e o que um livro-razao
-- precisa ter. `bigserial` e monotonico por insercao e independe do relogio de
-- quem chamou.

ALTER TABLE inventory_movements ADD COLUMN seq bigserial NOT NULL;

COMMENT ON COLUMN inventory_movements.seq IS
  'Ordem de insercao. E por ela que a trilha se le, e nao por created_at (RF-124).';

-- O indice novo serve a MESMA consulta que o antigo — "o historico deste
-- produto, do mais recente para tras" — com a diferenca de que agora a ordem e
-- deterministica.
CREATE INDEX inventory_movements_por_produto_seq
  ON inventory_movements (company_id, product_id, seq DESC);

-- O antigo sai. Nao ha consulta por faixa de data na trilha, e manter dois
-- indices para a mesma pergunta e custo de escrita em toda venda — a tabela so
-- cresce, e cada venda insere uma linha por item.
DROP INDEX inventory_movements_por_produto;

-- ---------------------------------------------------------------------------
-- O autor da trilha, alinhado com a convencao da audit_logs
-- ---------------------------------------------------------------------------
--
-- `created_by` era `REFERENCES users (id) ON DELETE SET NULL` numa tabela
-- SOMENTE-INSERCAO. As duas coisas nao convivem: `ON DELETE SET NULL` executa
-- um UPDATE na linha que referencia, e o gatilho `inventory_movements_sem_update`
-- recusa. O resultado pratico e que apagar um usuario que ja mexeu no estoque
-- falhava com "e somente-insercao: UPDATE nao e permitido" — uma mensagem que
-- nao aponta para nada e num caminho que ninguem exercitava.
--
-- A `audit_logs` (0007) ja resolveu isto e deixou o motivo escrito: `actor_id`
-- e `NOT NULL` e **sem FK**, porque "o autor pode ser desligado da empresa sem
-- que o que ele fez deixe de valer". A trilha de estoque e a mesma coisa e
-- segue a mesma regra.
--
-- O `SET NULL` nunca chegou a acontecer — o gatilho o impedia — entao nao ha
-- linha nula para tratar. Se houvesse, esta migration falharia alto, que e o
-- desfecho certo para um dado que ninguem sabe reconstruir.

ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_created_by_fkey;
ALTER TABLE inventory_movements ALTER COLUMN created_by SET NOT NULL;

COMMENT ON COLUMN inventory_movements.created_by IS
  'Quem fez o movimento. Sem FK de proposito: o autor pode sair da empresa sem que o movimento deixe de valer (US-061), e a trilha nao aceita UPDATE (RF-124).';


-- Endereco de empresa e de cliente — NR-072, RF-003, RF-011.
--
-- NENHUMA tabela guardava endereco. As telas de Empresa e de Cliente pedem CEP,
-- logradouro, numero, complemento, bairro, cidade e UF desde sempre, com busca
-- automatica por CEP — e o dado era descartado. O lojista preenchia sete campos
-- e nada disso existia no dia seguinte.
--
-- Isso tambem e o que mantinha as duas telas presas em `lib/mock-data`, e o que
-- fez o mapeamento da planilha de clientes deixar cidade e UF de fora com a
-- nota "voltam quando houver onde guardar". E agora.

-- ---------------------------------------------------------------------------
-- Colunas achatadas, e nao uma tabela `addresses`
-- ---------------------------------------------------------------------------
--
-- Um endereco aqui pertence a exatamente UMA entidade e nunca e compartilhado:
-- duas empresas no mesmo predio sao dois enderecos iguais, e nao o mesmo
-- endereco. Uma tabela separada custaria um JOIN em toda leitura de cadastro
-- para normalizar algo que ninguem reusa — e abriria a porta para endereco
-- orfao, que e lixo que so aparece anos depois.
--
-- Todos ANULAVEIS. A RF-009 e explicita: cliente precisa de "apenas nome e
-- telefone", e exigir CEP travaria o balcao. Para a empresa, o endereco chega
-- pela busca de CNPJ e pode faltar. Coluna obrigatoria aqui seria uma regra que
-- o produto nao tem.

-- A UF, com a lista fechada. `text` + CHECK como o resto do schema: enum nativo
-- nao volta atras, e a lista das 27 e a coisa mais estavel do Brasil — mas o
-- padrao do repositorio vale mesmo quando a lista nao muda.
CREATE OR REPLACE FUNCTION uf_valida(uf text) RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $$
    SELECT uf IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    )
  $$;

COMMENT ON FUNCTION uf_valida(text) IS
  'As 27 unidades federativas. Usada nos CHECK de endereco (NR-072).';

ALTER TABLE companies
  ADD COLUMN postal_code   text,
  ADD COLUMN street     text,
  ADD COLUMN street_number text,
  ADD COLUMN complement text,
  ADD COLUMN neighborhood   text,
  ADD COLUMN city       text,
  ADD COLUMN state      text CHECK (state IS NULL OR uf_valida(state));

ALTER TABLE customers
  ADD COLUMN postal_code   text,
  ADD COLUMN street     text,
  ADD COLUMN street_number text,
  ADD COLUMN complement text,
  ADD COLUMN neighborhood   text,
  ADD COLUMN city       text,
  ADD COLUMN state      text CHECK (state IS NULL OR uf_valida(state));

-- `number` e TEXTO e nao inteiro: existe "s/n", "120-A" e "KM 42". Guardar como
-- numero obrigaria a inventar uma convencao para os tres, e a primeira entrega
-- perdida seria a de um endereco desses.
COMMENT ON COLUMN customers.street_number IS
  'Numero do endereco. Texto porque existe "s/n", "120-A" e "KM 42".';

-- ---------------------------------------------------------------------------
-- O que NAO ganhou coluna, e por que
-- ---------------------------------------------------------------------------
--
-- **Tipo de pessoa** (fisica ou juridica). A tela mostra, e ele e DERIVADO do
-- documento: onze digitos e CPF, catorze e CNPJ. Guardar seria criar uma
-- segunda fonte para a mesma verdade, e no dia em que as duas divergissem
-- ninguem saberia qual vale — e um cadastro com CNPJ marcado como pessoa fisica
-- emite nota errada.
--
-- **DDD separado do celular.** `phone` ja guarda o numero inteiro, e o DDD sao
-- os dois primeiros digitos. Duas colunas para um numero so criam o estado
-- invalido "DDD de Sao Paulo com celular de Manaus", que nenhuma validacao
-- pega depois de gravado.
--
-- Os dois sao calculados na apresentacao. Ver `documento.ts` em `contracts`.


-- Hora de fim e local do compromisso — NR-035, RF-089, RF-093.
--
-- Mesmo defeito do endereco (0019), noutra tela: o formulario da agenda pede
-- horario de inicio, horario de FIM e local desde sempre, e so o inicio tinha
-- coluna. Os outros dois eram digitados e descartados.
--
-- Nao e cosmetico. Sem `ends_at` a agenda nao sabe quanto dura nada: uma
-- reuniao das 16h e um almoco das 12h ocupam o mesmo ponto na tela, e a
-- pergunta "tenho a tarde livre?" nao tem resposta. E sem `location` a entrega
-- na Rua Xavier da Silva, 88 vira "Entrega Padaria Sol" sem endereco nenhum,
-- que e a informacao pela qual se abre o compromisso.

-- ---------------------------------------------------------------------------
-- ends_at — anulavel, e nao com um padrao de trinta minutos
-- ---------------------------------------------------------------------------
--
-- "Pagar aluguel as 10h" nao tem duracao, e inventar meia hora para ele
-- ocuparia a agenda com um bloco que ninguem pediu. NULL aqui significa
-- "compromisso pontual", e a tela desenha um marcador em vez de uma faixa.
--
-- Quando existe, tem de ser DEPOIS do inicio. O CHECK e a ultima linha de
-- defesa: `contracts` valida o que entra por HTTP, mas migration, script e
-- worker escrevem por fora, e um compromisso que termina antes de comecar
-- quebra qualquer calculo de sobreposicao que venha depois.
ALTER TABLE appointments
  ADD COLUMN ends_at timestamptz,
  ADD COLUMN location text;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_fim_depois_do_inicio
    CHECK (ends_at IS NULL OR ends_at > starts_at);

-- O mesmo teto de `notes`, pelo mesmo motivo: o limite mora onde o dado mora.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_local_tamanho
    CHECK (location IS NULL OR char_length(location) <= 200);

COMMENT ON COLUMN appointments.ends_at IS
  'Fim do compromisso, em UTC. NULL = pontual, sem duracao (NR-035).';

COMMENT ON COLUMN appointments.location IS
  'Onde e o compromisso, em texto livre. Nao e endereco estruturado: '
  '"Loja", "Sala de reuniao" e "Rua Xavier da Silva, 88" sao todos validos.';


-- Inscricoes e ramo de atividade da empresa — NR-072, RF-003, RF-046.
--
-- A tela de Empresa pede inscricao estadual, inscricao municipal e ramo de
-- atividade desde sempre, e nenhum dos tres tinha coluna. Eram digitados e
-- descartados, como o endereco antes da 0019.
--
-- As duas inscricoes nao sao perda de cadastro apenas: elas entram na NOTA. Sem
-- inscricao estadual nao se emite NFC-e como contribuinte de ICMS, e sem a
-- municipal nao se emite NFS-e. A emissao ia funcionar em teste e falhar na
-- primeira nota de verdade, com uma mensagem da SEFAZ que ninguem no produto
-- saberia traduzir.

-- ---------------------------------------------------------------------------
-- Todos ANULAVEIS, e nao obrigatorios
-- ---------------------------------------------------------------------------
--
-- MEI nao tem inscricao estadual. Loja que so vende produto nao tem inscricao
-- municipal. E a RF-001 cadastra a empresa com razao social, CNPJ, e-mail e
-- telefone — exigir os tres aqui quebraria o cadastro de conta, que e a
-- primeira coisa que o lojista faz.
--
-- Quem cobra e a EMISSAO, no momento em que eles fazem falta, com a mensagem
-- certa. Cobrar no cadastro empurraria de volta para o caderno alguem que so
-- queria comecar a usar.

ALTER TABLE companies
  ADD COLUMN state_registration     text,
  ADD COLUMN municipal_registration text,
  ADD COLUMN business_segment       text;

ALTER TABLE companies
  ADD CONSTRAINT companies_inscricao_estadual_tamanho
    CHECK (state_registration IS NULL
           OR char_length(btrim(state_registration)) BETWEEN 2 AND 20),
  ADD CONSTRAINT companies_inscricao_municipal_tamanho
    CHECK (municipal_registration IS NULL
           OR char_length(btrim(municipal_registration)) BETWEEN 2 AND 20),
  ADD CONSTRAINT companies_ramo_tamanho
    CHECK (business_segment IS NULL
           OR char_length(btrim(business_segment)) BETWEEN 2 AND 80);

-- ---------------------------------------------------------------------------
-- `business_segment` e o RAMO, e nao o CNAE
-- ---------------------------------------------------------------------------
--
-- A tela oferece uma lista de segmentos em portugues corrente — "Mercearia e
-- minimercado", "Pet shop", "Oficina e autopecas". E o que o lojista sabe
-- responder, e serve para o produto se ajustar a ele.
--
-- CNAE e outra coisa: sete digitos, definidos pelo contador, e e ele que decide
-- codigo de servico na NFS-e. Guardar o segmento numa coluna chamada `cnae`
-- criaria uma coluna que a tela nunca consegue preencher direito — e alguem, no
-- dia da primeira NFS-e, leria "Pet shop" onde esperava "9609204". O CNAE entra
-- quando houver quem o informe.

COMMENT ON COLUMN companies.state_registration IS
  'Inscricao estadual. Formato varia por UF, e "ISENTO" e valor legitimo.';

COMMENT ON COLUMN companies.municipal_registration IS
  'Inscricao municipal. Necessaria para NFS-e; nem toda loja tem.';

COMMENT ON COLUMN companies.business_segment IS
  'Ramo de atividade em texto corrente. NAO e o CNAE (NR-072).';

-- ---------------------------------------------------------------------------
-- Por que a inscricao estadual NAO tem formato validado
-- ---------------------------------------------------------------------------
--
-- Cada estado tem o seu: Sao Paulo usa 12 digitos com dois verificadores, o
-- Parana usa 10, a Bahia aceita 8 e 9, e "ISENTO" e um valor legitimo em
-- varios. Um CHECK que aceitasse so um formato recusaria empresa de verdade, e
-- um que aceitasse todos nao guardaria nada. Fica so o tamanho, e a validacao
-- por estado entra com a emissao, onde ha a quem perguntar.
