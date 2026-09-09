'use client'

import { useState } from 'react'
import { Card, PageHeader } from '@/components/ui/UI'
import { Button } from '@/components/ui/Button'
import { exportarDados, type ResultadoDaExportacao, totalDeRegistros } from '@/lib/privacidade-api'
import styles from './empresa.module.css'

/**
 * Exportacao completa dos dados — NR-086, RF-125, RF-126, LGPD art. 18.
 *
 * ## Por que esta tela existe
 *
 * O direito de portabilidade tinha caso de uso em `core` desde a NR-031 e
 * nenhum caminho no produto. A politica de privacidade dizia "abra um chamado
 * em Suporte", que era verdade e era atendimento manual: o lojista pedia, e
 * alguem do outro lado teria de rodar algo a mao.
 *
 * ## O manifesto aparece, e nao e enfeite
 *
 * Depois de exportar, a tela lista quantos registros vieram de cada colecao.
 * E o que permite ao lojista dizer se o pacote esta completo — sem isso, ele
 * recebe um arquivo e so pode confiar. Confiar e exatamente o que um direito
 * de portabilidade nao deveria exigir.
 *
 * ## O aviso sobre o destino
 *
 * O pacote e escrito no servidor, e o download direto pelo navegador ainda nao
 * existe: o destino de producao e armazenamento de objetos, e isso depende da
 * DEC-009. A tela DIZ isso em vez de mostrar um botao de baixar que nao baixa —
 * botao que promete e nao entrega e pior que a ausencia dele.
 */
export default function MeusDados() {
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDaExportacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function exportar() {
    setGerando(true)
    setErro(null)

    const r = await exportarDados()
    setGerando(false)

    if (!r.ok) {
      setErro(r.erro)
      return
    }

    setResultado(r.dados)
  }

  return (
    <>
      <PageHeader
        title="Seus dados"
        subtitle="Exportacao completa, em formato aberto — LGPD art. 18"
      />

      <Card>
        <p className={styles.privacidadeTexto}>
          Voce pode levar todos os dados desta empresa para outro sistema quando quiser: vendas,
          clientes, produtos, financeiro, estoque, notas fiscais e a trilha de auditoria. O pacote
          vem com um <strong>manifesto</strong> que diz quantos registros de cada tipo foram gerados
          — para dar para conferir se veio tudo, em vez de ter de confiar.
        </p>

        <p className={styles.privacidadeTexto}>
          A exportacao continua disponivel mesmo com a conta suspensa por falta de pagamento. Seus
          dados nao servem de garantia de cobranca.
        </p>

        {/*
          Exportar a base inteira e auditado: quem gerou e quando ficam
          registrados. Dizer isso aqui e mais honesto que registrar em silencio.
        */}
        <p className={styles.privacidadeNota}>
          Cada exportacao fica registrada na trilha de auditoria, com quem gerou e quando.
        </p>

        {erro !== null ? (
          <p className={styles.privacidadeErro} role="alert">
            {erro}
          </p>
        ) : null}

        <div className={styles.privacidadeAcoes}>
          <Button onClick={exportar} disabled={gerando}>
            {gerando ? 'Gerando o pacote...' : 'Exportar meus dados'}
          </Button>
        </div>

        {resultado !== null ? (
          <div className={styles.privacidadeResultado}>
            <h3 className={styles.privacidadeTitulo}>
              Pacote gerado: {totalDeRegistros(resultado.manifest).toLocaleString('pt-BR')}{' '}
              registros
            </h3>

            <p className={styles.privacidadeNota}>
              Escrito no servidor, em <code>{resultado.location}</code>. O download direto pelo
              navegador entra quando o armazenamento de producao for definido — enquanto isso, peca
              o arquivo pelo Suporte citando este caminho.
            </p>

            <div className={styles.privacidadeTabelaWrap}>
              <table className={styles.privacidadeTabela}>
                <thead>
                  <tr>
                    <th>Colecao</th>
                    <th>Registros</th>
                    <th>Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.manifest.collections.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td>{c.rows.toLocaleString('pt-BR')}</td>
                      <td>
                        <code>{c.file}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  )
}
