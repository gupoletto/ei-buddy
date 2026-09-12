import { defineConfig } from 'vitest/config'

/**
 * Teto de tempo generoso — e a razao nao e lentidao de teste.
 *
 * As suites daqui montam um Fastify de verdade e importam a arvore inteira de
 * rotas, plugins e casos de uso. Esse grafo so cresce, e o PRIMEIRO caso de
 * cada arquivo paga a transpilacao: dois testes ja falharam com "timed out in
 * 5000ms" em execucoes que passaram na tentativa seguinte, sem nenhuma mudanca
 * de codigo entre elas.
 *
 * Falha intermitente e pior que teste lento por um motivo pratico: ela ensina a
 * suite a ser ignorada. Quem ve vermelho que passa ao rodar de novo para de
 * olhar para o vermelho — e o dia em que ele for de verdade, ninguem nota.
 *
 * O que se mede aqui e comportamento de rota, nunca tempo de carga.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
