-- Endereco de empresa e de cliente — NR-072, RF-003, RF-011.
--
-- NENHUMA tabela guardava endereco. As telas de Empresa e de Cliente pedem CEP,
-- logradouro, numero, complemento, bairro, cidade e UF desde sempre, com busca
-- automatica por CEP — e o dado era descartado. O lojista preenchia sete campos
-- e nada disso existia no dia seguinte.
--
-- Isso tambem e o que mantinha as duas telas presas em `lib/mock-data`, e o que
-- fez o mapeamento da planilha de clientes deixar cidade e UF de fora com a
-- nota "voltam quando houver onde guardar". E agora.

-- ---------------------------------------------------------------------------
-- Colunas achatadas, e nao uma tabela `addresses`
-- ---------------------------------------------------------------------------
--
-- Um endereco aqui pertence a exatamente UMA entidade e nunca e compartilhado:
-- duas empresas no mesmo predio sao dois enderecos iguais, e nao o mesmo
-- endereco. Uma tabela separada custaria um JOIN em toda leitura de cadastro
-- para normalizar algo que ninguem reusa — e abriria a porta para endereco
-- orfao, que e lixo que so aparece anos depois.
--
-- Todos ANULAVEIS. A RF-009 e explicita: cliente precisa de "apenas nome e
-- telefone", e exigir CEP travaria o balcao. Para a empresa, o endereco chega
-- pela busca de CNPJ e pode faltar. Coluna obrigatoria aqui seria uma regra que
-- o produto nao tem.

-- A UF, com a lista fechada. `text` + CHECK como o resto do schema: enum nativo
-- nao volta atras, e a lista das 27 e a coisa mais estavel do Brasil — mas o
-- padrao do repositorio vale mesmo quando a lista nao muda.
CREATE OR REPLACE FUNCTION uf_valida(uf text) RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $$
    SELECT uf IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    )
  $$;

COMMENT ON FUNCTION uf_valida(text) IS
  'As 27 unidades federativas. Usada nos CHECK de endereco (NR-072).';

ALTER TABLE companies
  ADD COLUMN zip_code   text,
  ADD COLUMN street     text,
  ADD COLUMN number     text,
  ADD COLUMN complement text,
  ADD COLUMN district   text,
  ADD COLUMN city       text,
  ADD COLUMN state      text CHECK (state IS NULL OR uf_valida(state));

ALTER TABLE customers
  ADD COLUMN zip_code   text,
  ADD COLUMN street     text,
  ADD COLUMN number     text,
  ADD COLUMN complement text,
  ADD COLUMN district   text,
  ADD COLUMN city       text,
  ADD COLUMN state      text CHECK (state IS NULL OR uf_valida(state));

-- `number` e TEXTO e nao inteiro: existe "s/n", "120-A" e "KM 42". Guardar como
-- numero obrigaria a inventar uma convencao para os tres, e a primeira entrega
-- perdida seria a de um endereco desses.
COMMENT ON COLUMN customers.number IS
  'Numero do endereco. Texto porque existe "s/n", "120-A" e "KM 42".';

-- ---------------------------------------------------------------------------
-- O que NAO ganhou coluna, e por que
-- ---------------------------------------------------------------------------
--
-- **Tipo de pessoa** (fisica ou juridica). A tela mostra, e ele e DERIVADO do
-- documento: onze digitos e CPF, catorze e CNPJ. Guardar seria criar uma
-- segunda fonte para a mesma verdade, e no dia em que as duas divergissem
-- ninguem saberia qual vale — e um cadastro com CNPJ marcado como pessoa fisica
-- emite nota errada.
--
-- **DDD separado do celular.** `phone` ja guarda o numero inteiro, e o DDD sao
-- os dois primeiros digitos. Duas colunas para um numero so criam o estado
-- invalido "DDD de Sao Paulo com celular de Manaus", que nenhuma validacao
-- pega depois de gravado.
--
-- Os dois sao calculados na apresentacao. Ver `documento.ts` em `contracts`.
