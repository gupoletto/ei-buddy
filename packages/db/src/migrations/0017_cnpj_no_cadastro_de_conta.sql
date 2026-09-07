-- O caminho estreito do CADASTRO DE CONTA — NR-014, RF-002, RF-121.
--
-- ## O defeito
--
-- `signup` comeca perguntando se o CNPJ ja tem cadastro (RF-002). Essa pergunta
-- acontece ANTES de existir empresa — descobrir se ela existe e justamente o
-- que se esta fazendo. O repositorio respondia com `withPlatformScope`, que
-- roda a consulta SEM tenant.
--
-- E consulta sem tenant LANCA, de proposito, desde a 0004 (RF-121): melhor
-- falhar que devolver vazio, porque vazio parece resposta. Entao, numa conexao
-- de verdade — papel comum, sujeito a RLS — o cadastro morria na primeira
-- linha com:
--
--   Consulta sem empresa no contexto: app.company_id nao esta definido.
--
-- A api traduzia para 500, e a pessoa via "algo deu errado do nosso lado". Nao
-- havia como criar conta, e sem conta nao havia como entrar.
--
-- ## Por que nenhum teste pegou
--
-- Porque todos rodavam a conexao do DONO do banco, e dono e superusuario —
-- superusuario ignora politica de RLS inteiramente, entao a consulta sem tenant
-- nunca chegava a falhar. O teste passava pelo motivo errado. E a mesma
-- armadilha que o `checkIsolation` da subida existe para denunciar, e que a
-- suite de `db` ja evita conectando com um papel comum.
--
-- ## A correcao
--
-- A mesma que a 0009 usou para o login, que tem a MESMA contradicao: o login
-- precisa achar o usuario antes de saber a empresa. Uma funcao `SECURITY
-- DEFINER` estreita, com as quatro travas de la:
--
-- 1. `SET search_path` — sem isso, quem chama poderia criar uma tabela
--    `companies` num schema anterior no caminho de busca e a funcao, rodando
--    com privilegio do dono, leria a tabela do atacante.
-- 2. Igualdade exata, nunca padrao — inutil para enumerar a base.
-- 3. Retorno minimo. Aqui ele e o menor possivel: um BOOLEANO. A funcao nao
--    devolve id, nome nem nada da empresa existente, o que casa com a RF-002
--    ("recusar sem revelar dados da empresa existente").
-- 4. `STABLE`, sem escrita.
--
-- Sobre GRANT vale o mesmo da 0009: a funcao nasce executavel por PUBLIC e
-- assim fica, porque o papel da aplicacao muda por ambiente e a migration nao o
-- conhece. O contrapeso e o retorno: quem chamar so descobre o que ja teria
-- descoberto tentando cadastrar.

CREATE OR REPLACE FUNCTION auth_cnpj_taken(p_cnpj text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (SELECT 1 FROM companies c WHERE c.cnpj = p_cnpj)
  $$;

COMMENT ON FUNCTION auth_cnpj_taken(text) IS
  'Este CNPJ ja tem cadastro? Booleano, sem empresa no contexto (RF-002, NR-014).';
