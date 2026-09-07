'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buscar,
  MINIMO_DA_BUSCA,
  type Resultado,
  ROTULO_DO_TIPO,
  type TipoDeResultado,
} from '@/lib/busca-api'
import { IconSearch } from '@/components/Icons'
import styles from './BuscaGlobal.module.css'

/**
 * A busca do topo — NR-013.
 *
 * O campo existia na barra e **nao fazia nada**: nem estado, nem handler.
 * Digitar nele era digitar num campo morto, o que e pior que nao ter campo —
 * um campo de busca visivel promete que ha o que buscar.
 *
 * ## Por que uma caixa so para tres coisas
 *
 * Quem digita "cafe" pode querer o produto ou a venda em que ele saiu. Obrigar
 * a escolher a tela antes de procurar inverte a ordem: para escolher a tela, a
 * pessoa ja precisaria saber o que vai achar.
 *
 * ## O teclado
 *
 * `/` foca de qualquer lugar, `↑` e `↓` andam, `Enter` abre, `Esc` fecha. Nao e
 * enfeite: quem opera um balcao tem uma mao no leitor de codigo, e tirar a mao
 * do teclado para pegar o mouse custa mais que a busca inteira.
 *
 * O `/` e ignorado enquanto se digita em outro campo — senao seria impossivel
 * escrever uma data ou um endereco em qualquer formulario do sistema.
 */

/** Espera a digitacao parar. Ver o comentario no efeito. */
const ESPERA_MS = 250

const ORDEM: readonly TipoDeResultado[] = ['produto', 'cliente', 'venda']

export default function BuscaGlobal() {
  const router = useRouter()

  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  /**
   * O termo cujos resultados estao em `resultados`.
   *
   * "Procurando" e DERIVADO dele, e nao um estado proprio: enquanto o que esta
   * na tela nao corresponde ao que foi digitado, esta se procurando. Um
   * `setBuscando(true)` no corpo do efeito seria `setState` sincrono — o que o
   * lint barra, e com razao: dispara uma renderizacao em cascata a cada tecla.
   */
  const [termoConsultado, setTermoConsultado] = useState('')
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(0)

  const campoRef = useRef<HTMLInputElement>(null)
  const raizRef = useRef<HTMLDivElement>(null)

  const curto = termo.trim().length < MINIMO_DA_BUSCA
  const buscando = !curto && termoConsultado !== termo.trim()

  /* --- A consulta, depois que a digitacao para --- */
  useEffect(() => {
    /* Termo curto nao consulta e nao limpa nada: o que estiver guardado fica
       invisivel pela guarda do render, e volta a valer se a pessoa apagar uma
       letra e escrever de novo. */
    if (curto) return

    /*
     * Sem a espera, "cafe" dispara quatro rodadas de TRES consultas cada — e a
     * resposta da segunda pode chegar depois da quarta, deixando a lista de
     * "caf" sob a palavra "cafe". O `cancelado` cuida do que ja partiu.
     */
    let cancelado = false
    const t = setTimeout(() => {
      void (async () => {
        const achados = await buscar(termo)
        if (cancelado) return
        setResultados(achados)
        setTermoConsultado(termo.trim())
        setAtivo(0)
      })()
    }, ESPERA_MS)

    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [termo, curto])

  /* --- `/` foca de qualquer lugar --- */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== '/') return

      /*
       * Ignora quando ja se esta escrevendo em algum campo. Sem isto, digitar
       * uma data ou um endereco em qualquer formulario roubaria o foco para a
       * busca — e o caractere sumiria.
       */
      const alvo = e.target as HTMLElement | null
      const editando =
        alvo?.tagName === 'INPUT' ||
        alvo?.tagName === 'TEXTAREA' ||
        alvo?.tagName === 'SELECT' ||
        alvo?.isContentEditable === true
      if (editando) return

      e.preventDefault()
      campoRef.current?.focus()
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  /* --- Clique fora fecha --- */
  useEffect(() => {
    if (!aberta) return

    function aoClicar(e: MouseEvent) {
      if (raizRef.current?.contains(e.target as Node) === false) setAberta(false)
    }

    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberta])

  const fechar = useCallback(() => {
    setAberta(false)
    setTermo('')
    setResultados([])
  }, [])

  function aoTeclarNoCampo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
      campoRef.current?.blur()
      return
    }

    if (resultados.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      /* Circula: de baixo volta para o topo. Quem chegou ao fim da lista quer
         rever o primeiro, e nao bater numa parede. */
      setAtivo((i) => (i + 1) % resultados.length)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((i) => (i - 1 + resultados.length) % resultados.length)
      return
    }

    if (e.key === 'Enter') {
      const escolhido = resultados[ativo]
      if (escolhido === undefined) return
      e.preventDefault()
      fechar()
      router.push(escolhido.href)
    }
  }

  const porTipo = ORDEM.map((tipo) => ({
    tipo,
    itens: resultados.filter((r) => r.tipo === tipo),
  })).filter((g) => g.itens.length > 0)

  const mostrarPainel = aberta && termo.trim().length > 0

  return (
    <div className={styles.raiz} ref={raizRef}>
      <label className={styles.campo}>
        <IconSearch size={18} />
        <input
          ref={campoRef}
          type="search"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value)
            setAberta(true)
          }}
          onFocus={() => setAberta(true)}
          onKeyDown={aoTeclarNoCampo}
          placeholder="Buscar cliente, produto ou venda"
          aria-label="Buscar cliente, produto ou venda"
          role="combobox"
          aria-expanded={mostrarPainel}
          aria-controls="busca-resultados"
          aria-autocomplete="list"
          {...(resultados[ativo] === undefined
            ? {}
            : { 'aria-activedescendant': `busca-${resultados[ativo].id}` })}
        />

        {/* A dica do atalho some quando o campo esta em uso: ela ensina, e
            depois sai da frente. */}
        {termo === '' ? (
          <kbd className={styles.atalho} aria-hidden="true">
            /
          </kbd>
        ) : null}
      </label>

      {mostrarPainel ? (
        <div className={styles.painel} id="busca-resultados" role="listbox">
          {/*
            Quatro estados, e nao um.
            "Digite mais", "procurando", "nada encontrado" e a lista sao coisas
            diferentes. A maioria dos campos de busca mostra nada nas tres
            primeiras, e a pessoa nao sabe se esperou pouco ou buscou errado.
          */}
          {curto ? (
            <p className={styles.aviso}>Digite ao menos {MINIMO_DA_BUSCA} letras.</p>
          ) : buscando ? (
            <p className={styles.aviso}>Procurando...</p>
          ) : resultados.length === 0 || termoConsultado !== termo.trim() ? (
            <p className={styles.aviso}>Nada encontrado para “{termo.trim()}”.</p>
          ) : (
            porTipo.map((grupo) => (
              <div key={grupo.tipo} className={styles.grupo}>
                <span className={styles.grupoTitulo}>{ROTULO_DO_TIPO[grupo.tipo]}</span>

                {grupo.itens.map((r) => {
                  const indice = resultados.indexOf(r)

                  return (
                    <Link
                      key={r.id}
                      id={`busca-${r.id}`}
                      href={r.href}
                      role="option"
                      aria-selected={indice === ativo}
                      className={`${styles.item} ${indice === ativo ? styles.itemAtivo : ''}`}
                      onClick={fechar}
                      /* O mouse move a selecao junto com o teclado: sem isso, a
                         linha destacada e a que o mouse aponta seriam duas, e o
                         Enter abriria a errada. */
                      onMouseEnter={() => setAtivo(indice)}
                    >
                      <span className={styles.itemTitulo}>{r.titulo}</span>
                      <span className={styles.itemApoio}>{r.apoio}</span>
                    </Link>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
