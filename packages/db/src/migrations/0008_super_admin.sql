-- Super Admin: acesso cross-tenant auditado — NR-105, ADR-0007, DEC-020.
--
-- ## Por que isto nao e um papel com BYPASSRLS
--
-- `rls-guard.ts` derruba a aplicacao se a conexao de runtime conseguir
-- ignorar RLS — de proposito. Dar a um "Super Admin" um papel de banco com
-- esse poder contradiria exatamente a garantia que o guard-rail protege: o
-- RLS deixaria de ser "sempre vale" para virar "vale, exceto quando alguem
-- quis o contrario". Um bug de autorizacao numa conexao assim nao vaza uma
-- consulta — vaza a base inteira.
--
-- ## O desenho: "entrar como", nao "ver por cima"
--
-- Super Admin nao e um SELECT que atravessa todas as empresas de uma vez. E
-- uma SESSAO que pode trocar de empresa livremente — o mesmo mecanismo que
-- `/auth/select-company` ja usa para quem opera mais de uma loja, so que sem
-- exigir vinculo em `company_users`, e com uma exigencia a mais: dizer POR
-- QUE, toda vez (RF-131).
--
-- Depois de "entrar", a sessao tem `active_company_id` e `role = 'owner'`
-- como qualquer sessao normal — `requireContext`/`withTenant` nao sabem, e
-- nao precisam saber, que quem esta do outro lado e um Super Admin. Toda
-- rota de negocio que existe hoje, e toda que vier a existir, ja funciona
-- para o Super Admin sem mudanca nenhuma. O preco: enquanto "dentro" de uma
-- empresa, o Super Admin tem tudo que o dono da loja tem — nao um
-- subconjunto proprio. Ver ADR-0007 para as opcoes descartadas.
--
-- ## As duas tabelas, e por que nenhuma tem politica de RLS
--
-- Mesmo desenho de `sessions`/`login_throttle` (migration 0004):
-- `ENABLE` + `FORCE ROW LEVEL SECURITY` sem nenhuma politica permissiva
-- nega tudo, para qualquer papel comum. Todo acesso passa pelas funcoes
-- `platform_admin_*`/`auth_session_*` abaixo — `SECURITY DEFINER`,
-- `search_path` fixo, retorno minimo, mesmo padrao da 0003/0004.

-- ---------------------------------------------------------------------------
-- platform_admins — quem PODE entrar em qualquer empresa
-- ---------------------------------------------------------------------------

CREATE TABLE platform_admins (
  user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  granted_by  uuid NOT NULL REFERENCES users (id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  uuid REFERENCES users (id),
  revoked_at  timestamptz,
  CONSTRAINT platform_admins_revogacao_consistente
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

COMMENT ON TABLE platform_admins IS
  'Quem pode entrar em qualquer empresa (ADR-0007). Sem politica de RLS: acesso so pelas funcoes platform_admin_*.';

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- platform_admin_access — RF-131: quando entrou em qual empresa, e por que
-- ---------------------------------------------------------------------------

CREATE TABLE platform_admin_access (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  uuid NOT NULL REFERENCES users (id),
  -- `target_company_id`, e NAO `company_id`: esta linha nao e POSSUIDA pela
  -- empresa, e SOBRE ela — a mesma distincao, pelo mesmo motivo, de
  -- `sessions.active_company_id` (ver o comentario la). Chamar de
  -- `company_id` acionaria a guarda de schema que exige `tenant_isolation`
  -- em toda tabela com essa coluna, e aqui a politica certa e a OPOSTA:
  -- ninguem le isto por tenant, so pelas funcoes SECURITY DEFINER abaixo.
  --
  -- RESTRICT, e nao CASCADE: uma empresa apagada nao pode levar embora o
  -- registro de que um Super Admin entrou nela — a trilha e sobre o acesso,
  -- nao sobre a empresa continuar existindo.
  target_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  justification  text NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  CONSTRAINT platform_admin_access_justificativa_nao_vazia
    CHECK (length(trim(justification)) >= 10)
);

COMMENT ON TABLE platform_admin_access IS
  'RF-131: por que um Super Admin entrou em cada empresa, e quando saiu. Sem politica de RLS: acesso so pelas funcoes auth_session_enter_company/auth_session_exit_company.';

CREATE INDEX platform_admin_access_por_empresa ON platform_admin_access (target_company_id, started_at DESC);
CREATE INDEX platform_admin_access_por_admin ON platform_admin_access (admin_user_id, started_at DESC);

ALTER TABLE platform_admin_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admin_access FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- E' Super Admin?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform_admin_is(p_user_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM platform_admins
       WHERE user_id = p_user_id
         AND revoked_at IS NULL
    )
  $$;

COMMENT ON FUNCTION platform_admin_is(uuid) IS
  'Se o usuario pode entrar em qualquer empresa (ADR-0007). Retorno minimo: um booleano, nunca a linha.';

-- ---------------------------------------------------------------------------
-- Conceder e revogar
-- ---------------------------------------------------------------------------

-- Quem concede PRECISA ja ser Super Admin. A excecao e so a PRIMEIRA linha:
-- ela nasce de um INSERT direto (fora desta funcao, num script de bootstrap),
-- porque antes do primeiro Super Admin nao existe quem conceda.
CREATE OR REPLACE FUNCTION platform_admin_grant(p_user_id uuid, p_granted_by uuid) RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    IF NOT platform_admin_is(p_granted_by) THEN
      RAISE EXCEPTION 'Quem concede Super Admin precisa ja ser Super Admin.';
    END IF;

    INSERT INTO platform_admins (user_id, granted_by)
    VALUES (p_user_id, p_granted_by)
    ON CONFLICT (user_id) DO UPDATE
       SET granted_by = p_granted_by,
           granted_at = now(),
           revoked_by = NULL,
           revoked_at = NULL;
  END;
  $$;

COMMENT ON FUNCTION platform_admin_grant(uuid, uuid) IS
  'Concede Super Admin. So outro Super Admin pode conceder (ADR-0007).';

CREATE OR REPLACE FUNCTION platform_admin_revoke(p_user_id uuid, p_revoked_by uuid) RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    IF NOT platform_admin_is(p_revoked_by) THEN
      RAISE EXCEPTION 'Quem revoga Super Admin precisa ja ser Super Admin.';
    END IF;

    UPDATE platform_admins
       SET revoked_by = p_revoked_by,
           revoked_at = now()
     WHERE user_id = p_user_id
       AND revoked_at IS NULL;
  END;
  $$;

COMMENT ON FUNCTION platform_admin_revoke(uuid, uuid) IS
  'Revoga Super Admin. So outro Super Admin pode revogar (ADR-0007).';

CREATE OR REPLACE FUNCTION platform_admin_list(p_requested_by uuid)
  RETURNS TABLE (user_id uuid, name text, email text, granted_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    IF NOT platform_admin_is(p_requested_by) THEN
      RAISE EXCEPTION 'Somente Super Admin ve a lista de Super Admins.';
    END IF;

    RETURN QUERY
    SELECT u.id, u.name, u.email, pa.granted_at
      FROM platform_admins pa
      JOIN users u ON u.id = pa.user_id
     WHERE pa.revoked_at IS NULL
     ORDER BY pa.granted_at;
  END;
  $$;

COMMENT ON FUNCTION platform_admin_list(uuid) IS
  'Lista quem e Super Admin hoje. Exige que quem pergunta tambem seja (ADR-0007).';

-- ---------------------------------------------------------------------------
-- A visao geral da plataforma
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform_admin_list_companies(p_requested_by uuid)
  RETURNS TABLE (
    id uuid,
    legal_name text,
    trade_name text,
    cnpj text,
    is_active boolean,
    created_at timestamptz
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    IF NOT platform_admin_is(p_requested_by) THEN
      RAISE EXCEPTION 'Somente Super Admin ve a lista de empresas.';
    END IF;

    RETURN QUERY
    SELECT c.id, c.legal_name, c.trade_name, c.cnpj, c.is_active, c.created_at
      FROM companies c
     ORDER BY c.created_at DESC;
  END;
  $$;

COMMENT ON FUNCTION platform_admin_list_companies(uuid) IS
  'Toda empresa cadastrada, para o painel do Super Admin. Exige que quem pergunta seja Super Admin (ADR-0007).';

-- ---------------------------------------------------------------------------
-- Entrar e sair de uma empresa
-- ---------------------------------------------------------------------------

-- A sessao ganha de onde saber se esta "dentro" de um acesso administrativo.
-- Nula em toda sessao comum — so passa a valer quando `auth_session_enter_company`
-- e chamada. O CHECK garante que nunca existe acesso administrativo sem
-- empresa ativa: os dois nascem e morrem juntos.
ALTER TABLE sessions
  ADD COLUMN admin_access_id uuid REFERENCES platform_admin_access (id);

ALTER TABLE sessions
  ADD CONSTRAINT sessions_admin_access_exige_empresa
  CHECK (admin_access_id IS NULL OR active_company_id IS NOT NULL);

-- Entra numa empresa. So chega aqui depois de `core` ja ter conferido
-- `platform_admin_is` — a checagem AQUI DENTRO e cinto e suspensorio: se
-- disparar, e porque algo pulou a checagem de `core`, o que e bug, nao
-- pedido recusado (mesma logica do RAISE de `current_company_id()` sem
-- contexto).
CREATE OR REPLACE FUNCTION auth_session_enter_company(
  p_token_hash text,
  p_company_id uuid,
  p_justification text
)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_user_id uuid;
  v_access_id uuid;
BEGIN
  SELECT s.user_id INTO v_user_id
    FROM sessions s
   WHERE s.token_hash = p_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at > now();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida ou expirada.';
  END IF;

  IF NOT platform_admin_is(v_user_id) THEN
    RAISE EXCEPTION 'Sessao nao pertence a um Super Admin.';
  END IF;

  IF length(trim(p_justification)) < 10 THEN
    RAISE EXCEPTION 'Justificativa precisa de pelo menos 10 caracteres.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa nao encontrada.';
  END IF;

  -- Pular de empresa em empresa sem passar por `auth_session_exit_company`
  -- fecharia o acesso ANTERIOR sozinho, se nao fosse por isto — e um acesso
  -- que nunca fecha e um buraco na trilha que RF-131 existe para nao ter.
  UPDATE platform_admin_access
     SET ended_at = now()
   WHERE id = (SELECT s.admin_access_id FROM sessions s WHERE s.token_hash = p_token_hash)
     AND ended_at IS NULL;

  INSERT INTO platform_admin_access (admin_user_id, target_company_id, justification)
  VALUES (v_user_id, p_company_id, p_justification)
  RETURNING id INTO v_access_id;

  -- `role = 'owner'`, sempre: a sessao passa a valer, dentro desta empresa,
  -- como o dono dela — ADR-0007 explica por que (a alternativa era duplicar
  -- toda rota de negocio para um "modo Super Admin" proprio).
  UPDATE sessions
     SET active_company_id = p_company_id,
         role = 'owner',
         admin_access_id = v_access_id
   WHERE token_hash = p_token_hash;
END;
$$;

COMMENT ON FUNCTION auth_session_enter_company(text, uuid, text) IS
  'Super Admin entra numa empresa: grava o acesso (RF-131) e atualiza a sessao para operar como owner dela (ADR-0007).';

-- Sai do modo Super Admin: fecha o registro de acesso e volta a sessao ao
-- estado sem empresa (o mesmo estado de quem ainda nao escolheu loja).
CREATE OR REPLACE FUNCTION auth_session_exit_company(p_token_hash text) RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_access_id uuid;
BEGIN
  SELECT s.admin_access_id INTO v_access_id
    FROM sessions s
   WHERE s.token_hash = p_token_hash
     AND s.revoked_at IS NULL;

  IF v_access_id IS NULL THEN
    RAISE EXCEPTION 'Sessao nao esta em modo Super Admin.';
  END IF;

  UPDATE platform_admin_access
     SET ended_at = now()
   WHERE id = v_access_id
     AND ended_at IS NULL;

  UPDATE sessions
     SET active_company_id = NULL,
         role = NULL,
         admin_access_id = NULL
   WHERE token_hash = p_token_hash;
END;
$$;

COMMENT ON FUNCTION auth_session_exit_company(text) IS
  'Sai do modo Super Admin: fecha o acesso registrado e devolve a sessao ao estado sem empresa (ADR-0007).';
