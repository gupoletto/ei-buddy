# db

Schema Drizzle, migrations SQL, políticas RLS.

**Estado:** 🟡 schema do recorte A–J (`NR-007`, `NR-008` em andamento) ·
isolamento: [ADR-0001](../../docs/decisoes/adr/0001-rls-por-linha.md)

O Postgres materializa o [modelo A–J](../../docs/arquitetura/dados.md#modelo-de-dados)
([catálogo físico](../../docs/arquitetura/esquema-postgresql.md)):
cadastro, venda, nota, financeiro, agenda/CRM/suporte, assistente, assinatura
SaaS e plataforma. Fiscal e pagamentos compartilham o satélite
`company_integrations` (1:0..1). Ids de cliente/cobrança/assinatura no provedor
moram em `customers`, `payments` e `subscriptions`. Empresa sem KYC ou
inelegível para nota **não** ganha linha de provedor. Sem PagMaxx. Sem tabela
de Split ([DEC-018](../../docs/decisoes/README.md#dec-018)).

Isolamento entre **lojas** é RLS por linha. Um **usuário** pertence a uma
empresa (`users.company_id`, nullable até `/app/empresa`) —
[ADR-0004](../../docs/decisoes/adr/0004-usuario-uma-empresa.md).
Não há `company_users`.

## Responsabilidade

Persistência: schema, migrations, políticas de isolamento.

**O que não faz:** regra de negócio, controle de transação (quem abre e fecha a
transação é o caso de uso em `core`).

## Fronteiras

|                       |                                                                                |
| --------------------- | ------------------------------------------------------------------------------ |
| **Expõe**             | `getClient()`, `checkConnection()`, `withTenant()`, schema, `applyMigration()` |
| **Depende de**        | `contracts`, `money`, `postgres`, `drizzle-orm`                                |
| **Proibido importar** | `core`, `domain`, adapters                                                     |
| **Quem depende**      | `core` — e a **raiz de composição** de `api`/`worker`, nada mais               |

A regra `handler-nao-importa-db` da CI barra qualquer import de `db` em
`apps/api` ou `apps/worker` fora de `composition.ts`.

## Isolamento multi-tenant

Decisão: **RLS por linha** ([ADR-0001](../../docs/decisoes/adr/0001-rls-por-linha.md)).

A aplicação **não** usa o superuser do Docker (`naregua`). Usa `naregua_app`
(`NOSUPERUSER`, sem `BYPASSRLS`). Superuser ignora RLS mesmo com `FORCE`.

```sql
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON sales
  USING (company_id = current_setting('app.company_id')::uuid);
```

```ts
await withTenant(sql, ctx.companyId, async (tx) => {
  return tx`SELECT * FROM customers`
})
```

| Regra                                                                                                        | Motivo                                                |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Toda tabela de negócio tem `company_id NOT NULL` (exceto `companies.id` e `users` até o cadastro da empresa) | sem ela a política não se aplica                      |
| `FORCE ROW LEVEL SECURITY` obrigatório                                                                       | sem ele o dono da tabela ignora a política            |
| Consulta sem `app.company_id` **falha**                                                                      | [RF-121](../../docs/produto/requisitos-funcionais.md) |
| `company_id` vem do contexto, nunca do cliente                                                               | [princípio 8](../../docs/arquitetura/principios.md)   |
| Recurso de outro tenant responde 404, não 403                                                                | 403 confirma que o recurso existe                     |

Login por e-mail (ainda sem tenant): função `find_login_by_email` com
`SECURITY DEFINER`. Cadastro da conta: `register_owner`. Depois de
`/app/empresa`: `attach_user_company`.

## Dois papéis de banco

| Papel              | Uso                          | RLS                     |
| ------------------ | ---------------------------- | ----------------------- |
| `naregua_app`      | aplicação                    | ✅ sujeito às políticas |
| `naregua_migrator` | migrations                   | ❌ `BYPASSRLS`          |
| `naregua`          | superuser do container local | não usar na API         |

Papéis locais: [`infra/postgres/init/01-extensions.sql`](../../infra/postgres/init/01-extensions.sql).
Depois de mudar o init: `pnpm infra:reset` (apaga volumes).

## Convenções de schema

Tabela `snake_case` plural · coluna `snake_case` · `id uuid` · FK `<singular>_id`
· **dinheiro em `bigint` de centavos** · percentual `numeric(7,4)` · data/hora
`timestamptz` em UTC com sufixo `_at` · `deleted_at` em toda tabela com
`created_at` ou `updated_at` · sem `enum` nativo (migrar dói).

Todo índice de tabela de negócio **começa por `company_id`**.

SQL vigente em [`migrations/0002_init.sql`](migrations/0002_init.sql)
([`0001_init.sql`](migrations/0001_init.sql) é histórico).
Tipos Drizzle em [`src/schema.ts`](src/schema.ts). Catálogo para leitura:
[`esquema-postgresql.md`](../../docs/arquitetura/esquema-postgresql.md).

## Migrations

```bash
pnpm --filter @na-regua/db migrate
```

Usa `DATABASE_MIGRATION_URL` (papel com `BYPASSRLS`).

| Regra                                     | Requisito                                                  |
| ----------------------------------------- | ---------------------------------------------------------- |
| Reversível ou com plano de reversão no PR | [RNF-048](../../docs/produto/requisitos-nao-funcionais.md) |
| Sem bloquear escrita por mais de 30 s     | [RNF-049](../../docs/produto/requisitos-nao-funcionais.md) |
| Tabela nova já nasce com RLS habilitado   | esquecer é vazamento entre tenants                         |
| Sem regra de negócio dentro               | regra vive em `domain`                                     |

## Testes

Contra **Postgres de verdade**. Os testes de isolamento usam o banco
`naregua_test` (não apagam o `naregua` de desenvolvimento).

Um teste tenta ler dado de outro `company_id` e **precisa falhar**; outro
consulta sem tenant e **precisa falhar**.

## Variáveis de ambiente

| Variável                 | Uso                               |
| ------------------------ | --------------------------------- |
| `DATABASE_URL`           | `naregua_app` — sujeita a RLS     |
| `DATABASE_MIGRATION_URL` | `naregua_migrator`, só migrations |

## Desenvolvimento

```bash
pnpm infra:up      # sobe o Postgres
pnpm infra:reset   # recria volumes (aplica init dos papéis)
pnpm --filter @na-regua/db migrate
pnpm infra:psql    # abre o psql
```
