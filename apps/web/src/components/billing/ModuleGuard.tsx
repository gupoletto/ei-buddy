'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { isRotaBloqueada } from '@/lib/access'
import LockedModuleOverlay from './LockedModuleOverlay'

/**
 * Aplica o bloqueio por rota em um unico lugar, em vez de espalhar a
 * verificacao por cada tela. As paginas nao precisam saber que existe
 * cobranca — quem decide e a regra em `lib/access.ts`.
 */
export default function ModuleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (!isRotaBloqueada(pathname)) {
    return <>{children}</>
  }

  return (
    <LockedModuleOverlay
      titulo="Módulo bloqueado"
      descricao="Seus dados continuam salvos. Regularize o pagamento para voltar a lançar e editar por aqui."
    >
      {children}
    </LockedModuleOverlay>
  )
}
