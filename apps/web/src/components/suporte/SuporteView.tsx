'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  abrirChamado,
  CATEGORIAS,
  listarChamados,
  ROTULO_STATUS,
  type CategoriaChamado,
  type Chamado,
} from '@/lib/suporte-api'
import { formatDate } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui/UI'
import { Button } from '@/components/ui/Button'
import Toast from '@/components/ui/Toast'
import { Spinner } from '@/components/auth/Fields'
import { IconPlus, IconUpload } from '@/components/Icons'
import ChamadoDetalhe from './ChamadoDetalhe'
import styles from './suporte.module.css'

const TOM_STATUS: Record<string, 'neutral' | 'info' | 'warning' | 'success'> = {
  aberto: 'neutral',
  andamento: 'info',
  respondido: 'warning',
  encerrado: 'success',
}

export default function SuporteView() {
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Chamado | null>(null)
  const [criando, setCriando] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null)

  const buscar = useCallback(async () => {
    const r = await listarChamados()
    setCarregando(false)

    if (!r.ok) {
      setErroCarga(r.erro)
      return
    }

    setErroCarga(null)
    setChamados(r.dados.chamados)
  }, [])

  useEffect(() => {
    /* `async` explicito: os `setState` vem todos depois do await, nunca
       sincronos no corpo do efeito. */
    void (async () => {
      await buscar()
    })()
  }, [buscar])

  const emAndamento = chamados.filter((c) => c.status !== 'encerrado')
  const comResposta = chamados.filter((c) => c.naoLidas > 0)

  function atualizar(chamado: Chamado) {
    setChamados((atual) => atual.map((c) => (c.id === chamado.id ? chamado : c)))
    setAberto(chamado)
  }

  return (
    <>
      <PageHeader
        title="Suporte"
        subtitle="Abra um chamado e acompanhe as respostas"
        actions={
          <Button onClick={() => setCriando(true)}>
            <IconPlus size={17} />
            Abrir chamado
          </Button>
        }
      />

      {chamados.length > 0 && !carregando ? (
        <div className="statRow">
          <Stat label="Chamados abertos" value={String(emAndamento.length)} />
          <Stat
            label="Com resposta nova"
            value={String(comResposta.length)}
            hint={comResposta.length ? 'aguardando voce' : 'nada novo'}
            tone={comResposta.length ? 'warning' : 'neutral'}
          />
          <Stat label="Total" value={String(chamados.length)} />
        </div>
      ) : null}

      <Card>
        {/*
          Carregando, vazio e quebrado sao TRES coisas diferentes.
          "Nenhum chamado por aqui" e uma boa noticia; "nao deu para carregar" e
          um problema. Mostrar o estado vazio enquanto a lista ainda vem faria o
          lojista abrir um chamado repetido achando que o anterior sumiu.
        */}
        {carregando ? (
          <EmptyState title="Carregando seus chamados" description="Um instante." />
        ) : erroCarga !== null ? (
          <EmptyState
            title="Nao deu para carregar os chamados"
            description={erroCarga}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setCarregando(true)
                  setErroCarga(null)
                  void buscar()
                }}
              >
                Tentar de novo
              </Button>
            }
          />
        ) : chamados.length === 0 ? (
          <EmptyState
            title="Nenhum chamado por aqui"
            description="Se algo nao funcionou como esperado, abra um chamado. O time responde por aqui mesmo e voce acompanha tudo nesta tela."
            action={
              <Button onClick={() => setCriando(true)}>
                <IconPlus size={16} />
                Abrir chamado
              </Button>
            }
          />
        ) : (
          <ul className={styles.lista}>
            {chamados.map((c) => (
              <li key={c.id}>
                <button type="button" className={styles.item} onClick={() => setAberto(c)}>
                  <span className={styles.itemProtocolo}>#{c.protocolo}</span>

                  <span className={styles.itemPrincipal}>
                    <strong>{c.assunto}</strong>
                    <span>
                      {CATEGORIAS.find((k) => k.valor === c.categoria)?.rotulo} · atualizado em{' '}
                      {formatDate(c.atualizadoEm)}
                    </span>
                  </span>

                  {/* Ponto de resposta nova — o mesmo sinal do badge da nav */}
                  {c.naoLidas > 0 ? (
                    <span className={styles.itemNaoLidas}>{c.naoLidas}</span>
                  ) : null}

                  <span className={styles.itemStatus}>
                    <Badge tone={TOM_STATUS[c.status]}>{ROTULO_STATUS[c.status]}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {aberto ? (
        <ChamadoDetalhe chamado={aberto} onFechar={() => setAberto(null)} onAtualizar={atualizar} />
      ) : null}

      {criando ? (
        <FormChamado
          onCriado={(novo) => {
            setChamados((atual) => [novo, ...atual])
            setCriando(false)
            setToast({
              msg: `Chamado #${novo.protocolo} aberto. Respondemos em ate 1 dia util.`,
              tone: 'success',
            })
          }}
          onCancelar={() => setCriando(false)}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}
    </>
  )
}

/* ================================================================== *
 * Abertura de chamado
 * ================================================================== */

function FormChamado({
  onCriado,
  onCancelar,
}: {
  onCriado: (chamado: Chamado) => void
  onCancelar: () => void
}) {
  const [assunto, setAssunto] = useState('')
  const [categoria, setCategoria] = useState<CategoriaChamado>('tecnico')
  const [descricao, setDescricao] = useState('')
  const [anexo, setAnexo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(event: React.FormEvent) {
    event.preventDefault()
    setErro(null)
    setSalvando(true)

    const r = await abrirChamado({ assunto, categoria, descricao, anexo })
    setSalvando(false)

    if (!r.ok) {
      setErro(r.erro)
      return
    }

    onCriado(r.dados)
  }

  return (
    <div className={styles.dialogRoot}>
      <button
        type="button"
        className={styles.dialogBackdrop}
        onClick={onCancelar}
        aria-label="Fechar"
      />

      <div
        className={styles.dialogPainel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-chamado"
      >
        <h2 id="novo-chamado" className={styles.dialogTitulo}>
          Abrir chamado
        </h2>

        <form onSubmit={salvar} noValidate className={styles.formCampos}>
          <label className={styles.campo}>
            <span>Assunto</span>
            <input
              className={styles.input}
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Resuma em uma linha"
              autoFocus
            />
          </label>

          <label className={styles.campo}>
            <span>Categoria</span>
            <select
              className={styles.input}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaChamado)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.campo}>
            <span>O que aconteceu</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Conte o que voce fez, o que esperava e o que aconteceu."
              rows={5}
            />
          </label>

          <div className={styles.campo}>
            <span>Anexo (opcional)</span>
            {anexo ? (
              <div className={styles.anexoEscolhido}>
                <span>{anexo}</span>
                <button type="button" onClick={() => setAnexo(null)}>
                  Remover
                </button>
              </div>
            ) : (
              <label className={styles.anexoUpload}>
                <IconUpload size={17} />
                Escolher arquivo ou print
                <input
                  type="file"
                  className={styles.anexoInput}
                  onChange={(e) => setAnexo(e.target.files?.[0]?.name ?? null)}
                />
              </label>
            )}
          </div>

          {erro ? (
            <p className={styles.erro} role="alert">
              {erro}
            </p>
          ) : null}

          <div className={styles.dialogAcoes}>
            <Button variant="secondary" onClick={onCancelar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? (
                <>
                  <Spinner size={15} />
                  Abrindo...
                </>
              ) : (
                'Abrir chamado'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
