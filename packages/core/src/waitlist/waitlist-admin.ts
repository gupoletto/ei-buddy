import type { WaitlistEntryOutput } from '@na-regua/contracts'
import { AppError } from '../app-error.js'
import type { UserId } from '../context.js'
import type { PlatformAdminAccess } from '../ports/platform-admin.js'
import type {
  WaitlistFilter,
  WaitlistRepository,
  WaitlistStats,
} from '../ports/waitlist-repository.js'

/**
 * Leitura da lista de espera pelo Super Admin — NR-111.
 *
 * Mesma disciplina de `auth/platform-admin.ts`: ninguem chega perto de
 * `waitlist.list`/`waitlist.stats` sem `isPlatformAdmin` confirmado antes. A
 * checagem se repete aqui em vez de importada de la porque e local aquele
 * arquivo — a regra e simples o bastante para nao valer uma dependencia
 * cruzada entre dois modulos de `core` que hoje nao se falam.
 */

export type WaitlistAdminDeps = {
  readonly waitlist: WaitlistRepository
  readonly platformAdmin: PlatformAdminAccess
}

const MSG_NAO_E_ADMIN = 'Esta conta nao tem acesso de Super Admin.'

async function exigirSuperAdmin(deps: WaitlistAdminDeps, userId: UserId): Promise<void> {
  if (!(await deps.platformAdmin.isPlatformAdmin(userId))) {
    throw AppError.forbidden(MSG_NAO_E_ADMIN)
  }
}

export async function getWaitlistStats(
  deps: WaitlistAdminDeps,
  requestedBy: UserId,
): Promise<WaitlistStats> {
  await exigirSuperAdmin(deps, requestedBy)
  return deps.waitlist.stats()
}

export async function listWaitlistEntries(
  deps: WaitlistAdminDeps,
  requestedBy: UserId,
  filter: WaitlistFilter,
): Promise<{ readonly entries: readonly WaitlistEntryOutput[]; readonly total: number }> {
  await exigirSuperAdmin(deps, requestedBy)
  return deps.waitlist.list(filter)
}
