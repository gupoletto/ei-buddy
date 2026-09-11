import { pedir, type Resultado } from './http'

/**
 * Quem trabalha na loja — NR-109.
 *
 * Hoje o unico uso e o seletor de responsavel do CRM, mas a rota (`GET
 * /equipe`) e generica: qualquer tela que precise "quem esta na equipe"
 * reaproveita esta mesma funcao.
 */
export type MembroDaEquipe = {
  id: string
  nome: string
}

export async function listarEquipe(): Promise<Resultado<MembroDaEquipe[]>> {
  const r = await pedir<{ members: { id: string; name: string }[] }>('/api/equipe')

  return r.ok ? { ok: true, dados: r.dados.members.map((m) => ({ id: m.id, nome: m.name })) } : r
}
