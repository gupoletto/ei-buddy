-- Marca de anonimizacao no cliente — NR-086, RF-127, RF-128.
--
-- `core` tem o caso de uso desde a NR-031 e a porta pede `anonymizedAt` — e a
-- coluna nunca existiu. Consequencia: nao havia como implementar
-- `DataSubjectRepository`, e por isso o direito de exclusao (LGPD art. 18, VI)
-- nao tinha caminho no produto.
--
-- ## Por que a data importa, e nao um booleano
--
-- Porque a segunda chamada precisa responder QUANDO. O caso de uso recusa
-- reanonimizar com "este cliente ja foi anonimizado em <data>" — e a data e o
-- que o titular pergunta quando cobra o atendimento do pedido dele. Com um
-- booleano, a resposta seria "ja foi", que nao serve de comprovante.
--
-- ## Por que a linha nao e apagada
--
-- Apagar o cliente destruiria as vendas que apontam para ele: os totais de
-- periodos ja fechados mudariam retroativamente, o DRE deixaria de bater, e a
-- obrigacao de guardar a venda por cinco anos seria descumprida. O `id` fica,
-- os valores ficam, os campos pessoais somem — RF-128.
--
-- O titular pediu exclusao e recebe anonimizacao. A diferenca esta escrita no
-- comprovante que o caso de uso devolve.

ALTER TABLE customers ADD COLUMN anonymized_at timestamptz;

-- `ON DELETE SET NULL` como o resto do schema: quem anonimizou pode sair da
-- empresa depois, e o cadastro dele ser removido. A anonimizacao continua
-- registrada — perder QUEM e aceitavel, perder QUE ACONTECEU nao seria.
ALTER TABLE customers ADD COLUMN anonymized_by uuid REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN customers.anonymized_at IS
  'Quando os dados pessoais foram substituidos a pedido do titular (RF-127). Nulo enquanto nao houve pedido.';

-- Indice parcial: a esmagadora maioria e nula, e a unica consulta que interessa
-- e "quais foram anonimizados" — para o relatorio de atendimento a titulares.
CREATE INDEX customers_anonimizados
  ON customers (company_id, anonymized_at)
  WHERE anonymized_at IS NOT NULL;
