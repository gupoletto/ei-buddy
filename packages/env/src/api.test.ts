import { describe, expect, it } from 'vitest'
import { loadApiEnv } from './api.js'

/** Conjunto minimo que passa. Cada teste varia um campo por vez. */
const base = {
  NODE_ENV: 'development',
  API_URL: 'http://localhost:3333',
  DATABASE_URL: 'postgresql://naregua:naregua@localhost:5432/naregua',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'dev-only-nao-use-em-producao',
}

describe('loadApiEnv', () => {
  it('aceita o conjunto minimo e aplica os padroes', () => {
    const env = loadApiEnv(base)
    expect(env.API_PORT).toBe(3333)
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.TZ).toBe('America/Sao_Paulo')
    expect(env.AUTH_PROVIDER).toBe('fake')
  })

  it('converte API_PORT de string para numero', () => {
    expect(loadApiEnv({ ...base, API_PORT: '8080' }).API_PORT).toBe(8080)
  })

  it('falha listando TODAS as variaveis com problema de uma vez, nao so a primeira', () => {
    expect.assertions(4)
    try {
      loadApiEnv({ NODE_ENV: 'development' })
    } catch (error) {
      const msg = (error as Error).message
      expect(msg).toContain('API_URL')
      expect(msg).toContain('DATABASE_URL')
      expect(msg).toContain('REDIS_URL')
      expect(msg).toContain('JWT_SECRET')
    }
  })

  it.each([
    [{ ...base, NODE_ENV: 'producao' }, 'NODE_ENV com valor que nao existe'],
    [{ ...base, API_URL: 'nao-e-uma-url' }, 'API_URL sem protocolo'],
    [{ ...base, API_PORT: '99999' }, 'API_PORT acima de 65535'],
    [{ ...base, API_PORT: 'oitenta' }, 'API_PORT nao numerico'],
    [{ ...base, DATABASE_URL: 'mysql://localhost/db' }, 'DATABASE_URL que nao e postgres'],
    [{ ...base, DATABASE_URL: '' }, 'DATABASE_URL vazia'],
    [{ ...base, REDIS_URL: 'http://localhost:6379' }, 'REDIS_URL sem protocolo redis'],
    [{ ...base, JWT_SECRET: '' }, 'JWT_SECRET vazio'],
    [{ ...base, LOG_LEVEL: 'verbose' }, 'LOG_LEVEL fora do enum'],
  ])('recusa %o (%s)', (entrada, _motivo) => {
    expect(() => loadApiEnv(entrada)).toThrow()
  })

  it('aceita rediss:// para Redis com TLS', () => {
    expect(() => loadApiEnv({ ...base, REDIS_URL: 'rediss://user:pass@host:6380' })).not.toThrow()
  })
})

/**
 * O segredo do Better Auth — ADR-0003.
 *
 * Opcional no schema e obrigatorio em `criarIdentidade`, e so quando
 * `AUTH_PROVIDER=better-auth`. Exigi-lo aqui barraria o boot local, onde o
 * provedor e o falso e este valor nao existe.
 */
describe('BETTER_AUTH_SECRET', () => {
  const trintaEDois = 'x'.repeat(32)

  it('e opcional — o modo fake nao tem segredo nenhum', () => {
    expect(loadApiEnv(base).BETTER_AUTH_SECRET).toBeUndefined()
  })

  it('aceita 32 caracteres', () => {
    expect(loadApiEnv({ ...base, BETTER_AUTH_SECRET: trintaEDois }).BETTER_AUTH_SECRET).toBe(
      trintaEDois,
    )
  })

  /*
   * Abaixo de 32 a propria biblioteca so escreve um aviso no log, e aviso em
   * log de boot ninguem le. Aqui vira recusa de subir.
   */
  it('recusa segredo curto', () => {
    expect(() => loadApiEnv({ ...base, BETTER_AUTH_SECRET: 'curto-demais' })).toThrow(
      /pelo menos 32 caracteres/,
    )
  })

  /* Vazia e o mesmo que ausente — `opcionalNaoVazia` apara e some com ela.
     Sem isto, um `BETTER_AUTH_SECRET=` no .env viraria segredo de zero
     caracteres em vez de "nao configurado". */
  it('trata string vazia como ausente', () => {
    expect(loadApiEnv({ ...base, BETTER_AUTH_SECRET: '' }).BETTER_AUTH_SECRET).toBeUndefined()
  })
})
