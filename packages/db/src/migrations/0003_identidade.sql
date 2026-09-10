-- Baseline NR-089 / ADR-0006. Origem fundida: 0009_identidade_de_login.sql, 0017_cnpj_no_cadastro_de_conta.sql, 0023_schema_da_identidade.sql.
-- Historia nova: nao editar as migrations 0001–0025 antigas — elas nao existem mais.

-- Identidade de login — NR-014, RF-005, RF-119, RF-120.
--
-- Duas coisas: a coluna que amarra a identidade externa ao nosso usuario, e o
-- caminho pelo qual o login consegue ler `users` ANTES de existir empresa no
-- contexto.
--
-- ## O problema que esta migration resolve
--
-- A politica de `users` (0002) diz: enxerga-se apenas quem tem vinculo com a
-- empresa do contexto. E a 0004 faz toda consulta sem `app.company_id`
-- **lancar**, de proposito.
--
-- No login nao existe empresa no contexto — descobrir qual e a empresa e
-- justamente o que o login faz. Entao, sob RLS, o login nao consegue nem achar
-- o proprio usuario. Nao e detalhe de implementacao: e uma contradicao entre
-- duas regras corretas, e ela tem de ser resolvida de forma explicita e
-- estreita, em vez de por um papel com BYPASSRLS.
--
-- O mesmo vale para o convite (RF-005): procurar por e-mail com a empresa no
-- contexto ESCONDE quem ainda nao tem vinculo com ela — que e exatamente quem
-- se quer convidar. Sem este caminho, convidar o contador que atende outra
-- loja criaria um usuario duplicado e explodiria no indice unico de e-mail.

-- ---------------------------------------------------------------------------
-- A identidade externa
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN auth_subject text;

COMMENT ON COLUMN users.auth_subject IS
  'Identificador da pessoa no provedor de identidade (ADR-0002). Nulo ate o primeiro login.';

-- Nulo repetido e permitido pelo indice unico do Postgres, e e o que se quer:
-- todo convidado nasce sem `auth_subject` e ganha o dele no primeiro login.
CREATE UNIQUE INDEX users_auth_subject_unico ON users (auth_subject);

-- ---------------------------------------------------------------------------
-- E-mail deixa de ser obrigatorio, e contato passa a ser
-- ---------------------------------------------------------------------------
--
-- A RF-005 e explicita: convidar por e-mail OU telefone. O schema da 0002
-- exigia e-mail, entao convite so por telefone era impossivel — e o contrato
-- em `contracts` permitia. Contrato mais permissivo que o schema significa que
-- a validacao passa, a tela promete, e o erro aparece no INSERT com a mensagem
-- do Postgres. Foi assim que apareceu, num teste da CI:
--
--   null value in column "email" of relation "users" violates not-null constraint
--
-- O CHECK e a regra que realmente importa, e ela nao existia em lugar nenhum:
-- pessoa sem NENHUM contato e uma linha em `users` que ninguem consegue
-- reivindicar. O primeiro login amarra a identidade do provedor por e-mail ou
-- por telefone (`auth_user_by_email`, `auth_user_by_phone`); sem os dois, o
-- convidado nunca entra e a linha fica ocupando o lugar dele para sempre.
--
-- `users_email_unico` e sobre `lower(email)` e nao muda: indice unico do
-- Postgres aceita nulo repetido, que e o que se quer aqui.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users ADD CONSTRAINT users_tem_contato
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

COMMENT ON CONSTRAINT users_tem_contato ON users IS
  'E-mail ou telefone, pelo menos um: sem contato ninguem reivindica a conta (RF-005).';

-- Telefone tambem precisa ser unico, e a falta disso era um bug esperando
-- acontecer: login por telefone com dois usuarios no mesmo numero nao tem
-- resposta certa, e a funcao abaixo devolveria um dos dois por sorte da ordem
-- de leitura. `users_email_unico` (0002) ja cobria o outro lado.
CREATE UNIQUE INDEX users_phone_unico ON users (phone) WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- O caminho estreito do login
-- ---------------------------------------------------------------------------
--
-- `SECURITY DEFINER` roda com os privilegios do DONO da funcao, e nao de quem
-- chama — entao estas funcoes atravessam a politica de `users`. Sao o unico
-- lugar do sistema que atravessa, e cada decisao aqui existe para manter o
-- buraco do tamanho exato do necessario:
--
-- 1. **`SET search_path`** em todas. Sem isso, quem chama pode criar uma tabela
--    `users` num schema que venha antes no `search_path` e a funcao — rodando
--    com privilegio do dono — leria a tabela do atacante. E a falha classica de
--    `SECURITY DEFINER`, e ela nao aparece em teste nenhum: a funcao continua
--    "funcionando".
--
-- 2. **Igualdade exata, nunca padrao.** Nenhuma aceita `LIKE`, prefixo ou
--    lista. Quem chama precisa ja saber o e-mail, o telefone ou o `subject`
--    inteiro. Isso as torna inuteis para enumerar a base — que e o mesmo
--    objetivo da RF-120 no login.
--
-- 3. **Retorno minimo.** `id`, `name` e `is_active`. Nao devolvem e-mail nem
--    telefone: quem chamou ja informou o contato, e devolve-lo seria dar de
--    volta um dado pessoal que a politica de `users` existe para proteger.
--
-- 4. **`STABLE`**, nao `VOLATILE`, e nada de escrita — exceto a de amarrar o
--    `subject`, que e a unica e esta separada.
--
-- Sobre GRANT: funcao no Postgres nasce executavel por PUBLIC, e aqui isso fica
-- como esta de proposito, porque a aplicacao conecta com um papel cujo nome
-- varia por ambiente e a migration nao o conhece. Restringir o EXECUTE a um
-- papel nomeado e trabalho de implantacao, e depende da DEC-009. O contrapeso
-- e o que esta acima: mesmo chamadas por quem nao deveria, estas funcoes so
-- respondem sobre um identificador que o chamador ja tem.

CREATE OR REPLACE FUNCTION auth_user_by_subject(p_subject text)
  RETURNS TABLE (id uuid, name text, is_active boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT u.id, u.name, u.is_active
      FROM users u
     WHERE u.auth_subject = p_subject
  $$;

COMMENT ON FUNCTION auth_user_by_subject(text) IS
  'Resolve o usuario pela identidade do provedor, sem empresa no contexto (NR-014).';

CREATE OR REPLACE FUNCTION auth_user_by_email(p_email text)
  RETURNS TABLE (id uuid, name text, is_active boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    -- `lower()` nos dois lados, casando com `users_email_unico`, que e sobre
    -- `lower(email)`. Comparar cru faria o indice nao ser usado E deixaria
    -- passar duplicata por diferenca de caixa.
    SELECT u.id, u.name, u.is_active
      FROM users u
     WHERE lower(u.email) = lower(p_email)
  $$;

COMMENT ON FUNCTION auth_user_by_email(text) IS
  'Resolve o usuario por e-mail exato, sem empresa no contexto (NR-014).';

CREATE OR REPLACE FUNCTION auth_user_by_phone(p_phone text)
  RETURNS TABLE (id uuid, name text, is_active boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT u.id, u.name, u.is_active
      FROM users u
     WHERE u.phone = p_phone
  $$;

COMMENT ON FUNCTION auth_user_by_phone(text) IS
  'Resolve o usuario por telefone exato, sem empresa no contexto (NR-014).';

CREATE OR REPLACE FUNCTION auth_user_by_id(p_user_id uuid)
  RETURNS TABLE (id uuid, name text, is_active boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT u.id, u.name, u.is_active
      FROM users u
     WHERE u.id = p_user_id
  $$;

COMMENT ON FUNCTION auth_user_by_id(uuid) IS
  'Reconfere o usuario na troca de loja, que tambem ocorre sem empresa no contexto (NR-014).';

-- ---------------------------------------------------------------------------
-- Os vinculos
-- ---------------------------------------------------------------------------
--
-- `company_users` esta sob a politica padrao, que filtra pela empresa do
-- contexto. Listar as lojas de uma pessoa e a pergunta oposta: quais empresas,
-- dado o usuario. Por definicao ela nao cabe dentro de uma empresa.
--
-- Somente `is_active`: acesso revogado nao e vinculo, e devolve-lo aqui
-- deixaria quem foi desligado escolher a loja e entrar.

CREATE OR REPLACE FUNCTION auth_memberships(p_user_id uuid)
  RETURNS TABLE (company_id uuid, company_name text, role text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT cu.company_id, c.legal_name, cu.role
      FROM company_users cu
      JOIN companies c ON c.id = cu.company_id
     WHERE cu.user_id = p_user_id
       AND cu.is_active
     ORDER BY c.legal_name
  $$;

COMMENT ON FUNCTION auth_memberships(uuid) IS
  'Lojas ativas de uma pessoa. Pergunta que nao cabe dentro de uma empresa (NR-014).';

CREATE OR REPLACE FUNCTION auth_membership(p_company_id uuid, p_user_id uuid)
  RETURNS TABLE (company_id uuid, company_name text, role text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT cu.company_id, c.legal_name, cu.role
      FROM company_users cu
      JOIN companies c ON c.id = cu.company_id
     WHERE cu.company_id = p_company_id
       AND cu.user_id = p_user_id
       AND cu.is_active
  $$;

COMMENT ON FUNCTION auth_membership(uuid, uuid) IS
  'Confere um vinculo especifico na troca de loja, antes de haver contexto (NR-014).';

-- ---------------------------------------------------------------------------
-- A unica escrita que atravessa
-- ---------------------------------------------------------------------------
--
-- Acontece no primeiro login de quem foi convidado: a linha em `users` existe
-- com e-mail e sem `subject`, e e agora que o `subject` aparece.
--
-- `auth_subject IS NULL` na condicao e o que impede esta funcao de virar um
-- sequestro de conta: ela so preenche o que esta vazio, nunca REaponta uma
-- identidade ja amarrada para outro `subject`. Sem essa clausula, uma chamada
-- com o id de outra pessoa e um `subject` proprio entregaria a conta dela.

CREATE OR REPLACE FUNCTION auth_attach_subject(p_user_id uuid, p_subject text)
  RETURNS boolean
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH alterada AS (
      UPDATE users
         SET auth_subject = p_subject,
             updated_at = now()
       WHERE id = p_user_id
         AND auth_subject IS NULL
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM alterada)
  $$;

COMMENT ON FUNCTION auth_attach_subject(uuid, text) IS
  'Amarra a identidade do provedor a um usuario que ainda nao tem. Nunca reaponta (NR-014).';


-- O caminho estreito do CADASTRO DE CONTA — NR-014, RF-002, RF-121.
--
-- ## O defeito
--
-- `signup` comeca perguntando se o CNPJ ja tem cadastro (RF-002). Essa pergunta
-- acontece ANTES de existir empresa — descobrir se ela existe e justamente o
-- que se esta fazendo. O repositorio respondia com `withPlatformScope`, que
-- roda a consulta SEM tenant.
--
-- E consulta sem tenant LANCA, de proposito, desde a 0004 (RF-121): melhor
-- falhar que devolver vazio, porque vazio parece resposta. Entao, numa conexao
-- de verdade — papel comum, sujeito a RLS — o cadastro morria na primeira
-- linha com:
--
--   Consulta sem empresa no contexto: app.company_id nao esta definido.
--
-- A api traduzia para 500, e a pessoa via "algo deu errado do nosso lado". Nao
-- havia como criar conta, e sem conta nao havia como entrar.
--
-- ## Por que nenhum teste pegou
--
-- Porque todos rodavam a conexao do DONO do banco, e dono e superusuario —
-- superusuario ignora politica de RLS inteiramente, entao a consulta sem tenant
-- nunca chegava a falhar. O teste passava pelo motivo errado. E a mesma
-- armadilha que o `checkIsolation` da subida existe para denunciar, e que a
-- suite de `db` ja evita conectando com um papel comum.
--
-- ## A correcao
--
-- A mesma que a 0009 usou para o login, que tem a MESMA contradicao: o login
-- precisa achar o usuario antes de saber a empresa. Uma funcao `SECURITY
-- DEFINER` estreita, com as quatro travas de la:
--
-- 1. `SET search_path` — sem isso, quem chama poderia criar uma tabela
--    `companies` num schema anterior no caminho de busca e a funcao, rodando
--    com privilegio do dono, leria a tabela do atacante.
-- 2. Igualdade exata, nunca padrao — inutil para enumerar a base.
-- 3. Retorno minimo. Aqui ele e o menor possivel: um BOOLEANO. A funcao nao
--    devolve id, nome nem nada da empresa existente, o que casa com a RF-002
--    ("recusar sem revelar dados da empresa existente").
-- 4. `STABLE`, sem escrita.
--
-- Sobre GRANT vale o mesmo da 0009: a funcao nasce executavel por PUBLIC e
-- assim fica, porque o papel da aplicacao muda por ambiente e a migration nao o
-- conhece. O contrapeso e o retorno: quem chamar so descobre o que ja teria
-- descoberto tentando cadastrar.

CREATE OR REPLACE FUNCTION auth_cnpj_taken(p_cnpj text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (SELECT 1 FROM companies c WHERE c.cnpj = p_cnpj)
  $$;

COMMENT ON FUNCTION auth_cnpj_taken(text) IS
  'Este CNPJ ja tem cadastro? Booleano, sem empresa no contexto (RF-002, NR-014).';


-- Schema da identidade — NR-084, ADR-0002 (opcao D), ADR-0001.
--
-- Esta migration cria UM schema vazio e nada mais. As tabelas dentro dele são
-- do Better Auth, e quem as cria é ele — ver o porquê abaixo.
--
-- ## Por que as tabelas do provedor NAO podem morar em `public`
--
-- A ADR-0001 tem uma invariante: **toda tabela em `public` nasce com RLS
-- habilitado e forcado**, e `schema.test.ts` reprova o PR que esquecer. A
-- invariante existe porque esquecer RLS numa tabela nova e vazamento entre
-- lojas, e regra que so vive em documento e regra que ja foi quebrada.
--
-- As quatro tabelas do Better Auth (`user`, `session`, `account`,
-- `verification`) nao tem `company_id` e nunca terao: elas guardam a PROVA de
-- identidade, que e da pessoa e nao da loja — a mesma pessoa opera cinco lojas
-- com uma credencial so. Poe-las em `public` deixaria duas saidas ruins:
--
-- - dar-lhes RLS sem politica, como `sessions` (0022). Mas ali o acesso passa
--   por funcoes nossas; aqui quem consulta e a biblioteca, com o pool dela, e
--   ela nao sabe de `app.company_id`. Toda consulta dela voltaria vazia.
-- - acrescenta-las a lista de excecoes do teste. E ai a invariante passa a ter
--   quatro furos que ninguem revisita, e o quinto entra sem discussao.
--
-- Um schema proprio nao e desvio da regra: e a regra dizendo a verdade. O teste
-- olha `nspname = 'public'`, entao `identidade` fica de fora — e fica de fora
-- por ser outra coisa, nao por ter sido perdoada.
--
-- ## Por que a migration nao cria as tabelas
--
-- Porque elas mudam com a VERSAO da biblioteca. Copiar o DDL do Better Auth
-- para ca faria cada atualizacao dele exigir um diff escrito a mao, e o erro
-- apareceria em producao, no primeiro login depois do deploy — nao no `pnpm
-- typecheck`.
--
-- Quem cria e `ctx.runMigrations()`, a migracao do proprio Better Auth,
-- chamada por `apps/api/src/bin/migrar-identidade.ts`. A regra que fica: **o
-- que e nosso mora em `public` e e migrado por `packages/db`; o que e da
-- biblioteca mora em `identidade` e e migrado por ela.**
--
-- ## O que este schema NAO tem
--
-- Nenhum GRANT. Pelo mesmo motivo da 0009: o papel da aplicacao tem nome
-- diferente em cada ambiente e a migration nao o conhece, entao conceder
-- privilegio nomeado e trabalho de implantacao e depende da DEC-009. O pool do
-- Better Auth conecta com `DATABASE_URL`, que ja e dono do schema.

CREATE SCHEMA IF NOT EXISTS identidade;

COMMENT ON SCHEMA identidade IS
  'Tabelas do provedor de identidade (Better Auth, ADR-0002 opcao D). Fora de public de proposito: nao tem company_id e nao entram na invariante de RLS da ADR-0001. Migradas pela propria biblioteca, nunca por packages/db.';
