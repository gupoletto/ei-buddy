---
adr: 0005
titulo: Subconta Asaas não-BaaS por lojista, KYC fora do caminho crítico
status: aceita
data: 2026-09-04
decisores:
  - Produto
substitui: null
substituida_por: null
---

# ADR-0005 — Subconta Asaas não-BaaS por lojista, KYC fora do caminho crítico

|                       |                                 |
| --------------------- | ------------------------------- |
| **Status**            | Aceita                          |
| **Data**              | 2026-09-04                      |
| **Decisores**         | Produto                         |
| **Decisão de origem** | [DEC-015](../README.md#dec-015) |

## Contexto

O Asaas cria subcontas ligadas a uma conta-pai PJ. Há dois modelos:

- **Não-BaaS:** o titular acessa o Asaas, define senha e envia documentos lá.
- **BaaS:** a jornada de documentos é da nossa plataforma (`onboardingUrl` /
  API), com o produto BaaS contratado.

Split na conta da plataforma faria o dinheiro do lojista passar por nós e
mudaria o enquadramento. Isso **não** se decide aqui — [DEC-018](../README.md#dec-018).

O onboarding do produto (pessoa + plano + cadastro da empresa) não pode
esperar KYC de pagamento. Venda em dinheiro e registro de maquininha existem
sem Asaas. Pix, boleto, link e cartão online ficam pendentes até
`accountStatus.general = APPROVED`.

Documentos da **Focus** (A1, CSC) habilitam nota fiscal. Documentos do
**Asaas** habilitam processar pagamento. São fluxos distintos na tela Empresa.

## Opções consideradas

### Opção A — Subconta não-BaaS por lojista

| Prós                               | Contras                                   |
| ---------------------------------- | ----------------------------------------- |
| Sem contratar BaaS no MVP          | Lojista usa o dashboard Asaas no KYC      |
| Dinheiro da venda na carteira dele | E-mail de ativação e UX fora do nosso app |
| `apiKey` na criação, cofre nosso   | Gestão de keys pós-avaliação pode apertar |

### Opção B — Subconta BaaS

| Prós                                       | Contras                                            |
| ------------------------------------------ | -------------------------------------------------- |
| KYC nas nossas telas                       | Contratar e homologar BaaS (marca Asaas, playbook) |
| Sem e-mail de ativação do Asaas ao titular | Mais superfície de API (`onboardingUrl`, docs)     |

## Decisão

**Escolhemos a opção A.** Credenciamento Asaas fora do caminho crítico:
cadastrar, estoque, venda registrada e NFC-e (se Focus ok) funcionam antes.
Meios Asaas exigem subconta com aprovação geral.

Não misturar com Split: BaaS vs não-BaaS é _quem conduz o KYC_; Split é _quem
fica com uma fatia da venda_.

## Consequências

### Positivas

- [M3](../../produto/visao.md#métricas-de-sucesso) não depende do KYC Asaas
- Captura da `apiKey` no `POST /v3/accounts` (a chave some depois)

### Negativas

- Lojista vê Pix/boleto/link/cartão desabilitados até aprovação
- Duas esteiras de documento (Focus vs Asaas)
- Depois do período de avaliação, keys de subconta com CNPJ diferente da pai
  podem exigir BaaS ou filial do mesmo prefixo

### Neutras

- `wallet_id` gravado mesmo sem Split, para DEC-018 não exigir migration

## Impacto na documentação

- [x] `docs/arquitetura/integracoes/asaas.md`, `fluxo-asaas.md`
- [x] `DEC-015` 🟢 aponta para esta ADR

## Quando revisitar

- Parecer jurídico contrário à subconta por lojista
- Operação pedir BaaS (UX sem dashboard Asaas, gestão de keys)
- Limites do período de avaliação inviabilizarem o piloto
