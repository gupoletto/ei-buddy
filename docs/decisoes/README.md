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

| Estado             | Qtd | Quais                                           |
| ------------------ | --: | ----------------------------------------------- |
| 🔴 Aberta          |   9 | DEC-003, 005, 007, 009, 011, 012, 013, 015, 016 |
| 🟡 Em análise      |   3 | DEC-001, 006, 010                               |
| ⚪ Adiada          |   1 | DEC-014                                         |
| 🟢 Decidida        |   2 | DEC-002, 008                                    |
| ❓ Pergunta aberta |  12 | QST-001 a QST-012                               |

**Bloqueando o MVP agora:** DEC-003, DEC-009.
Essas duas travam trabalho de implementação já na Sprint 1. A DEC-016 não trava
código, mas trava **operação comercial**: os documentos existem e têm lacunas
declaradas na própria página.

A DEC-008 fechou — [ADR-0002](adr/0002-autenticacao-identidade-propria.md) e
[ADR-0003](adr/0003-better-auth-como-prova-de-identidade.md).
A DEC-009 continua aberta, e **a autenticação deixou de esperar por ela**: a
ADR-0003 escolheu o Better Auth (opção D) antes de a hospedagem fechar, porque
o provedor era o último item de desenvolvimento no caminho de produção. Se a
DEC-009 cair em plataforma onde processo próprio seja inviável, trocar para a
opção C é trocar uma função de composição.

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

### DEC-003 — Provedor de WhatsApp

|              |                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                                                                                                                       |
| **Dono**     | Trilha 2 — Plataforma & Integrações                                                                                                                                             |
| **Prazo**    | **Sprint 2**                                                                                                                                                                    |
| **Bloqueia** | `packages/whatsapp` · [RF-015](../produto/requisitos-funcionais.md), RF-016, RF-048, RF-068, RF-094, RF-095 · todo o [E11](../produto/user-stories.md#e11--assistente-whatsapp) |

**Opções:** Meta Cloud API direto · BSP (Twilio, Z-API, 360dialog, Gupshup) ·
biblioteca não oficial.

**Critérios de decisão:** custo por conversa (entra em
[RNF-072](../produto/requisitos-nao-funcionais.md)) · janela de 24h e template de
mensagem · confiabilidade do webhook · **risco de banimento** — biblioteca não
oficial derruba o produto inteiro sem aviso e sem recurso.

**Recomendação preliminar.** Descartar solução não oficial: o produto todo
depende deste canal. Entre Meta direto e BSP, é troca de custo por velocidade —
BSP entrega mais rápido, Meta sai mais barato em escala. A porta
`MessageSender` deve ser escrita antes da decisão.

---

### DEC-004 — Provedor de emissão fiscal

|              |                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🟢 **Decidida — Focus NFe**                                                                                                      |
| **Dono**     | Trilha 2 — Plataforma & Integrações                                                                                              |
| **Prazo**    | **Sprint 2**                                                                                                                     |
| **Bloqueia** | `packages/fiscal` · [RF-045 a RF-054](../produto/requisitos-funcionais.md) · [E5](../produto/user-stories.md#e5--emissão-fiscal) |

**Opções:** provedor de API fiscal (Focus NFe, NFe.io, PlugNotas, eNotas, Tecnospeed)
· integração direta com a SEFAZ.

**Critérios:** cobertura de NFC-e **e** NFS-e (NFS-e é municipal — a cobertura
varia por cidade) · contingência ([RF-052](../produto/requisitos-funcionais.md))
· guarda de XML por 5 anos ([RNF-037](../produto/requisitos-nao-funcionais.md))
· gestão do certificado A1 · qualidade das mensagens de rejeição
([RF-047](../produto/requisitos-funcionais.md)) · custo por nota.

**Recomendação.** Integração direta com a SEFAZ está fora de cogitação para um
time de 3 pessoas: é um projeto inteiro por si só. Escolher provedor, priorizando
NFC-e (MVP) e cobertura de NFS-e nas cidades-alvo.

**Decisão (2026-09-04): Focus NFe.**

O adapter entrou com a [NR-042](../processo/task-ledger.md). Três propriedades
do provedor moldaram o desenho, e estão no código:

- **NFC-e é síncrona** — autoriza ou rejeita na mesma requisição, diferente da
  NF-e. Não há fila nem consulta obrigatória depois.
- **Autenticação é Basic com senha vazia** — `Base64("token:")`. Não é
  cabeçalho de API key.
- **A referência (`ref`) é nossa e é o `saleId`** — única por token, e não
  reutilizável depois que a nota autoriza. Isso dá metade da idempotência que a
  [RNF-043](../produto/requisitos-nao-funcionais.md) exige.

**As credenciais por lojista foram resolvidas** (migration `0015`). Cada empresa
tem seu token Focus NFe e seu certificado A1, os dois cifrados em AES-256-GCM
antes de entrar no banco, em tabela própria e não em `companies` —
[RF-004](../produto/requisitos-funcionais.md). O adapter está ligado à
composição: o worker emite pela fila, e a api apenas **consulta**, porque
reconciliar contingência é leitura. Sem `SECRETS_KEY` a api cai no emissor
falso em vez de lançar; no worker a falta da chave lança, porque lá ela
significaria emitir sem poder.

> Este parágrafo dizia que as credenciais estavam pendentes e que o adapter
> "não está ligado à composição". As três afirmações ficaram desatualizadas, e
> quem consultasse a decisão concluiria que a emissão fiscal não funciona.

**O que continua pendente**, e por motivos diferentes:

| Requisito                         | Estado | Por quê                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RF-048` DANFE por WhatsApp       | ⬜     | Depende da [DEC-003](#dec-003), que segue aberta                                                                                                                                                                                                                                                                                     |
| `RF-053` retransmissão automática | ⬜     | **Decisão consciente, não pendência de tempo.** A documentação da Focus não define como retransmitir uma nota offline: existe um campo `contingencia_offline_efetivada` que _sugere_ que o provedor resolve sozinho, e sugerir não basta para documento fiscal. Inventar a chamada produziria nota duplicada ou nota que nunca chega |

O caso de uso `reconcileContingency` faz o que dá para fazer com segurança:
**pergunta** o estado de cada nota offline, na ordem em que saíram, e atualiza
a guarda. Funciona sob as duas hipóteses — se o provedor efetiva sozinho, a
reconciliação percebe; se não, as notas seguem visíveis em contingência em vez
de parecerem resolvidas.

Hoje essa pergunta acontece quando alguém abre a tela. Um job periódico faria
a nota se resolver sozinha, e é trabalho pequeno — mas exige uma consulta que
atravessa empresas ("quais têm nota em contingência"), porque a varredura roda
sem lojista na frente.

---

### DEC-005 — Provedor de Open Finance

|              |                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                                                                                                               |
| **Dono**     | Trilha 2 — Plataforma & Integrações                                                                                                                                     |
| **Prazo**    | Sprint 4 — só bloqueia [E8](../produto/user-stories.md#e8--bancos--conciliação), que é `SHOULD`                                                                         |
| **Bloqueia** | `packages/banking` · [RF-074, RF-075](../produto/requisitos-funcionais.md) — a importação por arquivo (RF-076, RF-077) **não** depende desta decisão e já está entregue |

**Opções:** agregador (Pluggy, Belvo, Klavi) · integração direta · **apenas
importação de OFX/CSV no MVP**.

**Recomendação.** Começar por OFX/CSV
([RF-076](../produto/requisitos-funcionais.md)), que já entrega conciliação e não
depende de fornecedor nem de certificação. Open Finance entra depois, atrás da
mesma porta `BankStatementProvider`.

---

### DEC-006 — PSP / adquirente

|              |                                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| **Status**   | 🟡 Em análise — candidato avaliado                                                  |
| **Dono**     | Produto + Trilha 2                                                                  |
| **Prazo**    | Sprint 2                                                                            |
| **Bloqueia** | `packages/payments` · [RF-007](../produto/requisitos-funcionais.md), RF-038, RF-063 |

**Candidato: PagMaxx.** Avaliação completa em
[`integracoes/pagmaxx.md`](../arquitetura/integracoes/pagmaxx.md).

**Resumo.** Cobre Pix, link de pagamento, cartão online, tokenização, 3DS,
estorno, simulação de taxa e assinaturas, com webhooks bem projetados
(HMAC-SHA256 sobre corpo bruto, id de evento para idempotência, reentrega 5×).

**A ressalva que importa:** **não há API de captura presencial.** O cartão do
balcão continua na maquininha da lojista; o sistema registra a venda e calcula a
tarifa por tabela configurada. Isso não invalida a escolha — encaixa bem na
metade conversacional do produto — mas precisa estar claro antes de assinar.

**Pendências antes de fechar:** [QST-009](#qst-009), [QST-010](#qst-010),
[QST-012](#qst-012) e [DEC-015](#dec-015).

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

### DEC-010 — Cobrança de mensalidade, inadimplência e bloqueio

|              |                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🟡 Em análise — candidato avaliado                                                                                                             |
| **Dono**     | Produto                                                                                                                                        |
| **Prazo**    | Sprint 3                                                                                                                                       |
| **Bloqueia** | `packages/billing` · [RF-110 a RF-118](../produto/requisitos-funcionais.md) · [E12](../produto/user-stories.md#e12--assinatura--cobrança-saas) |

**Contexto.** Herdada da apresentação: como cobrar, como avisar da inadimplência,
qual a regra de bloqueio.

**Provedor.** `/subscriptions/*` da
[PagMaxx](../arquitetura/integracoes/pagmaxx.md) cobre recorrência em cartão e
Pix, com ciclos numerados, `external_reference` próprio e histórico de cobranças
— suficiente para E12 sem um segundo fornecedor.

**Ainda em aberto (produto, não técnico):**

| Ponto      | Pergunta                                                                   |
| ---------- | -------------------------------------------------------------------------- |
| Preço      | Quanto custa a mensalidade e quantos planos existem? → [QST-002](#qst-002) |
| Trial      | Quantos dias e com quais limites?                                          |
| Tolerância | Quantos dias entre o vencimento e a restrição?                             |
| Restrição  | Confirmado que restringe **escrita** mantendo leitura e exportação?        |

**Recomendação.** Manter o estado `Restrita` como desenhado em
[`fluxos.md`](../arquitetura/fluxos.md#assinatura-e-bloqueio-por-inadimplência):
bloquear escrita, **nunca** leitura nem exportação. Sequestrar dado para forçar
pagamento contradiz o princípio 5 da [visão](../produto/visao.md#princípios-de-produto)
e transforma inadimplente em detrator.

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

### DEC-012 — Criação de usuário e cupons

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Status**   | 🔴 Aberta                                                                                                          |
| **Dono**     | Produto                                                                                                            |
| **Prazo**    | Sprint 3                                                                                                           |
| **Bloqueia** | [RF-114](../produto/requisitos-funcionais.md), RF-115 · [US-056](../produto/user-stories.md#us-056--aplicar-cupom) |

Herdada da apresentação. **Decidir:** há autocadastro ou só por convite? Existe
indicação entre lojistas? Cupom é desconto percentual, valor fixo ou período
grátis? Cumulativo? Quem emite?

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

### DEC-015 — Modelo de conta no PSP: uma por lojista vs. split na conta da plataforma

|              |                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                                                                                   |
| **Dono**     | Produto + jurídico                                                                                                                          |
| **Prazo**    | Antes de fechar contrato com o PSP                                                                                                          |
| **Bloqueia** | `packages/payments` · onboarding ([E1](../produto/user-stories.md#e1--onboarding--empresa)) · [M3](../produto/visao.md#métricas-de-sucesso) |

**Contexto.** Descoberto na avaliação da
[PagMaxx](../arquitetura/integracoes/pagmaxx.md#5-uma-conta-pagmaxx-por-lojista--atrito-de-onboarding):
_"cada estabelecimento opera com suas próprias credenciais"_, com credenciamento
por envio de documentos e aprovação humana.

| Opção                            | Prós                                                                      | Contras                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Conta por lojista**            | Dinheiro vai direto ao lojista; responsabilidade regulatória fica com ele | KYC com aprovação humana no onboarding — atrito contra [M3](../produto/visao.md#métricas-de-sucesso) |
| **Split na conta da plataforma** | Onboarding quase instantâneo                                              | O dinheiro passa por nós — muda a natureza regulatória do negócio e exige análise jurídica           |

**Recomendação.** Conta por lojista, com o credenciamento **fora do caminho
crítico** do onboarding: a lojista vende, registra e emite nota desde o primeiro
minuto; Pix e link de pagamento ficam pendentes até a aprovação. Preserva M3 sem
assumir risco regulatório de instituição de pagamento.

Exige validação jurídica junto com [QST-004](#qst-004).

---

### DEC-016 — Revisão jurídica dos termos de uso e da política de privacidade

|              |                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**   | 🔴 Aberta                                                                                                                                         |
| **Dono**     | Fundadores + jurídico                                                                                                                             |
| **Prazo**    | **Antes de qualquer cadastro real** — o formulário exige o aceite                                                                                 |
| **Bloqueia** | Operação comercial · [RF-125](../produto/requisitos-funcionais.md)–128 na parte de canal de atendimento ao titular · publicação nas lojas de apps |

**Contexto.** A NR-085 criou as três páginas — [termos de
uso](../../apps/web/src/app/termos-de-uso/page.tsx), [política de
privacidade](../../apps/web/src/app/politica-de-privacidade/page.tsx) e
[política de cookies](../../apps/web/src/app/politica-de-cookies/page.tsx). Até
então o formulário de cadastro exigia marcar _"li e aceito"_ com os dois links
apontando para **404**: um aceite que, se questionado, não teria o que exibir.

O que está escrito nelas é o que dá para afirmar a partir do código — quais
tabelas existem, o que a exportação cobre, o que a anonimização preserva e por
quê, como a sessão é guardada. **A política de cookies está completa**, porque é
inventário de fato e é gerada a partir de
[`lib/cookies.ts`](../../apps/web/src/lib/cookies.ts).

**O que falta, e não dá para inferir de código nenhum:**

| Lacuna                                       | Por que só o negócio decide                                             |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Razão social e CNPJ do controlador           | Depende da constituição da empresa e da [DEC-001](#dec-001) (nome)      |
| Contato do encarregado (LGPD art. 41)        | Exige uma pessoa designada, não um endereço genérico                    |
| Prazo de retenção após encerramento da conta | Escolha de negócio acima do mínimo fiscal, que já são 5 anos            |
| Lista completa de operadores                 | Depende de DEC-003, 005, 006, 007 e 009 — cada fornecedor é um operador |
| Preço, prazo de pagamento e nível de serviço | [DEC-010](#dec-010) e [DEC-006](#dec-006)                               |
| Limite de responsabilidade, rescisão e foro  | Cláusula contratual; escrita por quem responde por ela                  |

**Por que as lacunas estão visíveis na página, e não preenchidas com texto
plausível.** Documento com cara de oficial e conteúdo inventado é pior que a
lacuna declarada: ninguém desconfia de um documento que parece completo. No caso
do limite de responsabilidade, seria pior ainda — prometeria ao lojista uma
proteção que ninguém se comprometeu a dar.

Cada lacuna aparece marcada no ponto exato do documento, e não num aviso geral
no topo, que se aprende a ignorar na segunda visita.

**O que esta decisão exige.** Um profissional revisar o que está escrito e
preencher o que está marcado. O material factual já está pronto — a revisão
parte dele, em vez de começar de uma página em branco.

---

## Perguntas em aberto

Resolvem-se com informação, não com escolha. Uma pergunta respondida vira
atualização de documento — e às vezes abre uma `DEC`.

| ID                              | Pergunta                                                                                                                  | Para quem            | Por que importa                                                                                                                                                    | Prazo             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| <a id="qst-001"></a>**QST-001** | Quantos lojistas se espera nos primeiros 12 meses?                                                                        | Produto              | Dimensiona [RNF-016/017](../produto/requisitos-nao-funcionais.md) e o custo de [DEC-009](#dec-009)                                                                 | Sprint 1          |
| <a id="qst-002"></a>**QST-002** | Qual o preço da mensalidade e quantos planos?                                                                             | Produto              | [RNF-072](../produto/requisitos-nao-funcionais.md) e [RNF-074](../produto/requisitos-nao-funcionais.md) são percentuais dela — sem o valor, não há como verificar  | Sprint 1          |
| <a id="qst-003"></a>**QST-003** | Existe lojista-piloto comprometido em usar o MVP?                                                                         | Produto              | Sem piloto não há como validar o [critério de saída do MVP](../produto/escopo-mvp.md#critérios-de-saída-do-mvp)                                                    | Sprint 1          |
| <a id="qst-004"></a>**QST-004** | Quem é controlador e quem é operador de dados na LGPD?                                                                    | Jurídico             | Define quem responde por vazamento e o que vai no contrato — ver [`seguranca.md`](../arquitetura/seguranca.md#lgpd)                                                | Sprint 2          |
| <a id="qst-005"></a>**QST-005** | Qual contador valida o formato de exportação?                                                                             | Produto              | [RF-087](../produto/requisitos-funcionais.md) sem validação real vira retrabalho                                                                                   | Sprint 4          |
| <a id="qst-006"></a>**QST-006** | As [personas](../produto/personas.md) foram validadas com lojistas reais?                                                 | Produto              | Hoje são inferência a partir da apresentação comercial                                                                                                             | Sprint 2          |
| <a id="qst-007"></a>**QST-007** | As metas [M1–M7](../produto/visao.md#métricas-de-sucesso) são realistas?                                                  | Produto              | São hipóteses; meta errada leva a decisão errada                                                                                                                   | Sprint 2          |
| <a id="qst-008"></a>**QST-008** | Os alvos numéricos dos [RNFs](../produto/requisitos-nao-funcionais.md) batem com o aparelho e a internet do público-alvo? | Produto + Trilha 3   | Calibrados por estimativa, não por medição                                                                                                                         | Sprint 3          |
| <a id="qst-009"></a>**QST-009** | A PagMaxx pode estender o escopo da API Key para Pix, links e assinaturas?                                                | PagMaxx              | Hoje essas rotas exigem guardar **e-mail e senha** da conta — ver [a ressalva](../arquitetura/integracoes/pagmaxx.md#3-autenticação-server-to-server-é-incompleta) | Antes do contrato |
| <a id="qst-010"></a>**QST-010** | A PagMaxx tem ou terá API de captura presencial (maquininha, TEF, tap-on-phone)?                                          | PagMaxx              | Mudaria completamente o desenho do PDV — ver [a lacuna](../arquitetura/integracoes/pagmaxx.md#a-lacuna-não-há-api-de-venda-presencial)                             | Antes do contrato |
| <a id="qst-011"></a>**QST-011** | ProComércio é a marca guarda-chuva e este ERP é uma das soluções dela, ou é o nome do próprio ERP?                        | Produto / fundadores | Resolve [DEC-001](#dec-001) e define qual das 5 paletas derivadas o produto usa                                                                                    | Sprint 1          |
| <a id="qst-012"></a>**QST-012** | Já existe conta PagMaxx ativa e acesso ao ambiente de homologação?                                                        | Produto              | Sem homologação não há como testar `packages/payments`                                                                                                             | Sprint 2          |

---

## Decisões tomadas

Fechadas viram ADR em [`adr/`](adr/). A âncora `DEC-xxx` permanece para os
links que já apontam para cá.

| ADR                                                     | Decisão                                               | Data       |
| ------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| [ADR-0001](adr/0001-rls-por-linha.md)                   | Isolamento multi-tenant por RLS por linha             | 2026-09-01 |
| [ADR-0002](adr/0002-autenticacao-identidade-propria.md) | Identidade e autorização próprias, prova terceirizada | 2026-09-03 |

### <a id="dec-002"></a>DEC-002 — Estratégia multi-tenant

|             |                                                       |
| ----------- | ----------------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0001](adr/0001-rls-por-linha.md)   |
| **Escolha** | RLS por linha (`company_id` + política no PostgreSQL) |
| **Data**    | 2026-09-01                                            |

Consequências no código: [`dados.md`](../arquitetura/dados.md#multi-tenant).
Materialização em `packages/db` (`NR-007`).

### <a id="dec-008"></a>DEC-008 — Autenticação e vínculo do número de WhatsApp

|             |                                                                              |
| ----------- | ---------------------------------------------------------------------------- |
| **Status**  | 🟢 Decidida — [ADR-0002](adr/0002-autenticacao-identidade-propria.md)        |
| **Escolha** | Identidade, papel e sessão são nossos; a prova de identidade entra por porta |
| **Data**    | 2026-09-03                                                                   |

**A segunda pergunta também foi respondida:** o vínculo do número **não** basta
para operação que muda acesso ou tira valor de dentro, e o eixo é **tipo de
ação**, não valor — piso monetário transforma o ataque em aritmética. A tabela
das operações que exigem segundo canal está em
[`seguranca.md`](../arquitetura/seguranca.md#o-que-o-vínculo-do-número-não-autoriza).

**O que a ADR corrigiu:** a documentação afirmava que a confirmação explícita de
`RF-103` contrabalançava o SIM swap. Não contrabalança — ela chega e é
respondida no mesmo canal que o atacante controla. Segue valendo como controle
de usabilidade.

Escolher entre provedor gerenciado e biblioteca auto-hospedada depende da
[DEC-009](#dec-009) e **não bloqueia código**: as duas implementam a mesma
porta.

## Documentos relacionados

- [ADRs](adr/) — decisões fechadas, com o contexto da época
- [Task Ledger](../processo/task-ledger.md) — o que cada decisão bloqueia
- [Princípios](../arquitetura/principios.md) — o que **não** é negociável
