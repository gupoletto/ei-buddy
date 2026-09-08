/**
 * Substituto vazio do pacote `server-only`, usado SO pelo Vitest.
 *
 * O pacote de verdade lanca quando resolvido pela condicao de cliente, e o
 * Vitest usa essa condicao — o que tornava `api-server.ts` impossivel de
 * importar num teste. Ver `vitest.config.ts` para por que isso nao afrouxa a
 * guarda: quem precisa falhar com o import errado e o `next build`, e la o
 * pacote real continua no lugar.
 */
export {}
