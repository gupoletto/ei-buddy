import type { Metadata } from 'next'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import { BRAND } from '@/content/site'
import ListaVipForm from './ListaVipForm'
import styles from './lista-vip.module.css'

export const metadata: Metadata = {
  title: `Grupo VIP de Pré-Lançamento — ${BRAND}`,
  description: 'Ajude a moldar o EiBuddy antes do lançamento e entre para o Grupo VIP.',
}

/**
 * Pesquisa do pre-lancamento — NR-111.
 *
 * Header e Footer iguais aos da landing, como em `PaginaLegal.tsx`: quem
 * chegou por um link precisa de caminho de volta. Sem os botoes de
 * Entrar/Cadastrar (`PRE_LANCAMENTO` em `content/site.ts`), o Header nao
 * empurra ninguem para um cadastro que ainda nao existe.
 */
export default function ListaVipPage() {
  return (
    <>
      <Header />

      <main className={styles.pagina}>
        <div className={`container ${styles.corpo}`}>
          <ListaVipForm />
        </div>
      </main>

      <Footer />
    </>
  )
}
