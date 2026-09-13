import styles from './lista-vip-charts.module.css'

/**
 * Os dois graficos do painel da lista de espera — NR-111.
 *
 * Uma so serie por grafico (a contagem), por isso uma so cor e nenhuma
 * legenda — o titulo do card ja diz o que esta plotado (dataviz skill,
 * "a single series needs no legend box"). O valor fica sempre visivel na
 * ponta da barra/coluna: nada aqui depende de passar o mouse por cima para
 * ser lido, e a tabela de respostas individuais continua a versao completa,
 * sem grafico nenhum.
 */

const diaMes = (iso: string): string => {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export function RankedBarList({ data }: { data: readonly { label: string; value: number }[] }) {
  if (data.length === 0) {
    return <p className={styles.vazio}>Nenhuma resposta ainda.</p>
  }

  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <ul className={styles.barras}>
      {data.map((d) => (
        <li key={d.label} className={styles.barraLinha}>
          <span className={styles.barraRotulo}>{d.label}</span>
          <span className={styles.barraTrilha}>
            <span
              className={styles.barraPreenchida}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </span>
          <span className={styles.barraValor}>{d.value}</span>
        </li>
      ))}
    </ul>
  )
}

export function DailyColumnChart({ data }: { data: readonly { date: string; count: number }[] }) {
  if (data.length === 0) {
    return <p className={styles.vazio}>Nenhuma resposta ainda.</p>
  }

  const max = Math.max(1, ...data.map((d) => d.count))

  return (
    <div className={styles.colunas} role="img" aria-label="Respostas por dia">
      {data.map((d) => (
        <div key={d.date} className={styles.coluna}>
          <span className={styles.colunaValor}>{d.count}</span>
          <span className={styles.colunaBarra} style={{ height: `${(d.count / max) * 100}%` }} />
          <span className={styles.colunaRotulo}>{diaMes(d.date)}</span>
        </div>
      ))}
    </div>
  )
}
