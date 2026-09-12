import { AppError } from '@na-regua/core'
import type { ExecutionContext } from '@na-regua/core'
import type { z } from 'zod'
import type { AgentTool } from './types.js'

/**
 * Empacota um schema de `contracts` numa tool. Nao inventa campos: o schema
 * que a API valida e o mesmo que o agente aceita.
 */
export function defineTool<TIn, TOut>(def: {
  readonly id: string
  readonly description: string
  readonly inputSchema: z.ZodType<TIn>
  readonly mutatesValue: boolean
  readonly execute: (input: TIn, ctx: ExecutionContext) => Promise<TOut>
  readonly formatReply: (output: TOut) => string
  readonly formatProposal: (input: TIn) => string
}): AgentTool {
  return {
    id: def.id,
    description: def.description,
    inputSchema: def.inputSchema,
    mutatesValue: def.mutatesValue,
    formatReply: (output) => def.formatReply(output as TOut),
    formatProposal: (input) => def.formatProposal(input as TIn),
    execute: async (input, ctx) => def.execute(input as TIn, ctx),
  }
}

export function parseToolArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args ?? {})
  if (parsed.success) return parsed.data as T

  const fields = parsed.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  throw AppError.validation('Nao deu para entender os dados. Confira e tente de novo.', fields)
}
