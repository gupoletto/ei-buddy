import { describe, expect, it } from 'vitest'
import { InMemoryCepLookup } from './fakes.js'
import { resolveCoordinates } from './geocoding.js'

const ENDERECO_SEM_CEP = { city: 'Curitiba', state: 'PR' as const }
const ENDERECO_COM_CEP = { zipCode: '80010000', city: 'Curitiba', state: 'PR' as const }

describe('resolveCoordinates — ADR-0008', () => {
  it('sem endereco, nao mexe (undefined)', async () => {
    const cepLookup = new InMemoryCepLookup()

    expect(await resolveCoordinates(cepLookup, undefined)).toBeUndefined()
  })

  it('endereco sem CEP, nao mexe (undefined) — nao apaga coordenada anterior', async () => {
    const cepLookup = new InMemoryCepLookup()

    expect(await resolveCoordinates(cepLookup, ENDERECO_SEM_CEP)).toBeUndefined()
  })

  it('CEP com cobertura de coordenada, devolve latitude/longitude', async () => {
    const cepLookup = new InMemoryCepLookup()
    cepLookup.registrar('80010000', {
      street: 'Rua XV de Novembro',
      district: 'Centro',
      city: 'Curitiba',
      state: 'PR',
      latitude: -25.4284,
      longitude: -49.2733,
    })

    expect(await resolveCoordinates(cepLookup, ENDERECO_COM_CEP)).toEqual({
      latitude: -25.4284,
      longitude: -49.2733,
    })
  })

  it('CEP sem cobertura de coordenada, devolve null — limpeza deliberada', async () => {
    const cepLookup = new InMemoryCepLookup()
    cepLookup.registrar('80010000', {
      street: 'Rua XV de Novembro',
      district: 'Centro',
      city: 'Curitiba',
      state: 'PR',
      latitude: null,
      longitude: null,
    })

    expect(await resolveCoordinates(cepLookup, ENDERECO_COM_CEP)).toBeNull()
  })

  it('CEP que o provedor nao conhece, nao mexe (undefined)', async () => {
    const cepLookup = new InMemoryCepLookup()

    expect(await resolveCoordinates(cepLookup, ENDERECO_COM_CEP)).toBeUndefined()
  })

  it('falha do provedor nao trava o cadastro — vira undefined', async () => {
    const cepLookup = new InMemoryCepLookup()
    cepLookup.lookup = async () => {
      throw new Error('Fora do ar (simulado).')
    }

    expect(await resolveCoordinates(cepLookup, ENDERECO_COM_CEP)).toBeUndefined()
  })
})
