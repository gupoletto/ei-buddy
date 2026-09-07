-- Chamados de suporte — NR-080, US-062.
--
-- A tela de suporte existia inteira sobre `lib/mock-data`: o lojista abria um
-- chamado, via a confirmacao com numero de protocolo, e nada era gravado. O
-- badge de "resposta nova" na navegacao contava mensagens de uma conversa
-- inventada.
--
-- ## Duas tabelas, e nao uma
--
-- O chamado e a CONVERSA, e as mensagens sao dela. A equipe de suporte responde
-- de FORA do app, por um painel proprio: se as respostas morassem num campo do
-- chamado, o painel e o cliente reescreveriam a mesma linha em concorrencia, e
-- a ultima escrita apagaria a outra.

-- ---------------------------------------------------------------------------
-- O numero que a pessoa fala ao telefone
-- ---------------------------------------------------------------------------
--
-- `AAAA-NNNN`, com sequencia GLOBAL e nao por empresa. O protocolo existe para
-- a equipe de suporte localizar o chamado sem perguntar de qual loja ele e —
-- e uma sequencia por empresa faria dois chamados diferentes terem o mesmo
-- numero, o que derrota o proposito.
--
-- O que isso revela e quantos chamados a plataforma ja teve. E um vazamento
-- pequeno e conhecido, e o contrario — protocolo ambiguo no telefone — custa
-- mais caro todos os dias.

CREATE SEQUENCE support_ticket_protocol_seq;

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------

CREATE TABLE support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  protocol      text NOT NULL,
  subject       text NOT NULL CHECK (length(btrim(subject)) >= 5),

  -- `text` + CHECK, como o resto do schema. Enum nativo nao volta atras, e
  -- categoria de chamado e das listas mais provaveis de crescer.
  category      text NOT NULL
                  CHECK (category IN ('financeiro', 'cadastro', 'vendas', 'tecnico', 'outro')),

  status        text NOT NULL DEFAULT 'aberto'
                  CHECK (status IN ('aberto', 'andamento', 'respondido', 'encerrado')),

  -- Quando o LOJISTA leu por ultimo. Nao ha contador de nao lidas.
  --
  -- Um contador seria denormalizacao com dois donos: o painel do suporte
  -- incrementa ao responder, o app zera ao abrir, e as duas escritas correm em
  -- concorrencia — e o numero passa a divergir sem que ninguem consiga dizer
  -- qual dos dois errou. O carimbo tem um dono so (o app) e as nao lidas viram
  -- uma CONTAGEM: mensagens do suporte depois desta data. Contagem derivada nao
  -- diverge, porque nao e guardada.
  --
  -- Nulo = nunca abriu o detalhe. Toda resposta conta como nao lida.
  last_read_at  timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Unico GLOBAL, e nao por empresa: e o que o protocolo promete ao telefone.
CREATE UNIQUE INDEX support_tickets_protocolo_unico ON support_tickets (protocol);

-- A lista da tela, do mais recente para tras.
CREATE INDEX support_tickets_por_atualizacao
  ON support_tickets (company_id, updated_at DESC);

-- Os que ainda estao vivos — o numero do topo da tela e do sino.
CREATE INDEX support_tickets_em_aberto
  ON support_tickets (company_id, status)
  WHERE status <> 'encerrado';

SELECT enable_tenant_isolation('support_tickets');

-- ---------------------------------------------------------------------------
-- support_messages
-- ---------------------------------------------------------------------------

CREATE TABLE support_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  ticket_id    uuid NOT NULL REFERENCES support_tickets (id) ON DELETE RESTRICT,

  -- Quem falou. `suporte` vem do painel administrativo, `cliente` vem do app.
  author       text NOT NULL CHECK (author IN ('cliente', 'suporte')),

  -- Nome de quem escreveu, COPIADO no instante. Nao e referencia viva: quem
  -- respondeu pode sair da equipe, e a conversa tem de continuar dizendo quem
  -- falou — a mesma razao de `sale_items` copiar descricao e preco.
  author_name  text NOT NULL,

  body         text NOT NULL CHECK (length(btrim(body)) >= 1),

  -- Nome do arquivo anexado. O arquivo em si ainda nao tem onde morar: nao ha
  -- decisao de armazenamento (DEC-009), e inventar um caminho local seria
  -- criar um anexo que some no primeiro deploy.
  attachment   text,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- A conversa, na ordem em que foi dita.
CREATE INDEX support_messages_por_chamado
  ON support_messages (company_id, ticket_id, created_at);

SELECT enable_tenant_isolation('support_messages');

COMMENT ON TABLE support_tickets IS
  'Chamados de suporte (NR-080, US-062). Nao lidas sao CONTADAS a partir de last_read_at, nunca guardadas.';
