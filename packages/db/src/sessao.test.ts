import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { createLoginThrottle, createSessionIssuer, hashDoToken } from './session-repository.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'
import { createUserDirectory } from './user-directory.js'

/**
 * Sessao persistente e desaceleracao — NR-083, ADR-0002, RF-119, RF-120.
 *
 * O que se prova aqui e o que so o banco prova:
 *
 * - a sessao **sobrevive** ao processo, que era o ponto de sair da memoria;
 * - a tabela guarda o HASH e nunca o token;
 * - expirada e revogada nao voltam — e o filtro esta na FUNCAO, entao nenhum
 *   caminho em TypeScript pode esquecer dele;
 * - as duas tabelas negam tudo para o papel comum, e o acesso so acontece pelas
 *   funcoes `auth_*` (mesmo desenho da 0009);
 * - a desaceleracao conta, dobra, tem teto e esquece fora da janela.
 *
 * Como nas outras suites de `db`: pulada sem `DATABASE_URL`, executada na CI,
 * com as assercoes rodando por um papel COMUM — com a conexao de administrador,
 * superusuario ignora RLS e a suite mediria o vazio.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('sessao e desaceleracao — NR-083', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresa: string

  beforeAll(async () => {
    admin = postgres(MIGRATION_URL!, { max: 1, onnotice: () => undefined })
    await migrate(MIGRATION_URL!)
    aplicacao = await conectarComoAplicacao(admin, MIGRATION_URL!)
    sql = aplicacao.sql

    empresa = randomUUID()
    const cnpj = cnpjDeTeste('7')
    await withTenant(
      sql,
      empresa,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${empresa}, ${'Loja da Sessao'}, ${cnpj}, ${`contato@${cnpj}.local`}, ${'41999990000'})
      `,
    )
  })

  afterAll(async () => {
    await aplicacao?.encerrar()
    await admin?.end({ timeout: 5 })
  })

  const emissor = () => createSessionIssuer(sql)
  const desaceleracao = () => createLoginThrottle(sql)

  /** Um usuario com vinculo, porque `sessions.user_id` tem FK para `users`. */
  async function criarUsuario(papel: 'owner' | 'staff' = 'owner') {
    return createUserDirectory(sql).createUserWithAccess({
      companyId: empresa,
      name: 'Pessoa da Sessao',
      email: `sessao-${randomUUID()}@loja.com`,
      phone: null,
      role: papel,
      createdAt: new Date(),
    })
  }

  const daquiAUmaHora = () => new Date(Date.now() + 3_600_000)

  describe('a sessao', () => {
    it('emite e le de volta os claims, com empresa e papel', async () => {
      const u = await criarUsuario('staff')

      const token = await emissor().issue(
        { userId: u.id, companyId: empresa, role: 'staff' },
        daquiAUmaHora(),
      )

      expect(await emissor().read(token)).toEqual({
        userId: u.id,
        companyId: empresa,
        role: 'staff',
      })
    })

    /*
     * Sessao sem loja escolhida — US-059. Nao e estado de erro: e o meio do
     * caminho de quem opera mais de uma, e o CHECK do schema exige que o papel
     * venha nulo junto.
     */
    it('emite sessao sem empresa, e ela volta sem papel', async () => {
      const u = await criarUsuario()

      const token = await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      expect(await emissor().read(token)).toEqual({ userId: u.id, companyId: null })
    })

    /*
     * O motivo de a tabela existir. Uma instancia nova — outra conexao, outro
     * objeto — le a sessao que a primeira emitiu. Com o `Map` na instancia isto
     * era impossivel, e era o que fazia todo deploy expulsar o balcao.
     */
    it('sobrevive a outra instancia do emissor', async () => {
      const u = await criarUsuario()
      const token = await emissor().issue(
        { userId: u.id, companyId: empresa, role: 'owner' },
        daquiAUmaHora(),
      )

      const outra = createSessionIssuer(sql)

      expect(await outra.read(token)).toMatchObject({ userId: u.id })
    })

    /*
     * Um dump da tabela com os tokens em texto seria um conjunto de sessoes
     * vivas: quem o lesse entraria como qualquer pessoa logada, sem senha.
     */
    it('guarda o hash do token, e nunca o token', async () => {
      const u = await criarUsuario()
      const token = await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      const [linha] = await admin<{ token_hash: string }[]>`
        SELECT token_hash FROM sessions WHERE user_id = ${u.id}
      `

      expect(linha?.token_hash).toBe(hashDoToken(token))
      expect(linha?.token_hash).not.toBe(token)
    })

    it('token que nunca existiu nao vira sessao', async () => {
      expect(await emissor().read('token-inventado')).toBeUndefined()
    })

    /*
     * O filtro de expiracao mora na FUNCAO `auth_session_read`, e nao aqui em
     * cima. E o que impede os dois caminhos de discordarem: um `expires_at`
     * esquecido no adapter seria uma sessao eterna, sem nada falhando.
     */
    it('sessao expirada nao volta', async () => {
      const u = await criarUsuario()
      const token = await emissor().issue(
        { userId: u.id, companyId: empresa, role: 'owner' },
        new Date(Date.now() - 1_000),
      )

      expect(await emissor().read(token)).toBeUndefined()
    })

    /* O comportamento que faltava: "Sair" passa a encerrar de verdade. */
    it('sessao revogada nao volta', async () => {
      const u = await criarUsuario()
      const token = await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      await emissor().revoke(token)

      expect(await emissor().read(token)).toBeUndefined()
    })

    /* Revogar nao apaga: quem investigar um acesso precisa ver que houve
       sessao e que ela terminou, e nao um buraco onde ela estava. */
    it('revogar carimba a linha em vez de apaga-la', async () => {
      const u = await criarUsuario()
      const token = await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      await emissor().revoke(token)

      const [linha] = await admin<{ revoked_at: Date | null }[]>`
        SELECT revoked_at FROM sessions WHERE token_hash = ${hashDoToken(token)}
      `
      expect(linha?.revoked_at).toBeInstanceOf(Date)
    })

    /* Sair duas vezes e sair. E o carimbo da PRIMEIRA revogacao fica. */
    it('revogar e idempotente e preserva o primeiro carimbo', async () => {
      const u = await criarUsuario()
      const token = await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      await emissor().revoke(token)
      const [antes] = await admin<{ revoked_at: Date }[]>`
        SELECT revoked_at FROM sessions WHERE token_hash = ${hashDoToken(token)}
      `

      await emissor().revoke(token)
      const [depois] = await admin<{ revoked_at: Date }[]>`
        SELECT revoked_at FROM sessions WHERE token_hash = ${hashDoToken(token)}
      `

      expect(depois!.revoked_at.getTime()).toBe(antes!.revoked_at.getTime())
    })

    /*
     * A tabela se limpa sozinha para quem usa o sistema, sem tarefa agendada —
     * que dependeria da DEC-009. A sessao VIVA da mesma pessoa nao pode ir
     * junto: seria um logout no meio do trabalho.
     */
    it('emitir recolhe as sessoes expiradas da mesma pessoa, e poupa as vivas', async () => {
      const u = await criarUsuario()

      const velho = await emissor().issue(
        { userId: u.id, companyId: null },
        new Date(Date.now() - 1_000),
      )
      const viva = await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      /* A terceira emissao e quem faz a limpeza. */
      await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      const [contagem] = await admin<{ total: string }[]>`
        SELECT count(*)::text AS total FROM sessions WHERE token_hash = ${hashDoToken(velho)}
      `
      expect(Number(contagem!.total)).toBe(0)
      expect(await emissor().read(viva)).not.toBeUndefined()
    })

    /*
     * O contrapeso das funcoes `auth_*`, como em `user-directory.test`. As duas
     * tabelas ficam sob RLS SEM politica: nega tudo. Se este teste passar a
     * devolver linha, a sessao de todo mundo virou legivel por qualquer tenant.
     */
    it('a consulta comum nao ve sessao nenhuma', async () => {
      const u = await criarUsuario()
      await emissor().issue({ userId: u.id, companyId: null }, daquiAUmaHora())

      const linhas = await withTenant(
        sql,
        empresa,
        (tx) => tx<{ id: string }[]>`SELECT id FROM sessions`,
      )

      expect(linhas).toEqual([])
    })

    it('a consulta comum nao consegue gravar sessao', async () => {
      const u = await criarUsuario()

      await expect(
        withTenant(
          sql,
          empresa,
          (tx) => tx`
            INSERT INTO sessions (token_hash, user_id, expires_at)
            VALUES (${'forjado'}, ${u.id}, ${daquiAUmaHora()})
          `,
        ),
      ).rejects.toThrow()
    })
  })

  describe('a desaceleracao — RF-120, RNF-026', () => {
    /** Chave nova por teste: o contador e por chave, e testes nao se cruzam. */
    const chave = () => `login:id:${randomUUID()}@x.com`

    it('deixa tentar enquanto esta dentro da tolerancia', async () => {
      const k = chave()

      /* Quatro falhas: a tolerancia e cinco. Erro de digitacao e Caps Lock
         cabem aqui — desacelerar antes seria punir memoria ruim. */
      for (let i = 0; i < 4; i += 1) {
        await desaceleracao().registerFailure(k, new Date())
      }

      expect(await desaceleracao().retryAfter(k)).toBeUndefined()
    })

    it('desacelera ao bater a tolerancia', async () => {
      const k = chave()
      for (let i = 0; i < 5; i += 1) {
        await desaceleracao().registerFailure(k, new Date())
      }

      const segundos = await desaceleracao().retryAfter(k)

      expect(segundos).toBeGreaterThan(0)
      expect(segundos).toBeLessThanOrEqual(60)
    })

    /* Dobrar e o que torna a forca bruta inviavel sem trancar quem errou a
       senha duas vezes. */
    it('a espera cresce com as falhas', async () => {
      const k = chave()
      for (let i = 0; i < 5; i += 1) {
        await desaceleracao().registerFailure(k, new Date())
      }
      const primeira = (await desaceleracao().retryAfter(k))!

      await desaceleracao().registerFailure(k, new Date())
      const segunda = (await desaceleracao().retryAfter(k))!

      expect(segunda).toBeGreaterThan(primeira)
    })

    /* Espera que cresce sem limite e bloqueio permanente com outro nome — e
       permite trancar alguem de proposito errando a senha dele. */
    it('a espera tem teto de quinze minutos', async () => {
      const k = chave()
      for (let i = 0; i < 30; i += 1) {
        await desaceleracao().registerFailure(k, new Date())
      }

      expect(await desaceleracao().retryAfter(k)).toBeLessThanOrEqual(900)
    })

    /*
     * Sem janela o contador so sobe: cinco erros espalhados por um ano
     * trancariam a pessoa para sempre. A janela e de quinze minutos, entao uma
     * falha de uma hora atras nao conta.
     */
    it('esquece as falhas velhas', async () => {
      const k = chave()
      const umaHoraAtras = new Date(Date.now() - 3_600_000)

      for (let i = 0; i < 10; i += 1) {
        await desaceleracao().registerFailure(k, umaHoraAtras)
      }

      expect(await desaceleracao().retryAfter(k)).toBeUndefined()
    })

    /* E a contagem REINICIA, em vez de somar em cima de uma janela vencida. */
    it('recomeca a contagem quando a janela venceu', async () => {
      const k = chave()
      const umaHoraAtras = new Date(Date.now() - 3_600_000)
      for (let i = 0; i < 10; i += 1) {
        await desaceleracao().registerFailure(k, umaHoraAtras)
      }

      await desaceleracao().registerFailure(k, new Date())

      const [linha] = await admin<{ failures: number }[]>`
        SELECT failures FROM login_throttle WHERE throttle_key = ${k}
      `
      expect(linha?.failures).toBe(1)
      expect(await desaceleracao().retryAfter(k)).toBeUndefined()
    })

    /* Login certo zera: senao quem erra quatro vezes, acerta e erra de novo
       entraria na desaceleracao com uma falha. */
    it('o acerto zera a contagem', async () => {
      const k = chave()
      for (let i = 0; i < 6; i += 1) {
        await desaceleracao().registerFailure(k, new Date())
      }
      expect(await desaceleracao().retryAfter(k)).toBeGreaterThan(0)

      await desaceleracao().clear(k)

      expect(await desaceleracao().retryAfter(k)).toBeUndefined()
    })

    it('chave que nunca falhou pode tentar', async () => {
      expect(await desaceleracao().retryAfter(chave())).toBeUndefined()
    })

    /*
     * O contador tambem sobrevive ao processo — e e por isso que ele saiu da
     * memoria. Com o `Map` na instancia, N instancias multiplicavam por N as
     * tentativas que a forca bruta conseguia.
     */
    it('a contagem sobrevive a outra instancia', async () => {
      const k = chave()
      for (let i = 0; i < 6; i += 1) {
        await desaceleracao().registerFailure(k, new Date())
      }

      expect(await createLoginThrottle(sql).retryAfter(k)).toBeGreaterThan(0)
    })

    it('a consulta comum nao ve o contador', async () => {
      const k = chave()
      await desaceleracao().registerFailure(k, new Date())

      const linhas = await withTenant(
        sql,
        empresa,
        (tx) => tx<{ throttle_key: string }[]>`SELECT throttle_key FROM login_throttle`,
      )

      expect(linhas).toEqual([])
    })
  })
})
