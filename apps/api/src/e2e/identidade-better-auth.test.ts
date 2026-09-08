import { randomUUID } from 'node:crypto'
import { closeConnection, getClient, migrate } from '@na-regua/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IdentidadeBetterAuth } from '../identidade-better-auth.js'

/**
 * O provedor de identidade contra Postgres de verdade — NR-084, ADR-0002.
 *
 * ## Por que esta suite existe
 *
 * Porque quase tudo que pode dar errado aqui e de integracao, e nenhum falso
 * pegaria: o `search_path` apontar para o schema errado, o plugin de telefone
 * nao achar o numero, o e-mail sintetico vazar para fora, a sessao do provedor
 * ficar viva. Todas passam por um banco.
 *
 * A afirmacao mais importante e a ultima do arquivo: **as tabelas dele nascem em
 * `identidade`, e nao em `public`**. Se ela quebrar, quatro tabelas sem RLS
 * apareceram ao lado das nossas, por baixo da invariante da ADR-0001 — e nada
 * mais falharia para avisar.
 *
 * ## Por que em `e2e/`, se nao entra por HTTP
 *
 * Porque e a pasta que a fronteira do `dependency-cruiser` abre para quem
 * precisa dos DOIS lados — `apps/api` e `packages/db`. A regra
 * `handler-nao-importa-db` protege o caminho de PRODUCAO: handler que consulta
 * o banco direto faz a regra migrar para a rota, e o canal WhatsApp deixa de
 * aplica-la. Um teste que le o banco nao faz canal nenhum pular regra, e a
 * excecao e a pasta justamente para nao virar "todo arquivo .test.ts".
 *
 * Este teste precisa dos dois: `migrate` cria o schema `identidade` (0023) e a
 * consulta em `pg_class` confere onde as tabelas nasceram.
 *
 * Como as suites de `db`: pulada sem `DATABASE_URL`, executada na CI.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

/* 32+ caracteres, o piso que a propria biblioteca exige. */
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres'

describe.skipIf(!DATABASE_URL)('provedor de identidade — NR-084', () => {
  /* A mesma conexao do resto do repo — `apps/api` nao depende de `postgres`
     direto, e nao vale acrescentar a dependencia por causa de um teste. */
  let admin: ReturnType<typeof getClient>
  let identidade: IdentidadeBetterAuth

  beforeAll(async () => {
    admin = getClient(MIGRATION_URL!)

    /* A 0023 cria o schema `identidade`; sem ela o `search_path` aponta para
       lugar nenhum e toda consulta do provedor falha. */
    await migrate(MIGRATION_URL!)

    identidade = new IdentidadeBetterAuth({
      databaseUrl: DATABASE_URL!,
      secret: SEGREDO,
      minimoDeSenha: 8,
    })

    /* Quem cria as tabelas dele e ele, e nao `packages/db` — ver a 0023. */
    await identidade.migrar()
  }, 60_000)

  afterAll(async () => {
    await identidade?.encerrar()
    await closeConnection()
  })

  const email = () => `pessoa-${randomUUID()}@loja.com`
  /* Numero unico por teste: o telefone e unico na tabela dele. */
  const telefone = () => `4198${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`

  describe('cadastro e entrada por e-mail', () => {
    it('cadastra e depois entra com a mesma credencial', async () => {
      const identifier = email()
      const criado = await identidade.register(
        { identifier, secret: 'senha-de-teste' },
        { email: identifier, phone: null },
      )

      expect(criado?.subject).toBeTruthy()

      const conferido = await identidade.verify({ identifier, secret: 'senha-de-teste' })

      /* O MESMO `subject` nas duas chamadas: e por ele que `users.auth_subject`
         amarra a identidade externa, e um id diferente a cada login faria todo
         retorno parecer uma pessoa nova. */
      expect(conferido?.subject).toBe(criado?.subject)
      expect(conferido?.email).toBe(identifier)
    })

    /* Resultado, e nao excecao: o caso de uso trata os dois no mesmo `if`. */
    it('senha errada devolve indefinido', async () => {
      const identifier = email()
      await identidade.register(
        { identifier, secret: 'senha-de-teste' },
        { email: identifier, phone: null },
      )

      expect(await identidade.verify({ identifier, secret: 'senha-errada' })).toBeUndefined()
    })

    /* A mesma resposta de senha errada — RF-120: nada aqui pode servir de
       oraculo para descobrir se um e-mail esta cadastrado. */
    it('pessoa que nao existe devolve indefinido', async () => {
      expect(
        await identidade.verify({ identifier: email(), secret: 'senha-de-teste' }),
      ).toBeUndefined()
    })

    it('cadastrar duas vezes o mesmo e-mail devolve indefinido', async () => {
      const identifier = email()
      const dados = { email: identifier, phone: null }

      expect(
        await identidade.register({ identifier, secret: 'senha-de-teste' }, dados),
      ).not.toBeUndefined()
      expect(
        await identidade.register({ identifier, secret: 'outra-senha' }, dados),
      ).toBeUndefined()
    })

    it('recusa senha menor que o minimo', async () => {
      const identifier = email()

      expect(
        await identidade.register(
          { identifier, secret: 'curta' },
          { email: identifier, phone: null },
        ),
      ).toBeUndefined()
    })
  })

  describe('cadastro e entrada por telefone — RF-005', () => {
    /*
     * A RF-005 permite convidar so por telefone, e o `signUpEmail` exige
     * e-mail: por isso um sintetico em `.invalid`. O que este teste guarda e
     * que ele NAO sai do adapter — se saisse, `findByEmail` procuraria em
     * `users` um endereco que so existe dentro do provedor, nao acharia
     * ninguem, e o convidado receberia falha na estreia.
     */
    it('cadastra so com telefone e entra pelo numero', async () => {
      const phone = telefone()
      const criado = await identidade.register(
        { identifier: phone, secret: 'senha-de-teste' },
        { email: null, phone },
      )

      expect(criado?.subject).toBeTruthy()

      const conferido = await identidade.verify({ identifier: phone, secret: 'senha-de-teste' })

      expect(conferido?.subject).toBe(criado?.subject)
      expect(conferido?.phone).toBe(phone)
      /* O sintetico fica dentro. */
      expect(conferido?.email).toBeNull()
    })

    it('senha errada por telefone devolve indefinido', async () => {
      const phone = telefone()
      await identidade.register(
        { identifier: phone, secret: 'senha-de-teste' },
        { email: null, phone },
      )

      expect(await identidade.verify({ identifier: phone, secret: 'errada' })).toBeUndefined()
    })

    it('telefone que nao existe devolve indefinido', async () => {
      expect(
        await identidade.verify({ identifier: telefone(), secret: 'senha-de-teste' }),
      ).toBeUndefined()
    })

    /* Quem tem os dois entra pelos dois, e o `subject` e o mesmo — senao seriam
       duas pessoas diferentes no nosso `users`, dependendo de como entrou. */
    it('com e-mail e telefone, os dois caminhos levam ao mesmo subject', async () => {
      const identifier = email()
      const phone = telefone()
      const criado = await identidade.register(
        { identifier, secret: 'senha-de-teste' },
        { email: identifier, phone },
      )

      const porEmail = await identidade.verify({ identifier, secret: 'senha-de-teste' })
      const porTelefone = await identidade.verify({ identifier: phone, secret: 'senha-de-teste' })

      expect(porEmail?.subject).toBe(criado?.subject)
      expect(porTelefone?.subject).toBe(criado?.subject)
      /* E o contato volta inteiro nos dois: `login.ts` procura o usuario local
         por e-mail OU telefone, e devolver so um faria o convidado que entra
         pelo caminho faltante receber falha na estreia. */
      expect(porEmail?.phone).toBe(phone)
      expect(porTelefone?.email).toBe(identifier)
    })
  })

  describe('o provedor nao acumula sessao', () => {
    /*
     * A sessao dele nao serve para nada aqui: a nossa e outra, com empresa e
     * papel dentro (ADR-0002). Deixa-la viva seria guardar por sete dias um
     * token valido que ninguem pediu e ninguem acompanha — exatamente o que a
     * NR-083 acabou de consertar do nosso lado.
     */
    it('entrar nao deixa sessao do provedor para tras', async () => {
      const identifier = email()
      await identidade.register(
        { identifier, secret: 'senha-de-teste' },
        { email: identifier, phone: null },
      )

      await identidade.verify({ identifier, secret: 'senha-de-teste' })
      await identidade.verify({ identifier, secret: 'senha-de-teste' })

      const [linha] = await admin<{ total: string }[]>`
        SELECT count(*)::text AS total
          FROM identidade.session s
          JOIN identidade."user" u ON u.id = s."userId"
         WHERE u.email = ${identifier}
      `
      expect(Number(linha!.total)).toBe(0)
    })
  })

  describe('as tabelas do provedor ficam FORA de public — ADR-0001', () => {
    /*
     * A afirmacao que sustenta o desenho todo.
     *
     * `schema.test.ts` exige RLS em toda tabela de `public`. As quatro do
     * provedor nao tem `company_id` e nunca terao — a credencial e da pessoa,
     * nao da loja. Se elas nascerem em `public`, ou a invariante ganha quatro
     * furos, ou o teste dela passa a reprovar por um motivo que nao e o dele.
     *
     * Quem as mantem no lugar e uma linha: `options: '-c search_path=identidade'`
     * no pool. E uma linha e facil de perder num merge.
     */
    it.each(['user', 'session', 'account', 'verification'])(
      'a tabela %s nasce em identidade',
      async (tabela) => {
        const linhas = await admin<{ nspname: string }[]>`
          SELECT n.nspname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relname = ${tabela} AND c.relkind = 'r'
        `

        const schemas = linhas.map((l: { nspname: string }) => l.nspname)
        expect(schemas).toContain('identidade')
        expect(schemas).not.toContain('public')
      },
    )
  })
})
