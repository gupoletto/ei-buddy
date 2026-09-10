import styles from './Skeleton.module.css'

/**
 * Placeholder de carregamento com efeito de brilho.
 *
 * Antes disto, toda tela em carregamento reusava `EmptyState` com
 * `title="Carregando..."` — texto estatico, sem forma do que esta vindo. O
 * skeleton mostra o FORMATO do conteudo (linhas, cartoes) antes do dado
 * chegar, que e o que reduz a sensacao de espera; ver `SkeletonLinhas` e
 * `SkeletonCartoes` abaixo para os dois formatos usados no painel.
 *
 * `prefers-reduced-motion` ja e tratado globalmente em `globals.css` — a
 * animacao de brilho para sozinha para quem pediu menos movimento, sem nada
 * de especial aqui.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  className = '',
}: {
  width?: number | string
  height?: number | string
  radius?: number
  className?: string
}) {
  return (
    <span
      className={`${styles.skeleton} ${className}`}
      style={{ width, height, borderRadius: radius }}
    />
  )
}

/** Linhas de texto/lista — para tabelas, listas e formularios em carregamento. */
export function SkeletonLinhas({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className={styles.linhas} role="status" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className={styles.linha}>
          <Skeleton width={36} height={36} radius={10} />
          <div className={styles.linhaTexto}>
            <Skeleton height={13} width={i % 2 === 0 ? '55%' : '40%'} />
            <Skeleton height={11} width={i % 3 === 0 ? '30%' : '22%'} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Grade de cartoes — para catalogo, dashboard e outras grades. */
export function SkeletonCartoes({ cartoes = 6 }: { cartoes?: number }) {
  return (
    <div className={styles.cartoes} role="status" aria-label="Carregando">
      {Array.from({ length: cartoes }).map((_, i) => (
        <div key={i} className={styles.cartao}>
          <Skeleton height={72} radius={10} />
          <Skeleton height={12} width="70%" />
          <Skeleton height={11} width="40%" />
        </div>
      ))}
    </div>
  )
}
