/**
 * O pedido do navegador ao BFF, num lugar so.
 *
 * Nasceu privado dentro de `financeiro-api` (NR-074) e saiu daqui quando a
 * conciliacao (NR-076) precisou do mesmo. Copiar seria o caminho curto e a
 * primeira coisa a divergir e a MENSAGEM de falha de rede: metade das telas
 * diria "Sem conexao" e a outra metade "Erro ao carregar", para a mesma coisa.
 */

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string }

export async function pedir<T>(caminho: string, init?: RequestInit): Promise<Resultado<T>> {
  let resposta: Response

  try {
    resposta = await fetch(caminho, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
      /* O token esta num cookie `httpOnly`: sem isto ele nao acompanha o
         pedido e toda chamada volta 401. */
      credentials: 'same-origin',
    })
  } catch {
    return { ok: false, erro: 'Sem conexão. Verifique sua internet.' }
  }

  const corpo = (await resposta.json().catch(() => ({}))) as {
    error?: { message?: string }
  }

  if (!resposta.ok) {
    return { ok: false, erro: corpo.error?.message ?? 'Nao foi possivel carregar.' }
  }

  return { ok: true, dados: corpo as unknown as T }
}
