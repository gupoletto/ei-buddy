'use client'

import { useEffect, useRef, useState } from 'react'
import {
  NOMES_BANCOS,
  NOMES_CLIENTES,
  NOMES_FORNECEDORES,
  NOMES_PLANOS,
  salvarTitulo,
  TIPOS_RECEBIMENTO,
} from '@/lib/financeiro-api'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/auth/Fields'
import { IconClose } from '@/components/Icons'
import CampoTag from '@/components/app/CampoTag'
import styles from './financeiro.module.css'
import { hoje } from '@/lib/format'

function paraNumero(valor: string): number {
  const limpo = valor.replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

/*
 * A EMISSAO abria com uma constante fixa em 24/08/2026 — o vencimento sempre
 * nasceu vazio e obrigatorio, mas a emissao vinha preenchida com a data
 * errada. Emissao e a competencia do lancamento: uma conta lancada em setembro
 * e gravada como emitida em agosto cai no mes errado do DRE, e o mes fechado
 * muda depois de fechado.
 */

/**
 * Lancamento de titulo, a pagar ou a receber.
 *
 * As duas telas compartilham este formulario porque a estrutura e a mesma
 * — muda a contraparte (fornecedor x cliente) e os campos proprios de
 * recebimento (emissao e tipo).
 */
export default function FormularioTitulo({
  tipo,
  onSalvo,
  onCancelar,
}: {
  tipo: 'pagar' | 'receber'
  onSalvo: (mensagem: string) => void
  onCancelar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  const [banco, setBanco] = useState('')
  const [plano, setPlano] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [emissao, setEmissao] = useState(hoje())
  const [vencimento, setVencimento] = useState('')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipoRecebimento, setTipoRecebimento] = useState<string>('pix')

  /* Listas locais para o "(T)": criar um item aqui ja o deixa disponivel
     no campo, sem recarregar a tela. */
  const [bancos, setBancos] = useState(NOMES_BANCOS)
  const [planos, setPlanos] = useState(NOMES_PLANOS)
  const [contrapartes, setContrapartes] = useState(
    tipo === 'pagar' ? NOMES_FORNECEDORES : NOMES_CLIENTES,
  )

  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) onCancelar()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onCancelar, salvando])

  const rotuloContraparte = tipo === 'pagar' ? 'Fornecedor' : 'Cliente'

  async function salvar(event: React.FormEvent) {
    event.preventDefault()

    const novos: Record<string, string> = {}
    if (!banco) novos.banco = 'Escolha o banco.'
    if (!contraparte) novos.contraparte = `Escolha o ${rotuloContraparte.toLowerCase()}.`
    if (tipo === 'pagar' && !plano) novos.plano = 'Escolha o plano de conta.'
    if (!vencimento) novos.vencimento = 'Informe a data de vencimento.'
    if (paraNumero(valor) <= 0) novos.valor = 'Informe um valor maior que zero.'
    if (!descricao.trim()) {
      novos.descricao = tipo === 'pagar' ? 'Descreva o que e.' : 'Informe a que se refere.'
    }

    setErros(novos)
    if (Object.keys(novos).length > 0) return

    setSalvando(true)

    /* SUBSTITUIR POR: POST /financeiro/titulos */
    const r = await salvarTitulo(
      tipo === 'pagar'
        ? {
            banco,
            planoContas: plano,
            fornecedor: contraparte,
            vencimento,
            valor: paraNumero(valor),
            descricao,
          }
        : {
            banco,
            cliente: contraparte,
            emissao,
            vencimento,
            referente: descricao,
            tipo: tipoRecebimento,
            valor: paraNumero(valor),
          },
    )
    setSalvando(false)

    if (!r.ok) {
      setErros({ geral: r.error })
      return
    }

    onSalvo(tipo === 'pagar' ? 'Conta a pagar lancada.' : 'Conta a receber lancada.')
  }

  const erroDe = (campo: string) =>
    erros[campo] ? (
      <span className={styles.campoErro} role="alert">
        {erros[campo]}
      </span>
    ) : null

  return (
    <div className={styles.dialogRoot}>
      <button
        type="button"
        className={styles.dialogBackdrop}
        onClick={() => !salvando && onCancelar()}
        aria-label="Fechar"
      />

      <div
        ref={ref}
        className={`${styles.dialogPainel} ${styles.dialogLargo}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-form"
        tabIndex={-1}
      >
        <header className={styles.dialogCabecalho}>
          <h2 id="titulo-form" className={styles.dialogTitulo}>
            {tipo === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}
          </h2>
          <button
            type="button"
            className={styles.dialogFechar}
            onClick={onCancelar}
            disabled={salvando}
            aria-label="Fechar"
          >
            <IconClose size={18} />
          </button>
        </header>

        <form onSubmit={salvar} noValidate className={styles.formCampos}>
          <div className={styles.formLinha}>
            <label className={styles.campo}>
              <span>Banco</span>
              <CampoTag
                valor={banco}
                opcoes={bancos}
                onChange={setBanco}
                onCriar={(novo) => setBancos((b) => [...b, novo])}
                ariaLabel="Banco"
                invalido={Boolean(erros.banco)}
              />
              {erroDe('banco')}
            </label>

            <label className={styles.campo}>
              <span>{rotuloContraparte}</span>
              <CampoTag
                valor={contraparte}
                opcoes={contrapartes}
                onChange={setContraparte}
                onCriar={(novo) => setContrapartes((c) => [...c, novo])}
                ariaLabel={rotuloContraparte}
                invalido={Boolean(erros.contraparte)}
              />
              {erroDe('contraparte')}
            </label>
          </div>

          {tipo === 'pagar' ? (
            <label className={styles.campo}>
              <span>Plano de conta</span>
              <CampoTag
                valor={plano}
                opcoes={planos}
                onChange={setPlano}
                onCriar={(novo) => setPlanos((p) => [...p, novo])}
                ariaLabel="Plano de conta"
                invalido={Boolean(erros.plano)}
              />
              {erroDe('plano')}
            </label>
          ) : null}

          <div className={styles.formLinha}>
            {tipo === 'receber' ? (
              <label className={styles.campo}>
                <span>Data de emissao</span>
                <input
                  type="date"
                  className={styles.input}
                  value={emissao}
                  onChange={(e) => setEmissao(e.target.value)}
                />
              </label>
            ) : null}

            <label className={styles.campo}>
              <span>Data de vencimento</span>
              <input
                type="date"
                className={styles.input}
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                aria-invalid={Boolean(erros.vencimento)}
              />
              {erroDe('vencimento')}
            </label>

            <label className={styles.campo}>
              <span>Valor</span>
              <input
                className={styles.input}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                aria-invalid={Boolean(erros.valor)}
              />
              {erroDe('valor')}
            </label>
          </div>

          {tipo === 'receber' ? (
            <label className={styles.campo}>
              <span>Tipo de recebimento</span>
              <select
                className={styles.input}
                value={tipoRecebimento}
                onChange={(e) => setTipoRecebimento(e.target.value)}
              >
                {TIPOS_RECEBIMENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className={styles.campo}>
            <span>{tipo === 'pagar' ? 'O que e' : 'Referente a'}</span>
            <input
              className={styles.input}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={
                tipo === 'pagar' ? 'Pedido 4471, aluguel de agosto...' : 'Venda 1842, servico...'
              }
              aria-invalid={Boolean(erros.descricao)}
            />
            {erroDe('descricao')}
          </label>

          {erros.geral ? (
            <p className={styles.baixaErro} role="alert">
              {erros.geral}
            </p>
          ) : null}

          <div className={styles.dialogAcoes}>
            <Button variant="secondary" onClick={onCancelar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? (
                <>
                  <Spinner size={15} />
                  Salvando...
                </>
              ) : (
                'Lancar titulo'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
