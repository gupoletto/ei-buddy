-- Executado uma unica vez, na criacao do volume do Postgres.
-- Para reexecutar: pnpm infra:reset

-- Geracao de UUID no banco. UUIDv7 (ordenavel por tempo) chega no Postgres 18;
-- ate la, o id e gerado na aplicacao e esta extensao serve a defaults e seeds.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Busca por nome de produto e de cliente sem acento e com erro de digitacao
-- (RF-029: buscar produto por nome).
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Papel usado pelas migrations. Diferente do papel da aplicacao porque
-- migration precisa enxergar todas as linhas, ignorando RLS
-- (docs/arquitetura/dados.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'naregua_migrator') THEN
    CREATE ROLE naregua_migrator LOGIN PASSWORD 'naregua' BYPASSRLS;
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE naregua TO naregua_migrator;
-- PG15+: CREATE no schema public nao e mais de PUBLIC. Sem isto o migrator
-- falha com "permission denied for schema public" na primeira tabela.
GRANT USAGE, CREATE ON SCHEMA public TO naregua_migrator;

-- ---------------------------------------------------------------------------
-- O papel da APLICACAO — o que faltava
-- ---------------------------------------------------------------------------
--
-- O `POSTGRES_USER` do compose (`naregua`) e o DONO do banco, e dono e
-- superusuario. Superusuario IGNORA politica de RLS inteiramente, `FORCE ROW
-- LEVEL SECURITY` incluido — entao o isolamento entre empresas simplesmente
-- nao valeria.
--
-- O `checkIsolation` da subida percebe isso e RECUSA subir, e esta certo. Mas o
-- `.env.example` apontava `DATABASE_URL` para o `naregua`, e este script nunca
-- criou um papel de aplicacao: quem seguia a instalacao documentada recebia uma
-- api que nao subia, com uma mensagem sobre RLS — e, na tela, "nao consigo
-- criar conta nem entrar".
--
-- O papel abaixo e comum: sem SUPERUSER, sem BYPASSRLS. E o mesmo desenho que a
-- suite de testes ja usava (`conectarComoAplicacao`, em packages/db), agora
-- disponivel tambem para quem roda o sistema.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'naregua_app') THEN
    CREATE ROLE naregua_app LOGIN PASSWORD 'naregua';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE naregua TO naregua_app;
GRANT USAGE ON SCHEMA public TO naregua_app;

-- O que existe hoje. O banco esta vazio na primeira execucao deste script, mas
-- a linha e barata e cobre quem rodar `infra:reset` com o schema ja migrado.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO naregua_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO naregua_app;

-- E o que as migrations criarem daqui para a frente, sem ninguem precisar
-- lembrar de voltar aqui. `FOR ROLE naregua_migrator` porque e ele quem cria as
-- tabelas: privilegio padrao vale para o objeto criado por AQUELE papel.
ALTER DEFAULT PRIVILEGES FOR ROLE naregua_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO naregua_app;

-- Sequencias tambem. `GRANT ... ON TABLES` nao as cobre, e uma coluna
-- `bigserial` cria uma: sem isto, o INSERT falha com "permission denied for
-- sequence" — foi assim que a trilha de estoque reprovou na suite.
ALTER DEFAULT PRIVILEGES FOR ROLE naregua_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO naregua_app;
