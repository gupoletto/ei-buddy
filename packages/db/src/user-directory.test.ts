import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'
import { createUserDirectory } from './user-directory.js'

/**
 * Diretorio de usuarios — NR-014. RF-005, RF-119.
 *
 * A suite existe por uma propriedade que nenhum teste em memoria alcanca: o
 * login precisa ler `users` SEM empresa no contexto, e a politica de RLS
 * (0003) mais o erro da 0001 tornam isso impossivel por consulta normal.
 *
 * O que se prova aqui e que o caminho estreito da 0003 funciona **e continua
 * estreito** — a consulta comum ainda esconde usuario de outra loja.
 *
 * Como nas outras suites de `db`: pulada sem `DATABASE_URL`, executada na CI,
 * com as asserções rodando por um papel COMUM.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('diretorio de usuarios — NR-014', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string

  async function criarEmpresa(prefixo: string, nome: string): Promise<string> {
    const id = randomUUID()
    const cnpj = cnpjDeTeste(prefixo)
    await withTenant(
      sql,
      id,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${id}, ${nome}, ${cnpj}, ${`contato@${cnpj}.local`}, ${'41999990000'})
      `,
    )
    return id
  }

  beforeAll(async () => {
    admin = postgres(MIGRATION_URL!, { max: 1, onnotice: () => undefined })
    await migrate(MIGRATION_URL!)
    aplicacao = await conectarComoAplicacao(admin, MIGRATION_URL!)
    sql = aplicacao.sql

    empresaA = await criarEmpresa('1', 'Loja A')
    empresaB = await criarEmpresa('2', 'Loja B')
  })

  afterAll(async () => {
    await aplicacao?.encerrar()
    await admin?.end({ timeout: 5 })
  })

  const diretorio = () => createUserDirectory(sql)

  describe('as funcoes auth_* atravessam a politica, e so elas', () => {
    /*
     * O teste central. Se `findByEmail` fosse um `SELECT ... FROM users`
     * comum, esta chamada LANCARIA — a 0004 recusa consulta sem
     * `app.company_id`, e ela recusa com razao. Que ela responda aqui e a
     * prova de que o login tem por onde comecar.
     */
    it('acha por e-mail sem nenhuma empresa no contexto', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Ana da Loja A',
        email: `ana-${randomUUID()}@loja.com`,
        phone: null,
        role: 'owner',
        createdAt: new Date(),
      })

      const achado = await diretorio().findById(criado.id)

      expect(achado).toMatchObject({ id: criado.id, isActive: true })
    })

    /*
     * O caso do convite (RF-005): procurar por e-mail COM a empresa no
     * contexto esconde exatamente quem se quer convidar — quem ainda nao tem
     * vinculo com ela. Sem este caminho, convidar o contador de outra loja
     * criaria um usuario duplicado e explodiria em `users_email_unico`.
     */
    it('acha quem nao tem vinculo nenhum com a empresa que esta convidando', async () => {
      const email = `contador-${randomUUID()}@escritorio.com`
      await diretorio().createUserWithAccess({
        companyId: empresaB,
        name: 'Contador da B',
        email,
        phone: null,
        role: 'accountant',
        createdAt: new Date(),
      })

      const achado = await diretorio().findByEmail(email)

      expect(achado?.name).toBe('Contador da B')
    })

    /*
     * O contrapeso. As funcoes atravessam; a consulta comum nao. Se este teste
     * quebrar, o buraco deixou de ser estreito — e ai `users` estaria legivel
     * entre lojas, que e o risco T1.
     */
    it('a consulta comum sob RLS continua escondendo usuario de outra loja', async () => {
      const email = `so-da-b-${randomUUID()}@x.com`
      await diretorio().createUserWithAccess({
        companyId: empresaB,
        name: 'So da B',
        email,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })

      const visiveis = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ id: string }[]>`SELECT id FROM users WHERE lower(email) = lower(${email})`,
      )

      expect(visiveis).toHaveLength(0)
    })

    /*
     * `SECURITY DEFINER` sem `search_path` fixo e a falha classica: quem chama
     * cria uma tabela `users` num schema que venha antes e a funcao, rodando
     * com privilegio do dono, le a tabela do atacante. A funcao continua
     * "funcionando", entao nenhum teste de comportamento pega isso — so este,
     * que olha a definicao.
     */
    it('toda funcao auth_* tem search_path fixo', async () => {
      const funcoes = await sql<{ proname: string; proconfig: string[] | null }[]>`
        SELECT p.proname, p.proconfig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname LIKE 'auth\\_%'
           AND p.prosecdef
      `

      expect(funcoes.length).toBeGreaterThanOrEqual(7)

      for (const f of funcoes) {
        expect(f.proconfig, `${f.proname} sem search_path`).toEqual(
          expect.arrayContaining([expect.stringMatching(/^search_path=/)]),
        )
      }
    })
  })

  describe('criar pessoa e acesso juntos', () => {
    /*
     * Nao ha estado intermediario valido: usuario sem vinculo nao entra (login
     * com zero vinculos responde falha) e ainda ocupa o e-mail no indice
     * unico, o que faria a segunda tentativa de convite responder "esta pessoa
     * ja existe". O convite viraria impossivel.
     */
    it('grava o usuario e o vinculo', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Novo Funcionario',
        email: `novo-${randomUUID()}@loja.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })

      const vinculo = await diretorio().findMembership(empresaA, criado.id)

      expect(vinculo).toMatchObject({ companyId: empresaA, role: 'staff' })
    })

    /*
     * `INSERT INTO users ... RETURNING` devolve VAZIO sob RLS, porque o
     * RETURNING passa pela politica de SELECT e o vinculo ainda nao existe. O
     * repositorio gera o uuid na aplicacao por isso, e este teste guarda a
     * razao: se alguem trocar por RETURNING, o id volta indefinido.
     */
    it('devolve o id mesmo com o RETURNING filtrado pela politica', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Com Id',
        email: `comid-${randomUUID()}@loja.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })

      expect(criado.id).toMatch(/^[0-9a-f-]{36}$/)
    })

    /*
     * A regra que faltava em todo lugar. Pessoa sem NENHUM contato e uma linha
     * em `users` que ninguem consegue reivindicar: o primeiro login amarra a
     * identidade do provedor por e-mail ou por telefone, e sem os dois o
     * convidado nunca entra — e a linha ocupa o lugar dele para sempre.
     */
    it('recusa pessoa sem e-mail e sem telefone', async () => {
      await expect(
        diretorio().createUserWithAccess({
          companyId: empresaA,
          name: 'Sem Contato',
          email: null,
          phone: null,
          role: 'staff',
          createdAt: new Date(),
        }),
      ).rejects.toThrow(/users_tem_contato/)
    })

    /* O schema exigia e-mail e o contrato permitia so telefone: a validacao
       passava, a tela prometia, e o erro aparecia no INSERT. A CI mostrou. */
    it('aceita pessoa so com telefone — RF-005', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'So Telefone',
        email: null,
        phone: `4197${String(Date.now()).slice(-7)}`,
        role: 'staff',
        createdAt: new Date(),
      })

      expect(await diretorio().findById(criado.id)).toMatchObject({ id: criado.id })
    })

    it('recusa dois usuarios no mesmo telefone', async () => {
      const telefone = `4198${String(Date.now()).slice(-7)}`
      await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Primeiro',
        email: null,
        phone: telefone,
        role: 'staff',
        createdAt: new Date(),
      })

      /* Login por telefone com dois usuarios no mesmo numero nao tem resposta
         certa — devolveria um dos dois por sorte da ordem de leitura. */
      await expect(
        diretorio().createUserWithAccess({
          companyId: empresaB,
          name: 'Segundo',
          email: null,
          phone: telefone,
          role: 'staff',
          createdAt: new Date(),
        }),
      ).rejects.toThrow()
    })
  })

  describe('vinculos', () => {
    it('lista as lojas da pessoa, e so as ativas', async () => {
      const email = `duas-${randomUUID()}@x.com`
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Em Duas',
        email,
        phone: null,
        role: 'owner',
        createdAt: new Date(),
      })
      await diretorio().grantAccess({
        companyId: empresaB,
        userId: criado.id,
        role: 'accountant',
        createdAt: new Date(),
      })

      expect(await diretorio().listMemberships(criado.id)).toHaveLength(2)

      await withTenant(
        sql,
        empresaB,
        (tx) => tx`
          UPDATE company_users SET is_active = false
           WHERE company_id = ${empresaB} AND user_id = ${criado.id}
        `,
      )

      const restantes = await diretorio().listMemberships(criado.id)
      expect(restantes.map((v) => v.companyId)).toEqual([empresaA])
    })

    it('findMembership nao devolve vinculo revogado', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Desligado',
        email: `desligado-${randomUUID()}@x.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })

      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          UPDATE company_users SET is_active = false
           WHERE company_id = ${empresaA} AND user_id = ${criado.id}
        `,
      )

      expect(await diretorio().findMembership(empresaA, criado.id)).toBeUndefined()
    })

    /* `company_users` guarda a revogacao em `is_active` sem apagar a linha, e
       reconvidar casaria com uma linha que ja existe. Sem o ON CONFLICT,
       readmitir alguem seria impossivel pela tela. */
    it('readmite quem foi desligado em vez de estourar na chave', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Readmitido',
        email: `readmitido-${randomUUID()}@x.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          UPDATE company_users SET is_active = false
           WHERE company_id = ${empresaA} AND user_id = ${criado.id}
        `,
      )

      await diretorio().grantAccess({
        companyId: empresaA,
        userId: criado.id,
        role: 'owner',
        createdAt: new Date(),
      })

      expect(await diretorio().findMembership(empresaA, criado.id)).toMatchObject({ role: 'owner' })
    })
  })

  describe('amarrar a identidade do provedor', () => {
    it('amarra no primeiro login de quem foi convidado', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Convidado',
        email: `convidado-${randomUUID()}@x.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })
      const subject = `sub-${randomUUID()}`

      await diretorio().attachSubject(criado.id, subject)

      expect(await diretorio().findBySubject(subject)).toMatchObject({ id: criado.id })
    })

    /*
     * A clausula `auth_subject IS NULL` na funcao e o que impede a chamada de
     * virar sequestro de conta: sem ela, uma chamada com o id de outra pessoa
     * e um subject proprio entregaria a conta dela.
     */
    it('NAO reaponta identidade ja amarrada', async () => {
      const criado = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Ja Amarrado',
        email: `amarrado-${randomUUID()}@x.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })
      const original = `sub-${randomUUID()}`
      const doAtacante = `sub-${randomUUID()}`
      await diretorio().attachSubject(criado.id, original)

      await diretorio().attachSubject(criado.id, doAtacante)

      expect(await diretorio().findBySubject(original)).toMatchObject({ id: criado.id })
      expect(await diretorio().findBySubject(doAtacante)).toBeUndefined()
    })

    it('recusa o mesmo subject em duas pessoas', async () => {
      const subject = `sub-${randomUUID()}`
      const a = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Pessoa A',
        email: `pa-${randomUUID()}@x.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })
      const b = await diretorio().createUserWithAccess({
        companyId: empresaA,
        name: 'Pessoa B',
        email: `pb-${randomUUID()}@x.com`,
        phone: null,
        role: 'staff',
        createdAt: new Date(),
      })
      await diretorio().attachSubject(a.id, subject)

      await expect(diretorio().attachSubject(b.id, subject)).rejects.toThrow()
    })
  })
})
