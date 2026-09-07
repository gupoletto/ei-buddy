import { z } from 'zod'
import { baseEnvSchema, opcionalNaoVazia, providerSchema } from './base.js'
import { parseEnv } from './parse.js'

/**
 * Variaveis que `apps/api` precisa para subir — ambientes.md#matriz.
 *
 * So entram aqui variaveis que o processo realmente le hoje, mais as
 * marcadas Obr. na matriz que ja tem consumidor no codigo (AUTH_PROVIDER e
 * JWT_SECRET, por DEC-008). As de PagMaxx, fiscal, WhatsApp, Open Finance e
 * agente ficam de fora ate os adapters existirem — colocar aqui uma lista de
 * campos obrigatorios que nada consome ainda so far barrar o boot local sem
 * necessidade.
 */
export const apiEnvSchema = baseEnvSchema.extend({
  API_PORT: z.coerce
    .number({ invalid_type_error: 'API_PORT precisa ser um numero.' })
    .int('API_PORT precisa ser um numero inteiro.')
    .positive('API_PORT precisa ser maior que zero.')
    .max(65535, 'API_PORT precisa ser no maximo 65535.')
    .default(3333),

  API_URL: z.string().url('API_URL precisa ser uma URL valida, ex.: http://localhost:3333'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL e obrigatoria. Copie .env.example para .env ou rode `pnpm setup`.')
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL precisa comecar com postgresql:// ou postgres://.'),

  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL e obrigatoria. Copie .env.example para .env ou rode `pnpm setup`.')
    .regex(/^rediss?:\/\//, 'REDIS_URL precisa comecar com redis:// ou rediss://.'),

  /** DEC-008. `fake` localmente — ambientes.md#modo-fake. */
  AUTH_PROVIDER: providerSchema,
  /**
   * Comprimento nao e validado aqui: politica de segredo forte e decisao do
   * adapter de autenticacao (DEC-008), nao deste pacote.
   */
  JWT_SECRET: z.string().min(1, 'JWT_SECRET e obrigatoria. Defina um valor em .env.'),

  /**
   * Chave de 32 bytes em base64 que cifra os segredos de lojista — RNF-022.
   *
   * Opcional: sem ela a api sobe e a configuracao de emissao fiscal fica
   * indisponivel, o que e melhor que nao subir. A rota recusa com mensagem
   * propria, e `lerChaveDeSegredo` (em `db`) confere tamanho e forca — validar
   * nos dois lugares daria duas respostas para "esta chave serve".
   */
  SECRETS_KEY: opcionalNaoVazia,
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

/** Valida `process.env` para `apps/api`. Chame uma vez, no topo do processo. */
export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source, '@na-regua/api')
}
