import { randomUUID } from 'node:crypto'
import type { LocalUser, UserDirectory } from '@na-regua/core'
import type { MembershipOutput, Role } from '@na-regua/contracts'
import type { Sql } from 'postgres'
import { withTenant } from './tenant.js'

/**
 * Implementacao do `UserDirectory` — NR-014.
 *
 * ## Por que as leituras NAO passam por `withTenant`
 *
 * Porque nao existe empresa a passar. Descobrir a empresa e o que o login faz,
 * e a politica de `users` (0003) so mostra quem tem vinculo com a empresa do
 * contexto — enquanto a 0001 faz consulta sem `app.company_id` lancar, de
 * proposito.
 *
 * A saida sao as funcoes `auth_*` da migration 0003: `SECURITY DEFINER`, com
 * `search_path` fixo, igualdade exata e retorno minimo. Elas sao o unico lugar
 * do sistema que atravessa a politica, e o motivo de cada restricao esta na
 * propria migration.
 *
 * As ESCRITAS passam por `withTenant`, porque o convite acontece dentro de uma
 * loja e `company_users` esta sob a politica padrao.
 */

type LinhaDeUsuario = { id: string; name: string; is_active: boolean }
type LinhaDeVinculo = { company_id: string; company_name: string; role: string }

const paraUsuario = (l: LinhaDeUsuario | undefined): LocalUser | undefined =>
  l === undefined ? undefined : { id: l.id, name: l.name, isActive: l.is_active }

const paraVinculo = (l: LinhaDeVinculo): MembershipOutput => ({
  companyId: l.company_id,
  companyName: l.company_name,
  role: l.role as Role,
})

export function createUserDirectory(sql: Sql): UserDirectory {
  return {
    findById: async (userId) => {
      const [linha] = await sql<LinhaDeUsuario[]>`SELECT * FROM auth_user_by_id(${userId})`
      return paraUsuario(linha)
    },

    findBySubject: async (subject) => {
      const [linha] = await sql<LinhaDeUsuario[]>`SELECT * FROM auth_user_by_subject(${subject})`
      return paraUsuario(linha)
    },

    findByEmail: async (email) => {
      const [linha] = await sql<LinhaDeUsuario[]>`SELECT * FROM auth_user_by_email(${email})`
      return paraUsuario(linha)
    },

    findByPhone: async (phone) => {
      const [linha] = await sql<LinhaDeUsuario[]>`SELECT * FROM auth_user_by_phone(${phone})`
      return paraUsuario(linha)
    },

    attachSubject: async (userId, subject) => {
      /*
       * O booleano da funcao diz se amarrou. Falso significa que aquele usuario
       * JA tinha `auth_subject` — a funcao nunca reaponta uma identidade
       * amarrada, e isso e o que impede a chamada de virar sequestro de conta.
       *
       * Nao e erro aqui: o login chega a este ponto so quando `findBySubject`
       * nao achou nada, entao falso significa corrida entre dois primeiros
       * logins simultaneos. O segundo nao amarra, e continua com o usuario
       * certo, que e o comportamento desejado.
       */
      await sql`SELECT auth_attach_subject(${userId}, ${subject})`
    },

    listMemberships: async (userId) => {
      const linhas = await sql<LinhaDeVinculo[]>`SELECT * FROM auth_memberships(${userId})`
      return linhas.map(paraVinculo)
    },

    findMembership: async (companyId, userId) => {
      const [linha] = await sql<
        LinhaDeVinculo[]
      >`SELECT * FROM auth_membership(${companyId}, ${userId})`
      return linha === undefined ? undefined : paraVinculo(linha)
    },

    createUserWithAccess: async (convite) => {
      /*
       * O id sai daqui, e nao de `RETURNING`.
       *
       * `INSERT INTO users ... RETURNING` devolve VAZIO sob RLS: o `RETURNING`
       * passa pela politica de SELECT, que exige vinculo em `company_users` —
       * e o vinculo ainda nao existe, porque e a linha seguinte. Ja custou um
       * ciclo de CI para descobrir; gerar o uuid na aplicacao resolve sem
       * afrouxar politica nenhuma.
       */
      const id = randomUUID()

      await withTenant(sql, convite.companyId, async (tx) => {
        await tx`
          INSERT INTO users (id, name, email, phone, created_at, updated_at)
          VALUES (
            ${id},
            ${convite.name},
            ${convite.email},
            ${convite.phone},
            ${convite.createdAt},
            ${convite.createdAt}
          )
        `

        await tx`
          INSERT INTO company_users (company_id, user_id, role, created_at, updated_at)
          VALUES (
            ${convite.companyId},
            ${id},
            ${convite.role},
            ${convite.createdAt},
            ${convite.createdAt}
          )
        `
      })

      return { id, name: convite.name, isActive: true }
    },

    grantAccess: async (vinculo) => {
      /*
       * `ON CONFLICT` porque vinculo revogado volta a valer em vez de estourar
       * na chave primaria: `company_users` guarda a revogacao em `is_active`,
       * sem apagar a linha, entao reconvidar quem foi desligado casa com uma
       * linha que ja existe. Sem isto, readmitir alguem seria impossivel pela
       * tela.
       *
       * O comentario mora aqui, e nao dentro do SQL: crase dentro de template
       * literal FECHA a string, e escrever `company_users` no comentario do
       * SQL quebrou a compilacao — TS1005, e a causa nao aparece na mensagem.
       */
      await withTenant(
        sql,
        vinculo.companyId,
        (tx) => tx`
          INSERT INTO company_users (company_id, user_id, role, created_at, updated_at)
          VALUES (
            ${vinculo.companyId},
            ${vinculo.userId},
            ${vinculo.role},
            ${vinculo.createdAt},
            ${vinculo.createdAt}
          )
          ON CONFLICT (company_id, user_id) DO UPDATE
            SET role = EXCLUDED.role,
                is_active = true,
                updated_at = EXCLUDED.updated_at
        `,
      )
    },
  }
}
