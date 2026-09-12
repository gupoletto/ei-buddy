---
adr: 0011
titulo: EiBuddy como nome do produto, domínio eibuddy.com.br
status: aceita
data: 2026-09-11
decisores:
  - Produto / fundadores
substitui: null
substituida_por: null
---

# ADR-0011 — EiBuddy como nome do produto, domínio eibuddy.com.br

|                       |                                 |
| --------------------- | ------------------------------- |
| **Status**            | Aceita                          |
| **Data**              | 2026-09-11                      |
| **Decisores**         | Produto / fundadores            |
| **Decisão de origem** | [DEC-001](../README.md#dec-001) |

## Contexto

Três nomes circulavam: o repositório `na-regua`, **ZapGestor** (nome de
trabalho da [apresentação comercial](../../assets/zapgestor-apresentacao.md))
e **ProComércio** (material de rebranding com paleta e marcas derivadas).
Enquanto a [DEC-001](../README.md#dec-001) estava aberta, a documentação
usava ZapGestor provisoriamente e os pacotes ficavam `@na-regua/*` de
propósito, para a marca não forçar rename de workspace.

A decisão trava README, loja de apps, domínio público e o texto que o
lojista vê. Não trava caso de uso: o núcleo não conhece o nome comercial.

Não se sabia, neste momento, se ProComércio era guarda-chuva ou o próprio
ERP ([QST-011](../README.md#qst-011)), nem qual das cinco paletas derivadas
valeriam.

## Opções consideradas

### Opção A — ProComércio guarda-chuva + nome próprio para o ERP

O ERP ganha marca própria; ProComércio fica como ecossistema.

| Prós                                      | Contras                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| Usa o investimento de identidade visual   | Exige escolher o nome do ERP e, em tese, uma paleta derivada    |
| Evita colar o produto na marca guarda-chuva | Duas marcas para um time pequeno explicar                     |

### Opção B — ProComércio é o nome do ERP

Abandona ZapGestor; a paleta já existe.

| Prós                    | Contras                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| Marca e KV prontos      | O material fala em várias soluções, não num ERP único            |
| Sem segundo naming      | Trava o produto a um nome que pode ser o do grupo, não do app    |

### Opção C — Manter ZapGestor

Continua o nome de trabalho da apresentação.

| Prós                         | Contras                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| Já está em PDF e wireframes  | A própria apresentação declara que é nome de trabalho      |
| Zero retrabalho de copy      | Contradiz o investimento no rebranding ProComércio         |

### Opção D — EiBuddy, domínio eibuddy.com.br

Nome próprio para o ERP, grafia única, domínio `.com.br` correspondente.

| Prós                                                         | Contras                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Encerra a ambiguidade ZapGestor / ProComércio / `na-regua`   | Identidade visual (paleta, fontes) ainda não é arte própria do EiBuddy  |
| Domínio alinhado ao `scheme` `eibuddy` já usado no mobile    | DNS, certificado e loja de apps ainda dependem da [DEC-009](../README.md#dec-009) |
| Pacotes podem continuar `@na-regua/*`                        | Nome interno (`na-regua`) ≠ nome comercial — custo consciente de comunicação |

## Decisão

**Escolhemos a opção D — o produto se chama EiBuddy.**

- Grafia oficial: **EiBuddy** (uma palavra, B maiúsculo).
- Domínio público: **eibuddy.com.br**.
- Repositório e escopo npm permanecem `na-regua` / `@na-regua/*`. Trocar o
  nome comercial MUST NOT exigir rename de pacote.

O que foi **abdicado:** ZapGestor como nome de produto; ProComércio como
nome do ERP. ProComércio continua material de origem da paleta provisória
em `packages/ui` — isso não é o nome.

[QST-011](../README.md#qst-011) fecha na parte que importava para a DEC-001:
o ERP **não** se chama ProComércio. Qual paleta definitiva o EiBuddy usa é
troca de tokens, não de marca.

## Consequências

### Positivas

- Documentação, constitution, landing (`BRAND`) e app stores passam a ter
  um nome só.
- A lacuna de "qual domínio público" deixa de bloquear texto legal e
  material comercial — falta só razão social e CNPJ ([DEC-016](../README.md#dec-016)).

### Negativas

- Tokens de cor e fontes ainda são os do ProComércio; haverá retrabalho de
  `packages/ui/src/tokens/` quando existir arte própria.
- Referências históricas (PDF ZapGestor, conversão em
  `docs/assets/zapgestor-apresentacao.md`) ficam como fonte bruta, não como
  nome vigente.

### Neutras

- `apps/mobile` já usava o scheme `eibuddy`.
- Hospedagem, DNS e certificado do domínio esperam a DEC-009.

## Impacto na documentação

Atualizados **no mesmo PR** desta ADR:

- [x] `.specify/memory/constitution.md` (v1.0.1)
- [x] `README.md`, `docs/README.md`, visão C4, personas, wireframes, integrações
- [x] `apps/web/src/content/site.ts` (`BRAND`)
- [x] `DEC-001` marcada como 🟢 e `QST-011` respondida

## Quando revisitar

- Impedimento de marca ou de domínio (registro, app store, conflito).
- Decisão de tratar ProComércio como guarda-chuva visível ao lojista — isso
  não reabre o nome do ERP, só o relacionamento entre marcas.
- Arte de marca própria do EiBuddy (aí troca-se paleta e fonte, não esta ADR).
