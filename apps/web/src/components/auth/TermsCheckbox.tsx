'use client'

import { useId } from 'react'
import styles from './signup.module.css'

/**
 * Aceite obrigatorio dos termos. O botao de avancar da etapa 3 fica
 * desabilitado enquanto `checked` for falso.
 *
 * Os `href` sempre estiveram certos; o que faltava eram as PAGINAS. Ate a
 * NR-085 os dois links davam 404, e a pessoa marcava "li e aceito" apontando
 * para nada — um aceite que, se fosse questionado, nao teria o que exibir.
 *
 * As paginas existem agora. As condicoes comerciais dos termos seguem em
 * elaboracao e estao marcadas como tal na propria pagina, em vez de escritas
 * por quem nao pode decidi-las.
 */
export default function TermsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()

  return (
    <div className={styles.terms}>
      <input
        id={id}
        type="checkbox"
        className={styles.termsBox}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className={styles.termsLabel}>
        Li e aceito os{' '}
        <a href="/termos-de-uso" target="_blank" rel="noreferrer noopener">
          Termos de Uso
        </a>{' '}
        e a{' '}
        <a href="/politica-de-privacidade" target="_blank" rel="noreferrer noopener">
          Política de Privacidade
        </a>
        .
      </label>
    </div>
  )
}
