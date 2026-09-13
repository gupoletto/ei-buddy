-- Lista de espera do pre-lancamento — NR-111.
--
-- ---------------------------------------------------------------------------
-- Por que esta tabela NAO tem company_id nem RLS
-- ---------------------------------------------------------------------------
--
-- Quem responde nao tem empresa cadastrada ainda — e por isso mesmo esta
-- aqui, e nao dentro do fluxo de cadastro. E dado de PLATAFORMA, na mesma
-- categoria de `partners`/`coupons`/`platform_admins`: as duas checagens de
-- `schema.test.ts` que exigem `company_id` numa coluna (politica de tenant, e
-- indice comecando por ele) nao se aplicam, porque as duas so examinam tabela
-- que TEM essa coluna — mas a checagem "toda tabela nasce com RLS" examina
-- TODA tabela, sem essa condicao, e por isso `waitlist_entries` entrou no
-- `NAO_TENANT` de `schema.test.ts`. A exportacao LGPD tambem pediu declaracao
-- explicita: `FORA_DA_EXPORTACAO` em `privacy-repository.ts`, mesmo motivo de
-- `partners`/`platform_admins` — quem respondeu nao e titular de empresa
-- nenhuma para devolver pacote.
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
