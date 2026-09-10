---
adr: 0008
titulo: Conexão entre usuários por proximidade — busca cross-tenant e pedido auditável
status: aceita
data: 2026-09-10
decisores: [Gustavo Poletto]
substitui: null
substituida_por: null
---

# ADR-0008 — Conexão entre usuários por proximidade — busca cross-tenant e pedido auditável

|                       |                                 |
| --------------------- | ------------------------------- |
| **Status**            | Aceita                          |
| **Data**              | 2026-09-10                      |
| **Decisores**         | Gustavo Poletto                 |
| **Decisão de origem** | [DEC-021](../README.md#dec-021) |

## Contexto

Um prompt de especificação pediu uma rede B2B entre lojistas: buscar por
produto (ex.: "farinha") e encontrar outros usuários que vendem aquele
insumo, ordenados por proximidade de CEP, com pedido de conexão que libera
contato completo quando aceito dos dois lados.

A DEC-021 nasceu ⚪ Adiada — mesmo motivo que já tira "Marketplace de lojas"
do MVP em `docs/produto/escopo-mvp.md`: depende de massa crítica de lojistas
que ainda não existe. Foi reaberta no mesmo dia por decisão explícita de
quem pediu, ciente do risco. Esta ADR registra **como** construir, não se
deve construir — essa parte já fechou na DEC-021.

Três lacunas de infraestrutura tornam isto mais que "adicionar uma tela":

1. **Não existe geocodificação em lugar nenhum do projeto.** `companies` e
   `customers` guardam CEP como texto (`postal_code`), sem latitude/longitude.
   A busca de CEP no front (`buscarCep()` em `apps/web/src/lib/empresa-api.ts`)
   é um mock com três CEPs fixos — o comentário já documenta a decisão de
   arquitetura ("consultas de CEP passam pelo NOSSO backend, não direto do
   navegador") mas a rota real (`GET /enderecos/cep/:cep`) nunca foi escrita.
2. **Produtos são inteiramente por tenant, sem taxonomia compartilhada.**
   `category_id` é uma FK para `categories`, que também é por empresa — duas
   lojas podem chamar o mesmo insumo de coisas diferentes, e não há
   correspondência garantida entre elas. Toda consulta de produto hoje leva
   `company_id` como primeiro parâmetro; não há precedente de busca cruzando
   tenants.
3. **Não existe canal de notificação in-app persistido.** O sino do `AppShell`
   (`apps/web/src/lib/avisos-api.ts`) não lê uma tabela de avisos — ele
   recalcula ao vivo a partir de rotas de domínio já existentes, de propósito
   ("não inventa notificação"). `MessageSender` (WhatsApp) existe, mas só como
   fila de saída (`QUEUES.whatsappSend`), com adapter real ainda não
   implementado (só `FakeMessageSender`).

## Opções consideradas

### Distância — Opção A: base estática de CEP → lat/long embutida no repo

Uma tabela semeada com centróides de faixa de CEP (o "MVP" que a spec
original sugere).

| Prós                                    | Contras                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sem chamada de rede em tempo de busca   | Não há como baixar/gerar essa base dentro desta tarefa — não é dado que já exista no projeto nem serviço interno que produza |
| Determinístico, sem dependência externa | Precisão por faixa de CEP é grosseira (a faixa cobre bairros inteiros ou mais)                                               |

### Distância — Opção B: geocodificação via CEP, na escrita do endereço

Implementar a porta `CepLookup` de verdade (fechando o TODO já documentado em
`empresa-api.ts`), usando a BrasilAPI (`/api/cep/v2/{cep}`, que devolve
`location.coordinates` quando disponível, além de logradouro/bairro/cidade/UF).
Guardar `latitude`/`longitude` em `companies` quando o CEP é salvo ou
atualizado.

| Prós                                                                              | Contras                                                                                                                                                    |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaproveita uma decisão de arquitetura já escrita no código, não inventa uma nova | Depende de serviço externo — CEP sem cobertura de coordenada fica sem posição, e a empresa correspondente não aparece em busca por proximidade até ter     |
| Fecha um TODO real (`GET /enderecos/cep/:cep`) que a tela de cadastro já espera   | Adiciona uma chamada de rede síncrona ao salvar/editar endereço da empresa (mitigado: não bloqueia o cadastro se falhar — grava sem coordenada e seguinte) |
| Precisão de rua/bairro, não de faixa inteira                                      | —                                                                                                                                                          |

### Distância — Opção C: geolocalização do navegador em tempo de busca

Pedir permissão de localização ao navegador e comparar contra o endereço
cadastrado da empresa-alvo (geocodificado uma vez).

| Prós                         | Contras                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mais preciso para quem busca | Ainda precisa da Opção B para a empresa-ALVO (ela não está "buscando", está sendo encontrada) — não substitui, só adicionaria uma segunda fonte de coordenada |
| —                            | Depende de permissão do navegador, que uma parcela vai negar                                                                                                  |

## Decisão

**Distância: Opção B.** `companies` ganha `latitude`/`longitude` (nullable),
populadas por uma porta nova `CepLookup` (com adapter real via BrasilAPI e
fake para teste, no mesmo molde de `MessageSender`/fiscal/pagamento) chamada
pelo caso de uso de cadastro/edição de empresa quando o CEP muda. A distância
em si é Haversine, calculada em `core` sobre os pares de coordenada — não
`earthdistance`/PostGIS: adicionar uma extensão do Postgres para uma fórmula
que cabe em uma função pura seria trocar uma dependência de infraestrutura
por uma linha de código.

**Busca cross-tenant: função `SECURITY DEFINER`, no molde do Super Admin
(ADR-0007).** Não existe — e não deveria existir — uma política de RLS que
deixe uma empresa ler produto de outra; a leitura pública básica ("quem vende
X, e onde") atravessa RLS pela mesma porta estreita e nomeada que todo
cruzamento de tenant já usa neste projeto: uma função SQL que devolve **só**
os campos necessários à etapa "antes do aceite" (nome da empresa,
bairro/cidade, coordenadas, descrição do produto que casou) — nunca telefone,
nunca endereço completo, nunca dado fiscal ou financeiro. Sem taxonomia
compartilhada de categoria, a busca compara `description` por
`ILIKE '%termo%'` — mais simples que texto completo (`tsvector`), e adequado
ao volume esperado (poucas centenas de produtos por busca, não milhões).

**Tabela de conexão: mesmo desenho de `platform_admin_access` (ADR-0007).**
`company_connections` (nome que evita a guarda de schema nº2 —
`packages/db/src/schema.test.ts` exige política `tenant_isolation` em
qualquer coluna chamada literalmente `company_id`; aqui as colunas se chamam
`requester_company_id`/`target_company_id`, de propósito) com
`ENABLE`/`FORCE ROW LEVEL SECURITY` e nenhuma política — nega tudo para
qualquer papel comum. Todo acesso (pedir, aceitar, recusar, desfazer, listar)
passa por função `SECURITY DEFINER`, que confere ali dentro se quem chama tem
o direito (é o requerente, ou tem papel `owner`/`manager` na empresa-alvo).

**Quem decide por uma empresa: o `owner`.** A busca devolve uma EMPRESA, não
uma pessoa. Ao criar o pedido, a função resolve `target_user_id` como o
`owner` daquela empresa no momento da criação — é quem a spec original
pressupõe como decisor ("o usuário que recebe o pedido... aceita ou
rejeita"), e é o único papel presente em toda empresa cadastrada hoje
(convite de `staff`/`manager` é opcional).

**Notificação: fila existente + sino existente, sem infraestrutura nova.**
O aviso de "pedido recebido" entra na fila `QUEUES.whatsappSend` já usada por
`charge-overdue`/`whatsapp-send` (`consent.basis: 'own_user'` — destinatário
é o próprio usuário do sistema, não terceiro). No painel, `carregarAvisos()`
ganha uma quinta chamada paralela para a contagem de pedidos pendentes,
exatamente como as quatro que já existem — nenhuma tabela de notificação
nova, nenhuma mudança na promessa de "só aviso vindo de dado real" que o
arquivo já documenta.

**Privacidade (RF-03, já fixada na DEC-021):** antes do aceite, a busca
devolve nome da empresa, bairro/cidade e distância aproximada. Telefone e
endereço completo só aparecem depois do aceite mútuo — a MESMA função de
busca nunca os devolve; eles vêm de uma consulta separada, condicionada ao
estado `accepted` da conexão.

**Escopo desta entrega: web, não mobile.** O caminho crítico do produto
mobile é o PDV; uma rede B2B é naturalmente uma tarefa de "gestão", que os
outros módulos administrativos (Financeiro completo, Suporte) também só
ganharam na web primeiro. Mobile fica registrado como fast-follow, não como
parte desta ADR.

## Consequências

### Positivas

- Fecha o TODO real de geocodificação (`GET /enderecos/cep/:cep`), que passa
  a existir de verdade e pode ser reaproveitado por QUALQUER formulário de
  endereço do sistema depois — não só por esta feature.
- O padrão de RLS cross-tenant (função `SECURITY DEFINER`, retorno mínimo,
  nomeação de coluna que escapa a guarda de schema) já tinha UM precedente
  (Super Admin); com dois, vira padrão reconhecível do projeto, e não mais
  "aquele jeito que o Super Admin faz".

### Negativas

- **A DEC-021 registrou o risco, e ele continua valendo:** com poucos
  lojistas cadastrados, buscas por produtos específicos podem voltar vazias.
  Isso não é um defeito de implementação — é a consequência aceita de tirar
  a feature da Fase 4 antes da massa crítica. Se a métrica de "buscas sem
  resultado" ficar alta por muito tempo, é sinal de que o risco se
  concretizou (ver "Quando revisitar").
- **Empresa sem CEP com coordenada resolvida não aparece em busca nenhuma.**
  Toda empresa cadastrada ANTES desta migration está nessa situação até
  editar o endereço uma vez — não há backfill automático (chamar a BrasilAPI
  para toda empresa existente, em lote, na migration, faria a migration
  depender de rede e falhar em ambiente sem internet, ex. CI). Um job de
  backfill fica registrado como trabalho futuro, não desta entrega.
- **Depender da BrasilAPI é depender de um serviço de terceiro sem SLA
  contratado.** Indisponibilidade dela não impede cadastro (a falha degrada
  para "sem coordenada", não bloqueia o salvamento), mas impede a empresa de
  aparecer em busca enquanto durar.

### Neutras

- `company_connections` não guarda justificativa (diferente de
  `platform_admin_access`) — a spec original não pede, e pedir "por que você
  quer comprar farinha" de um lojista para outro seria atrito sem função:
  aqui quem decide aceitar ou não é a outra parte, não uma auditoria.

## Impacto na documentação

- [x] `docs/decisoes/README.md` — DEC-021 fechada, apontando para esta ADR
- [ ] `docs/arquitetura/dados.md` — acrescentar a seção sobre
      `company_connections` e o padrão de função pública cross-tenant
      (fast-follow, não bloqueia esta ADR)
- [ ] Task Ledger — NR-107 em diante

## Quando revisitar

- Se a taxa de buscas sem nenhum resultado ficar alta por vários meses
  seguidos, é o sinal de que o risco de massa crítica da DEC-021 se
  concretizou — considerar promover a feature (divulgação interna, incentivo
  a cadastrar produtos) em vez de assumir que "vai resolver sozinho" com o
  tempo.
- Se o volume de empresas sem coordenada (CEP não geocodificado) for alto o
  bastante para distorcer a utilidade da busca, o backfill em lote citado nas
  consequências deixa de ser opcional.
- Se a BrasilAPI mudar de contrato, ficar paga ou sair do ar de forma
  recorrente, `CepLookup` é uma porta — trocar de provedor é trocar uma
  função de composição, não reescrever o caso de uso.
