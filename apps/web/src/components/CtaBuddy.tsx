import Image from 'next/image'
import Link from 'next/link'
import { IconArrowRight } from './Icons'
import styles from './CtaBuddy.module.css'

/**
 * Fechamento da landing.
 *
 * A pagina terminava no FAQ, que responde duvidas mas nao convida a nada.
 * Esta faixa retoma a acao no fim da leitura, quando a pessoa ja viu o
 * produto inteiro — e e onde o mascote cabe sem disputar atencao com o
 * mockup do hero.
 */
export default function CtaBuddy() {
  return (
    <section className={`section ${styles.section}`}>
      <div className="container">
        <div className={styles.card}>
          <div className={styles.copy}>
            <span className={styles.badge}>Comece hoje</span>

            <h2 className={styles.title}>
              Deixe o <span className="gradientText">Buddy</span> cuidar da papelada
            </h2>

            <p className={styles.lead}>
              Crie sua conta em dois minutos e use todos os módulos desde o primeiro dia. Sem
              instalação, sem contrato de fidelidade e sem cobrança por usuário.
            </p>

            <div className={styles.ctas}>
              <Link href="/criar-conta" className="btn btnPrimary">
                Começar agora
                <IconArrowRight size={18} />
              </Link>
              <a href="#planos" className="btn btnGhost">
                Ver o plano
              </a>
            </div>
          </div>

          <div className={styles.mascote}>
            <div className={styles.glow} aria-hidden="true" />
            <Image
              src="/buddy.png"
              alt="Buddy, o mascote do EiBuddy, com o polegar levantado"
              fill
              className={styles.imagem}
              sizes="(min-width: 940px) 380px, 260px"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
