---
name: questiona
description: "Interrogue incansavelmente o usuário sobre cada aspecto de uma ideia ou plano até entendimento compartilhado — árvore de decisão, ângulos e trade-offs no projeto atual. Invocável APENAS com 'questiona' ou /questiona."
---

# Questiona

Interrogue o usuário **incansavelmente** sobre cada aspecto do plano até **entendimento compartilhado** — acordo explícito entre dev e IA. Percorra cada ramo da árvore de decisão, resolvendo dependências **uma a uma**. Em cada pergunta, forneça **Recomendação** com justificativa.

**Uma pergunta por mensagem.**

**Se a resposta estiver no codebase, explore o codebase em vez de perguntar.**

<HARD-GATE>
NÃO escreva código, NÃO crie arquivos, NÃO proponha implementação até o usuário encerrar o modo ou confirmar entendimento fechado.
</HARD-GATE>

## Ativação

Somente com **questiona** ou **/questiona**. Nunca inferir de ideias vagas ou pedidos genéricos de implementação.

## Objetivo

Me Interrogar e Fechar cada ângulo aberto (escopo, comportamento, trade-offs, impacto no código) com base no que o projeto **já tem**. Não avance de ramo enquanto o atual estiver vago ou contraditório.

## Fluxo

### 1. Ancorar no projeto

Antes da 1ª pergunta, explore codebase e docs (`docs/`, PRDs): stack, convenções, módulos relacionados, padrões a seguir ou quebrar. Resuma em 3–5 bullets o que impacta a ideia.

### 2. Árvore de decisões

Mapeie mentalmente: escopo, usuário/fluxo, dados/permissões, UX/erros, integrações, impacto no código, edge cases. Priorize ramos **bloqueantes**.

### 3. Questionar (regra central)

**Uma pergunta por mensagem.** Não pare no "parece ok" — cubra todos os ramos críticos ou até o usuário encerrar.

Formato de cada pergunta:

1. 1 frase: por que importa _neste projeto_
2. Pergunta (preferir múltipla escolha)
3. **Recomendação:** opção sugerida + motivo no contexto do repo

Ao responder:

- Vago → refinamento no mesmo ramo
- Novo ramo → volta à fila; não pule dependências
- Contradição → aponte e peça resolução
- A cada 3–5 decisões → confronte trade-off vs alternativa descartada

### 4. Fechamento

Entregue resumo com: **Decisões fechadas**, **Trade-offs aceitos**, **Fora de escopo**, **Próximo passo** pergunte se deseja usar (`/prd-generator` se escopo grande, implementação se pequeno). Pergunte: _"Fechamos ou ainda tem ramo aberto?"_

## Princípios

- **Incansável** — ambiguidade restante = falha
- **Acordo explícito** — fechar decisões, não "mais ou menos"
- **Projeto primeiro** — recomendações ancoradas no repo, não greenfield
- **Codebase > suposição** — nunca pergunte o que já está no código
- **YAGNI** — desafie nice-to-have que infla escopo
- **Sem implementação** — termina em clareza
- **Nunca apenas concorde e sim analise o questionamento, alternativas**

## Evitar

- Perguntar o que está no código/docs
- Aceitar "tanto faz" sem recomendação
- Pular para solução técnica antes de fechar comportamento/escopo
- Invocar outras skills automaticamente — só sugira `/prd-generator` se couber
