-- Sessao persistente e desaceleracao de login — NR-083, ADR-0002, RF-006, RF-119, RF-120.
--
-- ## O que estava em memoria, e por que isso bloqueava producao
--
-- `InMemorySessionIssuer` guarda os tokens num `Map` da instancia, e
-- `InMemoryLoginThrottle` faz o mesmo com o contador de tentativas. As duas
-- coisas que isso implica sao piores do que parecem:
--
-- 1. **Reiniciar a api desloga todo mundo.** Todo deploy, toda queda, todo
--    `tsx watch` salvando arquivo. Nao e incomodo de desenvolvimento: em
--    producao, publicar uma correcao expulsa o balcao no meio da venda.
--
-- 2. **Duas instancias nao compartilham nada.** Quem entra na instancia A
--    recebe 401 quando o balanceador manda a proxima chamada para a B — e a
--    desaceleracao passa a valer por instancia, entao N instancias multiplicam
--    por N as tentativas que a forca bruta consegue (RF-120, RNF-026).
--
-- 3. **Sessao nao da para revogar.** E esta e a que decide: a RF-006 diz que
--    remover funcionario encerra a sessao dele, e "encerrar" exige que exista
--    algo de onde apagar. Com o mapa na instancia, o unico jeito de encerrar
--    uma sessao e reiniciar o processo — que encerra todas.
--
-- Ver `assertAuthUsavelEmProducao` em `apps/api/src/composition.ts`: ele recusa
-- subir em producao por causa das tres coisas. Esta migration resolve duas
-- delas; a terceira (o provedor de identidade) e a Opcao C/D da ADR-0002 e vem
-- em seguida.
--
-- ## Por que sessao nossa, e nao do provedor
--
-- A ADR-0002 e explicita: **somos donos da sessao, alugamos a prova.** A RLS le
-- `app.company_id` das NOSSAS tabelas, entao a empresa ativa e o papel tem de
-- sair de onde a seguranca ja olha. Sessao guardada num provedor seria uma
-- segunda fonte de verdade em que a que a RLS usa nao e a dele.
--
-- ## Por que as duas tabelas ficam sob RLS SEM POLITICA
--
-- `ENABLE` + `FORCE ROW LEVEL SECURITY` e nenhuma politica permissiva significa
-- **nega tudo** para qualquer papel comum: zero linhas no SELECT, erro no
-- INSERT. Nao e descuido nem exagero — e a resposta certa para estas duas.
--
-- Nenhum tenant tem o que ler aqui. Uma politica `tenant_isolation` seria pior
-- que nenhuma: `sessions` guarda a empresa ATIVA da sessao, que nao e a empresa
-- DONA da linha (uma sessao sem loja escolhida nao tem nenhuma), e a leitura
-- acontece antes de existir `app.company_id` — em toda requisicao, porque e ela
-- que produz o contexto. Uma politica que dependesse de `current_company_id()`
-- lancaria exatamente onde e usada.
--
-- Todo acesso passa pelas funcoes `auth_session_*` e `auth_throttle_*` abaixo,
-- pelo mesmo desenho da 0009: `SECURITY DEFINER`, `search_path` fixo, igualdade
-- exata e retorno minimo. A diferenca em relacao a `users` e que la existe
-- leitura legitima dentro de uma empresa (o cadastro de funcionarios), e aqui
-- nao existe nenhuma.
--
-- Por isso a coluna se chama `active_company_id`, e nao `company_id`: o nome
-- diz o que ela e — a loja que a sessao esta operando — e nao aciona a regra do
-- `company_id`, que fala de posse da linha. Chamar de `company_id` faria a
-- guarda do schema exigir `tenant_isolation` numa tabela onde ela e errada.

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- O HASH do token, nunca o token.
  --
  -- Um dump desta tabela com os tokens em texto seria um conjunto de sessoes
  -- vivas: quem o lesse entraria como qualquer pessoa logada, sem senha e sem
  -- deixar rastro de login. Guardando o hash, o dump vale nada.
  --
  -- SHA-256 e nao scrypt, e a diferenca em relacao a senha e o que justifica: o
  -- token e 256 bits sorteados, entao nao ha dicionario nem palpite provavel
  -- para atrasar. Um KDF lento aqui atrasaria TODA requisicao autenticada e nao
  -- compraria nada.
  token_hash text NOT NULL,

  -- CASCADE, e nao RESTRICT como no resto do schema. Sessao nao e historico: e
  -- estado derivado, e sessao de usuario apagado nao deve sobreviver a ele.
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Nula enquanto a pessoa nao escolheu a loja — US-059. Nao e estado de erro:
  -- e o meio do caminho de quem opera mais de uma.
  active_company_id uuid REFERENCES companies (id) ON DELETE CASCADE,

  -- Mesmos valores de `roleSchema`, como em `company_users`.
  role text CHECK (role IN ('owner', 'staff', 'accountant', 'platform_admin')),

  issued_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,

  -- Preenchido ao sair (RF-119) e ao trocar de loja. Coluna em vez de DELETE
  -- porque "esta sessao foi encerrada" e "esta sessao nunca existiu" sao
  -- respostas diferentes quando alguem for investigar um acesso.
  revoked_at timestamptz,

  -- O tipo `SessionClaims` em `core` e uniao discriminada: sessao sem empresa
  -- **nao tem papel**. Este CHECK e a mesma afirmacao no banco.
  --
  -- Sem ele, uma linha com empresa e sem papel entraria, e o adapter montaria
  -- um claim com `role: undefined` — que e como uma verificacao de permissao
  -- vira um `if` sempre falso.
  CONSTRAINT sessions_papel_acompanha_empresa
    CHECK ((active_company_id IS NULL) = (role IS NULL))
);

COMMENT ON TABLE sessions IS
  'Sessoes que NOS emitimos (ADR-0002). Sem politica de RLS de proposito: todo acesso passa pelas funcoes auth_session_*.';

CREATE UNIQUE INDEX sessions_token_unico ON sessions (token_hash);

-- Achar as sessoes de uma pessoa, para encerra-las (RF-006). Parcial: sessao ja
-- revogada nao interessa a nenhuma consulta, e deixa-la fora mantem o indice do
-- tamanho do que esta vivo.
CREATE INDEX sessions_vivas_por_usuario ON sessions (user_id) WHERE revoked_at IS NULL;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- login_throttle
-- ---------------------------------------------------------------------------
--
-- A chave vem montada de fora (`login:id:...`, `login:origem:...`), porque quem
-- decide contar por identificador E por origem e o caso de uso em `core` — ver
-- `chaveDeIdentificador` e `chaveDeOrigem` em `login.ts`. O banco so conta.

CREATE TABLE login_throttle (
  throttle_key text PRIMARY KEY,
  failures     integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  -- A primeira da janela atual, guardada para diagnostico: com ela da para ver
  -- se as N falhas vieram em dois segundos ou em dez minutos.
  first_failure_at timestamptz NOT NULL,
  last_failure_at  timestamptz NOT NULL
);

COMMENT ON TABLE login_throttle IS
  'Tentativas de login por chave — RF-120, RNF-026. Sem politica de RLS: acesso so pelas funcoes auth_throttle_*.';

ALTER TABLE login_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_throttle FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- O caminho estreito da sessao
-- ---------------------------------------------------------------------------

-- Emite a sessao.
--
-- Aproveita para apagar as sessoes JA EXPIRADAS da mesma pessoa. Uma linha, num
-- caminho que ja esta escrevendo, limitada a um usuario — e com isso a tabela se
-- limpa sozinha para quem usa o sistema, sem depender de tarefa agendada (que
-- por sua vez dependeria da DEC-009). Sessao expirada de quem nunca mais voltar
-- fica, e isso e aceitavel: e uma linha morta, nao uma credencial viva.
CREATE OR REPLACE FUNCTION auth_session_issue(
  p_token_hash text,
  p_user_id uuid,
  p_company_id uuid,
  p_role text,
  p_expires_at timestamptz
)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
  BEGIN
    DELETE FROM sessions
     WHERE user_id = p_user_id
       AND expires_at < now();

    INSERT INTO sessions (token_hash, user_id, active_company_id, role, expires_at)
    VALUES (p_token_hash, p_user_id, p_company_id, p_role, p_expires_at);
  END;
  $$;

COMMENT ON FUNCTION auth_session_issue(text, uuid, uuid, text, timestamptz) IS
  'Grava a sessao emitida e recolhe as expiradas da mesma pessoa (NR-083).';

-- Le a sessao, ja recusando o que nao vale.
--
-- Expirada e revogada nao voltam. Filtrar AQUI, e nao no adapter, e o que
-- garante que os dois caminhos que leem sessao concordem: um `expires_at >
-- now()` esquecido em TypeScript e uma sessao eterna, e nada falharia para
-- avisar.
--
-- Retorno minimo, como as `auth_user_*` da 0009: nao devolve `issued_at` nem o
-- hash. Quem chamou ja tem o token.
CREATE OR REPLACE FUNCTION auth_session_read(p_token_hash text)
  RETURNS TABLE (user_id uuid, active_company_id uuid, role text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT s.user_id, s.active_company_id, s.role
      FROM sessions s
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
  $$;

COMMENT ON FUNCTION auth_session_read(text) IS
  'Resolve a sessao pelo hash do token, recusando expirada e revogada (NR-083).';

-- Encerra uma sessao.
--
-- Idempotente e sem dizer se achou: sair sempre "da certo" do ponto de vista de
-- quem clicou, e um retorno booleano aqui viraria um oraculo de token valido
-- para quem chutasse hashes.
--
-- `revoked_at IS NULL` na condicao preserva o carimbo da primeira revogacao —
-- reescrever a data em cada chamada apagaria quando a sessao de fato terminou.
CREATE OR REPLACE FUNCTION auth_session_revoke(p_token_hash text)
  RETURNS void
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    UPDATE sessions
       SET revoked_at = now()
     WHERE token_hash = p_token_hash
       AND revoked_at IS NULL
  $$;

COMMENT ON FUNCTION auth_session_revoke(text) IS
  'Encerra uma sessao pelo hash do token. Idempotente (NR-083, RF-119).';

-- Nao existe aqui uma `auth_session_revoke_user`, e nao e esquecimento.
--
-- A RF-006 (remover funcionario encerra a sessao) esta a uma consulta de
-- distancia agora que ha onde revogar, mas a consulta certa nao e obvia: quem
-- perde acesso a UMA loja nao deve perder as sessoes das outras — o contador que
-- atende cinco lojas continua trabalhando nas quatro restantes. Isso e regra, e
-- entra com a tarefa da RF-006, junto com a de mudanca de papel.
--
-- O que esta migration muda e o pre-requisito: antes dela, "encerrar a sessao
-- de alguem" nao tinha implementacao possivel.

-- ---------------------------------------------------------------------------
-- O contador de tentativas
-- ---------------------------------------------------------------------------
--
-- Tres decisoes, e as tres em SQL de proposito: ler, decidir e gravar em
-- TypeScript seria ler-modificar-escrever, e duas tentativas simultaneas
-- contariam uma. Sob forca bruta, "simultaneas" e o caso normal.

-- Falha mais velha que isto nao conta mais. Sem janela, o contador so sobe: cinco
-- erros de senha espalhados por um ano trancariam a pessoa para sempre, e o
-- proposito e desacelerar ataque, nao punir memoria ruim.
--
-- Quinze minutos porque e o tempo em que uma pessoa desiste e vai recuperar a
-- senha, e curto demais para servir de janela a quem esta varrendo.
CREATE OR REPLACE FUNCTION auth_throttle_janela()
  RETURNS interval
  LANGUAGE sql
  IMMUTABLE
  AS $$ SELECT interval '15 minutes' $$;

-- Quantas falhas antes de comecar a desacelerar. Cinco: erro de digitacao e
-- Caps Lock cabem, varredura de senha nao.
CREATE OR REPLACE FUNCTION auth_throttle_tolerancia()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  AS $$ SELECT 5 $$;

-- Quantos segundos esperar, ou NULL quando pode tentar.
--
-- A espera DOBRA a cada falha depois da tolerancia (60s, 120s, 240s...) e para
-- em 15 minutos. Crescer e o que torna a forca bruta inviavel sem trancar quem
-- so errou a senha duas vezes; o teto existe porque espera que cresce sem
-- limite e bloqueio permanente com outro nome, e permite trancar alguem de
-- proposito errando a senha dele.
--
-- O desconto do tempo JA PASSADO e o que faz a espera correr sozinha: sem ele,
-- a resposta seria sempre "espere 60s", inclusive uma hora depois.
CREATE OR REPLACE FUNCTION auth_throttle_retry_after(p_key text)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT ceil(
             extract(epoch FROM (
               t.last_failure_at
               + make_interval(secs => least(
                   60 * power(2, t.failures - auth_throttle_tolerancia()),
                   900
                 )::double precision)
               - now()
             ))
           )::integer AS segundos
      FROM login_throttle t
     WHERE t.throttle_key = p_key
       -- Fora da janela nao conta. A linha continua no banco e some na proxima
       -- falha, quando a contagem reinicia.
       AND t.last_failure_at > now() - auth_throttle_janela()
       AND t.failures >= auth_throttle_tolerancia()
       AND t.last_failure_at
           + make_interval(secs => least(
               60 * power(2, t.failures - auth_throttle_tolerancia()),
               900
             )::double precision) > now()
  $$;

COMMENT ON FUNCTION auth_throttle_retry_after(text) IS
  'Segundos a esperar, ou NULL quando pode tentar — RF-120, RNF-026.';

-- Conta uma falha.
--
-- `ON CONFLICT` e nao SELECT-depois-INSERT: e uma ida ao banco e e atomico.
--
-- A contagem REINICIA quando a ultima falha caiu fora da janela — e por isso
-- `first_failure_at` tambem e reescrito nesse caso. Somar em cima de uma janela
-- vencida faria a espera de alguem que errou a senha hoje ser calculada com as
-- falhas do mes passado.
CREATE OR REPLACE FUNCTION auth_throttle_register_failure(p_key text, p_at timestamptz)
  RETURNS void
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    INSERT INTO login_throttle (throttle_key, failures, first_failure_at, last_failure_at)
    VALUES (p_key, 1, p_at, p_at)
    ON CONFLICT (throttle_key) DO UPDATE
       SET failures = CASE
             WHEN login_throttle.last_failure_at < p_at - auth_throttle_janela() THEN 1
             ELSE login_throttle.failures + 1
           END,
           first_failure_at = CASE
             WHEN login_throttle.last_failure_at < p_at - auth_throttle_janela() THEN p_at
             ELSE login_throttle.first_failure_at
           END,
           last_failure_at = p_at
  $$;

COMMENT ON FUNCTION auth_throttle_register_failure(text, timestamptz) IS
  'Conta uma falha de login, reiniciando a contagem fora da janela (RF-120).';

-- Login certo zera. Sem isto, quem erra quatro vezes, acerta, e erra de novo
-- entraria na desaceleracao com uma falha — e a pessoa se trancaria fora sozinha
-- sem nunca ter feito nada suspeito.
CREATE OR REPLACE FUNCTION auth_throttle_clear(p_key text)
  RETURNS void
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    DELETE FROM login_throttle WHERE throttle_key = p_key
  $$;

COMMENT ON FUNCTION auth_throttle_clear(text) IS
  'Zera a contagem depois de um login certo (RF-120).';
