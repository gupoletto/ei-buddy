# billing

Adapter de assinatura SaaS — a **nossa** mensalidade.

**Estado:** 🔴 não implementado · ⬜ provedor Asaas decidido ([ADR-0004](../../docs/decisoes/adr/0004-asaas.md)) · `NR-063` na fila da `NR-044`

## Responsabilidade

Cobrar a mensalidade da plataforma: planos, período de teste, recorrência,
inadimplência e bloqueio.

**O que não faz:** decidir regra de negócio. O adapter traduz entre a porta e o
provedor — nada mais.

## Fronteiras

|                       |                                                                   |
| --------------------- | ----------------------------------------------------------------- |
| **Implementa**        | `SubscriptionProvider`, declarada por [`core`](../core/README.md) |
| **Depende de**        | `contracts`, `money`                                              |
| **Proibido importar** | `core`, `db`, `domain` — a seta aponta para dentro                |
| **Quem depende**      | a raiz de composição de `api` e `worker`                          |

A proibição de importar `core` é verificada na CI pela regra
`adapter-nao-importa-core`. Adapter que conhece `core` não é substituível — e
substituibilidade é a única razão de ele existir.

## Por que separado de `payments`

São **dois problemas de negócio diferentes**: aqui é a nossa receita; em
[`payments`](../payments/README.md) é o dinheiro do lojista. Podem usar o mesmo
fornecedor hoje ([PagMaxx](../../docs/arquitetura/integracoes/pagmaxx.md)) e
fornecedores diferentes amanhã, sem que um afete o outro.

## O que a porta precisa cobrir

| Capacidade                                              | Requisito                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Iniciar período de teste com prazo e limites explícitos | [RF-110](../../docs/produto/requisitos-funcionais.md)                                                        |
| Ativar assinatura após confirmação de pagamento         | [RF-112](../../docs/produto/requisitos-funcionais.md)                                                        |
| Aplicar cupom, recusando expirado ou já usado           | [RF-114](../../docs/produto/requisitos-funcionais.md), [RF-115](../../docs/produto/requisitos-funcionais.md) |
| Notificar inadimplência com prazo até o bloqueio        | [RF-116](../../docs/produto/requisitos-funcionais.md)                                                        |
| Restringir escrita, **mantendo leitura e exportação**   | [RF-117](../../docs/produto/requisitos-funcionais.md)                                                        |
| Restaurar acesso em minutos após pagamento              | [RF-118](../../docs/produto/requisitos-funcionais.md)                                                        |

## Restrição não é bloqueio total

Decisão de produto, não limitação técnica: o lojista inadimplente continua
**lendo e exportando** os dados dele. Sequestrar dado para forçar pagamento
contradiz o princípio 5 da [visão](../../docs/produto/visao.md#princípios-de-produto)
e transforma inadimplente em detrator. Ver
[o diagrama de estados](../../docs/arquitetura/fluxos.md#assinatura-e-bloqueio-por-inadimplência).

## Modo falso

`BILLING_PROVIDER=fake` responde de forma determinística, sem rede. Isso permite
que o sistema suba local sem credencial nenhuma e que o trabalho não espere a
decisão do fornecedor.

**O adapter falso implementa a mesma porta, inclusive os caminhos de erro.**
Falso que só devolve sucesso esconde exatamente o que precisa ser testado.

## Testes

| Camada                     | Onde roda                                      |
| -------------------------- | ---------------------------------------------- |
| Contrato da porta          | CI — falso e real satisfazem a **mesma** suíte |
| Contra sandbox do provedor | manual ou agendado, fora do PR                 |
| Corpo de webhook gravado   | CI — inclusive os casos estranhos documentados |

## Variáveis de ambiente

Usa as mesmas credenciais `PAGMAXX_*` de [`payments`](../payments/README.md),
com `/subscriptions/*`.

Ver [`ambientes.md`](../../docs/engenharia/ambientes.md).
