# Fluxos

Sequências ponta a ponta dos caminhos críticos. Mostram os
[princípios](principios.md) em ação — em especial a convergência dos dois canais
no mesmo caso de uso.

---

## Venda completa

O caminho crítico do produto. Requisitos: RF-027 a RF-044 · RNF-003, RNF-004,
RNF-043, RNF-046.

```mermaid
sequenceDiagram
    autonumber
    actor F as Funcionário
    participant M as apps/mobile
    participant A as apps/api
    participant C as core.registerSale
    participant D as domain
    participant DB as PostgreSQL
    participant Q as fila (Redis)
    participant W as apps/worker
    participant FI as fiscal → Focus NFe

    F->>M: bipa produtos, escolhe cliente e pagamento
    Note over M: carrinho é local — RNF-051<br/>rede instável não trava o balcão
    M->>A: POST /v1/sales + Idempotency-Key
    A->>A: valida com contracts + monta ExecutionContext
    A->>C: registerSale(deps, ctx, input)

    C->>DB: verifica chave de idempotência
    alt chave já usada
        DB-->>C: venda existente
        C-->>A: 200 com a mesma venda (RNF-043)
    else chave nova
        C->>D: calculateSaleTotals(itens, pagamentos, regras, tarifas)
        D-->>C: bruto, custo, imposto, tarifa, líquido, margem

        rect rgba(90,140,200,0.12)
            Note over C,DB: uma única transação — RNF-046
            C->>DB: grava Sale + SaleItems + Payments
            C->>DB: baixa estoque (InventoryMovement)
            C->>DB: cria Receivable por parcela, com valor líquido
            C->>DB: atualiza carteira do cliente (se wallet)
            C->>DB: grava AuditLog (autor, canal, antes/depois)
        end

        C->>Q: enfileira invoice-issue
        C-->>A: venda registrada
        A-->>M: 201 Created
        Note over M: RNF-003: ≤ 1,5 s<br/>sem esperar a Focus — RNF-004
    end

    Q->>W: consome invoice-issue
        W->>FI: emite NFC-e ou NFS-e Nacional
    alt autorizada
        FI-->>W: chave de acesso + XML
        W->>DB: grava nota, XML e estado "autorizada"
        W->>Q: enfileira whatsapp-send (DANFE ao cliente)
    else Focus / autorização indisponível
        W->>DB: marca "em contingência" (RF-052)
        Note over W: retransmite quando voltar — RF-053
    else rejeitada
        FI-->>W: código de rejeição
        W->>DB: grava rejeição traduzida (RF-047)
        Note over W: a venda continua válida — só a nota falhou
    end
```

**Três decisões visíveis aqui:**

1. **A venda fecha antes da nota.** A emissão é assíncrona porque a autorização
   fiscal (Focus → SEFAZ ou Ambiente Nacional) é instável e o balcão não pode
   parar por causa disso. NFS-e Nacional quase sempre fica `processing` até o
   webhook.
2. **Uma transação para tudo que muda valor.** Ou venda, estoque, recebível e
   auditoria mudam juntos, ou nada muda.
3. **A idempotência é verificada antes de qualquer cálculo.** Rede ruim gera
   reenvio; reenvio não pode gerar venda dupla.
4. **Estado visível ao lojista é composto**, não um `status` na venda. Nota,
   recebível e falha de job vivem nas tabelas deles — ver
   [`dados.md`](dados.md#estados-da-venda).
   Falha no `registerSale` = nenhuma linha; falha na Focus/Asaas depois = venda
   existe com o estado filho explícito (RF-054, US-025).

## Venda pelo WhatsApp

O mesmo caso de uso, outro canal. Requisitos: RF-100 a RF-104.

```mermaid
sequenceDiagram
    autonumber
    actor L as Lojista
    participant WA as Provedor WhatsApp
    participant A as apps/api
    participant AG as packages/agent
    participant LLM as Provedor LLM
    participant C as core.registerSale

    L->>WA: "venda pro João: 2 camisetas M a 49,90, pagou no Pix"
    WA->>A: webhook
    A->>A: verifica assinatura do webhook (RNF-028)
    A->>AG: processMessage(companyId, from, texto)

    AG->>AG: número vinculado à empresa? (RF-095)
    alt número desconhecido
        AG-->>WA: ignora, sem revelar informação
    end

    AG->>AG: carrega contexto da conversa (RF-105)
    AG->>LLM: mensagem + contexto + tools geradas de contracts
    LLM-->>AG: tool call registerSale(...)

    AG->>AG: resolve cliente e produtos
    alt produto ambíguo
        AG-->>L: "Camiseta M azul ou branca?" (RF-102)
        L->>AG: responde
    end

    rect rgba(200,150,60,0.15)
        Note over AG,L: ação que mexe em valor exige confirmação — RF-103
        AG-->>L: "Venda para João: 2× Camiseta M — R$ 99,80 no Pix. Confirma?"
        alt confirma
            L->>AG: "sim"
        else recusa, ambiguidade ou tempo esgotado
            L->>AG: outra coisa / silêncio
            AG-->>L: cancelado, nada foi criado (RF-104)
        end
    end

    AG->>C: registerSale(deps, ctx{channel:'whatsapp'}, input)
    Note over C: daqui em diante é IDÊNTICO ao fluxo do app:<br/>mesmos cálculos, mesma transação, mesma auditoria
    C-->>AG: venda registrada
    AG-->>L: "Pronto. Venda #1042 — R$ 99,80. Nota sendo emitida."
```

### Confirmação de ações sensíveis

A regra que separa consulta de ação:

| Tipo de intenção   | Confirmação    | Exemplo                        |
| ------------------ | -------------- | ------------------------------ |
| Leitura            | ❌ não pede    | "quanto vendi hoje?"           |
| Criação de valor   | ✅ obrigatória | lançar venda, lançar conta     |
| Alteração de valor | ✅ obrigatória | mudar preço, alterar recebível |
| Exclusão / estorno | ✅ obrigatória | cancelar venda, estornar baixa |
| Envio a terceiro   | ✅ obrigatória | enviar cobrança ao cliente     |

Uma confirmação pendente expira. Resposta ambígua conta como **não** — o custo
de errar para o lado do "não" é uma pergunta repetida; para o lado do "sim" é um
lançamento financeiro errado.

## Cobrança de cliente inadimplente

Requisitos: RF-068 a RF-072 · RNF-032.

```mermaid
sequenceDiagram
    autonumber
    participant W as apps/worker
    participant C as core
    participant DB as PostgreSQL
    participant WA as whatsapp
    actor CL as Cliente final
    actor L as Lojista

    Note over W: job diário
    W->>C: listOverdueReceivables()
    C->>DB: recebíveis vencidos por empresa
    DB-->>C: lista

    loop cada recebível vencido
        C->>C: cliente tem consentimento? (RNF-032)
        alt sem consentimento
            C->>DB: registra "bloqueado por falta de consentimento"
            Note over C: nunca envia — LGPD
        else com consentimento
            C->>DB: já cobrado hoje?
            alt já cobrado
                Note over C: não reenvia — evita assédio
            else
                C->>WA: envia cobrança (valor, vencimento, origem)
                WA->>CL: mensagem
                C->>DB: registra data e canal do envio (RF-069)
            end
        end
    end

    CL->>L: paga
    L->>C: settleReceivable()
    C->>DB: baixa + atualiza saldo do cliente
    Note over C: cobranças futuras daquele recebível cessam (RF-070)
```

## Conciliação bancária

Fora do recorte A–J. [DEC-005](../decisoes/README.md#dec-005) adiada. Não
implementar `packages/banking` neste recorte.

## Assinatura e bloqueio por inadimplência

Requisitos: RF-110 a RF-118.

```mermaid
stateDiagram-v2
    [*] --> Trial: empresa criada
    Trial --> Ativa: plano contratado e pago
    Trial --> Restrita: trial expirado sem plano

    Ativa --> Vencida: cobrança não paga
    Vencida --> Ativa: pagamento confirmado
    Vencida --> Restrita: prazo de tolerância esgotado

    Restrita --> Ativa: pagamento confirmado
    Restrita --> Encerrada: cancelamento pelo lojista

    Encerrada --> [*]

    note right of Restrita
        Restrita NÃO é bloqueio total:
        • leitura ✅
        • exportação ✅ (RF-126)
        • criar lançamento ❌
        • assistente responde
          informando o bloqueio
    end note
```

O estado `Restrita` é decisão de produto, não limitação técnica: sequestrar o
dado do lojista para forçar pagamento contradiz o princípio 5 da
[visão](../produto/visao.md#princípios-de-produto), e transforma um cliente
inadimplente em detrator.

## Cancelamento de venda com nota emitida

Requisitos: RF-043, RF-050, RF-051.

```mermaid
flowchart TD
    START([lojista pede cancelamento]) --> HASINV{nota emitida?}

    HASINV -->|não| REVERT
    HASINV -->|sim| DEADLINE{dentro do<br/>prazo legal?}

    DEADLINE -->|sim| CANCELNF[cancela na Focus<br/>com justificativa]
    DEADLINE -->|não| REFUSE[recusa o cancelamento<br/>orienta devolução<br/>RF-051]

    CANCELNF --> OK{Focus aceitou?}
    OK -->|não| FAIL[informa o erro<br/>nada é estornado]
    OK -->|sim| REVERT

    REVERT[/"estorno em uma transação:<br/>• estoque volta<br/>• recebíveis cancelados<br/>• carteira restaurada<br/>• auditoria registra quem e por quê"/]
    REVERT --> DONE([venda marcada como cancelada<br/>nunca apagada — RNF-040])

    style REFUSE fill:#7c2d12,color:#fff
    style FAIL fill:#7c2d12,color:#fff
    style DONE fill:#14532d,color:#fff
```

**A ordem importa:** cancela a nota **antes** de estornar. O contrário deixaria
o sistema estornado e a Focus/SEFAZ com nota válida.

## Onboarding até a primeira venda

Alvo: 15 minutos ([M3](../produto/visao.md#métricas-de-sucesso)).

```mermaid
flowchart LR
    A([signup pessoal + plano]) --> B[empresa CNPJ<br/>/app/empresa]
    B --> C[regime tributário]
    C --> D{quer emitir e e<br/>MEI ou Simples sem Hibrido?}
    D -->|nao| F
    D -->|sim| E[A1; CSC se NFC-e<br/>flags NFS-e Nacional]
    E --> F[cadastra 1 produto]
    F --> G[primeira venda]
    G --> H([valor percebido])

    C -.->|opcional, depois| I[vincular WhatsApp]
    B -.->|opcional, depois| K[KYC Asaas<br/>Pix/boleto/link]

    style H fill:#14532d,color:#fff
```

Tudo que não está no caminho principal é adiável. O certificado na Focus é
pulável: venda e estoque funcionam; a nota fica `not_configured`. Empresa
inelegível para emitir ([DEC-017](../decisoes/README.md#dec-017)) segue o mesmo
caminho sem A1. Staff e Open Finance não entram neste fluxo.

## Documentos relacionados

- [Princípios](principios.md) — as regras que estes fluxos respeitam
- [Visão geral](visao-geral.md) — os containers envolvidos
- [Dados](dados.md) — as tabelas tocadas por estas transações
- [Esquema PostgreSQL](esquema-postgresql.md) — catálogo físico
- [User Stories](../produto/user-stories.md) — os critérios de aceite
