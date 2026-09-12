import type {
  CreateCrmCardInput,
  CrmBoardOutput,
  CrmCardOutput,
  CrmColumn,
  CrmCommentOutput,
} from '@na-regua/contracts'
import { AppError } from '../app-error.js'
import { assertCanWrite } from '../authorization.js'
import type { ExecutionContext } from '../context.js'
import type { CrmRepository } from '../ports/crm-repository.js'
import type { TeamRepository } from '../ports/team-repository.js'

export type CrmDeps = {
  readonly crm: CrmRepository
}

/**
 * Cria um card — NR-109.
 *
 * Todo card nasce por aqui: nao ha sincronizacao automatica com Clientes nem
 * Financeiro neste recorte (ver a migration 0011). Um contato anotado antes
 * de o cliente ter cadastro entra sem `customerId` — o campo e opcional de
 * proposito, para nao travar quem esta registrando algo agora.
 */
export async function createCrmCard(
  deps: CrmDeps,
  ctx: ExecutionContext,
  input: CreateCrmCardInput,
): Promise<CrmCardOutput> {
  assertCanWrite(ctx)

  return deps.crm.create({
    companyId: ctx.companyId,
    title: input.title,
    description: input.description,
    kind: input.kind,
    customerId: input.customerId,
    dueOn: input.dueOn,
    assigneeUserId: input.assigneeUserId,
    createdBy: ctx.userId,
    createdAt: ctx.now,
  })
}

/**
 * O quadro inteiro.
 *
 * Leitura: nao passa por `assertCanWrite`. `accountant` acompanha cobranca
 * (card do tipo `task` sobre um titulo vencido) como qualquer um.
 */
export async function listCrmBoard(deps: CrmDeps, ctx: ExecutionContext): Promise<CrmBoardOutput> {
  return { cards: [...(await deps.crm.list(ctx.companyId))] }
}

/**
 * Move o card entre colunas.
 *
 * "Concluir" um card e so move-lo para a coluna `done`: nao ha um segundo
 * verbo para isso porque a tela representa os dois com o mesmo gesto
 * (arrastar), e um caso de uso a mais para o mesmo movimento so divergiria
 * depois.
 */
export async function moveCrmCard(
  deps: CrmDeps,
  ctx: ExecutionContext,
  cardId: string,
  column: CrmColumn,
): Promise<CrmCardOutput> {
  assertCanWrite(ctx)

  const existe = await deps.crm.findById(ctx.companyId, cardId)
  if (existe === undefined) {
    /* 404, nunca 403: um erro diferente de "nao existe" confirmaria, para
       quem varre ids, que aquele card existe em alguma outra loja. */
    throw AppError.notFound('Card nao encontrado.')
  }

  return deps.crm.move(ctx.companyId, cardId, column)
}

/**
 * Comenta num card.
 *
 * `accountant` pode comentar: e leitura de negocio (nao mexe em dinheiro nem
 * em cadastro), e o motivo de existir e justamente registrar acompanhamento —
 * travar isso para quem so tem papel de leitura contradiria o proprio
 * proposito do comentario.
 */
export async function commentOnCrmCard(
  deps: CrmDeps,
  ctx: ExecutionContext,
  cardId: string,
  text: string,
): Promise<CrmCommentOutput> {
  const existe = await deps.crm.findById(ctx.companyId, cardId)
  if (existe === undefined) {
    throw AppError.notFound('Card nao encontrado.')
  }

  return deps.crm.addComment({
    companyId: ctx.companyId,
    cardId,
    authorId: ctx.userId,
    text,
    createdAt: ctx.now,
  })
}

export type TeamDeps = {
  readonly team: TeamRepository
}

/** Quem pode ser responsavel por um card — para o seletor da tela. */
export async function listTeam(deps: TeamDeps, ctx: ExecutionContext) {
  return { members: [...(await deps.team.list(ctx.companyId))] }
}
