import Link from 'next/link'
import type { ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

type CommonProps = {
  children: ReactNode
  variant?: Variant
  size?: Size
  /** Ocupa toda a largura disponivel. */
  block?: boolean
  className?: string
}

function classesFor({ variant = 'primary', size = 'md', block, className = '' }: CommonProps) {
  return [styles.base, styles[variant], styles[size], block ? styles.block : '', className]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  children,
  variant,
  size,
  block,
  className,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={classesFor({ children, variant, size, block, className })}>
      {children}
    </button>
  )
}

export function ButtonLink({
  children,
  href,
  variant,
  size,
  block,
  className,
  ...rest
}: CommonProps & { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Link
      href={href}
      className={classesFor({ children, variant, size, block, className })}
      {...rest}
    >
      {children}
    </Link>
  )
}
