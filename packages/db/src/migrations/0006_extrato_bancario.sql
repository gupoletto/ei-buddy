-- Baseline NR-089 / ADR-0006. Origem fundida: 0011_extrato_bancario.sql.
-- Historia nova: nao editar as migrations 0001–0025 antigas — elas nao existem mais.

-- Extrato bancario e conciliacao — NR-047 e NR-076. RF-076 a RF-080.
--
-- `core` desenhou a importacao (NR-047) e a conciliacao (NR-033) com
-- repositorio em memoria. Esta e a tabela por tras — ela faltava por inteiro.
--
-- Convencoes em docs/arquitetura/dados.md#convenções-de-schema: plural em
-- snake_case, dinheiro em bigint de centavos, timestamptz em UTC com sufixo
-- _at, sem enum nativo, e todo indice comecando por company_id.

CREATE TABLE bank_transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,

  -- FITID no OFX. E o que impede a mesma transacao de entrar duas vezes quando
  -- o lojista sobe o extrato de novo — e ele sobe, porque a forma normal de
  -- conferir se a importacao funcionou e importar outra vez (RF-076).
  external_id             text NOT NULL,

  -- Direcao explicita em vez de valor com sinal: o OFX traz o sinal de formas
  -- diferentes entre bancos, e a regra que importa fica legivel — debito casa
  -- com conta a pagar, credito com recebivel.
  direction               text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_cents            bigint NOT NULL CHECK (amount_cents > 0),

  -- O banco lanca num DIA. `date` e nao timestamptz, como `due_date`.
  posted_on               date NOT NULL,
  description             text NOT NULL,
  -- Quem pagou ou recebeu, quando o banco informa. Muitos nao informam.
  counterparty            text,

  -- ---------------------------------------------------------------------
  -- A conciliacao — RF-079, RF-080
  -- ---------------------------------------------------------------------
  --
  -- DUAS colunas com chave estrangeira de verdade, e nao um par
  -- (`entry_kind`, `entry_id`) polimorfico.
  --
  -- O par polimorfico e mais curto de escrever e nao tem integridade nenhuma:
  -- nenhuma chave estrangeira pode apontar para "uma de duas tabelas", entao o
  -- banco aceitaria um uuid que nao existe em lugar algum, ou um id de
  -- `payables` marcado como `receivable`. Numa tabela cujo proposito e PROVAR
  -- que os numeros batem, referencia que ninguem garante e o defeito mais caro
  -- possivel — a conferencia passaria a apontar para o nada, e o estado que
  -- ninguem confere de novo e justamente o de "conferido".
  --
  -- `entryKind` do contrato sai de qual das duas esta preenchida.
  reconciled_payable_id   uuid REFERENCES payables (id) ON DELETE RESTRICT,
  reconciled_receivable_id uuid REFERENCES receivables (id) ON DELETE RESTRICT,
  -- Sem `reconciled_by`: a porta `link` nao recebe o usuario, entao a coluna
  -- ficaria sempre nula. Coluna que nada escreve e pior que coluna ausente —
  -- quem a lesse depois concluiria que ninguem conciliou. Quem conciliou esta
  -- na trilha de auditoria, que e onde essa pergunta se responde.
  reconciled_at           timestamptz,

  imported_by             uuid REFERENCES users (id) ON DELETE SET NULL,
  imported_at             timestamptz NOT NULL DEFAULT now(),

  -- Uma transacao concilia com UM lancamento, nunca com dois.
  CONSTRAINT bank_transactions_um_lancamento
    CHECK (num_nonnulls(reconciled_payable_id, reconciled_receivable_id) <= 1),

  -- Conciliada tem data; nao conciliada nao tem. Sem isto, `reconciled_at`
  -- preenchido sem lancamento faria a fila mentir sobre o que ja foi conferido.
  CONSTRAINT bank_transactions_conciliacao_completa
    CHECK ((reconciled_at IS NULL)
           = (num_nonnulls(reconciled_payable_id, reconciled_receivable_id) = 0))
);

COMMENT ON TABLE bank_transactions IS
  'Transacoes do extrato importado e sua conciliacao (RF-076 a RF-080).';

-- A deduplicacao da importacao e DAQUI, e nao de um SELECT antes do INSERT —
-- e o que a porta `BankTransactionWriter` diz esperar. Duas importacoes
-- simultaneas do mesmo arquivo (o lojista clicando duas vezes) passariam as
-- duas por um SELECT e gravariam tudo em dobro. Quem decide e a escrita.
CREATE UNIQUE INDEX bank_transactions_sem_duplicata
  ON bank_transactions (company_id, external_id);

-- A consulta principal: a fila do que falta conferir, do mais antigo ao mais
-- novo. Parcial porque transacao ja conciliada nunca aparece nela.
CREATE INDEX bank_transactions_fila
  ON bank_transactions (company_id, posted_on)
  WHERE reconciled_at IS NULL;

-- Um lancamento e conciliado UMA vez. Sem isto, duas transacoes do extrato
-- poderiam apontar para a mesma conta a pagar e a conferencia daria dois
-- pagamentos como provados por uma saida so de dinheiro.
--
-- O caso de uso ja recusa candidato conciliado, mas ele le antes de escrever:
-- duas abas na mesma conta passam as duas pela leitura. Por isso `link()`
-- devolve `false` em vez de lancar — quem decide o empate e este indice.
CREATE UNIQUE INDEX bank_transactions_um_por_conta_a_pagar
  ON bank_transactions (company_id, reconciled_payable_id)
  WHERE reconciled_payable_id IS NOT NULL;

CREATE UNIQUE INDEX bank_transactions_um_por_recebivel
  ON bank_transactions (company_id, reconciled_receivable_id)
  WHERE reconciled_receivable_id IS NOT NULL;

SELECT enable_tenant_isolation('bank_transactions');

-- ---------------------------------------------------------------------------
-- Recebivel criado a partir do extrato — RF-079
-- ---------------------------------------------------------------------------
--
-- `receivables` nasceu da venda (0003), e ali quem esta do outro lado e o
-- `customer_id`. O recebivel criado a partir de uma linha do extrato nao tem
-- cliente cadastrado — e uma transferencia de alguem que o banco nomeia e o
-- sistema nao conhece.
--
-- Coluna propria, e nao dentro de `description`: o contrato mantem os dois
-- separados (`counterparty` e "quem", `description` e "para que"), e junta-los
-- aqui obrigaria a tela a desmontar a frase para mostrar cada um no seu campo.
-- `payables.supplier` ja e exatamente isto do lado a pagar.
ALTER TABLE receivables ADD COLUMN counterparty text;

COMMENT ON COLUMN receivables.counterparty IS
  'Origem em texto livre, para recebivel sem cliente cadastrado (RF-079).';
