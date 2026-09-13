'use client'

import { useId } from 'react'
import styles from './campos.module.css'

/**
 * Campos que `auth/Fields.tsx` nao tem — grupo de checkbox, grupo de radio, e
 * campo de texto longo — para o formulario publico de `/lista-vip` (NR-111).
 *
 * CSS proprio, e nao importado de `auth-form.module.css`: os dois usam os
 * MESMOS tokens globais (`--brand-*`, `--text-*`, `--border-*`), mas
 * compartilhar o arquivo acoplaria o formulario de login ao de pesquisa —
 * mudar um mudaria o outro sem ninguem pedir.
 */

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  hint?: string
  placeholder?: string
  rows?: number
}) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={`${styles.input} ${styles.textarea} ${error ? styles.inputError : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
      />
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

type Opcao = { value: string; label: string }

/** O campo de texto que aparece quando a opcao "outra"/"outro" e marcada. */
function CampoOutro({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <input
      className={styles.outroInput}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={rotulo}
      aria-label={rotulo}
    />
  )
}

export function CheckboxGroupField({
  legend,
  options,
  selected,
  onChange,
  outraValue,
  onChangeOutra,
  hint,
}: {
  legend: string
  options: readonly Opcao[]
  selected: readonly string[]
  onChange: (next: string[]) => void
  /** Presente so quando as opcoes incluem uma de valor `'other'`. */
  outraValue?: string
  onChangeOutra?: (v: string) => void
  hint?: string
}) {
  const outraMarcada = selected.includes('other')

  function alternar(valor: string, marcado: boolean) {
    onChange(marcado ? [...selected, valor] : selected.filter((v) => v !== valor))
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.opcoes}>
        {options.map((opcao) => (
          <label key={opcao.value} className={styles.opcao}>
            <input
              type="checkbox"
              checked={selected.includes(opcao.value)}
              onChange={(e) => alternar(opcao.value, e.target.checked)}
            />
            <span>{opcao.label}</span>
          </label>
        ))}
      </div>
      {outraMarcada && onChangeOutra ? (
        <CampoOutro rotulo="Qual?" valor={outraValue ?? ''} onChange={onChangeOutra} />
      ) : null}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </fieldset>
  )
}

export function RadioGroupField({
  legend,
  options,
  value,
  onChange,
  outraValue,
  onChangeOutra,
}: {
  legend: string
  options: readonly Opcao[]
  value: string | undefined
  onChange: (v: string) => void
  /** Presente so quando as opcoes incluem uma de valor `'other'`. */
  outraValue?: string
  onChangeOutra?: (v: string) => void
}) {
  const name = useId()
  const outraSelecionada = value === 'other'

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.opcoes}>
        {options.map((opcao) => (
          <label key={opcao.value} className={styles.opcao}>
            <input
              type="radio"
              name={name}
              checked={value === opcao.value}
              onChange={() => onChange(opcao.value)}
            />
            <span>{opcao.label}</span>
          </label>
        ))}
      </div>
      {outraSelecionada && onChangeOutra ? (
        <CampoOutro rotulo="Qual?" valor={outraValue ?? ''} onChange={onChangeOutra} />
      ) : null}
    </fieldset>
  )
}
