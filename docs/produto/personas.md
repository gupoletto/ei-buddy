# Personas

Cinco perfis atendidos pelo sistema. Cada história em
[`user-stories.md`](user-stories.md) declara para qual persona ela existe.

Os nomes servem para conversa de time ("isso é problema da Cláudia ou do
Roberto?"). Os perfis são hipóteses derivadas da apresentação comercial e
precisam ser validados com entrevistas reais — ver
[QST-006](../decisoes/README.md#qst-006).

---

## P1 — Cláudia, a lojista _(persona primária)_

**Papel no sistema:** `owner` — acesso total à empresa.

Dona de uma loja de roupas de bairro, 42 anos. Atende no balcão o dia inteiro,
tem uma funcionária. Vende também pelo WhatsApp e entrega de moto na região.

|                           |                                                                             |
| ------------------------- | --------------------------------------------------------------------------- |
| **Domínio de tecnologia** | Média. Usa WhatsApp com fluência, Instagram e app do banco. Nunca usou ERP. |
| **Contexto de uso**       | Celular, em pé, atrás do balcão, com cliente esperando                      |
| **Como opera**            | 80% WhatsApp, 20% app (fechamento do dia, conferência de estoque)           |

**O que ela precisa**

- Registrar a venda em segundos, sem perder o cliente da frente
- Saber quanto sobrou de verdade depois de imposto e taxa de cartão
- Saber quem lhe deve e cobrar sem constrangimento
- Não levar multa por não emitir nota

**O que a faz desistir**

- Formulário longo com campo obrigatório que ela não sabe preencher
- Sistema que exige computador
- Ter que cadastrar tudo antes de conseguir usar
- Não entender por que o número não bate

> **Frase que resume:** _"Eu não quero aprender um sistema, eu quero saber
> quanto eu ganhei hoje."_

---

## P2 — Marcos, o funcionário

**Papel no sistema:** `staff` — permissões restritas, definidas pela Cláudia.

Vendedor, 24 anos. Trabalha no balcão, opera o app com naturalidade.

|                           |                                               |
| ------------------------- | --------------------------------------------- |
| **Domínio de tecnologia** | Alta para o uso do dia a dia                  |
| **Contexto de uso**       | App no celular ou tablet da loja, no balcão   |
| **Como opera**            | 90% app (bipa código de barras), 10% WhatsApp |

**O que ele precisa**

- Bipar produto e fechar venda rápido, inclusive com internet ruim
- Consultar preço e estoque sem chamar a dona

**Restrições que o sistema precisa impor**

- Não pode ver margem, custo nem relatório financeiro
- Não pode dar desconto acima do limite configurado
- Não pode cancelar venda já emitida sem aprovação
- Toda ação dele fica registrada com autoria

---

## P3 — Roberto, o contador _(persona externa)_

**Papel no sistema:** `accountant` — somente leitura + exportação. **Fora do MVP**;
no MVP a Cláudia exporta e envia manualmente.

Atende 60 pequenas empresas. Recebe informação tarde, incompleta e em formatos
diferentes de cada cliente.

**O que ele precisa**

- Exportação mensal padronizada, com XML das notas emitidas
- Que o regime tributário do cliente esteja corretamente configurado

**O que ele representa para o produto**
Roberto não paga a assinatura, mas **influencia fortemente a permanência**: se
ele reclamar do formato, a Cláudia troca de sistema. Vale como canal de
aquisição no roadmap.

---

## P4 — João, o cliente final _(persona externa)_

**Papel no sistema:** nenhum — não faz login. Existe como registro em
`customers` e recebe mensagens.

Compra na loja da Cláudia, presencial e por WhatsApp.

**Onde toca o sistema**

- Recebe cobrança, comprovante e catálogo por WhatsApp
- Recebe o link ou o DANFE da nota emitida
- No roadmap: acessa a vitrine pública da loja

**O que o sistema precisa garantir**

- Não receber mensagem que ele não autorizou (LGPD — ver
  [`seguranca.md`](../arquitetura/seguranca.md))
- Ter o dado pessoal dele tratado com base legal definida
- Poder pedir a exclusão dos próprios dados

---

## P5 — Ana, a administradora da plataforma _(persona interna)_

**Papel no sistema:** `platform_admin` — acesso ao backoffice, nunca aos dados
de negócio de um tenant sem registro de acesso.

Trabalha na equipe do EiBuddy: suporte, cobrança e diagnóstico.

**O que ela precisa**

- Ver o estado da assinatura de um lojista e destravar bloqueio
- Diagnosticar por que uma mensagem ou uma nota falhou
- Acompanhar consumo de IA por tenant (custo — [M7](visao.md#métricas-de-sucesso))

**Restrições que o sistema precisa impor**

- Acesso a dado de tenant é auditado e justificado
- Nunca vê conteúdo de conversa sem consentimento explícito registrado

---

## Matriz de permissões

Base para o modelo de autorização detalhado em
[`seguranca.md`](../arquitetura/seguranca.md#autorização).

| Capacidade                       | `owner` |     `staff`     | `accountant` | `platform_admin` |
| -------------------------------- | :-----: | :-------------: | :----------: | :--------------: |
| Registrar venda                  |   ✅    |       ✅        |      ❌      |        ❌        |
| Cancelar venda emitida           |   ✅    |  ⚠️ aprovação   |      ❌      |        ❌        |
| Ver custo e margem               |   ✅    |       ❌        |      ✅      |        ❌        |
| Gerenciar produtos e preços      |   ✅    | ⚠️ configurável |      ❌      |        ❌        |
| Gerenciar contas a pagar/receber |   ✅    |       ❌        |      ❌      |        ❌        |
| Emitir nota fiscal               |   ✅    |       ✅        |      ❌      |        ❌        |
| Conciliar banco                  |   ✅    |       ❌        |      ❌      |        ❌        |
| Exportar dados                   |   ✅    |       ❌        |      ✅      |        ❌        |
| Usar o assistente WhatsApp       |   ✅    | ⚠️ configurável |      ❌      |        ❌        |
| Convidar usuários                |   ✅    |       ❌        |      ❌      |        ❌        |
| Gerenciar assinatura             |   ✅    |       ❌        |      ❌      |        ✅        |
| Acessar dados de outro tenant    |   ❌    |       ❌        |      ❌      |   ⚠️ auditado    |

⚠️ = permitido sob condição configurável ou com registro de auditoria.

## Documentos relacionados

- [Visão do produto](visao.md) — o problema que essas pessoas têm
- [User Stories](user-stories.md) — o que cada uma precisa fazer
- [Segurança](../arquitetura/seguranca.md) — como as permissões são impostas
