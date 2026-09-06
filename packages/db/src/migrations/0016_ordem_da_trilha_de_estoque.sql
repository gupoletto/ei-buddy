-- Ordem total na trilha de estoque — RF-124, NR-023.
--
-- O defeito: `inventory_movements` ordenava por `created_at DESC`, e
-- `created_at` vem do INSTANTE DA REQUISICAO (`ctx.now`), nao de `now()`. Dois
-- movimentos da mesma requisicao nascem com o mesmo carimbo, e o desempate
-- caia num uuid aleatorio — a trilha voltava fora de ordem.
--
-- Isso nao e detalhe de teste. A trilha existe para responder "por que o saldo
-- esta assim", e ela responde mostrando o saldo apos cada movimento: 0 -> 10 ->
-- 8 -> 25. Fora de ordem, ela mostra 8 depois de 25 e a sequencia deixa de
-- explicar coisa nenhuma. Acontece exatamente onde mais doi: importacao de
-- planilha e ajuste em lote, que gravam varios movimentos num instante so.
--
-- A correcao e dar a trilha uma ordem TOTAL, que e o que um livro-razao
-- precisa ter. `bigserial` e monotonico por insercao e independe do relogio de
-- quem chamou.

ALTER TABLE inventory_movements ADD COLUMN seq bigserial NOT NULL;

COMMENT ON COLUMN inventory_movements.seq IS
  'Ordem de insercao. E por ela que a trilha se le, e nao por created_at (RF-124).';

-- O indice novo serve a MESMA consulta que o antigo — "o historico deste
-- produto, do mais recente para tras" — com a diferenca de que agora a ordem e
-- deterministica.
CREATE INDEX inventory_movements_por_produto_seq
  ON inventory_movements (company_id, product_id, seq DESC);

-- O antigo sai. Nao ha consulta por faixa de data na trilha, e manter dois
-- indices para a mesma pergunta e custo de escrita em toda venda — a tabela so
-- cresce, e cada venda insere uma linha por item.
DROP INDEX inventory_movements_por_produto;

-- ---------------------------------------------------------------------------
-- O autor da trilha, alinhado com a convencao da audit_log
-- ---------------------------------------------------------------------------
--
-- `created_by` era `REFERENCES users (id) ON DELETE SET NULL` numa tabela
-- SOMENTE-INSERCAO. As duas coisas nao convivem: `ON DELETE SET NULL` executa
-- um UPDATE na linha que referencia, e o gatilho `inventory_movements_sem_update`
-- recusa. O resultado pratico e que apagar um usuario que ja mexeu no estoque
-- falhava com "e somente-insercao: UPDATE nao e permitido" — uma mensagem que
-- nao aponta para nada e num caminho que ninguem exercitava.
--
-- A `audit_log` (0007) ja resolveu isto e deixou o motivo escrito: `actor_id`
-- e `NOT NULL` e **sem FK**, porque "o autor pode ser desligado da empresa sem
-- que o que ele fez deixe de valer". A trilha de estoque e a mesma coisa e
-- segue a mesma regra.
--
-- O `SET NULL` nunca chegou a acontecer — o gatilho o impedia — entao nao ha
-- linha nula para tratar. Se houvesse, esta migration falharia alto, que e o
-- desfecho certo para um dado que ninguem sabe reconstruir.

ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_created_by_fkey;
ALTER TABLE inventory_movements ALTER COLUMN created_by SET NOT NULL;

COMMENT ON COLUMN inventory_movements.created_by IS
  'Quem fez o movimento. Sem FK de proposito: o autor pode sair da empresa sem que o movimento deixe de valer (US-061), e a trilha nao aceita UPDATE (RF-124).';
