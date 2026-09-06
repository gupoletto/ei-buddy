import {
  catalogInputSchema,
  createCompanyInputSchema,
  createCustomerInputSchema,
  createProductInputSchema,
} from '@na-regua/contracts'
import {
  AppError,
  catalogSummary,
  listCatalog,
  registerCompany,
  type RegisterCompanyDeps,
  registerCustomer,
  type RegisterCustomerDeps,
  registerProduct,
  type RegisterProductDeps,
  searchProducts,
} from '@na-regua/core'
import type { FastifyInstance } from 'fastify'
import { requireContext } from '../plugins/execution-context.js'
import { LIMITE_DE_ESCRITA } from '../plugins/rate-limit.js'
import { validate } from '../plugins/validate.js'

/**
 * Rotas de cadastro — NR-026, RF-001 a RF-019.
 *
 * Como as outras: le o contexto, valida a forma, chama o caso de uso, traduz.
 * Deteccao de duplicado, geracao de codigo interno e a recusa de CNPJ repetido
 * ficam em `core` — se morassem aqui, o canal WhatsApp cadastraria por outro
 * caminho, com outras regras.
 */

export type CadastroDeps = RegisterCompanyDeps & RegisterCustomerDeps & RegisterProductDeps

export function registerCadastroRoutes(app: FastifyInstance, deps: CadastroDeps): void {
  /**
   * Cadastrar empresa — RF-001, RF-002.
   *
   * A unica rota de cadastro que NAO exige sessao com empresa: e ela que cria a
   * empresa. Ainda exige sessao (o `userId` vem do contexto), mas o
   * `companyId` do principal nao e usado — a empresa nasce sob o proprio
   * tenant, e quem orquestra isso e `db`.
   */
  app.post('/empresas', { config: { rateLimit: LIMITE_DE_ESCRITA } }, async (request, reply) => {
    const ctx = requireContext(request)
    const input = validate(createCompanyInputSchema, request.body)

    const empresa = await registerCompany(deps, ctx, input)

    return reply.code(201).send(empresa)
  })

  /**
   * Cadastrar cliente — RF-009, RF-010.
   *
   * **Duplicado nao e erro, e resposta.** O caso de uso devolve os candidatos
   * em vez de recusar, porque a decisao de reusar o existente e de quem esta no
   * balcao, com o cliente na frente — recusar automaticamente travaria o
   * cadastro de dois irmaos com o telefone de casa, que acontece.
   *
   * Por isso 409 com os candidatos no corpo, e nao 400: o pedido esta correto,
   * o estado do servidor e que exige uma escolha. Quem decidiu reenvia com
   * `?duplicado=permitir`.
   */
  app.post('/clientes', { config: { rateLimit: LIMITE_DE_ESCRITA } }, async (request, reply) => {
    const ctx = requireContext(request)
    const input = validate(createCustomerInputSchema, request.body)
    const { duplicado } = request.query as { duplicado?: string }

    const r = await registerCustomer(deps, ctx, input, {
      allowDuplicate: duplicado === 'permitir',
    })

    if (r.status === 'duplicate_found') {
      return reply.code(409).send({
        error: {
          code: 'CONFLICT',
          message:
            'Ja existe cliente com este telefone ou documento. ' +
            'Reenvie com ?duplicado=permitir para cadastrar mesmo assim.',
        },
        /* Os candidatos vao FORA do envelope de erro: eles nao sao detalhe do
           erro, sao a informacao que permite decidir. A tela mostra a lista. */
        candidates: r.candidates,
      })
    }

    return reply.code(201).send(r.customer)
  })

  /** Cadastrar produto — RF-017, RF-018, RF-019. */
  app.post('/produtos', { config: { rateLimit: LIMITE_DE_ESCRITA } }, async (request, reply) => {
    const ctx = requireContext(request)
    const input = validate(createProductInputSchema, request.body)

    const produto = await registerProduct(deps, ctx, input)

    return reply.code(201).send(produto)
  })

  /**
   * Localizar produto pelo codigo de barras lido — RF-018.
   *
   * `GET /produtos/codigo-de-barras/:codigo` e nao `/produtos?barcode=`: o
   * leitor de balcao busca UM produto por um identificador exato, e isso e
   * acesso a recurso, nao filtro sobre colecao. A distincao aparece na
   * resposta — 404 quando nao existe, e nao lista vazia.
   */
  /**
   * O catalogo do balcao — RF-019.
   *
   * `GET /produtos?q=` e busca sobre colecao, ao contrario do codigo de barras,
   * que e acesso a recurso. A diferenca aparece na resposta: aqui lista vazia e
   * uma resposta legitima ("nada com esse nome"), la e 404.
   */
  app.get('/produtos', async (request, reply) => {
    const ctx = requireContext(request)
    const { q, limite } = (request.query ?? {}) as { q?: string; limite?: string }

    const produtos = await searchProducts(deps, ctx, {
      ...(q === undefined ? {} : { termo: q }),
      ...(limite === undefined ? {} : { limite: Number(limite) }),
    })

    return reply.code(200).send({ products: produtos })
  })

  /**
   * O catalogo do backoffice — NR-072, US-008.
   *
   * Rota SEPARADA de `GET /produtos`, que continua sendo a busca do balcao com
   * teto de `TETO_DO_CATALOGO`. Dar paginacao aquela mudaria o contrato do PDV,
   * que ja depende do teto; e ler o catalogo por ela mostraria 50 produtos ao
   * lojista que tem 300, sem nenhum aviso de que faltam 250.
   */
  app.get('/produtos/catalogo', async (request, reply) => {
    const ctx = requireContext(request)

    const input = validate(catalogInputSchema, request.query ?? {})
    const pagina = await listCatalog(deps, ctx, input)

    return reply.code(200).send(pagina)
  })

  /** Os numeros do topo da tela, sobre o catalogo inteiro — NR-072. */
  app.get('/produtos/resumo', async (request, reply) => {
    const ctx = requireContext(request)

    const resumo = await catalogSummary(deps, ctx)

    return reply.code(200).send(resumo)
  })

  app.get('/produtos/codigo-de-barras/:codigo', async (request, reply) => {
    const ctx = requireContext(request)
    const { codigo } = request.params as { codigo: string }

    const produto = await deps.products.findByBarcode(ctx.companyId, codigo)

    if (produto === undefined) {
      /* O balcao precisa distinguir "nao existe" de "existe e esta zerado" —
         a segunda e cadastro feito, a primeira e cadastro a fazer. */
      throw AppError.notFound('Produto nao encontrado para este codigo de barras.')
    }

    return reply.code(200).send(produto)
  })
}
