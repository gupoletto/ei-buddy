---
adr: 0007
titulo: Super Admin como troca de sessão auditada, não como papel bypass
status: aceita
data: 2026-09-10
decisores: [Gustavo Poletto]
substitui: null
substituida_por: null
---

# ADR-0007 — Super Admin como troca de sessão auditada, não como papel bypass

|                       |                                 |
| --------------------- | ------------------------------- |
| **Status**            | Aceita                          |
| **Data**              | 2026-09-10                      |
| **Decisores**         | Gustavo Poletto                 |
| **Decisão de origem** | [DEC-020](../README.md#dec-020) |

## Contexto

O produto precisa de um papel de operação interna — hoje chamado, sem
implementação, de `platform_admin` — que veja e edite dado de qualquer
empresa, e responda chamado de suporte de qualquer empresa. O papel já existe
no vocabulário: `roleSchema` o inclui, `company_users`/`sessions` já aceitam
o valor no CHECK, e a persona P5 ("Ana, administradora da plataforma") já
descreve a intenção. Nada disso está ligado a uma capacidade real —
`grantableRoleSchema` recusa `platform_admin` de propósito, e não existe
nenhum caminho no código para concedê-lo ou usá-lo.

O sistema inteiro é construído sobre RLS por linha (ADR-0001): toda tabela de
negócio nega leitura e escrita fora da empresa do contexto
(`current_company_id()`), e essa é a garantia de isolamento que o produto
vende para cada lojista. "Super Admin vê tudo" é exatamente o que esse
isolamento existe para impedir por padrão — então a pergunta desta ADR não é
"como damos acesso", é "como dar acesso sem que ele deixe de ser a exceção".

O padrão já estabelecido no projeto para atravessar RLS de forma controlada
não é um papel de banco com `BYPASSRLS` — esse papel só existe para migration
(ver `rls-guard.ts`, que derruba a aplicação se a conexão de runtime
conseguir ignorar RLS). O padrão são funções `SECURITY DEFINER` estreitas,
com nome, que fazem exatamente uma coisa (`auth_user_by_email`,
`auth_session_issue`, etc., da migration 0003/0004).

## Opções consideradas

### Opção A — Rotas administrativas paralelas

Um conjunto de rotas `/admin/empresas/:id/...` que aceitam um `companyId`
explícito e chamam os mesmos casos de uso de negócio, passando por
`withTenant(sql, companyId, ...)` fora do fluxo normal de sessão.

| Prós                            | Contras                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Não mexe em sessão nem em login | Duplica toda rota de negócio que o Super Admin precisa tocar — cada tela nova do app vira duas rotas para manter                           |
| —                               | O `companyId` viaja como parâmetro em toda chamada: mais um lugar para esquecer de checar `platform_admin_is`, e mais superfície de ataque |
| —                               | A tela do Super Admin não é a mesma tela do lojista — dobra o trabalho de front-end e dobra onde um bug de UI pode aparecer                |

### Opção B — Papel de banco com `BYPASSRLS`

Uma segunda conexão de aplicação, com um papel de banco que ignora RLS,
usada só pelas rotas de Super Admin.

| Prós                  | Contras                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Simples de configurar | Contradiz a garantia que `rls-guard.ts` existe para proteger — a aplicação passaria a ter, de propósito, o mesmo poder que o guard-rail derruba o processo por ter |
| —                     | Sem RF-131 (justificativa) embutida: nada obriga a pessoa a dizer POR QUE está olhando aquela empresa antes de olhar                                               |
| —                     | Um bug de autorização aqui não vaza uma consulta — vaza a base inteira, porque a conexão não tem isolamento nenhum para conter o erro                              |

### Opção C — "Entrar como", via troca de sessão auditada

O Super Admin autentica normalmente. Para agir em uma empresa, chama uma
função nova (`auth_session_enter_company`) que: confere `platform_admin_is`,
exige uma justificativa não vazia, grava a entrada em
`platform_admin_access` (RF-131), e then **atualiza a sessão existente** —
`active_company_id` e `role` passam a valer para aquela empresa, com
`role = 'owner'`. Da í em diante, **toda rota de negócio já existente**
funciona sem mudança nenhuma: `requireContext` monta o mesmo
`ExecutionContext` de sempre, `withTenant` aplica o mesmo RLS de sempre. Sair
(`auth_session_exit_company`) fecha o registro de acesso e volta a sessão ao
estado sem empresa.

| Prós                                                                                                                                                                        | Contras                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero rota nova para cada tela de negócio — o Super Admin usa a MESMA tela do lojista, com os MESMOS casos de uso e o MESMO RLS                                              | Enquanto está "dentro" de uma empresa, o Super Admin tem os poderes de `owner` daquela empresa — não um subconjunto próprio (mitigado pela auditoria e pela exigência de justificativa, não pela falta de poder) |
| RLS nunca é contornado — é a mesma política de sempre, só que `app.company_id` passou a valer a empresa que o Super Admin escolheu entrar, com registro de quando e por quê | Uma sessão só pode estar "dentro" de uma empresa por vez — não é limitação real: é a mesma regra que já vale para qualquer usuário multi-empresa hoje                                                            |
| A trilha de auditoria de negócio (`audit_logs`) já registra o `userId` real do Super Admin em cada ação — sem precisar inventar identidade nenhuma                          | Exige uma migração nova e um pequeno ajuste em `login()` (usuário sem nenhum vínculo de empresa, mas Super Admin, precisa poder logar)                                                                           |

## Decisão

**Escolhemos a Opção C.**

"Super Admin" não é um papel com mais poder de leitura — é uma **sessão que
pode trocar de empresa livremente, com registro obrigatório de por quê**,
usando a mesma porta estreita (`SECURITY DEFINER`) que o projeto já usa para
todo cruzamento de RLS. O que se abdica: uma tela dedicada de "painel do
Super Admin" com visão desenhada especificamente para essa operação teria
mais controle fino sobre o que ele vê em cada caso — a Opção C entrega a
MESMA tela do lojista, o que significa que qualquer coisa editável pelo dono
da loja é editável pelo Super Admin também, sem grau intermediário. Isso é
aceitável agora porque o pedido original era exatamente esse alcance ("vamos
ter acesso a todos os clientes, poderemos editar coisas"), e o custo de
reduzir esse alcance depois — restringir por rota, por exemplo — é menor que
o custo de ter construído duas telas desde o início.

## Consequências

### Positivas

- Toda tela nova que o app ganhar no futuro já funciona para o Super Admin
  automaticamente, sem trabalho extra — não existe uma segunda superfície de
  UI para manter em sincronia.
- RF-131 (registrar acesso administrativo com justificativa) nasce dentro do
  mecanismo, não como afterthought: não existe caminho de entrar numa
  empresa sem justificativa gravada.
- `platform_admins` e `platform_admin_access` seguem exatamente o desenho já
  usado em `sessions`/`login_throttle`: RLS ligado, sem política (nega
  tudo), acesso só pelas funções `SECURITY DEFINER`.

### Negativas

- **RNF-025 (segundo fator para `platform_admin`) fica de fora desta
  entrega.** O papel concede poder de `owner` sobre qualquer empresa; sem
  2FA, uma senha vazada de Super Admin vale por todas as lojas do sistema.
  Fica registrado como item pendente, não descartado — ver "Quando
  revisitar".
- **Convite por e-mail fica de fora desta entrega.** Não existe nenhuma
  integração de envio de e-mail no projeto hoje (nem Resend, nem SendGrid —
  só um Mailpit ocioso em dev). Conceder Super Admin, por ora, é uma ação
  manual de quem já é Super Admin, dentro do próprio painel, sem
  notificação automática — o mesmo gap que o convite de funcionário de loja
  já tem hoje.
- Desbloquear assinatura manualmente, exportar dados de outra empresa "em
  nome dela" e visualizar a trilha de auditoria de qualquer empresa **não
  vêm nesta entrega** — a "entrada" na empresa já habilita o que a tela do
  lojista já expõe; o que a tela do lojista ainda não expõe (essas três
  ações) continua não exposto, e entra como tarefa própria depois.

### Neutras

- `sessions.role = 'platform_admin'` continua existindo como valor possível
  no CHECK, mas na prática **nunca é o role operacional** de uma sessão em
  uso — é só o marcador de "esta pessoa pode chamar
  `auth_session_enter_company`". Uma vez dentro de uma empresa, o role
  efetivo é sempre `owner`.

## Impacto na documentação

- [x] `docs/decisoes/README.md` — DEC-020 fechada, apontando para esta ADR
- [ ] `docs/arquitetura/dados.md#multi-tenant` — acrescentar a seção sobre
      `platform_admins`/`platform_admin_access` (fast-follow, não bloqueia
      esta ADR)
- [x] Task Ledger — NR-105 em diante

## Quando revisitar

- Se o produto sair do estágio "duas pessoas de confiança direta" (você e o
  Daniel) para uma equipe de suporte maior, a ausência de 2FA (RNF-025) deixa
  de ser um risco aceitável e vira bloqueante — a entrada deste ADR já avisa.
- Se algum caso de uso do Super Admin precisar de MENOS poder que `owner`
  (por exemplo, alguém que só deveria responder chamado, sem poder editar
  financeiro), a Opção A volta a fazer sentido **para aquele caso
  específico** — a decisão aqui não impede um papel `support_agent` mais
  restrito nascer ao lado, no futuro, sem revogar esta ADR.
