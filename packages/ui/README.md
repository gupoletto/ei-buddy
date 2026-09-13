# ui

Tokens de design e componentes compartilhados entre web e mobile.

**Estado:** 🟢 tokens implementados · componentes ainda não · paleta provisória
(ProComércio) até existir arte própria do EiBuddy
([ADR-0011](../../docs/decisoes/adr/0011-eibuddy-nome-e-dominio.md)) · `NR-011`

## Responsabilidade

Tokens (cor, tipografia, espaçamento, raio, elevação) e os componentes que
aparecem nos dois clientes.

**O que não faz:** lógica de negócio, chamada de API, navegação.

## Fronteiras

|                       |                           |
| --------------------- | ------------------------- |
| **Depende de**        | `contracts`, `money`      |
| **Proibido importar** | `core`, `db`, `domain`    |
| **Quem depende**      | `apps/web`, `apps/mobile` |

`money` está aí por um motivo específico: formatar dinheiro é responsabilidade
de apresentação, e `Money.format()` é a única forma correta de fazê-lo.

## Bloqueio de marca

O nome do produto fechou: **EiBuddy**
([ADR-0011](../../docs/decisoes/adr/0011-eibuddy-nome-e-dominio.md)). O
[material de rebranding](../../docs/assets/pro-comercio-rebranding.md) continua
sendo a fonte da paleta provisória (`#1E2A78` `#39C8BD` `#6D33DD`) e das
fontes (BC Alphapipe, BD Colonius) — ProComércio **não** é o nome do ERP.

**Mitigação aplicada:** a paleta provisória vive em
[`src/tokens/color.ts`](src/tokens/color.ts). Quando houver arte própria do
EiBuddy, troca-se esse arquivo — os dois clientes acompanham sem refatoração.

## Restrições que vêm dos requisitos

| Restrição                                             | Requisito                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| Contraste ≥ 4.5:1 (WCAG 2.1 AA)                       | [RNF-055](../../docs/produto/requisitos-nao-funcionais.md) |
| Toda tela tem estado vazio, de carregamento e de erro | [RNF-056](../../docs/produto/requisitos-nao-funcionais.md) |
| Ações principais na metade inferior — uso com uma mão | [RNF-053](../../docs/produto/requisitos-nao-funcionais.md) |
| Mensagem de erro sem jargão nem código cru            | [RNF-054](../../docs/produto/requisitos-nao-funcionais.md) |
| Texto em PT-BR, tom direto                            | [RNF-057](../../docs/produto/requisitos-nao-funcionais.md) |

A terceira vem da persona: a Cláudia usa o sistema **em pé, atrás do balcão, com
cliente esperando**. Botão no topo da tela é botão que ela não alcança.

## Web e mobile

Tokens são compartilhados; componentes primitivos são por plataforma
(React DOM × React Native). Não force um sistema de componentes único entre os
dois — o custo dessa abstração costuma superar o ganho.

Os valores são números crus, sem unidade: o React Native só aceita número, e o
web acrescenta `px` ao montar as variáveis CSS.

**Como cada cliente consome:**

| Cliente  | Caminho                                                                                  |
| -------- | ---------------------------------------------------------------------------------------- |
| `mobile` | [`src/theme/tokens.ts`](../../apps/mobile/src/theme/tokens.ts) — adaptador fino          |
| `web`    | [`globals.css`](../../apps/web/src/app/globals.css) — variáveis CSS, guardadas por teste |

O web precisa das cores como variável CSS e o React Native não lê CSS, então o
valor aparece nos dois lugares. Em vez de gerar o CSS em tempo de build,
[`globals.test.ts`](../../apps/web/src/app/globals.test.ts) compara os dois: trocar
uma cor de um lado só reprova na CI.

## Contraste é verificado, não prometido

A RNF-055 exige 4.5:1. [`contrast.ts`](src/contrast.ts) implementa a razão da
WCAG 2.1 e [`color.test.ts`](src/tokens/color.test.ts) roda cada par que aparece
de verdade nas telas — nos dois temas.

Foi assim que se descobriu que o `--text-muted` antigo (`#767c9b`) reprovava:
4.10:1 sobre branco e 3.85:1 sobre `--bg-muted`. Está `#6a708c`.

## Variáveis de ambiente

Nenhuma.
