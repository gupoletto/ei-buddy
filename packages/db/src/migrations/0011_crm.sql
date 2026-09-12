-- CRM: quadro de acompanhamento de clientes — NR-109.
--
-- Modulo inteiro novo. Nao havia UMA linha de schema, porta ou rota — a tela
-- (`CrmQuadro.tsx`, web e mobile) montava o quadro a partir de contatos e
-- pendencias de `mock-data`, e criar card, mover coluna e comentar eram
-- `await delay(...)` seguidos de um objeto de sucesso: nada era gravado, e o
-- quadro voltava aos mesmos tres cartoes de exemplo a cada abertura de tela.
--
-- ---------------------------------------------------------------------------
-- O que este recorte NAO cobre, de proposito
-- ---------------------------------------------------------------------------
--
-- O mock tinha um campo `origem` (`clientes` | `financeiro` | `crm`): contato
-- lancado na ficha do cliente e titulo vencido em Contas a Receber viravam
-- card automaticamente. Essa sincronizacao — fazer OUTROS modulos escreverem
-- no CRM quando algo acontece neles — e uma integracao a parte, com decisao
-- propria sobre o que gera card e quando, e nao foi pedida junto com "criar
-- card, mover coluna, comentar, listar responsaveis". Fica de fora aqui; todo
-- card nasce pela propria tela do CRM.
--
-- Responsavel e SINGULAR, nao lista. O mock guardava `responsaveis: string[]`
-- com a nota "lista desde ja, conta compartilhada esta no roadmap" — mas o
-- FORMULARIO so deixava escolher um nome, e nenhuma tela desenhava mais de um.
-- Modelar como lista hoje seria complexidade sem uso: uma tabela de vinculo
-- (card, usuario) para uma relacao que e sempre 0 ou 1. Quando existir
-- responsavel MULTIPLO de verdade, essa e que sera a migration que troca a
-- coluna por tabela — e havera um caso de uso pedindo por ela.

-- ---------------------------------------------------------------------------
-- Remove o esqueleto do baseline 0909
-- ---------------------------------------------------------------------------
--
-- A 0007_acrescimos.sql ja criava `crm_cards` — um placeholder do recorte
-- "A-J que a main nao tinha", de proposito vazio e sem caso de uso ligado
-- (`board_column text`, `comments jsonb`, sem `kind`, `due_on` nem
-- `assignee_user_id`). Nunca teve porta, repositorio nem linha gravada —
-- `privacy-repository.ts` documentava isso no proprio `FORA_DA_EXPORTACAO`
-- ("tabela vazia no baseline"). Essa migration e que implementa o caso de
-- uso de verdade, e o formato e outro; em vez de ALTER em cima do esqueleto,
-- o DROP deixa explicito que o placeholder morre aqui. Seguro: a tabela
-- nunca teve dado, e nenhuma FK de fora aponta para ela.
DROP TABLE IF EXISTS crm_cards;

-- ---------------------------------------------------------------------------
-- crm_cards — o cartao
-- ---------------------------------------------------------------------------

CREATE TABLE crm_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  title         text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 140),
  description   text CHECK (description IS NULL OR char_length(description) <= 500),

  -- `text` + CHECK, como o resto do schema: enum nativo nao volta atras.
  -- `task` e o acompanhamento a fazer (cobranca, negociacao); `contact` e o
  -- registro de uma interacao que ja aconteceu (ligacao, visita, WhatsApp).
  kind          text NOT NULL CHECK (kind IN ('task', 'contact')),

  -- As tres colunas do quadro. Nomes em ingles como o resto do vocabulario
  -- interno; a tela traduz para "A fazer" / "Em andamento" / "Concluido".
  column_status text NOT NULL DEFAULT 'todo'
                  CHECK (column_status IN ('todo', 'doing', 'done')),

  -- Vinculo opcional com o cliente — nem todo card e sobre um cliente
  -- cadastrado (pode ser sobre um contato que ainda nao virou cadastro).
  -- RESTRICT como em sales/receivables/appointments.customer_id: cliente sai
  -- da lista por deleted_at, nunca por DELETE.
  customer_id      uuid REFERENCES customers (id) ON DELETE RESTRICT,

  -- Data de referencia do card — quando a tarefa vence, ou quando o contato
  -- aconteceu. NOT NULL: e por ela que o quadro decide o que esta atrasado, e
  -- um card sem data nao entraria nessa conta em lugar nenhum.
  due_on           date NOT NULL,

  -- Responsavel, SINGULAR — ver nota no topo do arquivo.
  assignee_user_id uuid REFERENCES users (id) ON DELETE SET NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL
);

-- A lista da tela, do mais recente para tras — o quadro inteiro cabe numa
-- consulta so, e o agrupamento por coluna e feito no cliente.
CREATE INDEX crm_cards_por_empresa ON crm_cards (company_id, created_at DESC);

-- Cliente sem cadastro (`customer_id IS NULL`) e o caso comum de um contato
-- anotado antes de a pessoa virar cadastro — parcial para nao indexar isso.
CREATE INDEX crm_cards_por_cliente ON crm_cards (company_id, customer_id)
  WHERE customer_id IS NOT NULL;

SELECT enable_tenant_isolation('crm_cards');

COMMENT ON TABLE crm_cards IS
  'Quadro de CRM (NR-109). Todo card nasce pela propria tela — sem sincronizacao automatica de outros modulos neste recorte.';
COMMENT ON COLUMN crm_cards.due_on IS
  'Data de referencia: vencimento da tarefa, ou data do contato ja ocorrido.';

-- ---------------------------------------------------------------------------
-- crm_card_comments — a conversa em cada card
-- ---------------------------------------------------------------------------
--
-- Tabela propria, e nao um array de texto na linha do card: comentario cresce
-- sem limite ao longo da vida do card, e um array cresceria a LINHA inteira a
-- cada comentario — toda leitura do quadro pagaria o peso de reescrever a
-- linha, mesmo quando ninguem pediu ver comentarios.

CREATE TABLE crm_card_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  card_id     uuid NOT NULL REFERENCES crm_cards (id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  text        text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- A conversa de um card, em ordem — a unica consulta que esta tabela serve.
CREATE INDEX crm_card_comments_por_card ON crm_card_comments (company_id, card_id, created_at);

SELECT enable_tenant_isolation('crm_card_comments');

COMMENT ON TABLE crm_card_comments IS
  'Comentarios de um card do CRM (NR-109). CASCADE em card_id: comentario nao sobrevive sem o card, e card nao se apaga (so o dono da empresa poderia, e a tela nao oferece isso).';
