import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const rolesSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'naregua_migrator') THEN
    CREATE ROLE naregua_migrator LOGIN PASSWORD 'naregua' NOSUPERUSER BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'naregua_app') THEN
    CREATE ROLE naregua_app LOGIN PASSWORD 'naregua' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
`

/** Superuser do container local (CI e docker-compose). CREATE ROLE / DROP SCHEMA. */
export function getBootstrapUrl(fromUrl: string): string {
  const url = new URL(fromUrl)
  url.username = process.env.POSTGRES_USER || 'naregua'
  url.password = process.env.POSTGRES_PASSWORD || 'naregua'
  return url.toString()
}

function databaseName(adminUrl: string): string {
  const name = new URL(adminUrl).pathname.replace(/^\//, '')
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('Nome de banco invalido na URL.')
  }
  return name
}

function appConnectionString(adminUrl: string): string {
  const url = new URL(adminUrl)
  url.username = 'naregua_app'
  url.password = 'naregua'
  return url.toString()
}

/** CI ja usa *_test. Local cria naregua_test para nao apagar o banco de desenvolvimento. */
export async function resolveTestDatabaseUrl(adminUrl: string): Promise<string> {
  const name = databaseName(adminUrl)
  if (name.endsWith('_test')) {
    return adminUrl
  }
  const testUrl = new URL(adminUrl)
  testUrl.pathname = '/naregua_test'
  const maint = postgres(adminUrl, { max: 1, onnotice: () => {} })
  try {
    const found = await maint`SELECT 1 FROM pg_database WHERE datname = 'naregua_test'`
    if (found.length === 0) {
      await maint.unsafe('CREATE DATABASE naregua_test')
    }
  } finally {
    await maint.end({ timeout: 5 })
  }
  return testUrl.toString()
}

/** Cria papéis da aplicação (CI não roda o init do docker-compose). */
export async function ensureRoles(adminUrl: string): Promise<void> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe(rolesSql)
    const database = databaseName(adminUrl)
    await sql.unsafe(`GRANT CONNECT ON DATABASE ${database} TO naregua_app`)
    await sql.unsafe(`GRANT CONNECT ON DATABASE ${database} TO naregua_migrator`)
    await sql.unsafe(`GRANT USAGE, CREATE ON SCHEMA public TO naregua_migrator`)
    await sql.unsafe(`GRANT USAGE ON SCHEMA public TO naregua_app`)
    await sql.unsafe(`
      ALTER DEFAULT PRIVILEGES FOR ROLE naregua_migrator IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO naregua_app
    `)
    await sql.unsafe(`
      ALTER DEFAULT PRIVILEGES FOR ROLE naregua_migrator IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO naregua_app
    `)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export async function applyMigration(adminUrl: string): Promise<void> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} })
  const file = join(dirname(fileURLToPath(import.meta.url)), '../migrations/0002_init.sql')
  try {
    await sql.unsafe(readFileSync(file, 'utf8'))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export function getAppDatabaseUrl(
  adminUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL,
): string {
  if (!adminUrl) {
    throw new Error('DATABASE_URL nao definida. Rode `pnpm setup` ou copie .env.example para .env')
  }
  return appConnectionString(adminUrl)
}
