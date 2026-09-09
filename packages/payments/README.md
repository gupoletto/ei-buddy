# payments

Adapter de PSP — o dinheiro do **lojista**.

**Estado:** 🟡 porta e adapter falso prontos (`NR-043`) · ⬜ adapter Asaas liberado (`NR-044`) — [ADR-0004](../../docs/decisoes/adr/0004-asaas.md), [ADR-0005](../../docs/decisoes/adr/0005-subconta-asaas-nao-baas.md)

## Responsabilidade

Gerar cobrança Pix, criar link de pagamento, estornar, e manter a tabela de
tarifas atualizada.

**O que não faz:** decidir regra de negócio. O adapter traduz entre a porta e o
provedor — nada mais.

## Fronteiras

|                       |                                                             |
| --------------------- | ----------------------------------------------------------- |
| **Implementa**        | `PaymentGateway`, declarada por [`core`](../core/README.md) |
| **Depende de**        | `contracts`, `money`                                        |
| **Proibido importar** | `core`, `db`, `domain` — a seta aponta para dentro          |
| **Quem depende**      | a raiz de composição de `api` e `worker`                    |

A proibição de importar `core` é verificada na CI pela regra
`adapter-nao-importa-core`. Adapter que conhece `core` não é substituível — e
substituibilidade é a única razão de ele existir.

### Onde a porta se afasta do esboço do `pagmaxx.md`

O esboço em
[`integracoes/pagmaxx.md`](../../docs/arquitetura/integracoes/pagmaxx.md#novo-módulo-packagespayments)
previa duas assinaturas que **não são implementáveis** sob a regra de
fronteiras, e a porta real ajustou as duas:

| Esboço                                   | Porta                              | Por quê                                                                                                                        |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `fetchFeeTable(): Promise<CardFeeTable>` | `fetchFeeQuotes(): FeeQuoteResult` | `CardFeeTable` mora em `packages/domain`, e a CI proíbe `payments → domain`. O adapter cota, **`core` traduz**.                |
| `refund(paymentId, amount?: Money)`      | `refund(RefundRequest)`            | dinheiro atravessa a porta em centavo inteiro, como no resto de `contracts`. `Money` é o tipo de cálculo de `core` e `domain`. |

Também ganhou `readWebhook`, que o esboço não previa: validar o HMAC é
responsabilidade do adapter, porque o segredo é configuração dele.

## Candidato: PagMaxx

Avaliação completa em
[`integracoes/pagmaxx.md`](../../docs/arquitetura/integracoes/pagmaxx.md).

**Cobre:** Pix, link de pagamento, cartão online, tokenização, 3DS, estorno,
simulação de taxa e webhooks bem projetados (HMAC-SHA256 sobre corpo bruto, id
de evento para idempotência, reentrega 5×).

**Não cobre:** captura presencial. O cartão do balcão continua na maquininha da
lojista; o sistema registra a venda e calcula a tarifa por tabela configurada.

## Três armadilhas conhecidas

1. **Dinheiro vem como decimal** — `100.50`, `"100.00"` e `129.9` na mesma API.
   A conversão acontece **na borda deste pacote**, com `Money.parse`, nunca com
   `parseFloat` seguido de aritmética.
2. **A resposta de `simulate-fee` não tem contrato estável** — é repassada da
   adquirente. Não chame no fechamento da venda: alimente a `CardFeeTable` de
   [`domain`](../domain/README.md) periodicamente.
3. **`payment.approved` nunca é disparado** — quem confirma pagamento é
   `payment.authorized`. E `type` pode vir nulo; nesse caso ignore o evento.

## Webhook

Valide o HMAC sobre o **corpo bruto**, antes de qualquer `JSON.parse` —
reserializar muda os bytes e a verificação falha. Responda 200 rápido e
processe na fila `webhook-process`.

## A porta

| Método              | Requisito | Nota                                                            |
| ------------------- | --------- | --------------------------------------------------------------- |
| `createPixCharge`   | RF-034    | idempotente por `externalReference`                             |
| `getPixCharge`      | —         | rede de segurança para quando o webhook se perde                |
| `createPaymentLink` | RF-068    | é o link que a cobrança por WhatsApp manda                      |
| `refund`            | RF-067    | total ou parcial; recusa é **resultado**, não exceção           |
| `fetchFeeQuotes`    | RF-038    | **não** chamar no fechamento da venda — RNF-003, RNF-041        |
| `readWebhook`       | RNF-028   | recebe o **corpo bruto**; síncrona, porque é HMAC local sem I/O |

`readWebhook` distingue quatro casos porque eles pedem **códigos HTTP
diferentes** — e é aí que a implementação ingênua gera bug:

| Caso                | Resposta     | Por quê                                                       |
| ------------------- | ------------ | ------------------------------------------------------------- |
| `accepted`          | 200, na fila | processa fora do ciclo da requisição                          |
| `ignored`           | 200          | evento que não nos interessa; 4xx faria o provedor reentregar |
| `invalid_signature` | 401          | **não** é 200: 200 ensina o atacante que o corpo foi aceito   |
| `malformed`         | 400          | assinatura válida, corpo ilegível — isso é bug do provedor    |

## Modo falso

`PAYMENTS_PROVIDER=fake` responde de forma determinística, sem rede. Isso permite
que o sistema suba local sem credencial nenhuma e que o trabalho não espere a
decisão do fornecedor.

**O adapter falso implementa a mesma porta, inclusive os caminhos de erro.**
Falso que só devolve sucesso esconde exatamente o que precisa ser testado.

E aqui isso significa uma coisa concreta: **o falso reproduz as três armadilhas
documentadas acima**, porque falso que não as reproduz não protege de nenhuma
delas.

```ts
import { createFakePaymentGateway } from '@na-regua/payments'

const gateway = createFakePaymentGateway()
const cotando = createFakePaymentGateway({
  feeQuotes: [{ brand: 'visa', installments: 1, feeRatePercent: 3.49 }],
})
```

| Opção                   | O que provoca                                                      |
| ----------------------- | ------------------------------------------------------------------ |
| `webhookSecret`         | troca o segredo do HMAC                                            |
| `feeQuotes`             | cotação disponível — **ausente = `unavailable`**, que é o padrão   |
| `falhaDeInfraestrutura` | **lança**, porque não é resultado de negócio — é job para retentar |

A cotação responde `unavailable` por padrão de propósito: a resposta do
provedor não tem contrato estável, e um falso que sempre cota ensinaria quem
chama a confiar num dado que na vida real falta.

`assinar()` e `corpoDeWebhook()` são apoio de teste — não fazem parte da porta.
`corpoDeWebhook` monta o corpo com `amount` **decimal** e com os campos legados
`event` e `data` preenchidos, para o teste poder provar que o adapter **não**
os usa.

## Testes

| Camada                     | Onde roda                                      |
| -------------------------- | ---------------------------------------------- |
| Contrato da porta          | CI — falso e real satisfazem a **mesma** suíte |
| Contra sandbox do provedor | manual ou agendado, fora do PR                 |
| Corpo de webhook gravado   | CI — inclusive os casos estranhos documentados |

A suíte de contrato está em
[`src/payment-gateway-contract.ts`](src/payment-gateway-contract.ts) e **não
conhece o falso**, só a porta:

```ts
verificarContratoDoGateway('FakePaymentGateway', () => createFakePaymentGateway())
```

Ficam fora dela os testes que exigem o segredo do webhook (o real lê de
`PAGMAXX_WEBHOOK_SECRET`) e a injeção de falha do provedor. O que **não** fica
fora é assinatura inválida: essa é propriedade universal e vale para qualquer
implementação.

Ela não é exportada pelo `index.ts` de propósito — importa `vitest`, que é
dependência de desenvolvimento.

## Variáveis de ambiente

`PAYMENTS_PROVIDER`, `PAGMAXX_BASE_URL`, `PAGMAXX_API_KEY`,
`PAGMAXX_ACCOUNT_EMAIL`, `PAGMAXX_ACCOUNT_PASSWORD`, `PAGMAXX_WEBHOOK_SECRET`.

⚠️ `PAGMAXX_ACCOUNT_PASSWORD` é **senha de conta**, não chave com escopo
restrito — a API exige isso para Pix, links e assinaturas
([QST-009](../../docs/decisoes/README.md#qst-009)).

Ver [`ambientes.md`](../../docs/engenharia/ambientes.md).
