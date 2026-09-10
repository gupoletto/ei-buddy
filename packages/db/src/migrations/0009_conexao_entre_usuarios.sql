-- Conexao entre lojistas por proximidade — NR-107, ADR-0008, DEC-021.
--
-- ## Coordenada mora em `companies`, nao em tabela propria
--
-- Latitude/longitude sao geocodificadas a partir do CEP quando o endereco e
-- salvo (ver `CepLookup` em `core`) e usadas SO para ordenar busca por
-- distancia — nunca aparecem em nenhum contrato publico (`CompanyOutput` nao
-- ganha os campos). Ficam como colunas simples porque sao um atributo da
-- empresa, nao uma entidade propria; uma tabela dedicada existiria so para
-- guardar dois numeros que sempre tem exatamente uma empresa dona.
--
-- ## `company_connections`: mesmo desenho de `platform_admin_access`
--
-- Liga usuarios de EMPRESAS DIFERENTES — nao ha um tenant dono unico, entao
-- nao ha politica `tenant_isolation` para aplicar (e as colunas nao se chamam
-- `company_id` de proposito, para nao cair na guarda de schema que exige essa
-- politica em qualquer coluna com esse nome literal — ver
-- `packages/db/src/schema.test.ts` e o mesmo comentario na migration 0008).
--
-- `ENABLE` + `FORCE ROW LEVEL SECURITY` sem nenhuma politica permissiva nega
-- tudo para qualquer papel comum. Todo acesso passa pelas funcoes
-- `company_connections_*` abaixo — `SECURITY DEFINER`, `search_path` fixo,
-- retorno minimo, mesmo padrao da 0008.
--
-- ## Busca cross-tenant: leitura publica, nunca dado sensivel
--
-- `company_connections_search` e a UNICA funcao deste arquivo que le
-- `products`/`companies` de qualquer empresa sem verificar vinculo nenhum —
-- de proposito, e por isso o retorno e minimo: nome da empresa,
-- bairro/cidade, coordenada, descricao do produto. Nunca telefone, nunca
-- endereco completo, nunca dado fiscal ou financeiro. Esses so saem de
-- `company_connections_list`, e so quando o pedido esta `accepted`.

-- ---------------------------------------------------------------------------
-- Coordenada da empresa
-- ---------------------------------------------------------------------------

ALTER TABLE companies
  ADD COLUMN latitude  numeric(9,6),
  ADD COLUMN longitude numeric(9,6);

COMMENT ON COLUMN companies.latitude IS
  'Geocodificada a partir do CEP ao salvar o endereco (ADR-0008). Nula ate o primeiro salvamento depois desta migration, ou se o CEP nao tiver cobertura de coordenada — a empresa fica de fora da busca por proximidade nesse caso.';
COMMENT ON COLUMN companies.longitude IS
  'Ver companies.latitude.';

-- ---------------------------------------------------------------------------
-- company_connections — o pedido de conexao
-- ---------------------------------------------------------------------------

CREATE TABLE company_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  requester_company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  target_user_id        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  target_company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  responded_at          timestamptz,
  expires_at            timestamptz NOT NULL,
  CONSTRAINT company_connections_nao_consigo_mesmo
    CHECK (requester_company_id != target_company_id),
  CONSTRAINT company_connections_resposta_consistente
    CHECK ((status = 'pending') = (responded_at IS NULL))
);

COMMENT ON TABLE company_connections IS
  'Pedido de conexao entre lojistas de empresas diferentes (ADR-0008, DEC-021). RLS sem politica; acesso so por company_connections_*.';

CREATE INDEX company_connections_por_requerente
  ON company_connections (requester_user_id, created_at DESC);
CREATE INDEX company_connections_por_alvo
  ON company_connections (target_user_id, created_at DESC);

-- Regra de negocio 2: nao ha pedido novo enquanto o PAR de empresas tiver um
-- pendente ou aceito, em qualquer direcao. `LEAST`/`GREATEST` normalizam o
-- par para que A-pedindo-B e B-pedindo-A colidam no mesmo indice.
CREATE UNIQUE INDEX company_connections_par_ativo_unico ON company_connections (
  LEAST(requester_company_id, target_company_id),
  GREATEST(requester_company_id, target_company_id)
) WHERE status IN ('pending', 'accepted');

ALTER TABLE company_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_connections FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Busca de fornecedores — RF-01, RF-02, RF-03
-- ---------------------------------------------------------------------------

-- Haversine, em km. `LEAST`/`GREATEST` blindam o `acos` contra o argumento
-- saindo de [-1, 1] por erro de ponto flutuante quando os dois pontos sao
-- (quase) o mesmo — sem a blindagem, `acos` de um numero como 1.0000000002
-- devolve NULL em vez de zero, e "distancia para uma empresa vizinha porta a
-- porta" viraria "sem distancia".
CREATE OR REPLACE FUNCTION haversine_km(
  lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric
) RETURNS numeric
  LANGUAGE sql
  IMMUTABLE
  AS $$
    SELECT 6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1)) +
        sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  $$;

CREATE OR REPLACE FUNCTION company_connections_search(p_requester_company_id uuid, p_term text)
  RETURNS TABLE (
    company_id   uuid,
    company_name text,
    neighborhood text,
    city         text,
    distance_km  numeric,
    products     text[]
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT
      c.id AS company_id,
      COALESCE(c.trade_name, c.legal_name) AS company_name,
      c.neighborhood,
      c.city,
      -- Nula quando quem busca ainda nao tem coordenada resolvida — a lista
      -- aparece sem ordenacao por distancia nesse caso, nao vazia (RF-02).
      CASE
        WHEN r.latitude IS NULL OR r.longitude IS NULL THEN NULL
        ELSE haversine_km(r.latitude, r.longitude, c.latitude, c.longitude)
      END AS distance_km,
      array_agg(DISTINCT p.description ORDER BY p.description) AS products
    FROM companies c
    JOIN products p ON p.company_id = c.id
    CROSS JOIN (SELECT latitude, longitude FROM companies WHERE id = p_requester_company_id) r
    WHERE c.id != p_requester_company_id
      AND c.is_active
      AND c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL
      AND p.is_active
      AND p.deleted_at IS NULL
      AND p.description ILIKE '%' || p_term || '%'
    GROUP BY c.id, r.latitude, r.longitude
    ORDER BY distance_km ASC NULLS LAST, company_name ASC
    LIMIT 200
  $$;

COMMENT ON FUNCTION company_connections_search(uuid, text) IS
  'Quem vende um produto, perto de quem busca (ADR-0008). Retorno minimo: nunca telefone nem endereco completo.';

-- ---------------------------------------------------------------------------
-- Pedir conexao — RF-04
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION company_connections_request(
  p_requester_user_id uuid,
  p_requester_company_id uuid,
  p_target_company_id uuid
)
  RETURNS TABLE (id uuid, target_company_id uuid, target_phone text, target_company_name text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_target_user_id uuid;
  v_target_phone text;
  v_target_name text;
  v_id uuid;
BEGIN
  IF p_requester_company_id = p_target_company_id THEN
    RAISE EXCEPTION 'Nao e possivel pedir conexao com a propria empresa.';
  END IF;

  SELECT c.phone, COALESCE(c.trade_name, c.legal_name)
    INTO v_target_phone, v_target_name
    FROM companies c
   WHERE c.id = p_target_company_id AND c.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa alvo nao encontrada ou inativa.';
  END IF;

  -- `phone` e `NOT NULL` na tabela, mas pode ser string vazia: o cadastro por
  -- `/auth/signup` nao exige telefone. Sem numero, nao ha como avisar por
  -- WhatsApp nem mostrar contato depois do aceite — melhor recusar aqui, com
  -- mensagem clara, do que aceitar o pedido e a outra parte nunca saber que
  -- recebeu um.
  IF trim(v_target_phone) = '' THEN
    RAISE EXCEPTION 'Empresa alvo sem telefone cadastrado.';
  END IF;

  -- Quem decide por uma empresa e o `owner` — o unico papel presente em toda
  -- empresa cadastrada hoje (ADR-0008).
  SELECT cu.user_id INTO v_target_user_id
    FROM company_users cu
   WHERE cu.company_id = p_target_company_id
     AND cu.role = 'owner'
     AND cu.is_active
   LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Empresa alvo sem dono ativo.';
  END IF;

  INSERT INTO company_connections (
    requester_user_id, requester_company_id, target_user_id, target_company_id, expires_at
  ) VALUES (
    p_requester_user_id, p_requester_company_id, v_target_user_id, p_target_company_id,
    now() + interval '30 days'
  )
  RETURNING company_connections.id INTO v_id;

  RETURN QUERY SELECT v_id, p_target_company_id, v_target_phone, v_target_name;
END;
$$;

COMMENT ON FUNCTION company_connections_request(uuid, uuid, uuid) IS
  'Cria o pedido, resolvido para o owner da empresa alvo. Devolve telefone e nome so para o enfileiramento do aviso (ADR-0008) — nao e leitura exposta ao chamador.';

-- ---------------------------------------------------------------------------
-- Aceitar ou recusar — RF-04
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION company_connections_respond(
  p_connection_id uuid,
  p_user_id uuid,
  p_accept boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_status text;
  v_target_user_id uuid;
  v_expires_at timestamptz;
BEGIN
  SELECT status, target_user_id, expires_at
    INTO v_status, v_target_user_id, v_expires_at
    FROM company_connections
   WHERE id = p_connection_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Pedido de conexao nao encontrado.';
  END IF;

  IF v_target_user_id != p_user_id THEN
    RAISE EXCEPTION 'Apenas quem recebeu o pedido pode responder.';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Este pedido ja foi respondido.';
  END IF;

  IF v_expires_at < now() THEN
    RAISE EXCEPTION 'Este pedido expirou.';
  END IF;

  UPDATE company_connections
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
         responded_at = now()
   WHERE id = p_connection_id;
END;
$$;

COMMENT ON FUNCTION company_connections_respond(uuid, uuid, boolean) IS
  'Aceita ou recusa um pedido pendente — so quem recebeu pode chamar (ADR-0008).';

-- ---------------------------------------------------------------------------
-- Cancelar (pendente) ou desfazer (aceita) — RF-05
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION company_connections_end(p_connection_id uuid, p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_status text;
  v_requester_user_id uuid;
  v_target_user_id uuid;
BEGIN
  SELECT status, requester_user_id, target_user_id
    INTO v_status, v_requester_user_id, v_target_user_id
    FROM company_connections
   WHERE id = p_connection_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Pedido de conexao nao encontrado.';
  END IF;

  IF v_status = 'pending' THEN
    IF p_user_id != v_requester_user_id THEN
      RAISE EXCEPTION 'Apenas quem pediu pode cancelar.';
    END IF;
  ELSIF v_status = 'accepted' THEN
    IF p_user_id NOT IN (v_requester_user_id, v_target_user_id) THEN
      RAISE EXCEPTION 'Voce nao faz parte desta conexao.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Este pedido ja foi encerrado.';
  END IF;

  -- `rejected` cobre os dois casos ("nao vai acontecer" e "nao esta mais
  -- acontecendo") — a spec original nao pede um quarto estado so para isto,
  -- e a tela distingue os dois pela ACAO que a pessoa tomou, nao pelo status
  -- salvo (ver ADR-0008, "Consequencias neutras").
  UPDATE company_connections
     SET status = 'rejected', responded_at = now()
   WHERE id = p_connection_id;
END;
$$;

COMMENT ON FUNCTION company_connections_end(uuid, uuid) IS
  'Cancela um pedido pendente (so o requerente) ou desfaz uma conexao aceita (qualquer um dos dois lados) — ADR-0008.';

-- ---------------------------------------------------------------------------
-- Listar minhas conexoes — RF-05
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION company_connections_list(p_user_id uuid)
  RETURNS TABLE (
    id                   uuid,
    direction            text,
    status               text,
    other_company_id     uuid,
    other_company_name   text,
    created_at           timestamptz,
    responded_at         timestamptz,
    expires_at           timestamptz,
    other_phone          text,
    other_postal_code    text,
    other_street         text,
    other_street_number  text,
    other_complement     text,
    other_neighborhood   text,
    other_city           text,
    other_state          text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT
      cc.id,
      CASE WHEN cc.requester_user_id = p_user_id THEN 'sent' ELSE 'received' END,
      CASE WHEN cc.status = 'pending' AND cc.expires_at < now() THEN 'expired' ELSE cc.status END,
      oc.id,
      COALESCE(oc.trade_name, oc.legal_name),
      cc.created_at,
      cc.responded_at,
      cc.expires_at,
      CASE WHEN cc.status = 'accepted' THEN oc.phone END,
      CASE WHEN cc.status = 'accepted' THEN oc.postal_code END,
      CASE WHEN cc.status = 'accepted' THEN oc.street END,
      CASE WHEN cc.status = 'accepted' THEN oc.street_number END,
      CASE WHEN cc.status = 'accepted' THEN oc.complement END,
      CASE WHEN cc.status = 'accepted' THEN oc.neighborhood END,
      CASE WHEN cc.status = 'accepted' THEN oc.city END,
      CASE WHEN cc.status = 'accepted' THEN oc.state END
    FROM company_connections cc
    JOIN companies oc
      ON oc.id = CASE
                   WHEN cc.requester_user_id = p_user_id THEN cc.target_company_id
                   ELSE cc.requester_company_id
                 END
    WHERE cc.requester_user_id = p_user_id OR cc.target_user_id = p_user_id
    ORDER BY cc.created_at DESC
  $$;

COMMENT ON FUNCTION company_connections_list(uuid) IS
  'Todas as conexoes de um usuario, dos dois lados. Contato completo so quando accepted (ADR-0008).';

-- ---------------------------------------------------------------------------
-- Contagem para o sino — RF-05
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION company_connections_pending_count(p_user_id uuid)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT count(*)::int
      FROM company_connections
     WHERE target_user_id = p_user_id
       AND status = 'pending'
       AND expires_at > now()
  $$;

COMMENT ON FUNCTION company_connections_pending_count(uuid) IS
  'Pedidos recebidos e pendentes — alimenta o sino do AppShell (ADR-0008).';
