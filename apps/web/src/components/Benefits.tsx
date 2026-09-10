import type { ComponentType } from 'react'
import { benefits } from '@/content/site'
import {
  IconBox,
  IconReceipt,
  IconShield,
  IconSparkles,
  IconUsers,
  IconWallet,
  type IconProps,
} from './Icons'
import styles from './Benefits.module.css'

/**
 * Substitui a antiga secao de prova social.
 *
 * Ela trazia quatro metricas e quatro depoimentos, todos inventados para dar
 * forma ao layout — nome, cidade, ramo e citacao de gente que nao existe.
 * Enquanto nao houver cliente real disposto a dar depoimento, a pagina fala
 * do que o produto faz, que e verificavel abrindo a tela correspondente.
 *
 * Quando existir citacao real, esta secao volta a ser o carrossel — o CSS
 * antigo esta no historico do git, em Testimonials.module.css.
 */
const iconMap: Record<string, ComponentType<IconProps>> = {
  sparkles: IconSparkles,
  receipt: IconReceipt,
  wallet: IconWallet,
  box: IconBox,
  users: IconUsers,
  shield: IconShield,
}

export default function Benefits() {
  return (
    <section className="section">
      <div className="container">
        <header className={styles.head}>
          <span className="eyebrow">Feito para o seu negócio</span>
          <h2 className="sectionTitle">
            O que muda no seu <span className="gradientText">dia a dia</span>
          </h2>
          <p className="sectionLead">
            Nada aqui é promessa de futuro: cada item abaixo corresponde a uma tela que já existe no
            sistema.
          </p>
        </header>

        <ul className={styles.cards}>
          {benefits.map((item) => {
            const Icon = iconMap[item.icon]
            return (
              <li key={item.title} className={styles.card}>
                <span className={styles.icon}>{Icon ? <Icon size={20} /> : null}</span>
                <h3 className={styles.title}>{item.title}</h3>
                <p className={styles.text}>{item.text}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
