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
