-- O vocabulario da trilha cresce — NR-087, RF-123, US-061.
--
-- ## O problema
--
-- A 0007 fechou `action` em quatro verbos de CRUD. Cinco eventos que NAO sao
-- CRUD vinham sendo gravados como o verbo mais proximo, com o nome real
-- escondido em `after.event`:
--
--   session_started, session_ended  -> action = 'updated'   (entidade User)
--   access_granted                  -> action = 'created'   (entidade User)
--   anonymized                      -> action = 'updated'   (entidade Customer)
--   data_export                     -> action = 'created'   (entidade Company)
--
-- Tres arquivos de `core` traziam o mesmo comentario admitindo a gambiarra e
-- dizendo que crescer o vocabulario era uma migration. E esta.
--
-- ## Por que isso nao era estetico
--
-- A US-061 e "quero saber quem fez o que para resolver divergencia com meu
-- funcionario". Com o vocabulario antigo, perguntar "o que foi alterado neste
-- usuario" devolvia LOGINS, e "quais usuarios foram criados" devolvia tambem
-- quem so ganhou acesso a mais uma loja. A trilha respondia a pergunta errada,
-- e o filtro certo exigia saber do truque do `after.event` — que nenhum indice
-- alcanca.
--
-- ## Por que agora
--
-- Porque agora e de graca. A trilha vivia em memoria ate esta tarefa: nao ha
-- uma linha gravada em lugar nenhum. Depois do primeiro registro em producao,
-- renomear acao vira migracao de dado — e migracao de dado numa tabela
-- somente-insercao, cujos gatilhos recusam UPDATE, seria uma tabela nova e uma
-- copia.
--
-- ## O CHECK e recriado, e nao alterado
--
-- Postgres nao tem `ALTER CONSTRAINT` para mudar a expressao de um CHECK.
-- Derrubar e recriar e o caminho, e e seguro aqui porque a tabela esta vazia —
-- num banco com dados, o `ADD CONSTRAINT` validaria as linhas existentes e
-- falharia se alguma tivesse valor fora da lista nova. Como a lista so CRESCE,
-- nem isso aconteceria.

ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN (
    -- Os quatro de CRUD, como antes.
    'created', 'updated', 'deleted', 'cancelled',
    -- Os cinco que estavam escondidos em `after.event`.
    'access_granted', 'anonymized', 'data_export', 'session_started', 'session_ended'
  ));

-- O CHECK de "criacao nao tem antes" continua valendo, e continua sendo sobre
-- `created` apenas: os verbos novos tambem nascem sem estado anterior, mas por
-- razoes proprias — `anonymized` de proposito (guardar o antes preservaria o
-- dado que o titular pediu para excluir), e os outros porque nao ha antes.
-- Amarra-los ao mesmo CHECK esconderia essa diferenca.

COMMENT ON COLUMN audit_log.action IS
  'Verbo do evento. Quatro de CRUD mais cinco de dominio (NR-087). Evento novo entra aqui, e nao em after.event.';
