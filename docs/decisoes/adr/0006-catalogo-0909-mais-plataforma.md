---
adr: 0006
titulo: Catálogo 0909 no domínio, plataforma da main às margens
status: aceita
data: 2026-09-09
decisores: [engenharia]
substitui: null
substituida_por: null
---

# ADR-0006 — Catálogo 0909 no domínio, plataforma da main às margens

|                       |                                 |
| --------------------- | ------------------------------- |
| **Status**            | Aceita                          |
| **Data**              | 2026-09-09                      |
| **Decisores**         | Engenharia                      |
| **Decisão de origem** | [DEC-019](../README.md#dec-019) |

## Contexto

O recorte A–J com `company_integrations` (Focus + Asaas) está fotografado em
[`db_0909.sql`](../../arquitetura/db_0909.sql). A `main` já tinha 25 migrations
incrementais com identidade Better Auth, sessão, cofre fiscal, extrato bancário
e o restante do MVP.

Aplicar o snapshot como um dump único apagaria trabalho entregue. Gerar SQL com
`drizzle-kit` não representa RLS, `FORCE` nem funções em plpgsql — o runner de
`packages/db` aplica SQL cru de propósito.

Não havia lojista em produção: o histórico de migrations podia nascer de novo,
desde que o Postgres local fosse resetado.

## Opções consideradas

### Opção A — dump do `db_0909.sql` no lugar das migrations

Uma migration só, igual ao snapshot.

| Prós                         | Contras                                           |
| ---------------------------- | ------------------------------------------------- |
| Catálogo único, fácil de ler | Apaga Better Auth, sessão, cofre, banco, counters |
|                              | Contraria ADR-0002 e ADR-0003                     |

### Opção B — 0909 só como documentação, migrations incrementais para sempre

| Prós                  | Contras                                            |
| --------------------- | -------------------------------------------------- |
| Não mexe no histórico | Snapshot e banco vivo continuam dois modelos       |
|                       | Cada tabela nova vira um diff mental contra o 0909 |

### Opção C — baseline novo: 0909 no domínio + plataforma da main

Reset do histórico. SQL cru. Identidade, sessão, cofre e extrato entram como
acréscimo. Colunas já na UI ou na lei permanecem no mesmo `CREATE`.

| Prós                                           | Contras                                      |
| ---------------------------------------------- | -------------------------------------------- |
| Um catálogo só, sem desfazer auth/fiscal/banco | Todo mundo dropa o volume local              |
| Runner e RLS da casa continuam                 | Retrabalho de SQL nos repositórios (NR-090+) |

## Decisão

**Escolhemos a opção C.**

O domínio (cadastros, venda, nota, financeiro, agenda, suporte, CRM, assistente,
assinatura, `company_integrations`) segue o 0909. A plataforma que o snapshot
omitiu **não** volta atrás: schema `identidade`, `company_users`, `auth_*`,
`sessions`, `login_throttle`, `company_fiscal_credentials`, `bank_transactions`,
`company_counters`.

Não entram do snapshot: `password_hash`, `register_owner`, `find_login_by_email`,
`attach_user_company`, `users.company_id` como fonte do vínculo.

Segredos fiscais continuam no cofre cifrado; `company_integrations` guarda
metadata, KYC, wallet e billing — não o token em claro.

O SQL do snapshot em `docs/` continua documental. Quem roda é
`packages/db/src/migrations/`.

## Consequências

### Positivas

- Um alvo de schema para Asaas, billing e o recorte A–J
- RLS pela função da casa, não pelo `DO $$ FOREACH` do snapshot
- Trabalho de identidade e fiscal não é reescrito do zero

### Negativas

- `pnpm infra:reset` obrigatório depois do merge — volume com 0001–0025 velhos
  falha no checksum
- Repositórios e testes que falavam `accounts`, `audit_log`, `support_messages`,
  `zip_code`, `stock_quantity` precisam acompanhar (NR-090 a NR-097)

### Neutras

- `schema.ts` Drizzle não gera migration e não é fonte da verdade

## Impacto na documentação

Atualizados **no mesmo PR** desta ADR:

- [x] `docs/arquitetura/dados.md`
- [x] `docs/arquitetura/esquema-postgresql.md`
- [x] `packages/db/README.md`
- [x] `docs/engenharia/setup.md` (`infra:reset`)
- [x] `DEC-019` marcada como 🟢

## Quando revisitar

- Better Auth inviável na hospedagem da DEC-009
- Produção com dado real, quando reset de histórico deixar de ser opção
