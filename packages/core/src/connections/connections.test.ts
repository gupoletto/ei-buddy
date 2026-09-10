import { describe, expect, it } from 'vitest'
import type { Role } from '@na-regua/contracts'
import { isAppError } from '../app-error.js'
import type { ExecutionContext } from '../context.js'
import { InMemoryCompanyRepository } from '../registration/fakes.js'
import {
  ConnectionActionRefusedError,
  ConnectionAlreadyExistsError,
  ConnectionNotFoundError,
  TargetCompanyUnavailableError,
} from '../ports/connections.js'
import {
  InMemoryConnectionNotifier,
  InMemoryConnectionRequests,
  InMemorySupplierDirectory,
} from './fakes.js'
import {
  connectionPendingCount,
  endConnection,
  listConnections,
  requestConnection,
  respondToConnection,
} from './manage-connections.js'
import { searchSuppliers } from './search-suppliers.js'

const AGORA = new Date('2026-09-10T12:00:00.000Z')

function contexto(sobrescreve: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    companyId: 'emp-1',
    userId: 'usr-1',
    role: 'owner' as Role,
    channel: 'app',
    requestId: 'req-1',
    now: AGORA,
    ...sobrescreve,
  }
}

async function pegaErro(fn: () => Promise<unknown>) {
  try {
    await fn()
    return undefined
  } catch (e) {
    return e
  }
}

function cenario() {
  const companies = new InMemoryCompanyRepository()
  const connections = new InMemoryConnectionRequests()
  const notifier = new InMemoryConnectionNotifier()
  const suppliers = new InMemorySupplierDirectory()
  return { companies, connections, notifier, suppliers }
}

describe('searchSuppliers — RF-01, RF-02', () => {
  it('repassa a empresa do contexto e o termo para a porta', async () => {
    const { suppliers } = cenario()
    suppliers.resultado = [
      {
        companyId: 'emp-2',
        companyName: 'Farinhas do Sul',
        neighborhood: 'Centro',
        city: 'Curitiba',
        distanceKm: 3.2,
        products: ['Farinha de trigo'],
      },
    ]

    const saida = await searchSuppliers({ suppliers }, contexto(), 'farinha')

    expect(suppliers.chamadas).toEqual([{ requesterCompanyId: 'emp-1', term: 'farinha' }])
    expect(saida.results).toEqual(suppliers.resultado)
  })

  it('funciona mesmo sem produto proprio cadastrado — regra de negocio 3', async () => {
    const { suppliers } = cenario()
    suppliers.resultado = []

    const saida = await searchSuppliers({ suppliers }, contexto(), 'farinha')

    expect(saida.results).toEqual([])
  })
})

describe('requestConnection — RF-04', () => {
  it('recusa pedir conexao para a propria empresa, sem tocar na porta', async () => {
    const { companies, connections, notifier } = cenario()

    const erro = await pegaErro(() =>
      requestConnection({ companies, connections, notifier }, contexto(), 'emp-1'),
    )

    expect(isAppError(erro) && erro.code).toBe('VALIDATION_FAILED')
    expect(connections.chamadas).toEqual([])
  })

  it('accountant nao pode pedir conexao', async () => {
    const { companies, connections, notifier } = cenario()
    const leitor = contexto({ role: 'accountant' as Role })

    const erro = await pegaErro(() =>
      requestConnection({ companies, connections, notifier }, leitor, 'emp-2'),
    )

    expect(String((erro as Error).message)).toMatch(/somente de leitura/i)
    expect(connections.chamadas).toEqual([])
  })

  it('pede a conexao e avisa quem recebeu, com o nome de quem pediu', async () => {
    const { companies, connections, notifier } = cenario()
    await companies.create({
      legalName: 'Bolos da Ana LTDA',
      tradeName: 'Bolos da Ana',
      cnpj: '12345678000195',
      email: 'ana@x.com',
      phone: '41988887777',
      createdAt: AGORA,
    })
    connections.requestResult = {
      id: 'conn-9',
      targetCompanyId: 'emp-2',
      targetPhone: '41988880000',
      targetCompanyName: 'Distribuidora Farinha Boa',
    }

    const saida = await requestConnection(
      { companies, connections, notifier },
      contexto({ companyId: 'emp-1' }),
      'emp-2',
    )

    expect(saida).toEqual({ id: 'conn-9' })
    expect(connections.chamadas).toEqual([{ metodo: 'request', args: ['usr-1', 'emp-1', 'emp-2'] }])
    expect(notifier.avisos).toEqual([
      {
        id: 'conn-9',
        targetCompanyId: 'emp-2',
        targetPhone: '41988880000',
        targetCompanyName: 'Distribuidora Farinha Boa',
        requesterCompanyName: 'Bolos da Ana',
      },
    ])
  })

  it('o pedido vale mesmo se o aviso falhar — o aviso e melhor esforco', async () => {
    const { companies, connections, notifier } = cenario()
    await companies.create({
      legalName: 'Bolos da Ana LTDA',
      cnpj: '12345678000195',
      email: 'ana@x.com',
      phone: '41988887777',
      createdAt: AGORA,
    })
    notifier.deveFalhar = true

    const saida = await requestConnection({ companies, connections, notifier }, contexto(), 'emp-2')

    expect(saida).toEqual({ id: 'conn-1' })
  })

  it('empresa ja com pedido ativo vira 409, e nao um erro cru', async () => {
    const { companies, connections, notifier } = cenario()
    await companies.create({
      legalName: 'Bolos da Ana LTDA',
      cnpj: '12345678000195',
      email: 'ana@x.com',
      phone: '41988887777',
      createdAt: AGORA,
    })
    connections.requestResult = new ConnectionAlreadyExistsError()

    const erro = await pegaErro(() =>
      requestConnection({ companies, connections, notifier }, contexto(), 'emp-2'),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
  })

  it('empresa alvo indisponivel vira 404', async () => {
    const { companies, connections, notifier } = cenario()
    await companies.create({
      legalName: 'Bolos da Ana LTDA',
      cnpj: '12345678000195',
      email: 'ana@x.com',
      phone: '41988887777',
      createdAt: AGORA,
    })
    connections.requestResult = new TargetCompanyUnavailableError('sem dono ativo')

    const erro = await pegaErro(() =>
      requestConnection({ companies, connections, notifier }, contexto(), 'emp-2'),
    )

    expect(isAppError(erro) && erro.code).toBe('NOT_FOUND')
  })
})

describe('respondToConnection / endConnection — RF-04, RF-05', () => {
  it('aceita chamando a porta com o usuario do contexto', async () => {
    const { companies, connections, notifier } = cenario()

    await respondToConnection({ companies, connections, notifier }, contexto(), 'conn-1', true)

    expect(connections.chamadas).toEqual([{ metodo: 'respond', args: ['conn-1', 'usr-1', true] }])
  })

  it('accountant nao pode responder nem desfazer', async () => {
    const { companies, connections, notifier } = cenario()
    const leitor = contexto({ role: 'accountant' as Role })

    expect(
      String(
        await pegaErro(() =>
          respondToConnection({ companies, connections, notifier }, leitor, 'conn-1', true),
        ).then((e) => (e as Error).message),
      ),
    ).toMatch(/somente de leitura/i)
    expect(
      String(
        await pegaErro(() =>
          endConnection({ companies, connections, notifier }, leitor, 'conn-1'),
        ).then((e) => (e as Error).message),
      ),
    ).toMatch(/somente de leitura/i)
  })

  it('pedido inexistente vira 404', async () => {
    const { companies, connections, notifier } = cenario()
    connections.respondError = new ConnectionNotFoundError()

    const erro = await pegaErro(() =>
      respondToConnection({ companies, connections, notifier }, contexto(), 'conn-x', true),
    )

    expect(isAppError(erro) && erro.code).toBe('NOT_FOUND')
  })

  it('acao recusada (nao e o destinatario, ja respondido, expirado) vira 409', async () => {
    const { companies, connections, notifier } = cenario()
    connections.respondError = new ConnectionActionRefusedError('Este pedido ja foi respondido.')

    const erro = await pegaErro(() =>
      respondToConnection({ companies, connections, notifier }, contexto(), 'conn-1', true),
    )

    expect(isAppError(erro) && erro.code).toBe('CONFLICT')
  })

  it('desfazer chama end com o usuario do contexto', async () => {
    const { companies, connections, notifier } = cenario()

    await endConnection({ companies, connections, notifier }, contexto(), 'conn-1')

    expect(connections.chamadas).toEqual([{ metodo: 'end', args: ['conn-1', 'usr-1'] }])
  })
})

describe('listConnections / connectionPendingCount — RF-05', () => {
  it('lista as conexoes do usuario do contexto', async () => {
    const { connections } = cenario()
    connections.listResult = [
      {
        id: 'conn-1',
        direction: 'sent',
        status: 'pending',
        otherCompanyId: 'emp-2',
        otherCompanyName: 'Distribuidora Farinha Boa',
        createdAt: AGORA.toISOString(),
        respondedAt: null,
        expiresAt: '2026-10-10T12:00:00.000Z',
        contact: null,
      },
    ]

    const saida = await listConnections({ connections }, contexto())

    expect(connections.chamadas).toEqual([{ metodo: 'list', args: ['usr-1'] }])
    expect(saida.connections).toEqual(connections.listResult)
  })

  it('accountant tambem pode listar — e leitura', async () => {
    const { connections } = cenario()
    const leitor = contexto({ role: 'accountant' as Role })

    await expect(listConnections({ connections }, leitor)).resolves.toEqual({ connections: [] })
  })

  it('conta pedidos pendentes do usuario informado', async () => {
    const { connections } = cenario()
    connections.pendingCountResult = 3

    const saida = await connectionPendingCount({ connections }, 'usr-1')

    expect(saida).toEqual({ count: 3 })
    expect(connections.chamadas).toEqual([{ metodo: 'pendingCount', args: ['usr-1'] }])
  })
})
