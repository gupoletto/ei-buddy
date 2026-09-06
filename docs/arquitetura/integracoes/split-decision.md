# Split Asaas — a plataforma fica com uma fatia da venda?

Pergunta de produto, ainda **aberta**
([DEC-018](../../decisoes/README.md#dec-018)):

> Além da mensalidade do software, a plataforma tira um pedaço de **cada
> venda** que passa pelo Asaas?

Isto **não** é especificação para implementar. O código **não** manda `split[]`
até a DEC fechar. Formato dos campos: `[asaas.md](asaas.md#split-só-o-formato-não-implementar)`.
A conta Asaas por loja (KYC no Asaas, não no nosso app) **já está fechada** em
[ADR-0008](../../decisoes/adr/0008-subconta-asaas-nao-baas.md) — é outro assunto.

Termos: `[asaas.md](asaas.md#termos-em-uma-linha)`.

Fonte: [Split de pagamentos](https://docs.asaas.com/docs/split-de-pagamentos) ·
[Split em cobranças avulsas](https://docs.asaas.com/docs/split-em-cobrancas-avulsas) ·
[Split em assinaturas](https://docs.asaas.com/docs/split-em-assinaturas) ·
[Links vs cobrança](https://docs.asaas.com/docs/link-de-pagamentos)

---

## Em uma analogia

Três jeitos de a mercearia e o software se relacionarem com o dinheiro da venda:

| Opção | Analogia                                                                          | Quem “segura” o dinheiro primeiro |
| ----- | --------------------------------------------------------------------------------- | --------------------------------- |
| **A** | Só cobramos o **aluguel** do sistema (mensalidade). A venda inteira é da loja.    | A loja                            |
| **B** | A loja recebe; na hora do Pix o Asaas **desvia um percentual** para nós.          | A loja (nós só pegamos a fatia)   |
| **C** | O cliente paga **a plataforma**; nós repassamos o resto à loja. Tipo marketplace. | Nós                               |

A e B cabem no desenho atual (a loja tem a conta Asaas dela). C mistura o
caixa da plataforma com o caixa da loja — é o modelo que a
[ADR-0006](../../decisoes/adr/0006-conta-pagmaxx-por-lojista.md) rejeitou e a
[ADR-0008](../../decisoes/adr/0008-subconta-asaas-nao-baas.md) mantém fora.

---

## O que o Asaas chama de Split

Na hora de criar a cobrança (`POST /v3/payments`), dá para listar carteiras
que levam um pedaço:

```json
"split": [
  { "walletId": "…-conta-pai-…", "percentualValue": 2.5 },
  { "walletId": "…-outra-…", "fixedValue": 5.00 }
]
```

Em português:

- Ou um **valor fixo** (`fixedValue`), ou um **percentual** (`percentualValue`)
  — o percentual é sobre o **líquido** (`netValue`), não sobre o preço cheio.
- Só se informa quem **recebe** recorte. O que sobra fica com quem **emitiu**
  a cobrança.
- Quando cada fatia liquida, o Asaas avisa `PAYMENT_SPLIT_DONE` (um aviso por
  pedaço).
- Se os números não fecham: `PAYMENT_SPLIT_DIVERGENCE_BLOCK` (trava).
- Mandar `split: []` ou `null` numa atualização **desliga** o Split.
- Restaurar uma cobrança apagada **não** traz o Split de volta — tem que
  configurar de novo.
- **Link de pagamento não aceita Split.** Se quisermos fatia + “manda o link
  no WhatsApp”, o caminho é cobrança avulsa + URL da fatura (`invoiceUrl`),
  não o recurso de payment link.

---

## Opção A — sem Split (só mensalidade)

A cobrança da venda usa a chave da **loja**. O valor líquido inteiro cai na
carteira dela.

Nós ganhamos só com `POST /v3/subscriptions` na conta da plataforma (jornada H:
a loja paga o software).

| Prós                                      | Contras                                      |
| ----------------------------------------- | -------------------------------------------- |
| O dinheiro da venda não passa por nós     | Sem comissão por venda; margem = mensalidade |
| Link e cobrança “na hora” funcionam igual | Ligar Split depois exige mudar o adapter     |
| Sem avisos extras de Split                | —                                            |
| Casa com “KYC fora do caminho crítico”    | —                                            |

É o recorte de hoje: Pix, boleto, link e cartão na conta da loja.

---

## Opção B — a loja cobra; o Asaas desvia uma fatia para nós

Mesmo `POST /v3/payments` na conta da **loja**. No array `split`, a carteira
da **plataforma** (`ASAAS_WALLET_ID`) + percentual ou valor fixo. O resto
fica com o lojista.

| Prós                                               | Contras                                                    |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Comissão cai sozinha quando a venda liquida        | O **link** de pagamento do Asaas **não** serve nessa venda |
| Menos “o dinheiro passou por nós” do que a opção C | Avisos `PAYMENT_SPLIT_*` e trava se o valor divergir       |
| Mensalidade do software continua à parte           | Precisa decidir % ou R$ e o que acontece no estorno        |
| Já vamos gravar a carteira da loja                 | Restaurar cobrança perde o Split                           |

Assinatura Asaas **do lojista para o cliente dele** (recorrência na mercearia)
seria outro fluxo. A **nossa** mensalidade não usa Split.

---

## Opção C — o cliente paga a plataforma; nós repassamos a loja

Marketplace clássico: autenticamos com a chave **nossa**. O dinheiro entra na
plataforma; o `split` manda o resto para a carteira da loja.

| Prós                      | Contras                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| Um só emissor de cobrança | O valor da venda transita por nós — cheiro de instituição de pagamento |
| Controle da comissão      | É o que a ADR-0008 **não** quer: custódia                              |
|                           | KYC e saldo nossos misturam aluguel do software e dinheiro de lojista  |

Fica na mesa para ninguém “descobrir” depois. **Não** é o default.

---

## Comparação

|                                        | A — sem Split    | B — fatia na conta da loja  | C — fatia na conta nossa |
| -------------------------------------- | ---------------- | --------------------------- | ------------------------ |
| Quem emite a cobrança da venda         | a loja           | a loja                      | a plataforma             |
| Onde o saldo da venda aparece primeiro | carteira da loja | loja + fatia nossa          | nós, depois a loja       |
| Como ganhamos                          | mensalidade      | mensalidade + comissão      | comissão (e mensalidade) |
| Avisos a mais                          | não              | `PAYMENT_SPLIT_*`           | `PAYMENT_SPLIT_*`        |
| Link de pagamento Asaas                | sim              | **não** (usar `invoiceUrl`) | **não**                  |
| Gravar agora, sem decidir              | carteira da loja | idem + `ASAAS_WALLET_ID`    | idem                     |
| Se fechar assim                        | —                | recorte do split no payload | idem                     |
| Peso regulatório                       | menor            | fatia nossa por venda       | custódia maior           |

---

## O que o código pode fazer **sem** a DEC

- Guardar `company_asaas.wallet_id` (já vem na criação da conta da loja).
- Deixar `ASAAS_WALLET_ID` na lista de variáveis (carteira nossa) — vazio no
  computador do desenvolvedor.
- A porta `PaymentGateway` aceita `split` opcional; o adapter real **só envia**
  quando DEC-018 fechar. Não escrever “nunca vai ter split”.
- Não criar tabela de split no draft `0001`.

Quando a DEC fechar: ADR **nova** (não reescrever 0007/0008). O mesmo PR
atualiza `asaas.md`, este arquivo (status) e, se for B ou C, o adapter.

## Documentos relacionados

- `[asaas.md](asaas.md)`
- `[fluxo-asaas.md](fluxo-asaas.md)`
- [DEC-018](../../decisoes/README.md#dec-018)
- [ADR-0007](../../decisoes/adr/0007-asaas.md)
- [ADR-0008](../../decisoes/adr/0008-subconta-asaas-nao-baas.md)

# **Métodos de pagamento compatíveis com Split**

Com base na documentação da API, o Split de Pagamentos pode ser configurado em cobranças com os seguintes métodos de pagamento (**billingType**):

- **Boleto bancário** (`BOLETO`)
- **Cartão de crédito** (`CREDIT_CARD`)
- **Pix** (`PIX`)

## **Como funciona**

O Split é configurado através do array `split` na criação da cobrança, independentemente do método de pagamento escolhido. Exemplo:

JSON

```
{
  "customer": "cus_G7Dvo4iphUNk",
  "billingType": "PIX",
  "value": 100.00,
  "dueDate": "2025-07-15",
  "split": [
    {
      "walletId": "48548710-9baa-4ec1-a11f-9010193527c6",
      "fixedValue": 20.00
    },
    {
      "walletId": "0b763922-aa88-4cbe-a567-e3fe8511fa06",
      "percentualValue": 10.00
    }
  ]
}
```

## **Tipos de repasse disponíveis**

| **Campo**         | **Descrição**                                                  |
| ----------------- | -------------------------------------------------------------- |
| `fixedValue`      | Valor fixo repassado por cobrança                              |
| `percentualValue` | Percentual sobre o valor líquido (`netValue`)                  |
| `totalFixedValue` | Valor total distribuído entre parcelas (somente parcelamentos) |

## **Onde o Split pode ser aplicado**

Além de cobranças avulsas, o Split também pode ser configurado em:

- **Parcelamentos**
- **Assinaturas**

Para acompanhar a liquidação dos Splits, utilize o evento de Webhook `PAYMENT_SPLIT_DONE`.

Para mais detalhes, consulte a ++[documentação de Split de Pagamentos](https://docs.asaas.com/docs/split-de-pagamentos)++.

More information:

- ++[Criar cobrança com cartão de crédito](https://docs.asaas.com/reference/criar-cobranca-com-cartao-de-credito)++
- ++[Splits](https://docs.asaas.com/reference/splits)++
