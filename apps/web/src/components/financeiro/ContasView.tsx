'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  carregarContasAPagar,
  type ContaAPagar,
  baixarTitulo,
  estornarTitulo,
  exportar,
  listarContasReceber,
  ROTULO_SITUACAO,
  situacaoDoTitulo,
  TIPOS_RECEBIMENTO,
  type SituacaoVisual,
} from '@/lib/financeiro-api'
import type { ContaReceber, StatusTitulo } from '@/lib/types'
import { daysUntil, describeDueDate, formatDate, formatMoney, mesDeHoje } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui/UI'
import { Button } from '@/components/ui/Button'
import Toast from '@/components/ui/Toast'
import { IconFilter, IconPlus, IconUpload } from '@/components/Icons'
import { COMANDOS_PAGAR, COMANDOS_RECEBER } from '@/lib/comandos'
import ComandosWhatsApp from '@/components/app/ComandosWhatsApp'
import ConfirmarDialog from '@/components/app/ConfirmarDialog'
import BaixaDialog from './BaixaDialog'
import FormularioTitulo from './FormularioTitulo'
import styles from './financeiro.module.css'

/** Forma comum entre conta a pagar e a receber, para a lista trabalhar. */
/**
 * O status da api para o vocabulario da tela.
 *
 * Os dois modelos discordam num ponto que importa: o web trata `vencido` como
 * STATUS, e a api o calcula a partir da data — la e faixa, nao estado. Uma
 * conta vencida continua `open` no servidor.
 *
 * Entao `vencido` sai daqui pela DATA, e nao do campo. Mapear `open` para
 * `aberto` sempre faria a tela perder o destaque de atraso; inventar um status
 * `vencido` no servidor faria a mesma conta mudar de estado a meia-noite sem
 * ninguem tocar nela.
 */
function statusDaApi(status: string, vencimento: string): StatusTitulo {
  if (status === 'settled') return 'pago'
  if (status === 'partially_settled') return 'parcial'
  return daysUntil(vencimento) < 0 ? 'vencido' : 'aberto'
}

function paraLinhaDaApi(c: ContaAPagar): Linha {
  return {
    id: c.id,
    contraparte: c.supplier,
    descricao: c.description,
    vencimento: c.dueDate,
    /* Centavos para reais na borda: a tela inteira trabalha em reais. */
    valor: c.amountCents / 100,
    valorBaixado: c.settledAmountCents / 100,
    status: statusDaApi(c.status, c.dueDate),
    /* O banco da baixa nao vem no titulo — ele mora em `payable_settlements`,
       uma linha por baixa, e o titulo pode ter varias. Vazio e honesto. */
    banco: '',
    /* A classificacao agora e id de conta (NR-077), e esta lista mostra NOME.
       Buscar o nome exige o plano carregado; a tela de contas ainda nao o
       carrega, entao mostra vazio em vez de mostrar um uuid. */
    classificacao: '',
  }
}

type Linha = {
  id: string
  contraparte: string
  descricao: string
  vencimento: string
  valor: number
  valorBaixado: number
  status: StatusTitulo
  banco: string
  /** Plano de conta (pagar) ou tipo de recebimento (receber). */
  classificacao: string
}

const TOM_SITUACAO: Record<SituacaoVisual, 'neutral' | 'warning' | 'danger' | 'success' | 'info'> =
  {
    aberto: 'neutral',
    aVencer: 'warning',
    vencido: 'danger',
    quitado: 'success',
    parcial: 'info',
  }

type FiltroStatus = 'todos' | 'aberto' | 'vencido' | 'quitado'

export default function ContasView({ tipo }: { tipo: 'pagar' | 'receber' }) {
  const pagar = tipo === 'pagar'

  /* Estado local: sem backend, a lista precisa refletir baixa e estorno
     para a tela ser navegavel de verdade. */
  /*
   * CONTAS A PAGAR vem da api (NR-074). CONTAS A RECEBER continua no mock: a
   * tabela `receivables` existe desde a 0003, mas nao ha caso de uso de listar
   * em `core` nem rota na api — e uma tela alimentada por dado inventado ao
   * lado de uma tela real seria pior que duas telas mock, porque ninguem
   * saberia qual e qual.
   *
   * Isso esta dito no PR. A metade que falta e uma tarefa: listar recebiveis.
   */
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    pagar ? [] : listarContasReceber().map(paraLinhaReceber),
  )
  const [carregando, setCarregando] = useState(pagar)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  /*
   * Fora do efeito porque o botao de "tentar de novo" chama o MESMO caminho.
   * Erro de rede que so oferece recarregar a pagina inteira faz o lojista
   * perder os filtros que acabou de montar.
   */
  const carregar = useCallback(async () => {
    const r = await carregarContasAPagar()
    setCarregando(false)

    if (!r.ok) {
      setErroCarga(r.erro)
      return
    }

    /* O servidor ja agrupa e ja soma. A tela achata para a lista que ela
       desenha, mas NAO recalcula total: somar aqui daria um numero que pode
       divergir do relatorio, e "quanto preciso ter em caixa" nao pode ter
       duas respostas. */
    setLinhas(r.dados.grupos.flatMap((g) => g.payables.map(paraLinhaDaApi)))
  }, [])

  useEffect(() => {
    if (!pagar) return

    /* O `async` explicito e para o lint, e o que ele diz e verdade: todo
       `setState` de `carregar` vem DEPOIS do await, nunca sincrono no corpo
       do efeito. Chamada nua, o compilador do React para no nome da funcao e
       supoe o pior. */
    void (async () => {
      await carregar()
    })()
  }, [pagar, carregar])

  /*
   * A primeira carga JA comeca com `carregando`; quem precisa religa-lo e a
   * retentativa. Por isso os dois `setState` moram aqui, num onClick, e nao
   * dentro de `carregar` — chamado pelo efeito, `setCarregando(true)` roda
   * sincrono na montagem e provoca um render em cascata (o lint reprova, e com
   * razao: e um render inteiro jogado fora em toda abertura da tela).
   */
  const tentarDeNovo = () => {
    setCarregando(true)
    setErroCarga(null)
    void carregar()
  }

  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos')
  const [filtroClassificacao, setFiltroClassificacao] = useState('')
  const [filtroContraparte, setFiltroContraparte] = useState('')
  const [ate, setAte] = useState('')

  const [lancando, setLancando] = useState(false)
  const [baixando, setBaixando] = useState<Linha | null>(null)
  const [estornando, setEstornando] = useState<Linha | null>(null)
  const [processando, setProcessando] = useState(false)
  const [erroDialogo, setErroDialogo] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)

  const classificacoes = useMemo(
    () => [...new Set(linhas.map((l) => l.classificacao))].filter(Boolean).sort(),
    [linhas],
  )
  const contrapartes = useMemo(
    () => [...new Set(linhas.map((l) => l.contraparte))].sort(),
    [linhas],
  )

  const filtradas = useMemo(() => {
    return linhas.filter((l) => {
      const saldo = l.valor - l.valorBaixado
      const dias = daysUntil(l.vencimento)
      const situacao = situacaoDoTitulo(l.status, l.vencimento, dias)

      if (filtroStatus === 'aberto' && (l.status === 'pago' || situacao === 'vencido')) return false
      if (filtroStatus === 'vencido' && situacao !== 'vencido') return false
      if (filtroStatus === 'quitado' && l.status !== 'pago') return false

      if (filtroClassificacao && l.classificacao !== filtroClassificacao) return false
      if (filtroContraparte && l.contraparte !== filtroContraparte) return false

      /* Filtro "ate" olha o vencimento, nao a emissao: quem pergunta
         "o que vence ate sexta" quer o que ainda deve. */
      if (ate && l.vencimento > ate) return false

      void saldo
      return true
    })
  }, [linhas, filtroStatus, filtroClassificacao, filtroContraparte, ate])

  /* --- Indicadores --- */
  const emAberto = linhas.filter((l) => l.status !== 'pago')
  const totalAberto = emAberto.reduce((acc, l) => acc + (l.valor - l.valorBaixado), 0)
  const vencidos = emAberto.filter((l) => daysUntil(l.vencimento) < 0)
  const totalVencido = vencidos.reduce((acc, l) => acc + (l.valor - l.valorBaixado), 0)
  /* `mesDeHoje()` e nao `'2026-08'`: o bloco "quitados no mes" mostrava agosto
     para sempre, e em setembro ele exibia o mes passado como se fosse este. */
  const quitadosMes = linhas.filter(
    (l) => l.status === 'pago' && l.vencimento.startsWith(mesDeHoje()),
  )
  const totalMes = quitadosMes.reduce((acc, l) => acc + l.valorBaixado, 0)

  /* ---------------------------------------------------------------- *
   * Baixa e estorno
   * ---------------------------------------------------------------- */

  async function confirmarBaixa(valorBaixa: number) {
    if (!baixando) return

    setProcessando(true)
    setErroDialogo(null)

    const saldo = baixando.valor - baixando.valorBaixado
    /* SUBSTITUIR POR: POST /financeiro/titulos/:id/baixas */
    const r = await baixarTitulo(baixando.id, valorBaixa, saldo)
    setProcessando(false)

    if (!r.ok) {
      setErroDialogo(r.error)
      return
    }

    setLinhas((atual) =>
      atual.map((l) =>
        l.id === baixando.id
          ? { ...l, valorBaixado: l.valorBaixado + r.valorBaixado, status: r.status }
          : l,
      ),
    )

    setBaixando(null)
    setToast({
      msg:
        r.status === 'pago'
          ? `Titulo quitado: ${formatMoney(r.valorBaixado)}.`
          : `Baixa parcial de ${formatMoney(r.valorBaixado)} registrada.`,
      tone: 'success',
    })
  }

  async function confirmarEstorno() {
    if (!estornando) return

    setProcessando(true)
    /* SUBSTITUIR POR: DELETE /financeiro/titulos/:id/baixas/:baixaId */
    const r = await estornarTitulo(estornando.id)
    setProcessando(false)

    if (!r.ok) {
      setToast({ msg: r.error, tone: 'error' })
      setEstornando(null)
      return
    }

    setLinhas((atual) =>
      atual.map((l) =>
        l.id === estornando.id
          ? {
              ...l,
              valorBaixado: 0,
              status: daysUntil(l.vencimento) < 0 ? 'vencido' : 'aberto',
            }
          : l,
      ),
    )

    setEstornando(null)
    setToast({ msg: 'Baixa estornada. O titulo voltou para em aberto.', tone: 'success' })
  }

  async function exportarLista(formato: 'csv' | 'pdf') {
    const r = await exportar(formato)
    setToast({ msg: r.error, tone: 'error' })
  }

  const limparFiltros = () => {
    setFiltroStatus('todos')
    setFiltroClassificacao('')
    setFiltroContraparte('')
    setAte('')
  }

  const rotuloContraparte = pagar ? 'Fornecedor' : 'Cliente'
  const rotuloClassificacao = pagar ? 'Plano de conta' : 'Tipo'

  return (
    <>
      <PageHeader
        title={pagar ? 'Contas a pagar' : 'Contas a receber'}
        subtitle={pagar ? 'Titulos, vencimentos e baixas' : 'Recebiveis, cobranca e baixas'}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportarLista('csv')}>
              <IconUpload size={16} />
              Exportar
            </Button>
            <Button onClick={() => setLancando(true)}>
              <IconPlus size={17} />
              Novo lancamento
            </Button>
          </>
        }
      />

      <div className="statRow">
        <Stat
          label={pagar ? 'Total a pagar' : 'Total a receber'}
          value={formatMoney(totalAberto)}
          hint={`${emAberto.length} titulo(s)`}
        />
        <Stat
          label="Vencido"
          value={formatMoney(totalVencido)}
          hint={vencidos.length ? `${vencidos.length} em atraso` : 'nada em atraso'}
          tone={totalVencido > 0 ? 'warning' : 'positive'}
        />
        <Stat
          label={pagar ? 'Pago no mes' : 'Recebido no mes'}
          value={formatMoney(totalMes)}
          hint={`${quitadosMes.length} titulo(s)`}
          tone="positive"
        />
      </div>

      <Card>
        {/* --- Filtros --- */}
        <div className={styles.filtrosLinha} role="group" aria-label="Filtro de situacao">
          {(
            [
              ['todos', 'Todos'],
              ['aberto', 'Em aberto'],
              ['vencido', 'Vencidos'],
              ['quitado', pagar ? 'Pagos' : 'Recebidos'],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              className={`${styles.filtro} ${filtroStatus === valor ? styles.filtroAtivo : ''}`}
              onClick={() => setFiltroStatus(valor)}
              aria-pressed={filtroStatus === valor}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div className={styles.filtrosCampos}>
          <label className={styles.filtroCampo}>
            <span>{rotuloClassificacao}</span>
            <select
              className={styles.filtroSelect}
              value={filtroClassificacao}
              onChange={(e) => setFiltroClassificacao(e.target.value)}
            >
              <option value="">Todos</option>
              {classificacoes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filtroCampo}>
            <span>{rotuloContraparte}</span>
            <select
              className={styles.filtroSelect}
              value={filtroContraparte}
              onChange={(e) => setFiltroContraparte(e.target.value)}
            >
              <option value="">Todos</option>
              {contrapartes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filtroCampo}>
            <span>Vence ate</span>
            <input
              type="date"
              className={styles.filtroSelect}
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </label>

          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            <IconFilter size={14} />
            Limpar
          </Button>
        </div>

        {/* --- Lista --- */}
        {carregando ? (
          <EmptyState title="Carregando contas" description="Buscando os titulos em aberto." />
        ) : erroCarga !== null ? (
          <EmptyState
            title="Nao deu para carregar as contas"
            description={erroCarga}
            action={
              <Button variant="secondary" onClick={tentarDeNovo}>
                Tentar de novo
              </Button>
            }
          />
        ) : filtradas.length === 0 ? (
          <EmptyState
            title={
              linhas.length === 0
                ? pagar
                  ? 'Nenhuma conta a pagar'
                  : 'Nenhuma conta a receber'
                : 'Nenhum titulo encontrado'
            }
            description={
              linhas.length === 0
                ? 'Lance o primeiro titulo para acompanhar vencimentos e baixas.'
                : 'Nenhum resultado para estes filtros.'
            }
            action={
              linhas.length === 0 ? (
                <Button onClick={() => setLancando(true)}>
                  <IconPlus size={17} />
                  Novo lancamento
                </Button>
              ) : (
                <Button variant="secondary" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              )
            }
          />
        ) : (
          <ul className={styles.titulos}>
            {filtradas.map((l) => {
              const saldo = l.valor - l.valorBaixado
              const dias = daysUntil(l.vencimento)
              const situacao = situacaoDoTitulo(l.status, l.vencimento, dias)
              const quitado = l.status === 'pago'

              return (
                <li key={l.id} className={styles.titulo}>
                  <div className={styles.tituloPrincipal}>
                    <strong>{l.contraparte}</strong>
                    <span>
                      {l.descricao} · {l.classificacao || '—'}
                    </span>
                  </div>

                  <div className={styles.tituloVencimento}>
                    <span className={styles.tituloData}>{formatDate(l.vencimento)}</span>
                    <span className={styles.tituloPrazo}>
                      {quitado ? 'baixado' : describeDueDate(l.vencimento)}
                    </span>
                  </div>

                  <div className={styles.tituloSituacao}>
                    <Badge tone={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO[situacao]}</Badge>
                  </div>

                  <div className={styles.tituloValores}>
                    <strong>{formatMoney(saldo > 0 ? saldo : l.valor)}</strong>
                    {l.valorBaixado > 0 && !quitado ? <span>de {formatMoney(l.valor)}</span> : null}
                  </div>

                  <div className={styles.tituloAcoes}>
                    {quitado || l.valorBaixado > 0 ? (
                      <Button variant="secondary" size="sm" onClick={() => setEstornando(l)}>
                        Estornar
                      </Button>
                    ) : null}
                    {!quitado ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setErroDialogo(null)
                          setBaixando(l)
                        }}
                      >
                        Baixar
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div className={styles.comandosWrap}>
        <ComandosWhatsApp comandos={pagar ? COMANDOS_PAGAR : COMANDOS_RECEBER} />
      </div>

      {/* --- Dialogos --- */}
      {lancando ? (
        <FormularioTitulo
          tipo={tipo}
          onSalvo={(msg) => {
            setLancando(false)
            setToast({ msg, tone: 'success' })
          }}
          onCancelar={() => setLancando(false)}
        />
      ) : null}

      {baixando ? (
        <BaixaDialog
          titulo={baixando.contraparte}
          descricao={`${baixando.descricao} · vence ${formatDate(baixando.vencimento)}`}
          saldo={baixando.valor - baixando.valorBaixado}
          verbo={tipo}
          processando={processando}
          erro={erroDialogo}
          onConfirmar={confirmarBaixa}
          onCancelar={() => {
            setBaixando(null)
            setErroDialogo(null)
          }}
        />
      ) : null}

      {estornando ? (
        <ConfirmarDialog
          titulo="Estornar baixa"
          descricao="A baixa sera desfeita e o titulo volta para em aberto. O historico guarda o estorno — nada e apagado."
          tom="perigo"
          rotuloConfirmar="Estornar"
          processando={processando}
          detalhe={
            <div className={styles.estornoDetalhe}>
              <strong>{estornando.contraparte}</strong>
              <span>{estornando.descricao}</span>
              <span className={styles.estornoValor}>
                {formatMoney(estornando.valorBaixado || estornando.valor)}
              </span>
            </div>
          }
          onConfirmar={confirmarEstorno}
          onCancelar={() => setEstornando(null)}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */

function paraLinhaReceber(c: ContaReceber): Linha {
  const tipoRotulo = TIPOS_RECEBIMENTO.find((t) => t.valor === c.tipo)?.rotulo ?? c.tipo

  return {
    id: c.id,
    contraparte: c.clienteNome,
    descricao: c.referente,
    vencimento: c.vencimento,
    valor: c.valor,
    valorBaixado: c.valorRecebido,
    status: c.status,
    banco: c.bancoNome,
    classificacao: tipoRotulo,
  }
}
