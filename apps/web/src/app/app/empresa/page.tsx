import type { Metadata } from 'next'
import { BRAND } from '@/content/site'
import EmpresaForm from '@/components/empresa/EmpresaForm'
import MeusDados from '@/components/empresa/MeusDados'

export const metadata: Metadata = {
  title: `Empresa — ${BRAND}`,
  description: 'Dados cadastrais, endereco, certificado digital e exportacao completa.',
}

export default function EmpresaPage() {
  return (
    <>
      <EmpresaForm />
      {/* A exportacao mora aqui, e nao numa tela propria: quem procura "meus
          dados" procura em Empresa. Uma pagina separada no menu seria mais
          visivel e menos encontravel. */}
      <MeusDados />
    </>
  )
}
