-- Custos fixos: previsao recorrente de gasto — NR-110.
--
-- Modulo inteiro novo. Nao havia tabela, porta nem rota — a tela de "Plano de
-- contas" montava a lista a partir de `mock-data`, e cadastrar, editar,
-- excluir e "gerar contas a pagar do mes" eram `await delay(...)` seguidos de
-- um objeto de sucesso: nada era gravado, e a lista voltava aos mesmos quatro
-- exemplos (aluguel, energia, internet, contabilidade) a cada abertura.
--
-- ---------------------------------------------------------------------------
-- Por que uma tabela PROPRIA, e nao `payables.is_template`
-- ---------------------------------------------------------------------------
--
-- `docs/arquitetura/esquema-postgresql.md` (snapshot do baseline 0909,
-- explicitamente NAO migration) chegou a esbocar "custo fixo = is_template em
-- payables". `payables` ja tem UM modelo de recorrencia (`recurrence_id` +
-- `occurrence_number` + `occurrence_count`), que materializa N ocorrencias
-- FUTURAS de uma vez, todas com `due_date` proprio. Custo fixo e outro
-- conceito: um "molde" com dia do mes fixo, sem data de vencimento nenhuma
-- at'e alguem pedir "gere o mes atual" — e esse pedido pode nunca vir (o
-- lojista cadastra em janeiro, so gera em marco). Forcar os dois modelos na
-- mesma coluna faria `due_date NOT NULL` nao fazer sentido para o molde, e
-- faria o codigo perguntar "essa linha e gasto real ou e so o molde?" toda vez
-- que lesse `payables`.
--
-- ---------------------------------------------------------------------------
-- Banco NAO existe aqui, nem em `payables`
-- ---------------------------------------------------------------------------
--
-- O mock de custo fixo tinha um campo "banco" — e nao ha, em lugar nenhum do
-- schema real, uma coluna para ele: `bank_account` so existe em `settlements`
-- (a BAIXA, "de qual conta o dinheiro SAIU"), nunca no lancamento. Um custo
-- fixo gera uma linha em `payables`, que tambem nao tem coluna de banco.
-- Guardar "banco" aqui seria o mesmo defeito que o resto desta sessao andou
-- corrigindo: coletar um dado que nao tem onde ir.

CREATE TABLE fixed_costs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 140),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  -- Dia do mes em que costuma vencer. 31 em fevereiro cai no ultimo dia do
  -- mes na hora de gerar — ver `diasNoMes` em `packages/domain`, a mesma
  -- regra que a recorrencia de conta a pagar ja usa.
  due_day      integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  -- Classificacao no plano de contas — opcional: o lojista pode cadastrar o
  -- custo antes de decidir a conta, e classificar depois na propria tela de
  -- contas a pagar, como qualquer outra.
  account_id   uuid REFERENCES ledger_accounts (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX fixed_costs_por_empresa ON fixed_costs (company_id, created_at DESC);

SELECT enable_tenant_isolation('fixed_costs');

COMMENT ON TABLE fixed_costs IS
  'Previsao recorrente de gasto (NR-110) — aluguel, energia, assinatura. "Gerar contas do mes" materializa uma linha em payables por custo fixo, uma vez por mes.';

-- ---------------------------------------------------------------------------
-- A ligacao com a conta a pagar gerada
-- ---------------------------------------------------------------------------
--
-- `ON DELETE SET NULL`, e nao RESTRICT: apagar um custo fixo nao apaga nem
-- reclassifica as contas que ele ja gerou — "contas ja lancadas continuam
-- como estao" e a propria regra que a tela promete. Bloquear a exclusao
-- enquanto houver conta gerada trataria o molde como se fosse tao importante
-- quanto o plano de contas, e nao e: e so um lembrete de que algo se repete.
ALTER TABLE payables
  ADD COLUMN fixed_cost_id uuid REFERENCES fixed_costs (id) ON DELETE SET NULL;

-- A idempotencia que "gerar contas do mes" promete: rodar duas vezes no
-- mesmo mes nao duplica a conta. `company_id` entra por convencao do schema
-- (todo indice de tabela de negocio comeca por ele — ver schema.test.ts), nao
-- porque a dupla (fixed_cost_id, due_date) sozinha deixasse de ser unica: um
-- custo fixo pertence a uma unica empresa.
CREATE UNIQUE INDEX payables_um_por_custo_fixo_por_vencimento
  ON payables (company_id, fixed_cost_id, due_date)
  WHERE fixed_cost_id IS NOT NULL;
