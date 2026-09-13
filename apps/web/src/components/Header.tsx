'use client'

import Link from 'next/link'
import { type MouseEvent, useEffect, useState } from 'react'
import { BRAND, nav, PRE_LANCAMENTO } from '@/content/site'
import { IconArrowLeft, IconClose, IconMenu } from './Icons'
import styles from './Header.module.css'

type HeaderProps = {
  /**
   * Paginas fora da landing (a pesquisa do pre-lancamento, por exemplo) nao
   * tem as secoes que `nav` aponta (`#modulos` etc.) — mostrar aqueles links
   * ali so pareceria quebrado. Neste modo o header vira so marca + um link de
   * volta para a landing, visivel em qualquer largura de tela (o nav/acoes
   * normal so aparece a partir de 900px, e aqui nao ha menu mobile para
   * cobrir a lacuna abaixo disso).
   */
  comVoltar?: boolean
}

export default function Header({ comVoltar = false }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Trava a rolagem do fundo enquanto o menu mobile estiver aberto. */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  /**
   * Volta ao topo pela marca.
   *
   * Era `href="#top"`, e depender da ancora trazia dois problemas juntos: a
   * rolagem suave anima por uma pagina longa enquanto imagens abaixo da dobra
   * ainda carregam e mudam a altura do documento, e o `#top` fica na URL, de
   * modo que o refresh seguinte volta a saltar. Rolar explicitamente e limpar
   * o hash remove as duas fontes de imprevisibilidade.
   *
   * O `href` continua ali para quem abre em outra aba ou navega sem JS.
   */
  function irAoTopo(evento: MouseEvent<HTMLAnchorElement>): void {
    /* Deixa passar clique com modificador — abrir em nova aba tem de funcionar. */
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return

    evento.preventDefault()
    setOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.history.replaceState(null, '', window.location.pathname)
  }

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={`container ${styles.inner}`}>
        <a
          href="#top"
          onClick={irAoTopo}
          className={styles.brand}
          aria-label={`${BRAND}, voltar ao topo`}
        >
          <span className={styles.brandName}>{BRAND}</span>
        </a>

        {comVoltar ? (
          <Link href="/" className={styles.voltar}>
            <IconArrowLeft size={16} />
            Voltar para o site
          </Link>
        ) : (
          <>
            <nav className={styles.nav} aria-label="Seções do site">
              {nav.map((item) => (
                <a key={item.href} href={item.href} className={styles.navLink}>
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Div sempre presente: e ela quem tem `margin-left: auto` no layout
                flex do header. Removendo a div (e nao so o conteudo), o menu
                hamburguer perderia a ancora e a barra ficaria desalinhada acima
                de 900px, largura em que ele fica escondido. */}
            <div className={styles.actions}>
              {PRE_LANCAMENTO ? null : (
                <>
                  <Link href="/login" className={styles.login}>
                    Entrar
                  </Link>
                  <Link href="/criar-conta" className="btn btnPrimary">
                    Começar agora
                  </Link>
                </>
              )}
            </div>

            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="menu-mobile"
              aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            >
              {open ? <IconClose /> : <IconMenu />}
            </button>
          </>
        )}
      </div>

      {comVoltar ? null : (
        <div
          id="menu-mobile"
          className={`${styles.mobilePanel} ${open ? styles.mobileOpen : ''}`}
          hidden={!open}
        >
          <nav className={styles.mobileNav} aria-label="Seções do site">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={styles.mobileLink}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>
          {PRE_LANCAMENTO ? null : (
            <>
              <Link
                href="/criar-conta"
                className={`btn btnPrimary ${styles.mobileCta}`}
                onClick={() => setOpen(false)}
              >
                Começar agora
              </Link>
              <Link
                href="/login"
                className={`btn btnGhost ${styles.mobileCta}`}
                onClick={() => setOpen(false)}
              >
                Entrar
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  )
}
