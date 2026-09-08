---
adr: 0002
titulo: Identidade e autorização próprias, prova de identidade terceirizada
status: aceita
data: 2026-09-03
decisores:
  - Trilha 1 — Núcleo & Dados
  - Trilha 2 — Plataforma & Integrações
substitui: null
substituida_por: null
---

# ADR-0002 — Identidade e autorização próprias, prova de identidade terceirizada

|                       |                                 |
| --------------------- | ------------------------------- |
| **Status**            | Aceita                          |
| **Data**              | 2026-09-03                      |
| **Decisores**         | Trilha 1 + Trilha 2             |
| **Decisão de origem** | [DEC-008](../README.md#dec-008) |

## Contexto

[DEC-008](../README.md#dec-008) juntava duas perguntas: qual solução de
autenticação usar, e se o número de WhatsApp vinculado basta como credencial.
Ela bloqueava `NR-013` e `NR-014` — 6 dias parados — e é pré-requisito de
produção: sem ela, `RF-119` (autenticar e restringir às empresas do usuário),
`RF-120` (não revelar existência de usuário) e `RF-005` (convidar usuário) não
têm onde nascer.

A costura já existe. [`execution-context.ts`](../../../apps/api/src/plugins/execution-context.ts)
define `AuthenticatedPrincipal` e `requireContext`, e hoje toda rota protegida
responde 401 porque nada popula `request.principal`. O que faltava não era
código — era decidir **quem é dono do quê**.

E o modelo de dados já tomou partido: `users ↔ company_users ↔ companies`
existe em [`0002_cadastros.sql`](../../../packages/db/src/migrations/0002_cadastros.sql),
e o isolamento por RLS ([ADR-0001](0001-rls-por-linha.md)) depende de
`app.company_id` sair **das nossas tabelas**.

## Duas perguntas, duas decisões

### Pergunta 1 — solução própria ou gerenciada

#### Opção A — Escrever a autenticação inteira

Hash de senha, recuperação, segundo fator, detecção de vazamento.

| Prós                           | Contras                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| Nenhuma dependência externa    | Escrever primitiva de segurança é onde time pequeno erra caro      |
| Nenhum custo por usuário ativo | Segundo fator para `platform_admin` (RNF-025) vira projeto próprio |
|                                | Recuperação de senha é um vetor de ataque inteiro por conta nossa  |

#### Opção B — Provedor gerenciado dono da identidade **e** da autorização

Auth0 Organizations, Clerk Organizations: o provedor guarda usuário, empresa e
papel.

| Prós                                     | Contras                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Tela de login e troca de empresa prontas | **Duas fontes de verdade para papel** — a do provedor e `company_users`      |
| Segundo fator incluso                    | RLS lê `app.company_id` das nossas tabelas; o papel do provedor seria adorno |
| Convite de usuário pronto                | Trocar de provedor reescreveria o modelo de acesso                           |
|                                          | Amarra o vendor ao modelo de dados — o critério que a própria DEC-008 proíbe |

#### Opção C — Provedor gerenciado só para provar identidade

O provedor responde "esta pessoa é quem diz ser". Empresa, papel e sessão são
nossos.

| Prós                                          | Contras                                 |
| --------------------------------------------- | --------------------------------------- |
| Segundo fator e recuperação sem código nosso  | Custo por usuário ativo                 |
| Uma fonte de verdade para papel               | Dependência externa no caminho de login |
| Vendor trocável sem tocar no modelo de acesso |                                         |

#### Opção D — Biblioteca de autenticação auto-hospedada

Better Auth, Lucia. Mesma divisão da opção C, mas a prova roda na nossa
infraestrutura.

| Prós                             | Contras                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| Sem custo por usuário ativo      | Operação é nossa: rotação de chave, migração                 |
| Sem dependência externa no login | Depende de onde hospedamos ([DEC-009](../README.md#dec-009)) |
| Mesma arquitetura da opção C     |                                                              |

### Pergunta 2 — o vínculo do número basta?

O desenho atual trata o número vinculado como credencial e apresenta a
confirmação explícita de ação com valor (`RF-103`) como contrapeso ao SIM swap.

**Esse contrapeso não se sustenta, e é o achado que move esta decisão.** A
confirmação chega e é respondida **no mesmo canal**. Quem fez o SIM swap tem o
número: recebe o pedido de confirmação e responde "sim". Confirmação em banda
não é segundo fator — é o primeiro fator perguntando duas vezes. Ela continua
valendo como controle de usabilidade (evita o lançamento por engano), e é assim
que deve ser descrita.

A DEC-008 propunha um piso de valor: acima de R$ X, exigir segundo canal. Duas
razões para recusar o piso:

1. **Transforma o ataque em aritmética.** Quem controla o número faz N
   operações abaixo da linha. O piso protege o valor de uma operação, não o
   patrimônio.
2. **Não existe linha boa.** O movimento diário de uma loja de bairro e de uma
   com quatro funcionários difere em uma ordem de grandeza. Qualquer valor
   único ou atrapalha o trabalho normal ou deixa passar dano real.

## Decisão

### 1. Identidade e autorização são nossas; a prova de identidade é alugada

> **Nós somos donos da sessão. Alugamos a prova.**

- `users`, `company_users`, papel e **empresa ativa** são nossos, em `db`, sob
  RLS. Nenhum provedor guarda papel.
- A prova de identidade entra por uma porta, `IdentityProvider`, que responde
  apenas: esta credencial corresponde a este `subject` externo, com este
  contato verificado.
- `core` mapeia `subject` → `users.id`, resolve os vínculos em `company_users`
  e emite **nossa** sessão, com `companyId` e `role` dentro.

Isso descarta as opções A e B. A escolha entre **C e D fica para quando a
[DEC-009](../README.md#dec-009) (hospedagem) fechar**, e essa espera não
bloqueia código nenhum: as duas usam a mesma porta, e a diferença é qual
implementação a composição injeta.

> **Atualização (2026-09-08) — esta metade foi decidida antes da DEC-009.** A
> [ADR-0003](0003-better-auth-como-prova-de-identidade.md) escolhe a opção D
> (Better Auth). Dois motivos que esta ADR não podia prever: o provedor virou o
> **único** item de desenvolvimento no caminho de produção depois que a NR-083
> tirou sessão e desaceleração da memória, e a premissa de que a opção D exige
> plataforma com processo próprio se mostrou mais fraca do que se supunha. O
> resto desta ADR continua valendo palavra por palavra — inclusive a aposta na
> porta, que é o que tornou a troca uma função de composição.

**Recomendação registrada:** se a DEC-009 cair em plataforma onde rodamos nosso
Postgres e nosso Node, opção D — sem custo por usuário ativo e sem terceiro no
caminho do login. Se cair em plataforma serverless, opção C.

Enquanto isso, `AUTH_PROVIDER=fake` atende desenvolvimento e teste, e
**produção recusa subir com ele** — pelo mesmo mecanismo que
[`composition.ts`](../../../apps/api/src/composition.ts) já usa para recusar
banco sem RLS em vigor.

### 2. O número prova continuidade de conversa, não identidade forte

O vínculo do número **basta** para ler e para registrar operação reversível,
auditada, que não tira valor do negócio: lançar uma venda, lançar uma conta,
consultar o caixa. O pior caso é dado sujo, e para isso já existem a trilha de
auditoria e o estorno.

O vínculo **não basta** — exige sessão do aplicativo, que é o segundo canal —
para o que muda quem tem acesso ou tira valor de dentro:

| Operação                                       | Por quê                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| Vincular o número a outro aparelho ou usuário  | É a operação que entrega todas as outras              |
| Convidar usuário ou mudar papel (`RF-005`)     | Cria credencial nova; é escalada de privilégio        |
| Trocar a conta bancária de repasse             | Redireciona o dinheiro sem mexer em nenhum lançamento |
| Exportar ou anonimizar a base (`RF-125`–`128`) | Exfiltração completa numa mensagem                    |

O eixo é **tipo de ação**, não valor. Cada linha acima tem a propriedade de que
uma única execução já é o dano — não há N pequenas que somam.

Isso é regra de negócio, então vive em `core` ao lado de `assertCanWrite`, e
não no handler HTTP: se ficasse no handler, o canal WhatsApp não a aplicaria,
que é exatamente o canal contra o qual ela existe
([princípio 1](../../arquitetura/principios.md#1-core-e-o-nucleo)).

## Consequências

### Positivas

- `NR-013` e `NR-014` saem do bloqueio; 6 dias voltam a andar
- Uma fonte de verdade para papel — a mesma que a RLS usa
- Trocar de provedor é trocar uma implementação de porta, não migrar dados
- A regra do canal é testável em `core`, sem subir servidor nem simular webhook
- A afirmação errada sobre SIM swap sai da documentação de segurança

### Negativas

- Emissão e revogação de sessão são nossas — inclusive `RF-006` (remover
  funcionário encerra a sessão)
- Produção continua dependendo da DEC-009 para escolher entre C e D. O que
  mudou é que a dependência é de **configuração**, não de código
- A porta `IdentityProvider` é indireção extra num fluxo que muita gente
  escreveria direto contra o SDK do provedor
- Operações sensíveis por WhatsApp respondem "faça isso no aplicativo", e isso
  é atrito deliberado num canal cujo apelo é não ter atrito

### Neutras

- `ExecutionContext.channel` já existia; passa a ter uma segunda função
- O modelo `users ↔ company_users ↔ companies` não muda

## Impacto na documentação

Atualizados **no mesmo PR** desta ADR:

- [x] `docs/arquitetura/seguranca.md` — correção do contrapeso ao SIM swap e a
      tabela de operações que exigem segundo canal
- [x] `docs/decisoes/README.md` — DEC-008 marcada 🟢 e retirada das abertas
- [x] `docs/processo/task-ledger.md` — `NR-013` e `NR-014` desbloqueadas
- [x] `apps/api/README.md`

## Quando revisitar

- A DEC-009 fechar — é quando a escolha entre C e D deixa de ser hipótese
- Um caso de uso legítimo aparecer para operação sensível por WhatsApp em loja
  sem ninguém que use o aplicativo. Aí a pergunta é qual segundo canal serve,
  não se ele é necessário
- SIM swap acontecer com um cliente: a ADR não se reescreve, escreve-se outra
- Custo por usuário ativo passar do que o plano cobra por empresa (`RNF-072`)
