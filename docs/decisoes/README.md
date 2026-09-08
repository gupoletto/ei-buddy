# Decisões e perguntas em aberto

O que ainda **não** foi decidido, quem decide, e o que trava enquanto não for
decidido.

Este documento existe porque a alternativa é pior: decisão não tomada vira
decisão tomada por omissão, dentro de um PR, por quem estava com pressa.

---

## Como funciona

Duas coisas diferentes, deliberadamente separadas:

|                        | Resolve-se com                    | Formato                               |
| ---------------------- | --------------------------------- | ------------------------------------- |
| **Decisão** `DEC-xxx`  | uma **escolha** entre opções      | Ver [decisões](#decisões-em-aberto)   |
| **Pergunta** `QST-xxx` | uma **informação** que alguém tem | Ver [perguntas](#perguntas-em-aberto) |

### Ciclo de vida de uma decisão

```
🔴 Aberta ──→ 🟡 Em análise ──→ 🟢 Decidida ──→ ADR em adr/ ──→ sai desta lista
                    │
                    └──→ ⚪ Adiada (com data de revisão)
```

Quando uma `DEC` fecha: escreve-se a ADR em [`adr/`](adr/) usando o
[template](adr/0000-template.md), atualiza-se a documentação afetada **no mesmo
PR**, e a linha sai da tabela de abertas.

### Regras

1. Toda `DEC` tem **dono** e **prazo**. Sem isso ela não é uma decisão pendente,
   é um desejo.
2. Toda tarefa bloqueada no [ledger](../processo/task-ledger.md) referencia a
   `DEC` que a bloqueia.
3. **Bloqueado ≠ parado.** Se a decisão é sobre um provedor externo, a porta
   (interface) e os testes podem ser escritos antes — é para isso que existem os
   adapters ([princípios](../arquitetura/principios.md#3-adapters-isolam-provedores)).
4. Decisão tomada em conversa e não registrada aqui **não foi tomada**.

## Painel

| Estado             | Qtd | Quais                                      |
| ------------------ | --: | ------------------------------------------ |
| 🔴 Aberta          |   7 | DEC-007, 008, 009, 011, 012, 013, 018      |
| 🟡 Em análise      |   1 | DEC-001                                    |
| ⚪ Adiada          |   2 | DEC-005, DEC-014                           |
| 🟢 Decidida        |   8 | DEC-002, 003, 004, 006, 010, 015, 016, 017 |
| ❓ Pergunta aberta |  11 | QST-001 a QST-012 (QST-009 encerrada)      |

**Bloqueando o MVP agora:** DEC-008, DEC-009.
Auth e hospedagem ainda travam Sprint 1. Fiscal, WhatsApp e Asaas **não**
travam mais o desenho — as ADRs 0002, 0005, 0007 e 0008 fecharam provedor e
recorte. Split nas vendas é [DEC-018](#dec-018) e **não** bloqueia o adapter
falso.

---

## Recorte A–J (2026-09-02)

Fonte de verdade das telas: [`apps/web`](../../apps/web). Espinha do produto:

| Jornada | O que é                                                                              |
| ------- | ------------------------------------------------------------------------------------ |
| **A**   | Cadastro pessoal no signup; dados da empresa (CNPJ) em `/app/empresa`                |
| **B**   | Estoque: produtos simples, quantidades, movimentações                                |
| **C**   | Vendas, clientes, Asaas (Pix/boleto/link/cartão online), NFC-e e NFS-e Nacional via Focus |
| **D**   | Contas a pagar, a receber, plano de contas — **sem** bancos/Open Finance             |
| **E**   | CRM (quadro de 3 colunas) e agenda — no primeiro recorte                             |
| **F**   | Dashboard de KPIs em `/app`                                                          |
| **G**   | Dados pessoais e da empresa; regime + Híbrido; A1 + CSC só se elegível para a Focus  |
| **H**   | Plano de assinatura (Asaas `/v3/subscriptions` na conta-pai)                         |
| **I**   | Chamados de suporte                                                                  |
| **J**   | Assistente no web, app e WhatsApp Cloud API oficial                                  |

Decisões de recorte fechadas junto com as ADRs (não viram DEC extra):

1. **Documentos G:** A1 (`.pfx`) + CSC/`id_token` NFC-e vão para a **Focus**.
   KYC do **Asaas** é esteira separada, só para Pix/boleto/link/cartão online
   ([ADR-0008](adr/0008-subconta-asaas-nao-baas.md)).
2. **Nota no primeiro recorte:** **NFC-e e NFS-e Nacional** via Focus. Sem NF-e
   modelo 55. O layout do passo fiscal no front ainda será definido
   (`nfce | nfse | sem_nota`).
3. **Onboarding:** como o web — pessoa, cupom, termos, Pix da assinatura; empresa
   depois em `/app/empresa`. Emissão fiscal é pulável até o A1 ser aceito na Focus.
4. **WhatsApp:** [ADR-0005](adr/0005-whatsapp-cloud-api.md) — Cloud API oficial.
5. **Conta Asaas:** [ADR-0008](adr/0008-subconta-asaas-nao-baas.md).
6. **CRM e chamados:** entram no primeiro recorte, modelo mínimo.
7. **Bancos / Open Finance:** [DEC-005](#dec-005) adiada — fora do caminho de
   desenvolvimento.
8. **Elegibilidade fiscal:** ERP para qualquer regime cadastrado; emissão
   NFC-e / NFS-e Nacional só para **MEI** ou **Simples Nacional** que **não**
   optou pelo Híbrido IBS/CBS ([DEC-017](#dec-017)).

---

## Decisões em aberto

### DEC-001 — Nome do produto

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| **Status**   | 🟡 Em análise                                                       |
| **Dono**     | Produto / fundadores                                                |
| **Prazo**    | Antes de qualquer material público ou publicação em loja de apps    |
| **Bloqueia** | README, marca, domínio, nome nas app stores, escopo dos pacotes npm |

**Contexto.** Existem três nomes em circulação:

| Nome            | Origem                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `na-regua`      | nome do repositório                                                                                                                                                                                        |
| **ZapGestor**   | [apresentação comercial](../assets/zapgestor-apresentacao.md) — e a própria apresentação diz que é **nome de trabalho**, listando ContaZap, Fechou.AI e Zaply Gestão como alternativas                     |
| **ProComércio** | [material de rebranding](../assets/pro-comercio-rebranding.md) com identidade completa: paleta (`#1E2A78` `#39C8BD` `#6D33DD`), fontes (BC Alphapipe, BD Colonius) e **cinco paletas de marcas derivadas** |

**O que o material de rebranding sugere.** O texto fala em _"diferentes e
complementares soluções para negócios, que se conectam em um único
ecossistema"_, e traz cinco paletas derivadas. A leitura provável é que
**ProComércio é a marca guarda-chuva** e este ERP é **uma** das soluções dela —
não que o ERP se chame ProComércio. Isso é inferência a partir de um KV de uma
página, não um fato → [QST-011](#qst-011).

**Opções**

| Opção                                                   | Consequência                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| ProComércio como guarda-chuva + nome próprio para o ERP | Precisa definir o nome do ERP; usa uma das 5 paletas derivadas |
| ProComércio é o nome do ERP                             | Marca já pronta; abandona ZapGestor                            |
| Manter ZapGestor                                        | Contradiz o investimento já feito no rebranding                |

**Recomendação.** Responder [QST-011](#qst-011) primeiro. Enquanto isso a
documentação usa **ZapGestor** como nome de trabalho e o escopo dos pacotes é
`@na-regua/*` — deliberadamente atrelado ao **repositório**, que não muda com a
marca, para que a decisão não force renomear pacote nenhum.

---

### DEC-007 — Modelo de LLM e mecanismo de recuperação de informação

|              |                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Status**   | 🔴 Aberta                                                                                                                      |
| **Dono**     | Trilha 2 — Plataforma & Integrações                                                                                            |
| **Prazo**    | **Sprint 3**                                                                                                                   |
| **Bloqueia** | `packages/agent` · [RF-096 a RF-109](../produto/requisitos-funcionais.md) · [RNF-072](../produto/requisitos-nao-funcionais.md) |

**Contexto.** Herdada da apresentação ("como será a busca de informações por trás
da IA"). São duas decisões que costumam ser confundidas:

1. **Qual modelo** — custo por interação, latência
   ([RNF-006](../produto/requisitos-nao-funcionais.md): ≤ 5 s), qualidade em
   português, e se aceita _tool calling_ confiável.
2. **Como o agente acessa o dado** — e aqui a arquitetura já respondeu: **tools
   tipadas geradas de `contracts`, chamando casos de uso de `core`**. Não é RAG
   sobre texto: é chamada de função sobre dado estruturado.

**Recomendação.** Deixar explícito que **não haverá busca semântica sobre o banco
de negócio**. O lojista pergunta "quanto vendi hoje?" e a resposta vem de uma
consulta SQL determinística, não de um índice vetorial. Isso mata a classe
inteira de erro em que o número da resposta não bate com o número do relatório —
e é o que sustenta [RF-101](../produto/requisitos-funcionais.md).

Busca semântica pode ser útil depois, para documentação e ajuda — não para dado
financeiro.

O assistente existe no **web, app e WhatsApp** (jornada J). O runtime continua
em `packages/agent` dentro da API.

---

### DEC-008 — Autenticação e vínculo do número de WhatsApp

|              |                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta — **recorte 2026-09-02:** membership 1:1 saiu desta DEC ([ADR-0004](adr/0004-usuario-uma-empresa.md))              |
| **Dono**     | Trilha 2 + Trilha 1                                                                                                          |
| **Prazo**    | **Sprint 1**                                                                                                                 |
| **Bloqueia** | [RF-119](../produto/requisitos-funcionais.md), RF-120 · api, web, mobile · [E11](../produto/user-stories.md#e11--assistente) |

**Ainda em aberto (só isto):**

1. **Provedor de autenticação:** solução própria vs. gerenciada (Auth0, Clerk,
   Supabase Auth, Better Auth). Critérios: custo por usuário ativo, segundo
   fator para `platform_admin`
   ([RNF-025](../produto/requisitos-nao-funcionais.md)), e não amarrar o vendor
   ao modelo de dados. **Não** precisa suportar um usuário em várias empresas.

2. **Vínculo telefone ↔ identidade:** o número vinculado é a credencial do
   canal WhatsApp
   ([`seguranca.md`](../arquitetura/seguranca.md#autenticação-do-canal-whatsapp)).
   Contrapesos: confirmação explícita de ação com valor e trilha de auditoria.

**A decidir explicitamente:** o vínculo por número é suficiente, ou uma ação
acima de certo valor exige confirmação por um segundo canal?

---

### DEC-009 — Hospedagem e alvo de deploy

|              |                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                                                              |
| **Dono**     | Trilha 2 — Plataforma & Integrações                                                                                    |
| **Prazo**    | **Sprint 1** — os workflows de deploy estão como esqueleto até isto fechar                                             |
| **Bloqueia** | `infra/` · [`ci-cd.md`](../engenharia/ci-cd.md) · [RNF-009](../produto/requisitos-nao-funcionais.md), RNF-013, RNF-064 |

**Opções:** PaaS (Railway, Render, Fly.io) · nuvem gerenciada (AWS, GCP) ·
VPS + Docker Compose.

**Critérios:** custo por empresa ativa
([RNF-074](../produto/requisitos-nao-funcionais.md): ≤ 8% da mensalidade) ·
Postgres gerenciado com recuperação a ponto no tempo
([RNF-013](../produto/requisitos-nao-funcionais.md)) · esforço de operação para
um time sem pessoa dedicada a infra · reversão de deploy em ≤ 10 min.

**Recomendação preliminar.** PaaS com Postgres gerenciado. Três desenvolvedores
sem SRE não devem operar Kubernetes — o custo aparece em indisponibilidade, não
na fatura.

---

### DEC-011 — Memória e contexto da conversa

|              |                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                                                                          |
| **Dono**     | Trilha 2                                                                                                                           |
| **Prazo**    | Sprint 3                                                                                                                           |
| **Bloqueia** | [RF-105](../produto/requisitos-funcionais.md), RF-106 · [US-051](../produto/user-stories.md#us-051--manter-o-contexto-da-conversa) |

**Contexto.** Herdada da apresentação: "como manter o contexto da conversa" e
"como a IA vai aprender/melhorar com o uso".

**Decidir:** o que é lembrado (só a conversa recente? preferências? histórico?) ·
por quanto tempo ([RNF-035](../produto/requisitos-nao-funcionais.md)) · onde é
armazenado · e se "aprendizado contínuo" significa memória por lojista ou
ajuste de modelo.

**Alerta.** "Aprendizado contínuo" com dado de cliente é campo minado de LGPD.
Memória **por empresa**, isolada e expirável, é uma coisa; treinar modelo com
dado de lojista é outra, e exige base legal e consentimento próprios
([RNF-036](../produto/requisitos-nao-funcionais.md)).

---

### DEC-012 — Cupons (autocadastro já existe no web)

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Status**   | 🔴 Aberta                                                                                                          |
| **Dono**     | Produto                                                                                                            |
| **Prazo**    | Sprint 3                                                                                                           |
| **Bloqueia** | [RF-114](../produto/requisitos-funcionais.md), RF-115 · [US-056](../produto/user-stories.md#us-056--aplicar-cupom) |

O web já tem autocadastro e campo de cupom no signup.

**Já no schema:** quem emite é `partners` (Clube X emite vários códigos);
desconto é `percent` ou `amount`; duração é `discount_cycles` (`NULL` = todos
os ciclos). Revogação (`revoked_at`) e validade (`expires_at`) também.

**Ainda decidir:** período grátis (além de desconto)? Cumulativo? Indicação
entre lojistas?

Convite de funcionário **não** está nesta DEC — é [ADR-0004](adr/0004-usuario-uma-empresa.md)
(staff depois, mesma empresa).

---

### <a id="dec-005"></a>DEC-005 — Provedor de Open Finance

|              |                                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| **Status**   | ⚪ Adiada — fora do recorte A–J. Revisar depois do MVP operacional                  |
| **Dono**     | Trilha 2 — Plataforma & Integrações                                                 |
| **Prazo**    | Sem data no primeiro recorte                                                        |
| **Bloqueia** | Nada no caminho crítico. `packages/banking` e NR-047/048/076 saem da Sprint 5 ativa |

**Motivo.** Jornada D é contas a pagar/receber e plano de contas. Conciliação
e Open Finance não estão no web nem no fluxo A–J.

Quando voltar: começar por OFX/CSV atrás da porta `BankStatementProvider`.

---

### DEC-013 — Idioma da descrição dos commits

|              |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                         |
| **Dono**     | Time                                                                              |
| **Prazo**    | **Antes do primeiro commit de feature**                                           |
| **Bloqueia** | [`git-workflow.md`](../engenharia/git-workflow.md) e a configuração do commitlint |

Tipos e escopos são palavras-chave em inglês em qualquer cenário. A dúvida é só
a descrição.

**Recomendação: PT-BR**, coerente com a escolha de documentação em português —
`feat(core): registrar venda com cálculo de líquido`. Barato mudar agora, caro
depois (histórico inteiro fica misto).

---

### DEC-014 — Versionamento: tag única vs. tag por aplicação

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Status**   | ⚪ Adiada — revisar quando houver deploy em produção |
| **Dono**     | Trilha 2                                             |
| **Prazo**    | Antes do primeiro deploy de produção                 |
| **Bloqueia** | Nada hoje                                            |

Pré-MVP usa **tag única `v0.x.y`** no monorepo. Quando os deploys de `api`,
`web` e `mobile` deixarem de ser sincronizados, migrar para tags por aplicação
(`api-v1.2.0`). Hoje seria cerimônia sem retorno.

---

### <a id="dec-018"></a>DEC-018 — Split nas vendas Asaas

|              |                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                                |
| **Dono**     | Produto + jurídico                                                                       |
| **Prazo**    | Antes de enviar `split[]` em produção (não bloqueia adapter falso nem o contrato)        |
| **Bloqueia** | Take-rate por venda · NR-044 só na parte de Split, não no Pix/boleto/link/cartão         |

**Pergunta.** A plataforma tira uma fatia de cada venda Asaas, ou só cobra a
mensalidade na conta-pai?

Insumo: [`split-decision.md`](../arquitetura/integracoes/split-decision.md)
(opções A sem Split, B split na subconta, C cobrança na pai).

Não reabre [ADR-0008](adr/0008-subconta-asaas-nao-baas.md) (não-BaaS vs BaaS).
Quando fechar: ADR nova e o mesmo PR atualiza o adapter.

---

## Perguntas em aberto

Resolvem-se com informação, não com escolha. Uma pergunta respondida vira
atualização de documento — e às vezes abre uma `DEC`.

| ID                              | Pergunta                                                                                                                  | Para quem            | Por que importa                                                                                                                                                    | Prazo                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| <a id="qst-001"></a>**QST-001** | Quantos lojistas se espera nos primeiros 12 meses?                                                                        | Produto              | Dimensiona [RNF-016/017](../produto/requisitos-nao-funcionais.md) e o custo de [DEC-009](#dec-009)                                                                 | Sprint 1                    |
| <a id="qst-002"></a>**QST-002** | Qual o preço da mensalidade e quantos planos?                                                                             | Produto              | [RNF-072](../produto/requisitos-nao-funcionais.md) e [RNF-074](../produto/requisitos-nao-funcionais.md) são percentuais dela — sem o valor, não há como verificar  | Sprint 1                    |
| <a id="qst-003"></a>**QST-003** | Existe lojista-piloto comprometido em usar o MVP?                                                                         | Produto              | Sem piloto não há como validar o [critério de saída do MVP](../produto/escopo-mvp.md#critérios-de-saída-do-mvp)                                                    | Sprint 1                    |
| <a id="qst-004"></a>**QST-004** | Quem é controlador e quem é operador de dados na LGPD?                                                                    | Jurídico             | Define quem responde por vazamento e o que vai no contrato — ver [`seguranca.md`](../arquitetura/seguranca.md#lgpd)                                                | Sprint 2                    |
| <a id="qst-005"></a>**QST-005** | Qual contador valida o formato de exportação?                                                                             | Produto              | [RF-087](../produto/requisitos-funcionais.md) sem validação real vira retrabalho                                                                                   | Sprint 4                    |
| <a id="qst-006"></a>**QST-006** | As [personas](../produto/personas.md) foram validadas com lojistas reais?                                                 | Produto              | Hoje são inferência a partir da apresentação comercial                                                                                                             | Sprint 2                    |
| <a id="qst-007"></a>**QST-007** | As metas [M1–M7](../produto/visao.md#métricas-de-sucesso) são realistas?                                                  | Produto              | São hipóteses; meta errada leva a decisão errada                                                                                                                   | Sprint 2                    |
| <a id="qst-008"></a>**QST-008** | Os alvos numéricos dos [RNFs](../produto/requisitos-nao-funcionais.md) batem com o aparelho e a internet do público-alvo? | Produto + Trilha 3   | Calibrados por estimativa, não por medição                                                                                                                         | Sprint 3                    |
| <a id="qst-009"></a>**QST-009** | Encerrada — Asaas usa API Key (`access_token`); não há senha de conta. | —                    | [ADR-0007](adr/0007-asaas.md)                                                                                                                                        | Encerrada 2026-09-04        |
| <a id="qst-010"></a>**QST-010** | O Asaas tem ou terá API de captura presencial (maquininha, TEF, tap-on-phone)?                            | Asaas                | Não muda a escolha atual (só registro) — informativo                                                                                                               | Quando houver roadmap deles |
| <a id="qst-011"></a>**QST-011** | ProComércio é a marca guarda-chuva e este ERP é uma das soluções dela, ou é o nome do próprio ERP?        | Produto / fundadores | Resolve [DEC-001](#dec-001) e define qual das 5 paletas derivadas o produto usa                                                                                    | Sprint 1                    |
| <a id="qst-012"></a>**QST-012** | Já existe conta Asaas (sandbox da conta-pai) e acesso para criar subcontas?                               | Produto              | Sem sandbox não há como testar `packages/payments`                                                                                                                 | Sprint 2                    |

---

## Decisões tomadas

Fechadas viram ADR em [`adr/`](adr/). A âncora `DEC-xxx` permanece para os
links que já apontam para cá.

| ADR                                               | Decisão                                               | Data       |
| ------------------------------------------------- | ----------------------------------------------------- | ---------- |
| [ADR-0001](adr/0001-rls-por-linha.md)             | Isolamento multi-tenant por RLS por linha             | 2026-09-01 |
| [ADR-0002](adr/0002-focus-nfe.md)                 | Emissão fiscal via Focus NFe (NFC-e e NFS-e Nacional) | 2026-09-02 |
| [ADR-0003](adr/0003-pagmaxx.md)                   | PagMaxx nas vendas e na assinatura — **substituída** por 0007 | 2026-09-02 |
| [ADR-0004](adr/0004-usuario-uma-empresa.md)       | Um usuário, uma empresa                               | 2026-09-02 |
| [ADR-0005](adr/0005-whatsapp-cloud-api.md)        | WhatsApp Cloud API oficial                            | 2026-09-02 |
| [ADR-0006](adr/0006-conta-pagmaxx-por-lojista.md) | Conta PagMaxx por lojista — **substituída** por 0008  | 2026-09-02 |
| [ADR-0007](adr/0007-asaas.md)                     | Asaas nas vendas online e na assinatura SaaS          | 2026-09-04 |
| [ADR-0008](adr/0008-subconta-asaas-nao-baas.md)   | Subconta Asaas não-BaaS por lojista                   | 2026-09-04 |

### <a id="dec-002"></a>DEC-002 — Estratégia multi-tenant

|             |                                                       |
| ----------- | ----------------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0001](adr/0001-rls-por-linha.md)   |
| **Escolha** | RLS por linha (`company_id` + política no PostgreSQL) |
| **Data**    | 2026-09-01                                            |

Consequências no código: [`dados.md`](../arquitetura/dados.md#multi-tenant).
Materialização em `packages/db` (`NR-007`). Isolamento **entre lojas**; não
implica um usuário em várias empresas ([ADR-0004](adr/0004-usuario-uma-empresa.md)).

### <a id="dec-003"></a>DEC-003 — Provedor de WhatsApp

|             |                                                                     |
| ----------- | ------------------------------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0005](adr/0005-whatsapp-cloud-api.md)            |
| **Escolha** | WhatsApp Cloud API oficial da Meta (BSP só se encapsular a oficial) |
| **Data**    | 2026-09-02                                                          |

Biblioteca não oficial descartada.

### <a id="dec-004"></a>DEC-004 — Provedor de emissão fiscal

|             |                                                                                       |
| ----------- | ------------------------------------------------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0002](adr/0002-focus-nfe.md)                                       |
| **Escolha** | Focus NFe; NFC-e e NFS-e Nacional; A1 só transita; emissão só MEI/Simples sem Híbrido |
| **Data**    | 2026-09-02                                                                            |

Não há integração direta com a SEFAZ. Contrato:
[`integracoes/focusnfe.md`](../arquitetura/integracoes/focusnfe.md).
Quem pode emitir: [DEC-017](#dec-017).

### <a id="dec-006"></a>DEC-006 — PSP / adquirente

|             |                                             |
| ----------- | ------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0007](adr/0007-asaas.md) |
| **Escolha** | Asaas para Pix, boleto, link e cartão online |
| **Data**    | 2026-09-04 (substitui a escolha de PSP de 2026-09-02) |

Dinheiro e maquininha: só registro. Sem TEF no recorte.
Contrato: [`integracoes/asaas.md`](../arquitetura/integracoes/asaas.md).

### <a id="dec-010"></a>DEC-010 — Cobrança de mensalidade (provedor)

|             |                                             |
| ----------- | ------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0007](adr/0007-asaas.md) |
| **Escolha** | Asaas `/v3/subscriptions` na conta-pai      |
| **Data**    | 2026-09-04 (substitui a escolha de PSP de 2026-09-02) |

Ainda produto (não bloqueia adapter): preço e trial → [QST-002](#qst-002).
Estado `Restrita`: bloquear escrita, nunca leitura nem exportação
([`fluxos.md`](../arquitetura/fluxos.md#assinatura-e-bloqueio-por-inadimplência)).

### <a id="dec-015"></a>DEC-015 — Modelo de conta no PSP

|             |                                                                           |
| ----------- | ------------------------------------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0008](adr/0008-subconta-asaas-nao-baas.md)             |
| **Escolha** | Subconta Asaas não-BaaS por lojista; KYC fora do caminho crítico          |
| **Data**    | 2026-09-04 (substitui o modelo de conta no PSP de 2026-09-02)             |

### <a id="dec-016"></a>DEC-016 — Relação usuário–empresa

|             |                                                           |
| ----------- | --------------------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0004](adr/0004-usuario-uma-empresa.md) |
| **Escolha** | `users.company_id` 1:1; staff futuro na mesma empresa     |
| **Data**    | 2026-09-02                                                |

### <a id="dec-017"></a>DEC-017 — Elegibilidade para emitir nota

|             |                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| **Status**  | 🟢 Decidida — recorte em [ADR-0002](adr/0002-focus-nfe.md)                                                  |
| **Escolha** | ERP liberado; NFC-e e NFS-e Nacional só MEI ou Simples **sem** Híbrido IBS/CBS (LC 214/2025, vigência 2027) |
| **Data**    | 2026-09-02                                                                                                  |

Autodeclaração em `/app/empresa` (`tax_regime` + `opted_reforma_hibrida`).
Consulta CNPJ sugere MEI vs Simples; **não** descobre Híbrido. Inelegível
grava a empresa, vende e usa financeiro; A1, CSC, flags Focus e a fila
`invoice-issue` são recusados ([RF-146](../produto/requisitos-funcionais.md)).
Predicado: `isEligibleForFiscalEmission` em `packages/domain`.

## Documentos relacionados

- [ADRs](adr/) — decisões fechadas, com o contexto da época
- [Task Ledger](../processo/task-ledger.md) — o que cada decisão bloqueia
- [Princípios](../arquitetura/principios.md) — o que **não** é negociável
- [Escopo A–J](../produto/escopo-mvp.md) — recorte de produto
