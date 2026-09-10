import { randomInt, randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConnectionRequests, createSupplierDirectory } from './connection-repository.js'
import { migrate } from './migrate.js'
import { conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'
import { createUserDirectory } from './user-directory.js'

/**
 * CNPJ de teste com entropia suficiente para muitas empresas no MESMO
 * arquivo — `cnpjDeTeste` de `test-support.ts` usa um prefixo de 1 digito e
 * cobre bem quando o arquivo cria poucas empresas, mas esta suite cria
 * dezenas, e um prefixo de 1 caractere so evita colisao ENTRE arquivos, nao
 * dentro deste. Mesma tecnica do `apps/api/src/e2e/super-admin.test.ts`: 7
 * digitos aleatorios (o `randomInt`) mais 5 do relogio, para dois processos
 * nascidos no mesmo milissegundo nao colidirem.
 */
function cnpjDeTesteLocal(): string {
  const base12 = `${randomInt(1_000_000, 9_999_999)}${String(Date.now()).slice(-5)}`
  const digito = (nums: number[], pesos: number[]): number => {
    const resto = nums.reduce((acc, n, i) => acc + n * pesos[i]!, 0) % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const base = base12.split('').map(Number)
  const d1 = digito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digito([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base12}${d1}${d2}`
}

/**
 * Conexao entre lojistas por proximidade — NR-107, ADR-0008, DEC-021.
 *
 * O que so o banco prova:
 *
 * - `company_connections` nega tudo para o papel comum — mesmo desenho de
 *   `platform_admin_access` (0008).
 * - `company_connections_search` acha quem vende, ordena por distancia real
 *   (Haversine), exclui a propria empresa e quem nao tem coordenada.
 * - `company_connections_request` resolve o `owner` da empresa alvo, recusa
 *   auto-pedido e pedido duplicado.
 * - `company_connections_respond`/`_end` so deixam a pessoa certa agir, e so
 *   no estado certo.
 * - Contato completo (telefone/endereco) so sai de `company_connections_list`
 *   quando `accepted` — nunca de `_search`.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('conexao entre usuarios — NR-107', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao

  /** Curitiba, Centro — usada como origem para as distancias do teste. */
  const ORIGEM = { lat: -25.4284, lng: -49.2733 }
  /** ~1.4km da origem — mesma cidade, mais perto. */
  const PERTO = { lat: -25.44, lng: -49.28 }
  /** ~339km da origem (Sao Paulo). */
  const LONGE = { lat: -23.5505, lng: -46.6333 }

  beforeAll(async () => {
    admin = postgres(MIGRATION_URL!, { max: 1, onnotice: () => undefined })
    await migrate(MIGRATION_URL!)
    aplicacao = await conectarComoAplicacao(admin, MIGRATION_URL!)
    sql = aplicacao.sql
  }, 30_000)

  afterAll(async () => {
    await aplicacao?.encerrar()
    await admin?.end({ timeout: 5 })
  })

  async function criarEmpresa(opcoes: {
    nome: string
    coordenada?: { lat: number; lng: number } | undefined
    ativa?: boolean
    telefone?: string
  }) {
    const id = randomUUID()
    const cnpj = cnpjDeTesteLocal()
    await withTenant(
      sql,
      id,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone, is_active, latitude, longitude)
        VALUES (
          ${id}, ${opcoes.nome}, ${cnpj}, ${`contato@${cnpj}.local`}, ${opcoes.telefone ?? '41999990000'},
          ${opcoes.ativa ?? true},
          ${opcoes.coordenada?.lat ?? null}, ${opcoes.coordenada?.lng ?? null}
        )
      `,
    )
    return id
  }

  async function criarDono(companyId: string) {
    return createUserDirectory(sql).createUserWithAccess({
      companyId,
      name: 'Dono da Loja',
      email: `dono-${randomUUID()}@loja.local`,
      phone: null,
      role: 'owner',
      createdAt: new Date(),
    })
  }

  /*
   * Marcador unico por teste — sem ele, `_search` faz `ILIKE '%farinha%'` e
   * ACHA o que sobrou de execucoes anteriores contra este mesmo banco de
   * desenvolvimento (nada aqui roda em transacao isolada por teste, ao
   * contrario do resto da suite). Termo unico e o suficiente para nao
   * precisar disso.
   */
  function termoUnico(): string {
    return `zz${randomUUID().replace(/-/g, '').slice(0, 12)}`
  }

  async function criarProduto(companyId: string, description: string) {
    await withTenant(
      sql,
      companyId,
      (tx) => tx`
        INSERT INTO products (company_id, description, internal_code, unit_of_measure, sale_price_cents)
        VALUES (${companyId}, ${description}, ${randomUUID()}, 'un', 1000)
      `,
    )
  }

  describe('company_connections nega tudo ao papel comum', () => {
    it('SELECT direto devolve zero linhas', async () => {
      const linhas = await sql`SELECT * FROM company_connections`
      expect(linhas).toHaveLength(0)
    })

    it('INSERT direto e recusado', async () => {
      await expect(
        sql`
          INSERT INTO company_connections
            (requester_user_id, requester_company_id, target_user_id, target_company_id, expires_at)
          VALUES (${randomUUID()}, ${randomUUID()}, ${randomUUID()}, ${randomUUID()}, now())
        `,
      ).rejects.toThrow(/row-level security|permission denied/i)
    })
  })

  describe('company_connections_search — RF-01, RF-02, RF-03', () => {
    it('acha quem vende, ordenado por distancia, sem telefone nem endereco', async () => {
      const termo = termoUnico()
      const buscadora = await criarEmpresa({ nome: 'Bolos da Ana', coordenada: ORIGEM })
      const vizinha = await criarEmpresa({
        nome: 'Distribuidora Farinha Boa',
        coordenada: PERTO,
      })
      const longeDaqui = await criarEmpresa({
        nome: 'Farinhas de SP',
        coordenada: LONGE,
      })
      await criarProduto(vizinha, `Farinha de trigo tipo 1 ${termo}`)
      await criarProduto(longeDaqui, `Farinha de trigo especial ${termo}`)

      const resultados = await sql`
        SELECT * FROM company_connections_search(${buscadora}, ${termo})
      `

      expect(resultados.map((r) => r.company_id)).toEqual([vizinha, longeDaqui])
      expect(Number(resultados[0]!.distance_km)).toBeLessThan(5)
      expect(Number(resultados[1]!.distance_km)).toBeGreaterThan(300)
      expect(resultados[0]).not.toHaveProperty('phone')
      expect(resultados[0]).not.toHaveProperty('postal_code')
    })

    it('nao acha a propria empresa', async () => {
      const termo = termoUnico()
      const empresa = await criarEmpresa({ nome: 'So Eu Mesma', coordenada: ORIGEM })
      await criarProduto(empresa, `Farinha especial ${termo}`)

      const resultados = await sql`SELECT * FROM company_connections_search(${empresa}, ${termo})`

      expect(resultados).toHaveLength(0)
    })

    it('empresa sem coordenada nao aparece — RF-02', async () => {
      const termo = termoUnico()
      const buscadora = await criarEmpresa({ nome: 'Buscadora', coordenada: ORIGEM })
      const semCoordenada = await criarEmpresa({ nome: 'Sem Coordenada' })
      await criarProduto(semCoordenada, `Farinha de mandioca ${termo}`)

      const resultados = await sql`
        SELECT * FROM company_connections_search(${buscadora}, ${termo})
      `

      expect(resultados.map((r) => r.company_id)).not.toContain(semCoordenada)
    })

    it('quem busca sem coordenada continua achando resultado — regra de negocio 3', async () => {
      const termo = termoUnico()
      const buscadoraSemCoordenada = await criarEmpresa({ nome: 'So Compra' })
      const vendedora = await criarEmpresa({ nome: 'Vende Farinha', coordenada: PERTO })
      await criarProduto(vendedora, `Farinha de trigo ${termo}`)

      const resultados = await sql`
        SELECT * FROM company_connections_search(${buscadoraSemCoordenada}, ${termo})
      `

      expect(resultados).toHaveLength(1)
      expect(resultados[0]!.distance_km).toBeNull()
    })

    it('empresa inativa nao aparece', async () => {
      const termo = termoUnico()
      const buscadora = await criarEmpresa({ nome: 'Buscadora Inativa', coordenada: ORIGEM })
      const inativa = await criarEmpresa({
        nome: 'Fechada',
        coordenada: PERTO,
        ativa: false,
      })
      await criarProduto(inativa, `Farinha de trigo ${termo}`)

      const resultados = await sql`SELECT * FROM company_connections_search(${buscadora}, ${termo})`

      expect(resultados).toHaveLength(0)
    })
  })

  describe('company_connections_request — RF-04', () => {
    it('cria o pedido, resolvido para o owner da empresa alvo', async () => {
      const empresaA = await criarEmpresa({ nome: 'Empresa Pedinte' })
      const empresaB = await criarEmpresa({ nome: 'Empresa Pedida' })
      const donoA = await criarDono(empresaA)
      await criarDono(empresaB)

      const [pedido] = await sql`
        SELECT * FROM company_connections_request(${donoA.id}, ${empresaA}, ${empresaB})
      `

      expect(pedido!.id).toBeDefined()
      expect(pedido!.target_company_name).toContain('Empresa Pedida')
    })

    it('recusa empresa alvo sem telefone cadastrado', async () => {
      const empresaA = await criarEmpresa({ nome: 'Pede Sem Telefone' })
      const empresaSemTelefone = await criarEmpresa({ nome: 'Sem Telefone', telefone: '' })
      const donoA = await criarDono(empresaA)
      await criarDono(empresaSemTelefone)

      await expect(
        sql`SELECT * FROM company_connections_request(${donoA.id}, ${empresaA}, ${empresaSemTelefone})`,
      ).rejects.toThrow(/sem telefone cadastrado/i)
    })

    it('recusa empresa alvo sem owner ativo', async () => {
      const empresaA = await criarEmpresa({ nome: 'Pede Sem Dono' })
      const empresaSemDono = await criarEmpresa({ nome: 'Sem Dono' })
      const donoA = await criarDono(empresaA)

      await expect(
        sql`SELECT * FROM company_connections_request(${donoA.id}, ${empresaA}, ${empresaSemDono})`,
      ).rejects.toThrow(/sem dono ativo/i)
    })

    it('recusa pedido duplicado enquanto o par estiver pendente', async () => {
      const empresaA = await criarEmpresa({ nome: 'Empresa Duplicada A' })
      const empresaB = await criarEmpresa({ nome: 'Empresa Duplicada B' })
      const donoA = await criarDono(empresaA)
      await criarDono(empresaB)

      await sql`SELECT * FROM company_connections_request(${donoA.id}, ${empresaA}, ${empresaB})`

      await expect(
        sql`SELECT * FROM company_connections_request(${donoA.id}, ${empresaA}, ${empresaB})`,
      ).rejects.toThrow(/unique|duplicate/i)
    })
  })

  describe('company_connections_respond e _end — RF-04, RF-05', () => {
    async function cenarioComPedido() {
      const empresaA = await criarEmpresa({ nome: 'Requerente' })
      const empresaB = await criarEmpresa({ nome: 'Destinataria' })
      const donoA = await criarDono(empresaA)
      const donoB = await criarDono(empresaB)

      const [pedido] = await sql`
        SELECT * FROM company_connections_request(${donoA.id}, ${empresaA}, ${empresaB})
      `

      return { empresaA, empresaB, donoA, donoB, conexaoId: pedido!.id }
    }

    it('so quem recebeu pode aceitar', async () => {
      const { donoA, conexaoId } = await cenarioComPedido()

      await expect(
        sql`SELECT company_connections_respond(${conexaoId}, ${donoA.id}, true)`,
      ).rejects.toThrow(/apenas quem recebeu/i)
    })

    it('aceita, e a lista dos dois lados mostra o contato completo', async () => {
      const { donoA, donoB, conexaoId } = await cenarioComPedido()

      await sql`SELECT company_connections_respond(${conexaoId}, ${donoB.id}, true)`

      const [doLadoDeA] = await sql`SELECT * FROM company_connections_list(${donoA.id})`
      expect(doLadoDeA!.status).toBe('accepted')
      expect(doLadoDeA!.other_phone).not.toBeNull()

      const [doLadoDeB] = await sql`SELECT * FROM company_connections_list(${donoB.id})`
      expect(doLadoDeB!.status).toBe('accepted')
      expect(doLadoDeB!.other_phone).not.toBeNull()
    })

    it('recusa responder duas vezes', async () => {
      const { donoB, conexaoId } = await cenarioComPedido()
      await sql`SELECT company_connections_respond(${conexaoId}, ${donoB.id}, false)`

      await expect(
        sql`SELECT company_connections_respond(${conexaoId}, ${donoB.id}, true)`,
      ).rejects.toThrow(/ja foi respondido/i)
    })

    it('quem pediu pode cancelar enquanto pendente; a outra parte nao', async () => {
      const { donoB, conexaoId } = await cenarioComPedido()

      await expect(sql`SELECT company_connections_end(${conexaoId}, ${donoB.id})`).rejects.toThrow(
        /apenas quem pediu/i,
      )
    })

    it('qualquer um dos dois lados desfaz uma conexao aceita', async () => {
      const { donoA, donoB, conexaoId } = await cenarioComPedido()
      await sql`SELECT company_connections_respond(${conexaoId}, ${donoB.id}, true)`

      await sql`SELECT company_connections_end(${conexaoId}, ${donoA.id})`

      const [linha] = await sql`SELECT * FROM company_connections_list(${donoB.id})`
      expect(linha!.status).toBe('rejected')
      expect(linha!.other_phone).toBeNull()
    })

    it('pending_count conta so os recebidos e pendentes', async () => {
      const { donoB } = await cenarioComPedido()

      const [linha] = await sql`SELECT company_connections_pending_count(${donoB.id})`
      expect(linha!.company_connections_pending_count).toBe(1)
    })
  })

  describe('o adapter TypeScript (createSupplierDirectory/createConnectionRequests)', () => {
    it('search bate de ponta a ponta, com o mapeamento snake_case -> camelCase', async () => {
      const termo = termoUnico()
      const diretorio = createSupplierDirectory(sql)
      const buscadora = await criarEmpresa({
        nome: 'Buscadora Adapter',
        coordenada: ORIGEM,
      })
      const vendedora = await criarEmpresa({
        nome: 'Vendedora Adapter',
        coordenada: PERTO,
      })
      await criarProduto(vendedora, `Farinha de trigo especial adapter ${termo}`)

      const resultados = await diretorio.search(buscadora, termo)

      expect(resultados).toEqual([
        {
          companyId: vendedora,
          companyName: 'Vendedora Adapter',
          neighborhood: null,
          city: null,
          distanceKm: expect.any(Number),
          products: [`Farinha de trigo especial adapter ${termo}`],
        },
      ])
    })

    it('request/respond/end/list batem de ponta a ponta', async () => {
      const conexoes = createConnectionRequests(sql)
      const empresaA = await criarEmpresa({ nome: 'Adapter Requerente' })
      const empresaB = await criarEmpresa({ nome: 'Adapter Destinataria' })
      const donoA = await criarDono(empresaA)
      const donoB = await criarDono(empresaB)

      const pedido = await conexoes.request(donoA.id, empresaA, empresaB)
      expect(pedido.targetCompanyName).toContain('Adapter Destinataria')

      expect(await conexoes.pendingCount(donoB.id)).toBe(1)

      await conexoes.respond(pedido.id, donoB.id, true)

      const listaDeA = await conexoes.list(donoA.id)
      expect(listaDeA).toEqual([
        {
          id: pedido.id,
          direction: 'sent',
          status: 'accepted',
          otherCompanyId: empresaB,
          otherCompanyName: 'Adapter Destinataria',
          createdAt: expect.any(String),
          respondedAt: expect.any(String),
          expiresAt: expect.any(String),
          contact: {
            phone: '41999990000',
            postalCode: null,
            street: null,
            streetNumber: null,
            complement: null,
            neighborhood: null,
            city: null,
            state: null,
          },
        },
      ])

      await conexoes.end(pedido.id, donoB.id)
      expect((await conexoes.list(donoA.id))[0]!.status).toBe('rejected')
    })
  })
})
