import { defineConfig } from 'vitest/config'

/**
 * Configuracao de teste do `web`.
 *
 * ## Por que `server-only` e neutralizado aqui
 *
 * `api-server.ts` comeca com `import 'server-only'`, e isso e deliberado: o
 * pacote faz o BUILD quebrar se um componente de cliente importar o modulo,
 * impedindo que a `API_URL` interna e o token da sessao vazem para o
 * navegador. A guarda que importa e a do bundler.
 *
 * O Vitest, porem, resolve a condicao de cliente do pacote — e a condicao de
 * cliente e um `throw`. Resultado: o modulo nao dava nem para importar num
 * teste, e a alternativa era deixar sem teste justamente a funcao por onde
 * passa toda chamada a api.
 *
 * O alias troca o pacote por um modulo vazio SO no runner. Nao afrouxa nada:
 * `next build` continua com o `server-only` de verdade, e e la que o import
 * errado precisa falhar.
 */
export default defineConfig({
  test: {
    alias: {
      'server-only': new URL('./src/test/server-only-stub.ts', import.meta.url).pathname,
    },
  },
})
