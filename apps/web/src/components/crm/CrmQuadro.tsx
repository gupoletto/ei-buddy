'use client'

import { useEffect, useMemo, useState } from 'react'
import { listarClientes } from '@/lib/clientes-api'
import {
  COLUNAS,
  criarCard,
  listarCards,
  moverCard,
  RESPONSAVEIS,
  ROTULO_ORIGEM,
  type CardCrm,
  type ColunaId,
} from '@/lib/crm-api'
import { daysUntil, formatDate, hoje } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui/UI'
import { Button } from '@/components/ui/Button'
import Toast from '@/components/ui/Toast'
import { Spinner } from '@/components/auth/Fields'
import { IconCalendar, IconList, IconPlus, IconUsers } from '@/components/Icons'
import CampoTag from '@/components/app/CampoTag'
import CardDetalhe from './CardDetalhe'
import styles from './crm.module.css'

type Visao = 'quadro' | 'lista'

export default function CrmQuadro() {
  const [cards, setCards] = useState<CardCrm[]>(() => listarCards())
  const [visao, setVisao] = useState<Visao>('quadro')

  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [periodo, setPeriodo] = useState(0)

  const [aberto, setAberto] = useState<CardCrm | null>(null)
  const [criando, setCriando] = useState(false)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [colunaAlvo, setColunaAlvo] = useState<ColunaId | null>(null)
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)

  const nomesClientes = useMemo(() => [...new Set(cards.map((c) => c.clienteNome))].sort(), [cards])

  const filtrados = useMemo(() => {
    return cards.filter((c) => {
      if (filtroCliente && c.clienteNome !== filtroCliente) return false
      if (filtroTipo && c.tipo !== filtroTipo) return false
      if (periodo > 0 && Math.abs(daysUntil(c.data)) > periodo) return false
      return true
    })
  }, [cards, filtroCliente, filtroTipo, periodo])

  const porColuna = (coluna: ColunaId) => filtrados.filter((c) => c.coluna === coluna)

  /* ---------------------------------------------------------------- *
   * Mover card
   * ---------------------------------------------------------------- */

  async function mover(id: string, coluna: ColunaId) {
    const card = cards.find((c) => c.id === id)
    if (!card || card.coluna === coluna) return

    /* Move na tela antes da resposta: arrastar precisa parecer imediato.
       Se a chamada falhar, desfazemos. */
    setCards((atual) => atual.map((c) => (c.id === id ? { ...c, coluna } : c)))

    /* SUBSTITUIR POR: PATCH /crm/cards/:id */
    const r = await moverCard(id, coluna)

    if (!r.ok) {
      setCards((atual) => atual.map((c) => (c.id === id ? { ...c, coluna: card.coluna } : c)))
      setToast({ msg: 'Não foi possível mover o card.', tone: 'error' })
    }
  }

  const contagem = {
    afazer: cards.filter((c) => c.coluna === 'afazer').length,
    andamento: cards.filter((c) => c.coluna === 'andamento').length,
    concluido: cards.filter((c) => c.coluna === 'concluido').length,
  }

  return (
    <>
      <PageHeader
        title="CRM"
        subtitle="Pendências e contatos, vindos dos clientes ou lançados aqui"
        actions={
          <Button onClick={() => setCriando(true)}>
            <IconPlus size={17} />
            Nova pendência
          </Button>
        }
      />

      <div className="statRow">
        <Stat
          label="A fazer"
          value={String(contagem.afazer)}
          tone={contagem.afazer ? 'warning' : 'neutral'}
        />
        <Stat label="Em andamento" value={String(contagem.andamento)} />
        <Stat label="Concluídos" value={String(contagem.concluido)} tone="positive" />
      </div>

      <Card>
        {/* --- Filtros e alternador de visao --- */}
        <div className={styles.barra}>
          <div className={styles.filtros}>
            <select
              className={styles.select}
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              aria-label="Filtrar por cliente"
            >
              <option value="">Todos os clientes</option>
              {nomesClientes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              aria-label="Filtrar por tipo"
            >
              <option value="">Pendências e contatos</option>
              <option value="pendencia">Só pendências</option>
              <option value="contato">So contatos</option>
            </select>

            <select
              className={styles.select}
              value={periodo}
              onChange={(e) => setPeriodo(Number(e.target.value))}
              aria-label="Filtrar por período"
            >
              <option value={0}>Qualquer data</option>
              <option value={7}>Últimos/próximos 7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
            </select>
          </div>

          {/* No mobile o quadro rola na horizontal; a lista e a alternativa */}
          <div className={styles.visoes} role="group" aria-label="Modo de visualização">
            <button
              type="button"
              className={`${styles.visao} ${visao === 'quadro' ? styles.visaoAtiva : ''}`}
              onClick={() => setVisao('quadro')}
              aria-pressed={visao === 'quadro'}
            >
              Quadro
            </button>
            <button
              type="button"
              className={`${styles.visao} ${visao === 'lista' ? styles.visaoAtiva : ''}`}
              onClick={() => setVisao('lista')}
              aria-pressed={visao === 'lista'}
            >
              <IconList size={14} />
              Lista
            </button>
          </div>
        </div>

        {filtrados.length === 0 ? (
          cards.length === 0 ? (
            <EmptyState
              title="Nada no CRM ainda"
              description="Pendências e contatos lançados na tela de Clientes aparecem aqui automaticamente. Você também pode lançar direto por esta tela."
              mascote
              action={
                <Button onClick={() => setCriando(true)}>
                  <IconPlus size={16} />
                  Lançar a primeira
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Nenhum card com estes filtros"
              description="Ajuste os filtros para ver outros cards."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFiltroCliente('')
                    setFiltroTipo('')
                    setPeriodo(0)
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          )
        ) : visao === 'quadro' ? (
          /* ============ Quadro Kanban ============ */
          <div className={styles.quadro}>
            {COLUNAS.map((coluna) => (
              <section
                key={coluna.id}
                className={`${styles.coluna} ${colunaAlvo === coluna.id ? styles.colunaAlvo : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setColunaAlvo(coluna.id)
                }}
                onDragLeave={() => setColunaAlvo(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setColunaAlvo(null)
                  if (arrastando) void mover(arrastando, coluna.id)
                  setArrastando(null)
                }}
              >
                <header className={styles.colunaCabecalho}>
                  <h2 className={styles.colunaTitulo}>{coluna.titulo}</h2>
                  <span className={styles.colunaContador}>{porColuna(coluna.id).length}</span>
                </header>

                <ul className={styles.cards}>
                  {porColuna(coluna.id).map((card) => (
                    <li key={card.id}>
                      <CardKanban
                        card={card}
                        onAbrir={() => setAberto(card)}
                        onMover={(destino) => void mover(card.id, destino)}
                        onArrastarInicio={() => setArrastando(card.id)}
                        onArrastarFim={() => {
                          setArrastando(null)
                          setColunaAlvo(null)
                        }}
                        arrastando={arrastando === card.id}
                      />
                    </li>
                  ))}

                  {porColuna(coluna.id).length === 0 ? (
                    <li className={styles.colunaVazia}>Nada aqui</li>
                  ) : null}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          /* ============ Lista ============ */
          <ul className={styles.lista}>
            {filtrados.map((card) => {
              const coluna = COLUNAS.find((c) => c.id === card.coluna)
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    className={styles.listaItem}
                    onClick={() => setAberto(card)}
                  >
                    <span className={styles.listaPrincipal}>
                      <strong>{card.titulo}</strong>
                      <span>
                        {card.clienteNome} · {formatDate(card.data)}
                      </span>
                    </span>
                    <Badge
                      tone={
                        card.coluna === 'concluido'
                          ? 'success'
                          : card.coluna === 'andamento'
                            ? 'info'
                            : 'warning'
                      }
                    >
                      {coluna?.titulo}
                    </Badge>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {aberto ? (
        <CardDetalhe
          card={aberto}
          onFechar={() => setAberto(null)}
          onAtualizar={(atualizado) => {
            setCards((atual) => atual.map((c) => (c.id === atualizado.id ? atualizado : c)))
            setAberto(atualizado)
          }}
        />
      ) : null}

      {criando ? (
        <FormCard
          onCriado={(novo) => {
            setCards((atual) => [novo, ...atual])
            setCriando(false)
            setToast({ msg: 'Card criado em A fazer.', tone: 'success' })
          }}
          onCancelar={() => setCriando(false)}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
    </>
  )
}

/* ================================================================== *
 * Card do quadro
 * ================================================================== */

function CardKanban({
  card,
  onAbrir,
  onMover,
  onArrastarInicio,
  onArrastarFim,
  arrastando,
}: {
  card: CardCrm
  onAbrir: () => void
  onMover: (destino: ColunaId) => void
  onArrastarInicio: () => void
  onArrastarFim: () => void
  arrastando: boolean
}) {
  const atrasado = card.coluna !== 'concluido' && daysUntil(card.data) < 0

  return (
    <div
      className={`${styles.card} ${arrastando ? styles.cardArrastando : ''}`}
      draggable
      onDragStart={onArrastarInicio}
      onDragEnd={onArrastarFim}
    >
      <button type="button" className={styles.cardCorpo} onClick={onAbrir}>
        <span className={styles.cardTopo}>
          <Badge tone={card.tipo === 'pendencia' ? 'warning' : 'info'}>
            {card.tipo === 'pendencia' ? 'Pendência' : 'Contato'}
          </Badge>
          {atrasado ? <Badge tone="danger">Atrasado</Badge> : null}
        </span>

        <strong className={styles.cardTitulo}>{card.titulo}</strong>

        <span className={styles.cardCliente}>
          <IconUsers size={13} />
          {card.clienteNome}
        </span>

        <span className={styles.cardRodape}>
          <span className={styles.cardData}>
            <IconCalendar size={12} />
            {formatDate(card.data)}
          </span>
          {card.responsaveis.length > 0 ? (
            <span className={styles.cardResponsavel}>
              {card.responsaveis[0].split(' ')[0]}
              {card.responsaveis.length > 1 ? ` +${card.responsaveis.length - 1}` : ''}
            </span>
          ) : (
            <span className={styles.cardSemResponsavel}>sem responsável</span>
          )}
        </span>

        <span className={styles.cardOrigem}>{ROTULO_ORIGEM[card.origem]}</span>
      </button>

      {/* Arrastar nao funciona no toque nem no teclado — este seletor e o
          caminho acessivel para a mesma acao. */}
      <label className={styles.cardMover}>
        <span className={styles.cardMoverRotulo}>Mover para</span>
        <select
          className={styles.cardMoverSelect}
          value={card.coluna}
          onChange={(e) => onMover(e.target.value as ColunaId)}
          aria-label={`Mover ${card.titulo} para outra coluna`}
        >
          {COLUNAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.titulo}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/* ================================================================== *
 * Formulario de novo card
 * ================================================================== */

function FormCard({
  onCriado,
  onCancelar,
}: {
  onCriado: (card: CardCrm) => void
  onCancelar: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<'pendencia' | 'contato'>('pendencia')
  const [cliente, setCliente] = useState('')
  /* O campo de data do cartao novo abria em 24/08/2026 — a pessoa tinha de
     corrigir a data em todo cartao que criasse. */
  const [data, setData] = useState(hoje())
  const [responsavel, setResponsavel] = useState('')

  /*
   * Os nomes vem da api, e nao de `mock-data`.
   *
   * O campo e um autocompletar: comeca vazio e enche quando a lista chega. Um
   * valor provisorio com nomes inventados seria pior que campo vazio — a pessoa
   * escolheria "Maria Silva" achando que e cliente dela.
   */
  const [listaClientes, setListaClientes] = useState<string[]>([])
  const [listaResponsaveis, setListaResponsaveis] = useState(RESPONSAVEIS)

  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    /* `async` explicito: o `setState` vem depois do await, nunca sincrono no
       corpo do efeito. */
    void (async () => {
      const r = await listarClientes({})
      if (r.ok) setListaClientes(r.dados.clientes.map((c) => c.nome))
    })()
  }, [])

  async function salvar(event: React.FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    /* SUBSTITUIR POR: POST /crm/cards */
    const r = await criarCard({
      titulo,
      descricao,
      tipo,
      clienteNome: cliente,
      data,
      responsaveis: responsavel ? [responsavel] : [],
    })
    setSalvando(false)

    if (!r.ok) {
      setErro(r.error)
      return
    }

    onCriado({
      id: r.id,
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      tipo,
      coluna: 'afazer',
      /* Nulo quando o nome digitado nao casa com nenhum cliente: o campo
         aceita texto livre de proposito, para nao travar quem anota um contato
         antes de cadastrar a pessoa. */
      clienteId: null,
      clienteNome: cliente,
      data,
      responsaveis: responsavel ? [responsavel] : [],
      origem: 'crm',
      comentarios: [],
    })
  }

  return (
    <div className={styles.dialogRoot}>
      <button
        type="button"
        className={styles.dialogBackdrop}
        onClick={onCancelar}
        aria-label="Fechar"
      />

      <div
        className={styles.dialogPainel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-card"
      >
        <h2 id="novo-card" className={styles.dialogTitulo}>
          Nova pendência ou contato
        </h2>

        <form onSubmit={salvar} noValidate className={styles.formCampos}>
          <div className={styles.tipoToggle} role="group" aria-label="Tipo">
            <button
              type="button"
              className={`${styles.tipoBotao} ${tipo === 'pendencia' ? styles.tipoAtivo : ''}`}
              onClick={() => setTipo('pendencia')}
              aria-pressed={tipo === 'pendencia'}
            >
              Pendência
            </button>
            <button
              type="button"
              className={`${styles.tipoBotao} ${tipo === 'contato' ? styles.tipoAtivo : ''}`}
              onClick={() => setTipo('contato')}
              aria-pressed={tipo === 'contato'}
            >
              Contato
            </button>
          </div>

          <label className={styles.campo}>
            <span>Título</span>
            <input
              className={styles.input}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Cobrar pedido 8874"
              autoFocus
            />
          </label>

          <label className={styles.campo}>
            <span>Descrição</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que precisa ser feito"
              rows={3}
            />
          </label>

          <label className={styles.campo}>
            <span>Cliente</span>
            <CampoTag
              valor={cliente}
              opcoes={listaClientes}
              onChange={setCliente}
              onCriar={(novo) => setListaClientes((c) => [...c, novo])}
              ariaLabel="Cliente"
            />
          </label>

          <div className={styles.formLinha}>
            <label className={styles.campo}>
              <span>Data</span>
              <input
                type="date"
                className={styles.input}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </label>

            <label className={styles.campo}>
              <span>Responsável</span>
              <CampoTag
                valor={responsavel}
                opcoes={listaResponsaveis}
                onChange={setResponsavel}
                onCriar={(novo) => setListaResponsaveis((r) => [...r, novo])}
                ariaLabel="Responsável"
              />
            </label>
          </div>

          {erro ? (
            <p className={styles.erro} role="alert">
              {erro}
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
                  Criando...
                </>
              ) : (
                'Criar card'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
