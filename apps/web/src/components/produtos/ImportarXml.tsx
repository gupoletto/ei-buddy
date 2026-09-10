'use client'

import { useEffect, useRef, useState } from 'react'
import { importarXmlCompra, lerXmlNfe, type ItemXml, type NotaXml } from '@/lib/produtos-api'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge } from '@/components/ui/UI'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/auth/Fields'
import { IconClose, IconUpload } from '@/components/Icons'
import styles from './xml.module.css'

type Decisao = 'vincular' | 'criar' | 'ignorar'

/**
 * Importacao de nota de compra por XML.
 *
 * O XML e lido aqui so para montar a previa; a entrada de estoque e o custo
 * sao gravados pelo servidor, que precisa validar a chave de acesso e
 * impedir que a mesma nota entre duas vezes.
 */
export default function ImportarXml({ onClose }: { onClose: () => void }) {
  const [nota, setNota] = useState<NotaXml | null>(null)
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<number | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  async function receberArquivo(arquivo: File) {
    setErro(null)
    setLendo(true)

    if (!arquivo.name.toLowerCase().endsWith('.xml')) {
      setErro('Envie o arquivo XML da nota fiscal de compra.')
      setLendo(false)
      return
    }

    const resultadoLeitura = lerXmlNfe(await arquivo.text())
    setLendo(false)

    if (!resultadoLeitura.ok) {
      setErro(resultadoLeitura.error)
      return
    }

    /* Sugestao inicial: item que casou com o catalogo entra como vinculo,
       o resto entra como produto novo — e tudo continua editavel. */
    const iniciais: Record<string, Decisao> = {}
    resultadoLeitura.nota.itens.forEach((item, i) => {
      iniciais[String(i)] = item.produtoVinculado ? 'vincular' : 'criar'
    })

    setNota(resultadoLeitura.nota)
    setDecisoes(iniciais)
  }

  async function confirmar() {
    if (!nota) return
    setImportando(true)

    /* SUBSTITUIR POR: POST /compras/xml */
    const r = await importarXmlCompra(nota, decisoes)
    setImportando(false)

    if (!r.ok) {
      setErro(r.error)
      return
    }
    setResultado(r.entradas)
  }

  const total = nota?.itens.reduce((acc, i) => acc + i.quantidade * i.valorUnitario, 0) ?? 0

  return (
    <div className={styles.root}>
      <button type="button" className={styles.backdrop} onClick={onClose} aria-label="Fechar" />

      <div
        ref={dialogRef}
        className={styles.painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="xml-titulo"
        tabIndex={-1}
      >
        <header className={styles.cabecalho}>
          <h2 id="xml-titulo" className={styles.titulo}>
            Importar XML de compra
          </h2>
          <button type="button" className={styles.fechar} onClick={onClose} aria-label="Fechar">
            <IconClose size={18} />
          </button>
        </header>

        {/* ---------- Resultado ---------- */}
        {resultado !== null ? (
          <div className={styles.corpo}>
            <div className={styles.sucesso}>
              <strong>{resultado} item(ns) lancado(s)</strong>
              <p>
                O estoque e o preço de custo foram atualizados a partir da nota
                {nota ? ` ${nota.numero}` : ''}.
              </p>
            </div>
            <div className={styles.acoes}>
              <Button onClick={onClose}>Concluir</Button>
            </div>
          </div>
        ) : null}

        {/* ---------- Upload ---------- */}
        {resultado === null && !nota ? (
          <div className={styles.corpo}>
            <p className={styles.texto}>
              Envie o XML da nota fiscal de compra. Os itens são lidos automaticamente e você
              escolhe, item a item, o que fazer com cada um antes de confirmar.
            </p>

            <label className={styles.dropzone}>
              <IconUpload size={26} />
              <strong>Escolher XML</strong>
              <span>Arquivo .xml da NF-e</span>
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                className={styles.fileInput}
                disabled={lendo}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void receberArquivo(f)
                }}
              />
            </label>

            {lendo ? (
              <p className={styles.carregando}>
                <Spinner size={15} />
                Lendo a nota...
              </p>
            ) : null}

            {erro ? (
              <p className={styles.erro} role="alert">
                {erro}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ---------- Conferencia dos itens ---------- */}
        {resultado === null && nota ? (
          <div className={styles.corpo}>
            <div className={styles.notaInfo}>
              <div>
                <span>Nota</span>
                <strong>{nota.numero || '—'}</strong>
              </div>
              <div>
                <span>Emitente</span>
                <strong>{nota.emitente || '—'}</strong>
              </div>
              <div>
                <span>Emissao</span>
                <strong>{nota.emissao ? formatDate(nota.emissao) : '—'}</strong>
              </div>
              <div>
                <span>Total dos itens</span>
                <strong>{formatMoney(total)}</strong>
              </div>
            </div>

            <ul className={styles.itens}>
              {nota.itens.map((item, i) => (
                <ItemLinha
                  key={i}
                  item={item}
                  decisao={decisoes[String(i)] ?? 'criar'}
                  onDecisao={(d) => setDecisoes((m) => ({ ...m, [String(i)]: d }))}
                />
              ))}
            </ul>

            {erro ? (
              <p className={styles.erro} role="alert">
                {erro}
              </p>
            ) : null}

            <div className={styles.acoes}>
              <Button variant="secondary" onClick={() => setNota(null)}>
                Trocar arquivo
              </Button>
              <Button onClick={confirmar} disabled={importando}>
                {importando ? (
                  <>
                    <Spinner size={15} />
                    Lancando...
                  </>
                ) : (
                  'Confirmar entrada'
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ItemLinha({
  item,
  decisao,
  onDecisao,
}: {
  item: ItemXml
  decisao: Decisao
  onDecisao: (d: Decisao) => void
}) {
  return (
    <li className={styles.item}>
      <div className={styles.itemTopo}>
        <span className={styles.itemDescricao}>
          <strong>{item.descricao}</strong>
          <span>
            {item.ean ? `EAN ${item.ean} · ` : ''}NCM {item.ncm || '—'}
          </span>
        </span>

        {item.produtoVinculado ? (
          <Badge tone="success">Ja cadastrado</Badge>
        ) : (
          <Badge tone="info">Novo</Badge>
        )}
      </div>

      <div className={styles.itemNumeros}>
        <span>
          {item.quantidade} un × {formatMoney(item.valorUnitario)}
        </span>
        <strong>{formatMoney(item.quantidade * item.valorUnitario)}</strong>
      </div>

      {item.produtoVinculado ? (
        <p className={styles.itemVinculo}>
          Vincula a <strong>{item.produtoVinculado.descricao}</strong> (codigo{' '}
          {item.produtoVinculado.codigo})
        </p>
      ) : null}

      <div className={styles.itemAcoes} role="group" aria-label="O que fazer com o item">
        {(
          [
            ['vincular', 'Vincular', Boolean(item.produtoVinculado)],
            ['criar', 'Criar produto', true],
            ['ignorar', 'Ignorar', true],
          ] as const
        ).map(([valor, rotulo, habilitado]) =>
          habilitado ? (
            <button
              key={valor}
              type="button"
              className={`${styles.itemBotao} ${decisao === valor ? styles.itemBotaoAtivo : ''}`}
              onClick={() => onDecisao(valor)}
              aria-pressed={decisao === valor}
            >
              {rotulo}
            </button>
          ) : null,
        )}
      </div>
    </li>
  )
}
