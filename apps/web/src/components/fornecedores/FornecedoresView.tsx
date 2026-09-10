'use client'

import { useState, type FormEvent } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, EmptyState, Field, Input } from '@/components/ui/UI'
import { Spinner } from '@/components/auth/Fields'
import { IconCheck, IconSearch, IconStore } from '@/components/Icons'
import { buscarFornecedores, pedirConexao, type Fornecedor } from '@/lib/connections-api'
import styles from './fornecedores.module.css'

const formatarDistancia = (km: number | null): string | null => {
  if (km === null) return null
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

/**
 * Buscar fornecedor por proximidade — ADR-0008, DEC-021, RF-01 a RF-04.
 *
 * O caso de uso guia: quem vende bolo de pote precisa de farinha, busca
 * "farinha" e ve quem mais vende isso perto, do mais proximo ao mais
 * distante. Antes do pedido ser aceito, so nome da empresa, bairro/cidade e
 * distancia aparecem — telefone e endereco completo vem depois.
 */
export default function FornecedoresView() {
  const [termo, setTermo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [buscou, setBuscou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Fornecedor[]>([])
  const [pedidos, setPedidos] = useState<Record<string, 'enviando' | 'enviado' | string>>({})

  async function buscar(event: FormEvent) {
    event.preventDefault()
    if (termo.trim().length < 2) return

    setBuscando(true)
    setErro(null)

    const r = await buscarFornecedores(termo.trim())
    setBuscando(false)
    setBuscou(true)

    if (!r.ok) {
      setErro(r.erro)
      return
    }

    setResultados(r.dados.results)
  }

  async function pedir(fornecedor: Fornecedor) {
    setPedidos((atual) => ({ ...atual, [fornecedor.companyId]: 'enviando' }))

    const r = await pedirConexao(fornecedor.companyId)

    setPedidos((atual) => ({
      ...atual,
      [fornecedor.companyId]: r.ok ? 'enviado' : r.erro,
    }))
  }

  return (
    <>
      <div className={styles.intro}>
        <div className={styles.introTopo}>
          <div>
            <h1 className={styles.introTitle}>Buscar fornecedores</h1>
            <p className={styles.introSubtitle}>
              Precisa de um insumo? Veja quem mais vende perto de você e peça conexão.
            </p>
          </div>
          <ButtonLink href="/app/conexoes" variant="secondary" size="sm">
            Minhas conexões
          </ButtonLink>
        </div>
      </div>

      <Card>
        <form className={styles.busca} onSubmit={(e) => void buscar(e)}>
          <div className={styles.buscaCampo}>
            <Field label="O que você precisa?">
              <Input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Ex.: farinha, embalagem, tempero..."
                disabled={buscando}
              />
            </Field>
          </div>
          <Button type="submit" disabled={buscando || termo.trim().length < 2}>
            {buscando ? (
              <>
                <Spinner size={15} />
                Buscando...
              </>
            ) : (
              <>
                <IconSearch size={16} />
                Buscar
              </>
            )}
          </Button>
        </form>

        {erro !== null ? <EmptyState title="Não deu para buscar" description={erro} /> : null}

        {buscou && erro === null ? (
          resultados.length === 0 ? (
            <EmptyState
              title="Nenhum fornecedor encontrado"
              description="Ninguém cadastrado por aqui vende isso ainda. Tente outro termo."
            />
          ) : (
            <ul className={styles.lista}>
              {resultados.map((f) => {
                const estado = pedidos[f.companyId]
                const distancia = formatarDistancia(f.distanceKm)

                return (
                  <li key={f.companyId} className={styles.linha}>
                    <IconStore size={20} />
                    <div className={styles.linhaTexto}>
                      <span className={styles.linhaTitulo}>
                        {f.companyName}
                        {distancia !== null ? (
                          <span className={styles.linhaDetalhe}>· {distancia}</span>
                        ) : null}
                      </span>
                      <span className={styles.linhaDetalhe}>
                        {[f.neighborhood, f.city].filter(Boolean).join(', ') ||
                          'Localização não informada'}
                      </span>
                      <span className={styles.linhaProdutos}>{f.products.join(', ')}</span>
                    </div>

                    {estado === 'enviado' ? (
                      <Button size="sm" variant="secondary" disabled>
                        <IconCheck size={16} />
                        Pedido enviado
                      </Button>
                    ) : estado === 'enviando' ? (
                      <Button size="sm" variant="secondary" disabled>
                        <Spinner size={14} />
                      </Button>
                    ) : (
                      <div className={styles.linhaAcao}>
                        {estado !== undefined ? (
                          <span className={styles.linhaErro}>{estado}</span>
                        ) : null}
                        <Button size="sm" variant="secondary" onClick={() => void pedir(f)}>
                          Pedir conexão
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </Card>
    </>
  )
}
