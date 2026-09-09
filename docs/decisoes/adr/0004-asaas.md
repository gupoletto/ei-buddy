---
adr: 0004
titulo: Asaas como PSP das vendas e da assinatura SaaS
status: aceita
data: 2026-09-04
decisores:
  - Produto
  - Trilha 2 — Plataforma & Integrações
substitui: null
substituida_por: null
---

# ADR-0004 — Asaas como PSP das vendas e da assinatura SaaS

|                       |                                                                  |
| --------------------- | ---------------------------------------------------------------- |
| **Status**            | Aceita                                                           |
| **Data**              | 2026-09-04                                                       |
| **Decisores**         | Produto + Trilha 2                                               |
| **Decisão de origem** | [DEC-006](../README.md#dec-006), [DEC-010](../README.md#dec-010) |

## Contexto

Havia dois problemas de cobrança: o dinheiro do lojista (venda) e a nossa
mensalidade. A avaliação da
[`pagmaxx.md`](../../arquitetura/integracoes/pagmaxx.md) cobria os dois,
mas a operação migrou para o Asaas: API Key (`access_token`), subcontas, Pix,
boleto, link, cartão, assinaturas e webhooks documentados.

Não há API de maquininha/TEF. Venda presencial em cartão, se existir, só é
**registrada**. Dinheiro em espécie também só é registrado.

Split por venda (take-rate) **não** entra nesta ADR — [DEC-018](../README.md#dec-018).

## Opções consideradas

### Opção A — Asaas para vendas online e para SaaS

Um fornecedor, dois adapters (`payments` e `billing`).

| Prós                                       | Contras                                        |
| ------------------------------------------ | ---------------------------------------------- |
| Um sandbox, um padrão de webhook, API Key  | Sem captura presencial                         |
| `/v3/subscriptions` cobre o épico de plano | Período de avaliação regulatória nas subcontas |
| Boleto nativo além de Pix/link/cartão      | Titular não-BaaS usa o dashboard Asaas         |

### Opção B — PSP nas vendas e outro provedor na mensalidade

| Prós                            | Contras                     |
| ------------------------------- | --------------------------- |
| Falha de um não derruba o outro | Dois KYC, duas conciliações |

### Opção C — Só registrar pagamento, sem processar

| Prós    | Contras                                                  |
| ------- | -------------------------------------------------------- |
| Sem PCI | Não há Pix/boleto/link que dê baixa sozinho — fura o CRM |

## Decisão

**Escolhemos a opção A.** Vendas cobradas pelo sistema passam pelo Asaas
(Pix, boleto, link, cartão online). Assinatura da plataforma também, na
**conta-pai**. Dinheiro e maquininha, se o lojista usar, são lançamentos
locais.

O que foi abdicado: um segundo fornecedor de billing e a pretensão de TEF no
MVP. `payments` e `billing` continuam pacotes separados: são dois problemas de
negócio; o fornecedor hoje é o mesmo.

Contrato send/receive: [`integracoes/asaas.md`](../../arquitetura/integracoes/asaas.md).
Sequência: [`fluxo-asaas.md`](../../arquitetura/integracoes/fluxo-asaas.md).
Modelo de conta: [ADR-0005](0005-subconta-asaas-nao-baas.md).
Split: [`split-decision.md`](../../arquitetura/integracoes/split-decision.md).

## Consequências

### Positivas

- Autenticação por API Key — encerra [QST-009](../README.md#qst-009)
- Um desenho de webhook (`asaas-access-token` + `evt_…`)
- Tarifas (`GET /v3/myAccount/fees/`) alimentam `CardFeeTable` **fora** do
  fechamento da venda

### Negativas

- Decimal da API → `Money.parse` na borda, sempre
- Subconta não-BaaS: o lojista completa KYC no Asaas, não nas nossas telas
- Período de avaliação (10 subcontas / R$ 2.000 / 60 dias) no go-live

### Neutras

- Adapters falsos (`PAYMENTS_PROVIDER=fake`, `BILLING_PROVIDER=fake`) seguem
  obrigatórios no local
- Array `split` fica na porta, desligado até DEC-018

## Impacto na documentação

- [x] `docs/arquitetura/integracoes/asaas.md`, `fluxo-asaas.md`, `split-decision.md`
- [x] `packages/payments/README.md`, `packages/billing/README.md`
- [x] `DEC-006` e `DEC-010` apontam para esta ADR

## Quando revisitar

- Asaas entregar captura presencial (mudaria o PDV)
- Custo ou estabilidade inviáveis
- [DEC-018](../README.md#dec-018) — Split
- BaaS (eixo da ADR-0005, não desta)
