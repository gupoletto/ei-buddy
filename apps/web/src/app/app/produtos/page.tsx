import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import ProdutosLista from '@/components/produtos/ProdutosLista'

export const metadata: Metadata = {
  title: `Produtos — ${BRAND}`,
  description: 'Catálogo, preços e controle de estoque.',
}

export default function ProdutosPage() {
  return <ProdutosLista />
}
