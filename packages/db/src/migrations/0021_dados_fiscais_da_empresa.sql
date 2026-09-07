-- Inscricoes e ramo de atividade da empresa — NR-072, RF-003, RF-046.
--
-- A tela de Empresa pede inscricao estadual, inscricao municipal e ramo de
-- atividade desde sempre, e nenhum dos tres tinha coluna. Eram digitados e
-- descartados, como o endereco antes da 0019.
--
-- As duas inscricoes nao sao perda de cadastro apenas: elas entram na NOTA. Sem
-- inscricao estadual nao se emite NFC-e como contribuinte de ICMS, e sem a
-- municipal nao se emite NFS-e. A emissao ia funcionar em teste e falhar na
-- primeira nota de verdade, com uma mensagem da SEFAZ que ninguem no produto
-- saberia traduzir.

-- ---------------------------------------------------------------------------
-- Todos ANULAVEIS, e nao obrigatorios
-- ---------------------------------------------------------------------------
--
-- MEI nao tem inscricao estadual. Loja que so vende produto nao tem inscricao
-- municipal. E a RF-001 cadastra a empresa com razao social, CNPJ, e-mail e
-- telefone — exigir os tres aqui quebraria o cadastro de conta, que e a
-- primeira coisa que o lojista faz.
--
-- Quem cobra e a EMISSAO, no momento em que eles fazem falta, com a mensagem
-- certa. Cobrar no cadastro empurraria de volta para o caderno alguem que so
-- queria comecar a usar.

ALTER TABLE companies
  ADD COLUMN state_registration     text,
  ADD COLUMN municipal_registration text,
  ADD COLUMN business_segment       text;

ALTER TABLE companies
  ADD CONSTRAINT companies_inscricao_estadual_tamanho
    CHECK (state_registration IS NULL
           OR char_length(btrim(state_registration)) BETWEEN 2 AND 20),
  ADD CONSTRAINT companies_inscricao_municipal_tamanho
    CHECK (municipal_registration IS NULL
           OR char_length(btrim(municipal_registration)) BETWEEN 2 AND 20),
  ADD CONSTRAINT companies_ramo_tamanho
    CHECK (business_segment IS NULL
           OR char_length(btrim(business_segment)) BETWEEN 2 AND 80);

-- ---------------------------------------------------------------------------
-- `business_segment` e o RAMO, e nao o CNAE
-- ---------------------------------------------------------------------------
--
-- A tela oferece uma lista de segmentos em portugues corrente — "Mercearia e
-- minimercado", "Pet shop", "Oficina e autopecas". E o que o lojista sabe
-- responder, e serve para o produto se ajustar a ele.
--
-- CNAE e outra coisa: sete digitos, definidos pelo contador, e e ele que decide
-- codigo de servico na NFS-e. Guardar o segmento numa coluna chamada `cnae`
-- criaria uma coluna que a tela nunca consegue preencher direito — e alguem, no
-- dia da primeira NFS-e, leria "Pet shop" onde esperava "9609204". O CNAE entra
-- quando houver quem o informe.

COMMENT ON COLUMN companies.state_registration IS
  'Inscricao estadual. Formato varia por UF, e "ISENTO" e valor legitimo.';

COMMENT ON COLUMN companies.municipal_registration IS
  'Inscricao municipal. Necessaria para NFS-e; nem toda loja tem.';

COMMENT ON COLUMN companies.business_segment IS
  'Ramo de atividade em texto corrente. NAO e o CNAE (NR-072).';

-- ---------------------------------------------------------------------------
-- Por que a inscricao estadual NAO tem formato validado
-- ---------------------------------------------------------------------------
--
-- Cada estado tem o seu: Sao Paulo usa 12 digitos com dois verificadores, o
-- Parana usa 10, a Bahia aceita 8 e 9, e "ISENTO" e um valor legitimo em
-- varios. Um CHECK que aceitasse so um formato recusaria empresa de verdade, e
-- um que aceitasse todos nao guardaria nada. Fica so o tamanho, e a validacao
-- por estado entra com a emissao, onde ha a quem perguntar.
