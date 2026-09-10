import Link from 'next/link'
import { plan } from '@/content/site'
import { IconArrowRight, IconCheck, IconShield } from './Icons'
import styles from './Pricing.module.css'

export default function Pricing() {
  return (
    <section className={`section ${styles.section}`} id="planos">
      <div className="container">
        <header className={styles.head}>
          <span className="eyebrow">Planos</span>
          <h2 className="sectionTitle">
            Um plano, todos os <span className="gradientText">módulos</span>
          </h2>
          <p className="sectionLead">
            Sem escalonamento por funcionalidade e sem cobrança por usuário. Você paga por empresa e
            usa o sistema inteiro, do balcão ao assistente.
          </p>
        </header>

        <div className={styles.card}>
          <div className={styles.cardMain}>
            <span className={styles.badge}>{plan.badge}</span>
            <h3 className={styles.planName}>{plan.name}</h3>

            <p className={styles.priceRow}>
              <strong className={styles.price}>{plan.price}</strong>
              <span className={styles.period}>{plan.period}</span>
            </p>

            {/*
              O plano vai na query para o cadastro saber de onde a pessoa veio.
              Hoje ha um plano so, entao o valor e fixo — mas o parametro ja
              existe para quando houver mais de um.
              TODO: ler `plano` no formulario de criar conta (NR-075).
            */}
            <Link href="/criar-conta?plano=unico" className={`btn btnPrimary ${styles.cta}`}>
              Começar agora
              <IconArrowRight size={18} />
            </Link>

            <p className={styles.note}>{plan.note}</p>

            <p className={styles.secure}>
              <IconShield size={16} />
              Dados isolados por empresa e backup diário
            </p>
          </div>

          <ul className={styles.features}>
            {plan.features.map((feature) => (
              <li key={feature} className={styles.feature}>
                <span className={styles.check}>
                  <IconCheck size={13} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
