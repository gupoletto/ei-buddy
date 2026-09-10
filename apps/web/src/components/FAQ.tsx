'use client'

import { useState } from 'react'
import { faq } from '@/content/site'
import { IconChevronDown } from './Icons'
import styles from './FAQ.module.css'

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="section" id="duvidas">
      <div className="container">
        <header className={styles.head}>
          <span className="eyebrow">Dúvidas</span>
          <h2 className="sectionTitle">Perguntas frequentes</h2>
          <p className="sectionLead">
            O que costumam perguntar antes de começar. Se ficar faltando algo, o time responde
            direto no chat.
          </p>
        </header>

        <ul className={styles.list}>
          {faq.map((item, i) => {
            const isOpen = open === i
            return (
              <li key={item.question} className={styles.item}>
                <h3>
                  <button
                    type="button"
                    className={styles.trigger}
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-trigger-${i}`}
                  >
                    <span>{item.question}</span>
                    <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                      <IconChevronDown size={19} />
                    </span>
                  </button>
                </h3>

                <div
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-trigger-${i}`}
                  className={styles.panel}
                  hidden={!isOpen}
                >
                  <p className={styles.answer}>{item.answer}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
