import type { ReactNode } from 'react'
import Link from 'next/link'
import { BRAND } from '@/content/site'
import { IconBolt, IconShield, IconSparkles } from '@/components/Icons'
import styles from './auth.module.css'

const destaques = [
  {
    icon: IconBolt,
    title: 'Tudo em um so fluxo',
    text: 'Vendas, financeiro, estoque e fiscal conversando entre si.',
  },
  {
    icon: IconSparkles,
    title: 'Assistente em texto',
    text: 'Pergunte o que precisa e receba o numero pronto.',
  },
  {
    icon: IconShield,
    title: 'Seguranca nivel bancario',
    text: 'Dados isolados por empresa e backup diario.',
  },
]

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {/* Painel de marca — gradiente da identidade */}
      <aside className={styles.brandPanel}>
        <div className={styles.brandInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandName}>{BRAND}</span>
          </Link>

          <div className={styles.pitch}>
            <h2 className={styles.pitchTitle}>A gestao do seu comercio, do balcao ao relatorio.</h2>

            <ul className={styles.highlights}>
              {destaques.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.title} className={styles.highlight}>
                    <span className={styles.highlightIcon}>
                      <Icon size={18} />
                    </span>
                    <span className={styles.highlightText}>
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <p className={styles.footNote}>
            Mais de 12 mil negocios ja usam para fechar o mes sem planilha.
          </p>
        </div>
      </aside>

      {/* Painel do formulario — fundo claro */}
      <main className={styles.formPanel}>
        <div className={styles.formInner}>{children}</div>
      </main>
    </div>
  )
}
