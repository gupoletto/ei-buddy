import { IconBarcode, IconCalendar, IconReceipt, IconSparkles, IconTrendUp } from './Icons'
import styles from './FeatureVisuals.module.css'

/* --------------------------------------------------------------------------
   Pilar 1 — Vendas: carrinho de balcao com leitor de codigo de barras
   -------------------------------------------------------------------------- */

const cartItems = [
  { name: 'Café torrado 500g', qty: '2 un', value: 'R$ 43,80' },
  { name: 'Filtro de papel n103', qty: '1 un', value: 'R$ 8,90' },
  { name: 'Açúcar mascavo 1kg', qty: '3 un', value: 'R$ 38,70' },
]

export function SalesVisual() {
  return (
    <div className={styles.card}>
      <div className={styles.scanBar}>
        <IconBarcode size={20} />
        <span className={styles.scanText}>Bipe ou busque um produto</span>
        <span className={styles.scanPulse} aria-hidden="true" />
      </div>

      <ul className={styles.cart}>
        {cartItems.map((item) => (
          <li key={item.name} className={styles.cartRow}>
            <span className={styles.cartName}>
              <strong>{item.name}</strong>
              <span>{item.qty}</span>
            </span>
            <span className={styles.cartValue}>{item.value}</span>
          </li>
        ))}
      </ul>

      <div className={styles.totalBox}>
        <div className={styles.totalLine}>
          <span>Subtotal</span>
          <span>R$ 91,40</span>
        </div>
        <div className={styles.totalLine}>
          <span>Desconto</span>
          <span className={styles.negative}>- R$ 4,50</span>
        </div>
        <div className={`${styles.totalLine} ${styles.totalMain}`}>
          <span>Total</span>
          <strong>R$ 86,90</strong>
        </div>
      </div>

      <div className={styles.payRow}>
        <span className={`${styles.payChip} ${styles.payActive}`}>Pix</span>
        <span className={styles.payChip}>Débito</span>
        <span className={styles.payChip}>Crédito</span>
        <span className={styles.payChip}>Dinheiro</span>
        <span className={styles.payChip}>Carteira</span>
      </div>

      <div className={styles.fiscalNote}>
        <IconReceipt size={16} />
        NFC-e emitida junto com o fechamento
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Pilar 2 — Financeiro: previsao de caixa e titulos do dia
   -------------------------------------------------------------------------- */

const bills = [
  { name: 'Fornecedor Aurora', due: 'Vence hoje', value: 'R$ 1.240,00', state: 'due' },
  { name: 'Aluguel do ponto', due: 'Vence em 3 dias', value: 'R$ 3.800,00', state: 'soon' },
  { name: 'Energia elétrica', due: 'Vence em 8 dias', value: 'R$ 742,30', state: 'ok' },
]

export function FinanceVisual() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <span className={styles.cardLabel}>Caixa previsto · 30 dias</span>
          <strong className={styles.cardValue}>R$ 46.980</strong>
        </div>
        <span className={styles.trendChip}>
          <IconTrendUp size={14} /> 9,4%
        </span>
      </div>

      <svg
        className={styles.areaChart}
        viewBox="0 0 320 120"
        preserveAspectRatio="none"
        role="img"
        aria-label="Evolução do caixa previsto"
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--brand-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 88 L45 72 L90 80 L135 54 L180 60 L225 34 L270 40 L320 18 L320 120 L0 120 Z"
          fill="url(#areaFill)"
        />
        <path
          d="M0 88 L45 72 L90 80 L135 54 L180 60 L225 34 L270 40 L320 18"
          fill="none"
          stroke="var(--brand-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <ul className={styles.bills}>
        {bills.map((bill) => (
          <li key={bill.name} className={styles.billRow}>
            <span
              className={`${styles.billDot} ${
                bill.state === 'due'
                  ? styles.dotDue
                  : bill.state === 'soon'
                    ? styles.dotSoon
                    : styles.dotOk
              }`}
            />
            <span className={styles.billName}>
              <strong>{bill.name}</strong>
              <span>{bill.due}</span>
            </span>
            <span className={styles.billValue}>{bill.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Pilar 3 — Assistente: pergunta em texto, resposta pronta
   -------------------------------------------------------------------------- */

export function AssistantVisual() {
  return (
    <div className={styles.card}>
      <div className={styles.chatHead}>
        <span className={styles.chatAvatar}>
          <IconSparkles size={17} />
        </span>
        <span className={styles.chatTitle}>
          <strong>Assistente</strong>
          <span>responde em segundos</span>
        </span>
      </div>

      <div className={styles.chat}>
        <p className={`${styles.bubble} ${styles.bubbleUser}`}>
          quais produtos precisam de reposição?
        </p>

        <div className={`${styles.bubble} ${styles.bubbleBot}`}>
          <p>3 itens abaixo do mínimo:</p>
          <ul className={styles.answerList}>
            <li>
              <span>Café torrado 500g</span>
              <strong>4 un</strong>
            </li>
            <li>
              <span>Leite integral 1L</span>
              <strong>6 un</strong>
            </li>
            <li>
              <span>Açúcar mascavo 1kg</span>
              <strong>2 un</strong>
            </li>
          </ul>
        </div>

        <p className={`${styles.bubble} ${styles.bubbleUser}`}>
          gera o pedido de compra do primeiro
        </p>

        <div className={`${styles.bubble} ${styles.bubbleBot}`}>
          <p className={styles.confirm}>
            Pedido de 24 un para Fornecedor Aurora. Confirma o envio?
          </p>
          <div className={styles.confirmActions}>
            <span className={styles.confirmYes}>Confirmar</span>
            <span className={styles.confirmNo}>Ajustar</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Pilar 4 — Clientes e CRM: pendencias em quadro e o proximo compromisso
   -------------------------------------------------------------------------- */

const board = [
  {
    column: 'A fazer',
    cards: [
      { title: 'Cobrar Restaurante Boa Mesa', meta: 'R$ 78,40 em aberto' },
      { title: 'Retornar contato', meta: 'Padaria Sol LTDA' },
    ],
  },
  {
    column: 'Em andamento',
    cards: [{ title: 'Orçamento de reposição', meta: 'Joana Ribeiro' }],
  },
  {
    column: 'Concluído',
    cards: [{ title: 'Entrega confirmada', meta: 'Marcos Dias' }],
  },
]

export function CrmVisual() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardLabel}>Pendências por cliente</span>
      </div>

      <div className={styles.board}>
        {board.map((col) => (
          <div key={col.column} className={styles.boardColumn}>
            <span className={styles.boardTitle}>{col.column}</span>
            {col.cards.map((item) => (
              <div key={item.title} className={styles.boardCard}>
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.fiscalNote}>
        <IconCalendar size={16} />
        Lembrete disparado antes da hora do compromisso
      </div>
    </div>
  )
}
