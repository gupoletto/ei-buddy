import { z } from 'zod'
import { dateSchema, idSchema } from '../common/primitives.js'

/**
 * O quadro de CRM — glossario `CrmCard`. NR-109.
 *
 * Modulo novo: nao havia schema, porta nem rota antes disto. Ver a nota no
 * topo da migration 0011 para o que fica de fora deste recorte (sincronizacao
 * automatica com outros modulos, responsavel multiplo).
 */

export const crmCardKindSchema = z.enum(['task', 'contact'])
export type CrmCardKind = z.infer<typeof crmCardKindSchema>

export const crmColumnSchema = z.enum(['todo', 'doing', 'done'])
export type CrmColumn = z.infer<typeof crmColumnSchema>

export const createCrmCardInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Titulo muito curto.').max(140, 'Titulo muito longo.'),
    description: z.string().trim().max(500, 'Descricao muito longa.').optional(),
    kind: crmCardKindSchema,
    /** Ausente = card sobre um contato que ainda nao virou cadastro. */
    customerId: idSchema.optional(),
    /** Vencimento da tarefa, ou data do contato ja ocorrido. */
    dueOn: dateSchema,
    assigneeUserId: idSchema.optional(),
  })
  .strict()

export type CreateCrmCardInput = z.infer<typeof createCrmCardInputSchema>

/**
 * Mover o card — a unica edicao que a tela oferece hoje (arrastar entre
 * colunas). Editar titulo, descricao ou responsavel nao tem tela ainda, e por
 * isso nao entram aqui: um campo que ninguem envia e superficie sem uso.
 */
export const moveCrmCardInputSchema = z
  .object({
    column: crmColumnSchema,
  })
  .strict()

export type MoveCrmCardInput = z.infer<typeof moveCrmCardInputSchema>

export const crmCommentInputSchema = z
  .object({
    text: z.string().trim().min(1, 'Escreva o comentario.').max(1000, 'Comentario muito longo.'),
  })
  .strict()

export type CrmCommentInput = z.infer<typeof crmCommentInputSchema>

export const crmCommentOutputSchema = z.object({
  id: idSchema,
  authorId: idSchema.nullable(),
  /** Nulo quando quem comentou saiu da empresa — o texto continua, o nome nao. */
  authorName: z.string().nullable(),
  text: z.string(),
  createdAt: z.string(),
})

export type CrmCommentOutput = z.infer<typeof crmCommentOutputSchema>

export const crmCardOutputSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  kind: crmCardKindSchema,
  column: crmColumnSchema,
  customerId: idSchema.nullable(),
  /** Junto na mesma consulta — a tela mostra o nome em todo card. */
  customerName: z.string().nullable(),
  dueOn: z.string(),
  assigneeUserId: idSchema.nullable(),
  assigneeName: z.string().nullable(),
  comments: z.array(crmCommentOutputSchema),
  createdAt: z.string(),
})

export type CrmCardOutput = z.infer<typeof crmCardOutputSchema>

/**
 * O quadro inteiro, numa chamada so.
 *
 * Sem paginacao: um quadro de CRM de uma mercearia tem dezenas de cards, nao
 * milhares — e o agrupamento por coluna, que a tela precisa para desenhar as
 * tres raias, so funciona vendo tudo de uma vez.
 */
export const crmBoardOutputSchema = z.object({
  cards: z.array(crmCardOutputSchema),
})

export type CrmBoardOutput = z.infer<typeof crmBoardOutputSchema>
