-- Sugestao de conexao por ramo de atividade — NR-108, ADR-0008 (aditivo).
--
-- ## A regra: sem IA, sem lista de palavra-chave por ramo
--
-- `business_segment` e texto livre (RF-003) — nao ha vocabulario fechado para
-- mapear "confeitaria" -> "farinha, acucar, embalagem" sem inventar e manter
-- essa lista a mao, ramo por ramo, para sempre. A regra aqui e outra: se
-- OUTRAS empresas do MESMO ramo (mesmo texto, comparado sem caixa nem
-- espaco) ja tem conexao ACEITA com uma empresa X, X e sugerida para voce
-- tambem. E filtragem colaborativa pura, com o dado que o sistema ja tem —
-- nenhuma tabela nova, nenhuma chamada a modelo de linguagem.
--
-- ## O mesmo limite ja registrado na DEC-021
--
-- Sem conexao aceita nenhuma na base, nao ha sugestao nenhuma — e o mesmo
-- risco de massa critica que a DEC-021 ja assumiu para a busca. Aqui isso
-- fica ainda mais visivel: o RECURSO INTEIRO comeca vazio e so passa a
-- aparecer conforme lojistas do mesmo ramo forem se conectando.

CREATE OR REPLACE FUNCTION company_connections_suggestions(p_requester_company_id uuid)
  RETURNS TABLE (
    company_id   uuid,
    company_name text,
    neighborhood text,
    city         text,
    distance_km  numeric,
    peer_count   integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH eu AS (
      SELECT id, latitude, longitude, business_segment
        FROM companies
       WHERE id = p_requester_company_id
    ),
    -- Outras empresas do MESMO ramo — nunca a propria.
    pares_do_ramo AS (
      SELECT c.id
        FROM companies c, eu
       WHERE c.id != eu.id
         AND c.business_segment IS NOT NULL
         AND eu.business_segment IS NOT NULL
         AND lower(trim(c.business_segment)) = lower(trim(eu.business_segment))
    ),
    -- Para quem os pares do ramo ja tem conexao aceita, do lado de FORA do par.
    conexoes_dos_pares AS (
      SELECT
        CASE
          WHEN cc.requester_company_id IN (SELECT id FROM pares_do_ramo)
          THEN cc.target_company_id
          ELSE cc.requester_company_id
        END AS empresa_sugerida,
        CASE
          WHEN cc.requester_company_id IN (SELECT id FROM pares_do_ramo)
          THEN cc.requester_company_id
          ELSE cc.target_company_id
        END AS par_de_origem
      FROM company_connections cc
      WHERE cc.status = 'accepted'
        AND (
          cc.requester_company_id IN (SELECT id FROM pares_do_ramo)
          OR cc.target_company_id IN (SELECT id FROM pares_do_ramo)
        )
    )
    SELECT
      s.id AS company_id,
      COALESCE(s.trade_name, s.legal_name) AS company_name,
      s.neighborhood,
      s.city,
      CASE
        WHEN eu.latitude IS NULL OR eu.longitude IS NULL OR s.latitude IS NULL OR s.longitude IS NULL
        THEN NULL
        ELSE haversine_km(eu.latitude, eu.longitude, s.latitude, s.longitude)
      END AS distance_km,
      count(DISTINCT cdp.par_de_origem)::int AS peer_count
    FROM conexoes_dos_pares cdp
    JOIN companies s ON s.id = cdp.empresa_sugerida
    CROSS JOIN eu
    WHERE s.id != p_requester_company_id
      AND s.is_active
      -- Nunca sugere quem ja tem pedido ativo (pendente ou aceito) com voce —
      -- sugestao e para abrir porta nova, nao repetir a que ja existe.
      AND NOT EXISTS (
        SELECT 1 FROM company_connections x
         WHERE x.status IN ('pending', 'accepted')
           AND (
             (x.requester_company_id = p_requester_company_id AND x.target_company_id = s.id)
             OR (x.requester_company_id = s.id AND x.target_company_id = p_requester_company_id)
           )
      )
    GROUP BY s.id, s.trade_name, s.legal_name, s.neighborhood, s.city,
             eu.latitude, eu.longitude, s.latitude, s.longitude
    ORDER BY peer_count DESC, distance_km ASC NULLS LAST
    LIMIT 10
  $$;

COMMENT ON FUNCTION company_connections_suggestions(uuid) IS
  'Empresas que outras do MESMO ramo ja aceitaram conexao — filtragem colaborativa sem IA (ADR-0008).';
