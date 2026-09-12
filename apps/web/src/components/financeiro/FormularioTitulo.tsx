'use client'

import { useEffect, useRef, useState } from 'react'
import { criarConta, carregarPlano, type ContaContabil } from '@/lib/contabilidade-api'
import {
  lancarContaAPagar,
  NOMES_BANCOS,
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
 *
 * So o lado PAGAR fala com a api de verdade (`POST /contas-a-pagar` existe
 * desde a NR-074). O lado RECEBER continua em `salvarTitulo`, mock: lancar
 * recebivel avulso (RF-065) nao tem porta, caso de uso nem rota ainda — so o
 * contrato existe. Ver `createReceivableInputSchema` em `packages/contracts`.
 */
export default function FormularioTitulo({
  tipo,
  contrapartesConhecidas,
  onSalvo,
  onCancelar,
}: {
  tipo: 'pagar' | 'receber'
  /** Nomes de quem ja apareceu na lista — sugestao real, e nao inventada. */
  contrapartesConhecidas: string[]
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
  const [contrapartes, setContrapartes] = useState(contrapartesConhecidas)

  /*
   * O plano de conta do lado PAGAR e o plano de contas DE VERDADE
   * (`GET /contas-contabeis`) — nao a lista de exemplo. `CampoTag` so
   * conhece nome (string); resolver para `accountId` acontece no envio
   * (`contaPeloNome`), e nao aqui: criar a conta so quando o formulario for
   * de fato enviado evita sobrar uma conta vazia se a pessoa desistir no
   * meio do preenchimento.
   */
  const [contas, setContas] = useState<ContaContabil[]>([])
  /* Nomes digitados nesta sessao que ainda nao existem de verdade — so para
     a sugestao reaparecer se a pessoa abrir o campo de novo. A conta em si
     so nasce no envio (`contaPeloNome`), e por isso este array nunca entra
     na busca por id. */
  const [planosNovos, setPlanosNovos] = useState<string[]>([])

  useEffect(() => {
    if (tipo !== 'pagar') return
    void (async () => {
      const r = await carregarPlano()
      if (r.ok) setContas(r.dados.accounts.filter((c) => c.type === 'cost' || c.type === 'expense'))
    })()
  }, [tipo])

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

  /**
   * O id da conta pelo NOME digitado — criando de verdade se o nome nao
   * bate com nenhuma conta existente.
   *
   * `CampoTag` so devolve string porque e o mesmo campo usado para banco,
   * fornecedor e categoria — nenhum deles tem id. Plano de conta tem, e esta
   * e a unica peca do formulario que precisa de ponte entre nome e id.
   */
  async function contaPeloNome(nome: string): Promise<{ ok: true; id: string } | { ok: false }> {
    const existente = contas.find((c) => c.name.toLowerCase() === nome.trim().toLowerCase())
    if (existente) return { ok: true, id: existente.id }

    const criada = await criarConta({ name: nome.trim(), type: 'expense' })
    return criada.ok ? { ok: true, id: criada.dados.id } : { ok: false }
  }

  async function salvar(event: React.FormEvent) {
    event.preventDefault()

    const novos: Record<string, string> = {}
    if (tipo === 'receber' && !banco) novos.banco = 'Escolha o banco.'
    if (!contraparte) novos.contraparte = `Escolha o ${rotuloContraparte.toLowerCase()}.`
    if (tipo === 'pagar' && !plano) novos.plano = 'Escolha o plano de conta.'
    if (!vencimento) novos.vencimento = 'Informe a data de vencimento.'
    if (paraNumero(valor) <= 0) novos.valor = 'Informe um valor maior que zero.'
    if (!descricao.trim()) {
      novos.descricao = tipo === 'pagar' ? 'Descreva o que é.' : 'Informe a que se refere.'
    }

    setErros(novos)
    if (Object.keys(novos).length > 0) return

    setSalvando(true)

    if (tipo === 'pagar') {
      const conta = await contaPeloNome(plano)
      if (!conta.ok) {
        setSalvando(false)
        setErros({ geral: 'Não foi possível gravar o plano de conta. Tente de novo.' })
        return
      }

      const r = await lancarContaAPagar({
        supplier: contraparte.trim(),
        description: descricao.trim(),
        amountCents: Math.round(paraNumero(valor) * 100),
        dueDate: vencimento,
        accountId: conta.id,
      })
      setSalvando(false)

      if (!r.ok) {
        setErros({ geral: r.erro })
        return
      }

      onSalvo('Conta a pagar lançada.')
      return
    }

    /* SUBSTITUIR POR: POST /financeiro/titulos — so o lado RECEBER. */
    const r = await salvarTitulo({
      banco,
      cliente: contraparte,
      emissao,
      vencimento,
      referente: descricao,
      tipo: tipoRecebimento,
      valor: paraNumero(valor),
    })
    setSalvando(false)

    if (!r.ok) {
      setErros({ geral: r.error })
      return
    }

    onSalvo('Conta a receber lancada.')
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
            {tipo === 'receber' ? (
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
            ) : null}

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
                opcoes={[...contas.map((c) => c.name), ...planosNovos]}
                onChange={setPlano}
                onCriar={(novo) => setPlanosNovos((p) => [...p, novo])}
                ariaLabel="Plano de conta"
                invalido={Boolean(erros.plano)}
              />
              {erroDe('plano')}
            </label>
          ) : null}

          <div className={styles.formLinha}>
            {tipo === 'receber' ? (
              <label className={styles.campo}>
                <span>Data de emissão</span>
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
                'Lançar título'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
