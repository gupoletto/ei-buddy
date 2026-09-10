'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { BRAND } from '@/content/site'
import { Button } from '@/components/ui/Button'
import { IconArrowRight, IconClose } from '@/components/Icons'
import {
  assinarTutorialAtivo,
  encerrarTutorial,
  iniciarTutorial,
  lerTutorialAtivo,
  lerTutorialAtivoNoServidor,
  tutorialJaVisto,
} from '@/lib/tutorial'
import styles from './Tutorial.module.css'

type Passo = {
  /** Valor de `data-tutorial` do elemento a destacar. `null` = cartao central. */
  alvo: string | null
  titulo: string
  texto: string
}

const PASSOS: Passo[] = [
  {
    alvo: null,
    titulo: `Bem-vindo ao ${BRAND}!`,
    texto: 'Vamos conhecer o painel em menos de 2 minutos. Você pode pular quando quiser.',
  },
  {
    alvo: 'dashboard-stats',
    titulo: 'O resumo do seu dia',
    texto:
      'Faturamento, ticket médio, o que falta receber e o que falta pagar — sempre atualizado.',
  },
  {
    alvo: 'dashboard-nova-venda',
    titulo: 'Toda venda começa aqui',
    texto: 'Leitor de código de barras, carrinho e pagamento em poucos toques.',
  },
  {
    alvo: '/app/vendas',
    titulo: 'Vendas',
    texto: 'O histórico de tudo que você já vendeu, com filtro por cliente e período.',
  },
  {
    alvo: '/app/clientes',
    titulo: 'Clientes',
    texto: 'Cadastro, histórico de compras e pendências de cada cliente.',
  },
  {
    alvo: '/app/produtos',
    titulo: 'Produtos',
    texto: 'Seu catálogo completo, com controle de estoque e alerta de reposição.',
  },
  {
    alvo: '/app/financeiro',
    titulo: 'Financeiro',
    texto: 'Contas a pagar e receber, conciliação bancária, DRE e plano de contas.',
  },
  {
    alvo: '/app/crm',
    titulo: 'CRM',
    texto: 'Pendências e contatos num quadro, para não esquecer ninguém.',
  },
  {
    alvo: '/app/agenda',
    titulo: 'Agenda',
    texto: 'Compromissos e vencimentos, organizados por dia.',
  },
  {
    alvo: '/app/assistente-ia',
    titulo: 'Assistente IA',
    texto: 'Pergunte em português — as mesmas perguntas funcionam pelo WhatsApp.',
  },
  {
    alvo: 'tema-som',
    titulo: 'Do seu jeito',
    texto: 'Prefere o tema claro? Quer desligar o som? É por aqui.',
  },
  {
    alvo: 'notificacoes',
    titulo: 'Avisos importantes',
    texto: 'Contas vencendo, respostas do suporte e outros avisos aparecem aqui.',
  },
  {
    alvo: 'ajuda',
    titulo: 'Pronto!',
    texto: 'Você já sabe o essencial. Pode rever este tutorial quando quiser clicando neste ícone.',
  },
]

/** Alvos que moram DENTRO da barra lateral — so estes precisam dela aberta. */
const ALVOS_DE_NAV = new Set(
  PASSOS.map((p) => p.alvo).filter(
    (alvo): alvo is string => alvo !== null && alvo.startsWith('/app'),
  ),
)

const LARGURA_CARTAO = 300
const MARGEM = 16
const PADDING_FOCO = 8

type Posicao = { top: number; left: number; lado: 'direita' | 'baixo' | 'cima' | 'centro' }

function calcularPosicao(rect: DOMRect | null): Posicao {
  if (!rect || typeof window === 'undefined') {
    return { top: 0, left: 0, lado: 'centro' }
  }

  const espacoDireita = window.innerWidth - rect.right
  if (espacoDireita > LARGURA_CARTAO + MARGEM * 2) {
    return {
      top: Math.min(Math.max(rect.top, MARGEM), window.innerHeight - 200),
      left: rect.right + MARGEM,
      lado: 'direita',
    }
  }

  const left = Math.min(Math.max(rect.left, MARGEM), window.innerWidth - LARGURA_CARTAO - MARGEM)
  const espacoBaixo = window.innerHeight - rect.bottom
  if (espacoBaixo > 210 || espacoBaixo >= rect.top) {
    return { top: rect.bottom + MARGEM, left, lado: 'baixo' }
  }
  return { top: Math.max(rect.top - 200, MARGEM), left, lado: 'cima' }
}

/**
 * O motor do tutorial — spotlight sobre um elemento real da tela, com um
 * cartao explicando o que ele faz.
 *
 * Recebe `abrirNav`/`fecharNav` do `AppShell`: no mobile a barra lateral fica
 * fora da tela ate o usuario abrir, e os passos que apontam para ela nao
 * teriam o que destacar sem isso.
 */
export default function Tutorial({
  navAberto,
  abrirNav,
  fecharNav,
}: {
  navAberto: boolean
  abrirNav: () => void
  fecharNav: () => void
}) {
  const pathname = usePathname()
  const ativo = useSyncExternalStore(
    assinarTutorialAtivo,
    lerTutorialAtivo,
    lerTutorialAtivoNoServidor,
  )
  const [passoAtual, setPassoAtual] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  /* Inicio automatico: so na tela principal, so na primeira vez. */
  useEffect(() => {
    if (pathname !== '/app' || tutorialJaVisto()) return
    const espera = setTimeout(() => iniciarTutorial(), 700)
    return () => clearTimeout(espera)
  }, [pathname])

  /* Zera o passo quando o tutorial LIGA — ajustado durante o render, e nao
     num efeito, seguindo o mesmo padrao de `rotaAnterior` no AppShell: e o
     jeito que o compilador do React recomenda para "resetar um estado quando
     outro estado muda", sem o passo extra de render que um efeito causaria. */
  const [ativoAnterior, setAtivoAnterior] = useState(ativo)
  if (ativoAnterior !== ativo) {
    setAtivoAnterior(ativo)
    if (ativo) setPassoAtual(0)
  }

  /* Mede o alvo do passo atual — e refaz a medida em resize/scroll, porque a
     posicao de um item da barra lateral muda com o tamanho da janela.
     Tambem decide se a nav do PAI (mobile, fora da tela por padrao) precisa
     estar aberta: SO nos passos que apontam para dentro dela — abri-la no
     passo de boas-vindas (sem alvo) cobriria o cartao a toa. */
  useEffect(() => {
    if (!ativo) return
    const passo = PASSOS[passoAtual]
    const precisaNav = passo.alvo !== null && ALVOS_DE_NAV.has(passo.alvo)

    if (precisaNav && !navAberto) {
      abrirNav()
      return /* o proximo render, com navAberto=true, roda este efeito de novo */
    }
    if (!precisaNav && navAberto) {
      fecharNav()
    }

    function medir() {
      if (!passo.alvo) {
        setRect(null)
        return
      }
      const el = document.querySelector<HTMLElement>(`[data-tutorial="${passo.alvo}"]`)
      if (!el) {
        /* Elemento nao existe nesta tela/viewport (ex.: item raro sumiu do
           DOM) — pula para o proximo em vez de mostrar um spotlight vazio. */
        setPassoAtual((p) => Math.min(p + 1, PASSOS.length - 1))
        return
      }
      el.scrollIntoView({ block: 'nearest' })
      setRect(el.getBoundingClientRect())
    }

    /* A barra lateral desliza (transicao CSS): medir na hora pegaria o rect
       no meio do movimento. So espera quando acabou de abrir. */
    const atraso = precisaNav ? 320 : 0
    const espera = setTimeout(medir, atraso)
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      clearTimeout(espera)
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, passoAtual, navAberto])

  if (!ativo) return null

  const passo = PASSOS[passoAtual]
  const ultimo = passoAtual === PASSOS.length - 1
  const pos = calcularPosicao(rect)

  function avancar() {
    if (ultimo) {
      fecharNav()
      encerrarTutorial()
      return
    }
    setPassoAtual((p) => p + 1)
  }

  function pular() {
    fecharNav()
    encerrarTutorial()
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Tutorial guiado">
      {rect ? (
        <div
          className={styles.foco}
          style={{
            top: rect.top - PADDING_FOCO,
            left: rect.left - PADDING_FOCO,
            width: rect.width + PADDING_FOCO * 2,
            height: rect.height + PADDING_FOCO * 2,
          }}
        />
      ) : (
        <div className={styles.pano} />
      )}

      <div
        className={`${styles.cartao} ${styles[`lado_${pos.lado}`]}`}
        style={
          pos.lado === 'centro'
            ? undefined
            : { top: pos.top, left: pos.left, width: LARGURA_CARTAO }
        }
      >
        <button type="button" className={styles.fechar} onClick={pular} aria-label="Pular tutorial">
          <IconClose size={16} />
        </button>

        <span className={styles.progresso}>
          {passoAtual + 1} de {PASSOS.length}
        </span>
        <strong className={styles.titulo}>{passo.titulo}</strong>
        <p className={styles.texto}>{passo.texto}</p>

        <div className={styles.acoes}>
          <Button variant="ghost" size="sm" onClick={pular}>
            Pular
          </Button>
          <Button size="sm" onClick={avancar}>
            {ultimo ? 'Concluir' : 'Próximo'}
            {ultimo ? null : <IconArrowRight size={15} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
