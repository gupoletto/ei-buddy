-- Lista de espera do pre-lancamento — NR-111.
--
-- ---------------------------------------------------------------------------
-- Por que esta tabela NAO tem company_id nem RLS
-- ---------------------------------------------------------------------------
--
-- Quem responde nao tem empresa cadastrada ainda — e por isso mesmo esta
-- aqui, e nao dentro do fluxo de cadastro. E dado de PLATAFORMA, na mesma
-- categoria de `users`, `partners` e `coupons`: nenhuma das duas checagens de
-- `schema.test.ts` sobre `company_id` se aplica, porque as duas so examinam
-- tabela que TEM essa coluna. Nao ha lista de excecao para atualizar.
--
-- ---------------------------------------------------------------------------
-- Por que as respostas fechadas gravam CHAVE em ingles, nao o texto da tela
-- ---------------------------------------------------------------------------
--
-- `pain_points`, `uses_system` e `fair_price` gravam a chave semantica que
-- `packages/contracts` define (`cash_flow`, `complicated`, `up_to_29`...), o
-- mesmo padrao de `products.category`/`account_type` no resto do schema. A
-- pergunta do formulario pode mudar de palavra sem migrar dado, e o painel
-- (NR-111, segunda PR) agrega por chave, nao por texto solto.
CREATE TABLE waitlist_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 140),
  business_type      text,
  phone              text NOT NULL,
  expectation        text NOT NULL CHECK (char_length(btrim(expectation)) BETWEEN 1 AND 2000),
  /* Chaves de `painPointSchema`, sem repetir — a UI ja impede repeticao, e o
     CHECK aqui e a mesma garantia contra quem grava direto no banco. */
  pain_points        text[] NOT NULL DEFAULT '{}',
  pain_point_other   text,
  uses_system        text,
  uses_system_other  text,
  fair_price         text,
  wants_updates      boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Painel do Super Admin (NR-111, segunda PR) le sempre do mais novo pro mais
-- velho, e "evolucao no tempo" agrupa por dia sobre esta mesma ordenacao.
CREATE INDEX waitlist_entries_por_data ON waitlist_entries (created_at DESC);
