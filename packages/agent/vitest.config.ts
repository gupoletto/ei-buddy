import { defineConfig } from 'vitest/config'

/**
 * Piso de cobertura — RNF-068. `mastra-llm.ts` fala com a OpenAI: o teste do
 * runtime usa o falso, e este arquivo fica de fora do denominador.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      exclude: ['src/index.ts', 'src/mastra-llm.ts', '**/*.test.ts'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
})
