import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExportCollection } from '@na-regua/contracts'
import type { ExportSink } from '@na-regua/core'

/**
 * Onde o pacote da exportacao e escrito — NR-086, RF-125.
 *
 * ## Em disco, e por enquanto
 *
 * O destino de producao e armazenamento de objetos, e isso depende da DEC-009
 * (hospedagem). A porta `ExportSink` existe justamente para essa troca: o caso
 * de uso nao muda, muda o que a composicao injeta. A ADR-0002 fez a mesma
 * aposta com o provedor de identidade, e ela se pagou.
 *
 * ## JSONL, uma linha por registro
 *
 * Nao JSON: um arquivo com um array gigante obriga quem le a carrega-lo inteiro
 * na memoria, que e exatamente o problema que a paginacao do caso de uso existe
 * para evitar — o pacote seria portavel para nos e nao para quem recebe.
 *
 * Nao CSV: metade das colunas e `jsonb` ou nula, e CSV nao distingue nulo de
 * string vazia. Num pacote de portabilidade essa diferenca e a diferenca entre
 * "o cliente nao informou telefone" e "o telefone e uma string vazia".
 *
 * ## Escreve por fluxo, e nao acumula
 *
 * Um `WriteStream` por colecao, aberto na primeira pagina. Acumular em memoria
 * para gravar no fim desfaria a paginacao: o pico voltaria a ser a colecao
 * inteira, e a exportacao quebraria na loja grande — a de quem mais precisa
 * dela ao sair.
 *
 * ## A pasta so vira definitiva no fim
 *
 * Escreve em `<destino>.parcial` e renomeia ao terminar. `rename` no mesmo
 * volume e atomico, entao um processo derrubado no meio nao deixa uma pasta com
 * cara de pacote pronto e metade dos dados. Pacote incompleto que PARECE
 * completo e o pior desfecho de um direito de portabilidade: ninguem descobre
 * pelo uso.
 */

/** Fora de `src`, e ignorado pelo git — como o `.dev` da identidade. */
const BASE_PADRAO = join(process.cwd(), '.dev', 'exportacoes')

export class ExportacaoEmArquivo implements ExportSink {
  private readonly parcial: string
  private readonly definitivo: string
  private readonly fluxos = new Map<ExportCollection, WriteStream>()

  /**
   * @param companyId entra no caminho para dois pacotes de lojas diferentes
   *   nunca se sobreporem, mesmo gerados no mesmo instante.
   * @param carimbo o instante da geracao, vindo de `ctx.now` — e nao de
   *   `Date.now()` aqui dentro. Duas fontes de tempo fariam o nome da pasta
   *   discordar do `generatedAt` do manifesto.
   */
  constructor(companyId: string, carimbo: Date, base: string = BASE_PADRAO) {
    /* `:` nao e valido em nome de arquivo no Windows, e o ISO esta cheio. */
    const nome = `${companyId}-${carimbo.toISOString().replace(/[:.]/g, '-')}`
    this.definitivo = join(base, nome)
    this.parcial = `${this.definitivo}.parcial`
    mkdirSync(this.parcial, { recursive: true })
  }

  async writeRows(
    collection: ExportCollection,
    rows: readonly Record<string, unknown>[],
  ): Promise<void> {
    const fluxo = this.abrir(collection)

    /*
     * Uma unica escrita por pagina, e nao uma por linha: mil chamadas de
     * `write` por pagina enchem a fila interna do fluxo sem necessidade.
     */
    const bloco = rows.map((linha) => JSON.stringify(linha)).join('\n') + '\n'

    await new Promise<void>((resolve, reject) => {
      fluxo.write(bloco, (erro) => (erro ? reject(erro) : resolve()))
    })
  }

  async finish(manifest: unknown): Promise<{ location: string }> {
    await Promise.all([...this.fluxos.values()].map((f) => this.fechar(f)))
    this.fluxos.clear()

    /*
     * O manifesto e o ULTIMO arquivo. Se algo falhar antes, a pasta parcial nao
     * tem manifesto — e uma pasta sem manifesto e reconhecivelmente incompleta,
     * em vez de parecer um pacote menor do que deveria.
     */
    const manifesto = createWriteStream(join(this.parcial, 'manifest.json'))
    await new Promise<void>((resolve, reject) => {
      manifesto.write(JSON.stringify(manifest, null, 2), (erro) =>
        erro ? reject(erro) : resolve(),
      )
    })
    await this.fechar(manifesto)

    await rename(this.parcial, this.definitivo)

    return { location: this.definitivo }
  }

  private abrir(collection: ExportCollection): WriteStream {
    const existente = this.fluxos.get(collection)
    if (existente !== undefined) return existente

    /* O nome do arquivo casa com o `file` do manifesto — quem le o manifesto
       precisa achar o arquivo que ele nomeia. */
    const fluxo = createWriteStream(join(this.parcial, `${collection}.jsonl`))
    this.fluxos.set(collection, fluxo)
    return fluxo
  }

  private fechar(fluxo: WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      fluxo.end((erro?: Error | null) => (erro ? reject(erro) : resolve()))
    })
  }
}
