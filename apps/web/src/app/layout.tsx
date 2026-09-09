import type { Metadata } from 'next'
import { Poppins, Inter } from 'next/font/google'
import AvisoDeCookies from '@/components/AvisoDeCookies'
import ScrollRestoration from '@/components/ScrollRestoration'
import { BRAND } from '@/content/site'
import './globals.css'

/* Fonte de marca/destaque: geometrica e arredondada, no espirito da
   tipografia do rebranding (a original nao tem licenca aberta). */
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

/* Fonte de apoio: neutra e legivel para texto corrido, UI e painel. */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  /* Le do BRAND para o nome nao precisar ser trocado em dois lugares. */
  title: `${BRAND} — Gestao modular para o seu comercio`,
  description:
    'Modulos integrados de vendas, financeiro, estoque e fiscal, com um assistente que responde em linguagem natural.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${inter.variable}`}>
      <body>
        <ScrollRestoration />
        {children}
        {/* No layout RAIZ, e nao so na landing: o aviso precisa alcancar quem
            entra direto no painel por um link salvo, que e quem mais usa o
            sistema e menos passa pela pagina inicial. */}
        <AvisoDeCookies />
      </body>
    </html>
  )
}
