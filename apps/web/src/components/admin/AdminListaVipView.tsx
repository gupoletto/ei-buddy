'use client'

import { useEffect, useState } from 'react'
import {
  listarRespostasListaVip,
  resumoListaVip,
  type PaginaDaListaVip,
  type ResumoDaListaVip,
} from '@/lib/admin-api'
import { formatDateTime } from '@/lib/format'
import { OPCOES_VALOR, ROTULO_DIFICULDADE, ROTULO_SISTEMA, ROTULO_VALOR } from '@/lib/waitlist-api'
import { Badge, Card, EmptyState, Input, PageHeader, Stat } from '@/components/ui/UI'
import { DailyColumnChart, RankedBarList } from './ListaVipCharts'
import styles from './lista-vip.module.css'

const TAMANHO_DA_PAGINA = 100

/**
 * Painel do Super Admin — respostas do pre-lancamento (NR-111).
 *
 * Duas fontes: `resumoListaVip` traz os quatro agregados (dificuldade,
 * sistema, valor justo, evolucao por dia) numa varredura so no banco; a
 * mesma pagina de `listarRespostasListaVip` alimenta tanto a tabela quanto
 * as respostas abertas em destaque, para nao buscar a mesma lista duas
 * vezes. `TAMANHO_DA_PAGINA` bem acima do volume esperado de pre-lancamento
 * faz "buscar" e "ver tudo" coincidirem por enquanto — a paginacao continua
 * funcionando de verdade quando a lista crescer além disso.
 */
export default function AdminListaVipView() {
  const [resumo, setResumo] = useState<ResumoDaListaVip | null>(null)
  const [erroResumo, setErroResumo] = useState<string | null>(null)

  const [pagina, setPagina] = useState<PaginaDaListaVip | null>(null)
  const [erroPagina, setErroPagina] = useState<string | null>(null)
  const [carregandoPagina, setCarregandoPagina] = useState(true)
  const [busca, setBusca] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)

  useEffect(() => {
    void (async () => {
      const r = await resumoListaVip()
      if (r.ok) {
        setErroResumo(null)
        setResumo(r.dados)
      } else {
        setErroResumo(r.erro)
      }
    })()
  }, [])

  /* O efeito so busca. `carregandoPagina` e ligado por quem mexeu na busca
   * ou na pagina — setState sincrono no corpo do efeito dispara render em
   * cascata (react-hooks/set-state-in-effect), mesmo padrao de ProdutosLista. */
  useEffect(() => {
    void (async () => {
      const r = await listarRespostasListaVip({
        ...(busca.trim() === '' ? {} : { q: busca.trim() }),
        page: paginaAtual,
        pageSize: TAMANHO_DA_PAGINA,
      })
      setCarregandoPagina(false)
      if (r.ok) {
        setErroPagina(null)
        setPagina(r.dados)
      } else {
        setErroPagina(r.erro)
      }
    })()
  }, [busca, paginaAtual])

  const valorJustoCompleto = OPCOES_VALOR.map((o) => ({
    label: o.label,
    value: resumo?.fairPrice.find((c) => c.value === o.value)?.count ?? 0,
  }))

  const respostasAbertas = (pagina?.entries ?? []).filter((e) => e.expectation.trim() !== '')

  const ultimaPagina = Math.max(1, Math.ceil((pagina?.total ?? 0) / TAMANHO_DA_PAGINA))

  return (
    <>
      <PageHeader title="Lista de espera" subtitle="Respostas do Grupo VIP de Pré-Lançamento" />

      <div className="statRow">
        <Stat label="Respostas recebidas" value={String(resumo?.total ?? '—')} />
      </div>

      {erroResumo !== null ? (
        <EmptyState title="Não deu para carregar os agregados" description={erroResumo} />
      ) : (
        <div className={styles.grade}>
          <Card title="Maior dificuldade hoje">
            <RankedBarList
              data={(resumo?.painPoints ?? []).map((c) => ({
                label: ROTULO_DIFICULDADE[c.value],
                value: c.count,
              }))}
            />
          </Card>

          <Card title="Já usa algum sistema?">
            <RankedBarList
              data={(resumo?.usesSystem ?? []).map((c) => ({
                label: ROTULO_SISTEMA[c.value],
                value: c.count,
              }))}
            />
          </Card>

          <Card title="Valor mensal considerado justo">
            <RankedBarList data={valorJustoCompleto} />
          </Card>

          <Card title="Respostas por dia">
            <DailyColumnChart data={resumo?.perDay ?? []} />
          </Card>
        </div>
      )}

      <Card title="O que esperam do Buddy">
        {respostasAbertas.length === 0 ? (
          <p className={styles.vazio}>Nenhuma resposta aberta ainda.</p>
        ) : (
          <ul className={styles.abertas}>
            {respostasAbertas.map((e) => (
              <li key={e.id} className={styles.abertaItem}>
                <p className={styles.abertaTexto}>“{e.expectation}”</p>
                <span className={styles.abertaAutor}>
                  {e.name}
                  {e.businessType ? ` · ${e.businessType}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Respostas individuais">
        <div className={styles.busca}>
          <Input
            value={busca}
            onChange={(e) => {
              setCarregandoPagina(true)
              setBusca(e.target.value)
              setPaginaAtual(1)
            }}
            placeholder="Buscar por nome, celular, ramo ou expectativa..."
            aria-label="Buscar resposta"
          />
        </div>

        {erroPagina !== null ? (
          <EmptyState title="Não deu para carregar as respostas" description={erroPagina} />
        ) : carregandoPagina && pagina === null ? (
          <p className={styles.vazio}>Carregando...</p>
        ) : pagina === null || pagina.entries.length === 0 ? (
          <EmptyState
            title="Nenhuma resposta encontrada"
            description={busca === '' ? 'Ainda não há respostas.' : 'Tente outro termo de busca.'}
          />
        ) : (
          <div className={styles.tabelaWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ramo</th>
                  <th>Celular</th>
                  <th>Dificuldades</th>
                  <th>Já usa sistema</th>
                  <th>Valor justo</th>
                  <th>Contato</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {pagina.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>{e.businessType ?? '—'}</td>
                    <td>{e.phone}</td>
                    <td>
                      {e.painPoints.length === 0
                        ? '—'
                        : e.painPoints.map((p) => ROTULO_DIFICULDADE[p]).join(', ')}
                      {e.painPointOther ? ` (${e.painPointOther})` : ''}
                    </td>
                    <td>
                      {e.usesSystem === null ? '—' : ROTULO_SISTEMA[e.usesSystem]}
                      {e.usesSystemOther ? ` (${e.usesSystemOther})` : ''}
                    </td>
                    <td>{e.fairPrice === null ? '—' : ROTULO_VALOR[e.fairPrice]}</td>
                    <td>
                      <Badge tone={e.wantsUpdates ? 'success' : 'neutral'}>
                        {e.wantsUpdates ? 'Sim' : 'Não'}
                      </Badge>
                    </td>
                    <td>{formatDateTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagina !== null && ultimaPagina > 1 ? (
          <div className={styles.paginacao}>
            <button
              type="button"
              className={styles.paginacaoBotao}
              disabled={paginaAtual <= 1}
              onClick={() => {
                setCarregandoPagina(true)
                setPaginaAtual((p) => p - 1)
              }}
            >
              Anterior
            </button>
            <span className={styles.paginacaoInfo}>
              Página {paginaAtual} de {ultimaPagina} · {pagina.total} resposta(s)
            </span>
            <button
              type="button"
              className={styles.paginacaoBotao}
              disabled={paginaAtual >= ultimaPagina}
              onClick={() => {
                setCarregandoPagina(true)
                setPaginaAtual((p) => p + 1)
              }}
            >
              Próxima
            </button>
          </div>
        ) : null}
      </Card>
    </>
  )
}
