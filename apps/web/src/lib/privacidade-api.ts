import { pedir, type Resultado } from './http'

/**
 * Exportacao completa — NR-086, RF-125, RF-126, LGPD art. 18.
 *
 * Este modulo nasceu real: nao houve versao de mentira. `core` tinha o caso de
 * uso desde a NR-031 e nada o expunha — o direito de portabilidade existia em
 * codigo e nao tinha caminho no produto.
 */

/**
 * O manifesto que acompanha o pacote.
 *
 * E o que transforma "recebi um zip" em "recebi 1.482 vendas". Sem ele, quem
 * recebe o pacote nao tem como dizer se ele esta completo — e um pacote
 * incompleto que parece completo e o pior desfecho de uma portabilidade,
 * porque ninguem descobre pelo uso.
 */
export type ManifestoDaExportacao = {
  companyId: string
  generatedAt: string
  formatVersion: number
  collections: { name: string; rows: number; file: string }[]
}

export type ResultadoDaExportacao = {
  manifest: ManifestoDaExportacao
  /** Por onde baixar. Hoje um caminho no servidor — ver a nota na tela. */
  location: string
}

/**
 * Gera o pacote — RF-125.
 *
 * `POST` porque grava: o pacote no destino e a linha na trilha de auditoria.
 * Exportar a base inteira e o evento que alguem vai querer reconstituir depois
 * de um vazamento, e por isso ele e auditado ao contrario da maioria das
 * leituras.
 *
 * Sem corpo: o que exportar nao e escolha — e tudo. Um parametro de selecao
 * transformaria o direito de portabilidade numa exportacao parcial que o
 * lojista teria de saber configurar.
 */
export const exportarDados = (): Promise<Resultado<ResultadoDaExportacao>> =>
  pedir<ResultadoDaExportacao>('/api/privacidade/exportacoes', {
    method: 'POST',
    body: JSON.stringify({}),
  })

/** Total de registros do pacote — o numero que a tela mostra. */
export const totalDeRegistros = (m: ManifestoDaExportacao): number =>
  m.collections.reduce((soma, c) => soma + c.rows, 0)
