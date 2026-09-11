---
adr: 0009
titulo: Sugestão de conexão por filtragem colaborativa de ramo, sem IA
status: aceita
data: 2026-09-10
decisores: [Gustavo Poletto]
substitui: null
substituida_por: null
---

# ADR-0009 — Sugestão de conexão por filtragem colaborativa de ramo, sem IA

|                       |                                 |
| --------------------- | ------------------------------- |
| **Status**            | Aceita                          |
| **Data**              | 2026-09-10                      |
| **Decisores**         | Gustavo Poletto                 |
| **Decisão de origem** | [DEC-022](../README.md#dec-022) |

## Contexto

A busca de fornecedores por proximidade (ADR-0008) exige que o lojista saiba
o que procurar e digite um termo. O pedido era ir além: sugerir empresas
**sem** a pessoa precisar buscar, "baseado no negócio dela".

`business_segment` (o ramo de atividade) é texto livre, digitado pela
própria empresa no cadastro — não há vocabulário fechado. Mapear
"confeitaria" → farinha, açúcar, embalagem exigiria uma tabela mantida à
mão, ramo por ramo, para sempre, e ainda assim perderia qualquer ramo escrito
diferente do esperado. Um modelo de linguagem resolveria o texto livre, mas
o projeto já tinha decidido, para a notificação desta mesma funcionalidade,
evitar custo de IA quando a regra dá conta.

## Opções consideradas

### Opção A — Filtragem colaborativa por ramo

Se outras empresas do MESMO ramo (texto comparado sem caixa nem espaço) já
têm conexão **aceita** com uma empresa X, X é sugerida também.

| Prós                                                                                     | Contras                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Nenhum vocabulário para manter; funciona para qualquer ramo digitado, desde que haja par | Começa vazia — depende de massa crítica, o mesmo risco já assumido na DEC-021                                                             |
| Sem chamada a modelo de linguagem, sem custo de IA                                       | Um ramo digitado de forma pouco padronizada (sinônimos, plural) não casa com o comparado — mitigado por `lower(trim())`, não por sinônimo |
| A "razão" da sugestão é honesta e explicável: "N empresas do seu ramo já conectaram"     | —                                                                                                                                         |

### Opção B — Palavra-chave fixa por ramo

Uma tabela no código mapeando ramos comuns a termos de busca.

| Prós                                                      | Contras                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Sugestão aparece mesmo sem nenhuma conexão prévia na base | Exige adivinhar e manter a lista; ramo fora dela não gera sugestão nenhuma — o oposto do texto livre que o cadastro já permite |

### Opção C — Proximidade pura

Sugere as empresas mais perto, sem tentar casar por ramo.

| Prós                              | Contras                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Simples, sempre tem o que mostrar | Não é "baseado no negócio" — é só localização, o que o pedido explicitamente não queria |

## Decisão

**Escolhemos a Opção A.** `company_connections_suggestions` (migration 0010) é uma função `SECURITY DEFINER`, no mesmo padrão de
`company_connections_search`: acha pares do mesmo ramo, olha as conexões
ACEITAS deles, e sugere quem está do outro lado — excluindo quem já tem
pedido ativo com quem busca. `peer_count` (quantos pares já conectaram)
ordena o resultado e vira a frase que justifica a sugestão na tela.

## Consequências

### Positivas

- Zero infraestrutura nova: mesma tabela, mesmo padrão de função, nenhuma
  chamada de rede nem custo de token.
- A sugestão explica a si mesma ("2 empresas do seu ramo já se conectaram")
  em vez de aparecer como uma caixa preta.

### Negativas

- **Cold start explícito.** Enquanto não houver conexão aceita nenhuma entre
  pares do mesmo ramo, a seção de sugestões simplesmente não aparece — a
  tela já trata isso como estado normal (a seção só renderiza quando há
  pelo menos uma sugestão), não como erro. Mesmo risco de massa crítica já
  registrado na DEC-021.
- Ramo com grafias muito diferentes entre empresas do mesmo negócio (ex.:
  "Confeitaria" vs. "Doces e bolos") não são reconhecidos como pares — a
  comparação é textual, não semântica.

### Neutras

- Não há como uma empresa "esconder" que serve de referência para outra —
  `peer_count` é sempre visível para quem recebe a sugestão, nunca revela
  QUAIS empresas são os pares (só a contagem).

## Impacto na documentação

- [x] `docs/decisoes/README.md` — DEC-022 fechada, apontando para esta ADR
- [x] Task Ledger — NR-108

## Quando revisitar

- Se ramos com grafia muito variada continuarem sem gerar sugestão umas para
  as outras, uma normalização mais forte (remover acentos, plural/singular)
  resolve sem precisar de IA — ainda dentro do espírito desta ADR.
- Se a base crescer e cold-start deixar de ser o caso comum, vale medir se
  `peer_count` sozinho basta ou se a ordem também deveria considerar
  distância com peso maior.
