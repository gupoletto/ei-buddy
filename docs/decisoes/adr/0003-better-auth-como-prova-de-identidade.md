---
adr: 0003
titulo: Better Auth como prova de identidade, em schema próprio
status: aceita
data: 2026-09-08
decisores:
  - Trilha 2 — Plataforma & Integrações
substitui: null
substituida_por: null
---

# ADR-0003 — Better Auth como prova de identidade, em schema próprio

|                       |                                                               |
| --------------------- | ------------------------------------------------------------- |
| **Status**            | Aceita                                                        |
| **Data**              | 2026-09-08                                                    |
| **Decisores**         | Trilha 2                                                      |
| **Decisão de origem** | [ADR-0002](0002-autenticacao-identidade-propria.md), metade B |

## Contexto

A [ADR-0002](0002-autenticacao-identidade-propria.md) respondeu **quem é dono
do quê** — nós somos donos da sessão, alugamos a prova — e deixou uma metade em
aberto: se a prova vem de um provedor gerenciado (**opção C**) ou de uma
biblioteca auto-hospedada (**opção D**). Ela adiou essa escolha para quando a
[DEC-009](../README.md#dec-009) (hospedagem) fechasse, com uma recomendação
registrada: opção D se rodarmos nosso Node e nosso Postgres, opção C se
serverless.

Três coisas mudaram desde então:

1. **A espera deixou de ser barata.** A ADR-0002 argumentou que adiar não
   bloqueava código, e estava certa — mas o preço apareceu depois. O
   `assertAuthUsavelEmProducao` guardava três implementações de desenvolvimento;
   a [NR-083](../../processo/task-ledger.md) resolveu duas (sessão e
   desaceleração, agora no Postgres) e o provedor ficou sendo o **único** item
   entre o sistema e um ambiente de produção.

2. **A premissa da recomendação enfraqueceu.** A ADR supôs que a opção D exige
   plataforma onde rodamos nosso processo. O Better Auth roda em serverless
   também — ele documenta migração programática justamente para isso. A
   dependência de hospedagem, na prática, é menor do que a ADR imaginou.

3. **A porta provou que a escolha é reversível.** `IdentityProvider` e
   `IdentityRegistrar` existem desde a NR-014, com o falso satisfazendo as duas.
   Trocar de provedor é trocar uma função de composição — que é exatamente o que
   esta ADR faz.

## Decisão

### 1. A prova de identidade é o Better Auth, auto-hospedado — opção D

Ele responde uma pergunta e nada mais: esta credencial é desta pessoa? O
`subject` que ele devolve entra em `users.auth_subject` (migration 0009), e
empresa, papel e sessão continuam nossos.

O que estamos comprando é o que a ADR-0002 recusou escrever quando descartou a
opção A — hash de senha, recuperação, verificação de contato, segundo fator para
`platform_admin` (RNF-025). O que **não** estamos comprando é modelo de acesso:
a sessão dele é descartada em `verify`, nenhuma rota dele é montada, e nenhum
cookie dele existe.

### 2. As tabelas dele ficam em `identidade`, e não em `public`

A [ADR-0001](0001-rls-por-linha.md) tem uma invariante: toda tabela em `public`
nasce com RLS habilitado e forçado, e `schema.test.ts` reprova o PR que
esquecer.

As quatro tabelas do Better Auth (`user`, `session`, `account`, `verification`)
não têm `company_id` e nunca terão — a credencial é da pessoa, não da loja; a
mesma pessoa opera cinco lojas com uma credencial só. Em `public` sobrariam duas
saídas ruins:

| Saída                               | Por que não                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS sem política, como `sessions`   | Ali o acesso passa por funções nossas. Aqui quem consulta é a biblioteca, com o pool dela, que não sabe de `app.company_id` — toda consulta voltaria vazia |
| Acrescentá-las às exceções do teste | A invariante passaria a ter quatro furos que ninguém revisita, e o quinto entraria sem discussão                                                           |

Um schema próprio não é desvio da regra: é a regra dizendo a verdade. O teste
olha `nspname = 'public'`, então `identidade` fica de fora — **por ser outra
coisa, não por ter sido perdoada.**

### 3. Quem migra o schema da biblioteca é a biblioteca

A migration `0023` cria o schema vazio. As tabelas vêm de `ctx.runMigrations()`,
por `pnpm --filter @na-regua/api migrar:identidade`.

Copiar o DDL do Better Auth para `packages/db/src/migrations` faria cada
atualização dele exigir um diff escrito à mão, e o erro apareceria no primeiro
login depois do deploy — não no `pnpm typecheck`. A regra que fica: **o que é
nosso mora em `public` e é migrado por `packages/db`; o que é da biblioteca mora
em `identidade` e é migrado por ela.**

## Consequências

### Positivas

- O último item de memória sai do caminho de produção; sobra configuração
- Segundo fator (RNF-025) e recuperação de senha passam a ser plugin, não projeto
- A escolha do provedor deixa de depender da DEC-009
- Trocar para a opção C continua sendo trocar `criarIdentidade` — a porta não mudou

### Negativas

- **Um segundo driver de Postgres no processo.** O repo fala `postgres.js`; o
  Better Auth fala Kysely, que quer um `Pool` do `pg`. Não há dialeto de Kysely
  sobre `postgres.js`, e escrever um seria manter um adaptador de banco para não
  instalar um driver. O pool separado tem um efeito bom: é ele que mantém
  `search_path=identidade` longe do nosso
- **Duas migrações a rodar na ordem certa**, e a segunda depende da primeira
- **Um e-mail sintético para quem só tem telefone.** `signUpEmail` exige e-mail e
  a RF-005 permite convidar só por número. O cadastro por telefone do plugin
  passa por OTP, e OTP depende da [DEC-003](../README.md#dec-003). O endereço usa
  `.invalid` (RFC 2606), nunca sai do adapter, e o contato de verdade continua em
  `users` — mas é uma coluna com dado falso dentro, e isso é dívida
- **A operação é nossa**, como a própria ADR-0002 já registrava na opção D:
  rotação de chave, atualização de versão, migração de schema

### Neutras

- `AUTH_PROVIDER` já aceitava qualquer string; `better-auth` passa a ser tratado
- `BETTER_AUTH_SECRET` é opcional no schema de env e obrigatória em
  `criarIdentidade` — barrá-la no schema quebraria o boot local com o falso

## O que fica em aberto

- **Segundo fator para `platform_admin` (RNF-025).** O plugin existe; ligá-lo é
  tarefa própria, com decisão de UX junto
- **Recuperação de senha.** Depende de por onde a mensagem sai — e-mail ou
  WhatsApp (DEC-003)
- **Cadastro por telefone sem e-mail sintético.** Sai quando o OTP puder ser
  enviado, o que também é DEC-003

## Quando revisitar

- Custo de operação do Better Auth passar do que a opção C custaria por usuário
  ativo (RNF-072)
- A DEC-009 cair em plataforma onde rodar processo próprio seja inviável — aí a
  pergunta é se a opção C compensa, e a resposta é uma função de composição
- Uma falha de segurança na biblioteca: a ADR não se reescreve, escreve-se outra
