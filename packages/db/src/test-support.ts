import postgres, { type Sql } from 'postgres'

/**
 * Apoio para os testes de isolamento. NAO e exportado pelo `index.ts`.
 *
 * Existe porque testar RLS com a conexao de administrador nao testa nada:
 * superusuario ignora politica, e o teste passa a medir o vazio. A CI descobriu
 * isso do jeito caro — oito testes vermelhos mostrando linhas de duas empresas
 * onde deveria haver uma.
 *
 * Aqui um papel comum e criado sob demanda, sem superusuario e sem BYPASSRLS, e
 * a suite conecta com ele. Assim o teste mede o que vai valer em producao, e
 * nao o privilegio de quem rodou.
 */

/** Papel de teste. Reusado entre execucoes; criado se nao existir. */
export const PAPEL_DE_TESTE = 'naregua_rls_test'
const SENHA_DE_TESTE = 'naregua_rls_test'

/**
 * CNPJ de teste com EXATAMENTE 14 digitos, exigencia do CHECK da tabela.
 *
 * `Date.now()` tem 13 digitos; um digito de prefixo fecha os 14 e distingue as
 * empresas criadas no mesmo milissegundo. A primeira versao montava 13 digitos
 * e a CI reprovou com `companies_cnpj_digitos` — o CHECK fez o trabalho dele.
 */
export function cnpjDeTeste(prefixo: string): string {
  const cnpj = `${prefixo}${Date.now()}`
  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error(`cnpjDeTeste gerou "${cnpj}", que nao tem 14 digitos.`)
  }
  return cnpj
}

export type ConexaoDeAplicacao = {
  /** Conexao com o papel comum — sujeita a RLS. */
  readonly sql: Sql
  readonly role: string
  encerrar(): Promise<void>
}

/**
 * Cria (ou reusa) o papel de teste, concede o minimo, e conecta com ele.
 *
 * `adminSql` precisa poder criar papel — na CI e no compose local, o usuario do
 * contedor pode. Se nao puder, o erro diz o que fazer em vez de a suite
 * silenciosamente medir o vazio.
 */
export async function conectarComoAplicacao(
  adminSql: Sql,
  adminUrl: string,
): Promise<ConexaoDeAplicacao> {
  try {
    /*
     * O `EXCEPTION` nao e zelo excessivo: os arquivos de teste rodam em
     * paralelo, e entre o `IF NOT EXISTS` e o `CREATE ROLE` cabe outra
     * execucao criando o mesmo papel. Sem ele, um dos arquivos falha com
     * "role already exists" e o motivo real (a corrida) fica escondido.
     */
    await adminSql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PAPEL_DE_TESTE}') THEN
          CREATE ROLE ${PAPEL_DE_TESTE} LOGIN PASSWORD '${SENHA_DE_TESTE}';
        END IF;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END
      $$
    `)
  } catch (erro) {
    throw new Error(
      `Nao foi possivel criar o papel de teste ${PAPEL_DE_TESTE}: ` +
        `${erro instanceof Error ? erro.message : erro}\n` +
        `Os testes de RLS precisam de um papel SEM superusuario — com a conexao de ` +
        `administrador eles mediriam o vazio, porque superusuario ignora politica.`,
    )
  }

  /*
   * O minimo para operar as tabelas, e nada mais. Em especial, nenhum
   * `BYPASSRLS` e nenhum `CREATEROLE`: o papel tem de ser tao comum quanto o
   * da aplicacao em producao.
   *
   * `ALTER DEFAULT PRIVILEGES` cobre as tabelas que uma migration futura criar
   * sem que alguem precise lembrar de voltar aqui.
   */
  await adminSql.unsafe(`GRANT USAGE ON SCHEMA public TO ${PAPEL_DE_TESTE}`)
  await adminSql.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${PAPEL_DE_TESTE}`,
  )
  await adminSql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${PAPEL_DE_TESTE}`,
  )

  /*
   * SEQUENCIAS tambem — e nao e detalhe de teste.
   *
   * Coluna `bigserial` cria uma sequencia, e `GRANT ... ON TABLES` nao a cobre:
   * o INSERT falha com "permission denied for sequence". A migration 0016
   * introduziu a primeira sequencia do schema (a ordem da trilha de estoque), e
   * a suite reprovou aqui antes de qualquer ambiente reprovar — que e o ponto
   * de a conexao de teste usar um papel COMUM em vez do dono do banco.
   *
   * Quem provisionar o papel da aplicacao em producao precisa conceder o mesmo.
   * Ver docs/engenharia/banco-de-dados.md.
   */
  await adminSql.unsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${PAPEL_DE_TESTE}`,
  )
  await adminSql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO ${PAPEL_DE_TESTE}`,
  )

  const url = new URL(adminUrl)
  url.username = PAPEL_DE_TESTE
  url.password = SENHA_DE_TESTE

  const sql = postgres(url.toString(), { max: 6, onnotice: () => {} })

  /* Confere que o papel realmente nao escapa — senao a suite volta a medir o
     vazio, agora com um nome que sugere o contrario. */
  const [papel] = await sql<{ super: boolean; bypass: boolean }[]>`
    SELECT rolsuper AS super, rolbypassrls AS bypass
      FROM pg_roles WHERE rolname = current_user
  `
  if (papel?.super || papel?.bypass) {
    await sql.end({ timeout: 5 })
    throw new Error(
      `O papel ${PAPEL_DE_TESTE} tem superusuario ou BYPASSRLS. ` +
        `Com ele, os testes de isolamento nao verificam nada.`,
    )
  }

  return {
    sql,
    role: PAPEL_DE_TESTE,
    encerrar: () => sql.end({ timeout: 5 }),
  }
}
