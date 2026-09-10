'use client'

import { useEffect, useState } from 'react'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/UI'
import { IconUsers } from '@/components/Icons'
import {
  aceitarConexao,
  encerrarConexao,
  listarConexoes,
  recusarConexao,
  type Conexao,
} from '@/lib/connections-api'
import type { Resultado } from '@/lib/http'
import styles from './conexoes.module.css'

const enderecoDe = (c: Conexao['contact']): string | null => {
  if (c === null) return null
  return (
    [c.street, c.streetNumber, c.neighborhood, c.city, c.state].filter(Boolean).join(', ') || null
  )
}

/**
 * Minhas conexões — ADR-0008, DEC-021, RF-05.
 *
 * Três grupos: quem me pediu (posso aceitar ou recusar), a quem eu pedi
 * (posso cancelar), e com quem já estou conectada (posso desfazer, e é aqui
 * que o contato completo aparece — antes do aceite ele não sai da busca).
 */
export default function ConexoesView() {
  const [conexoes, setConexoes] = useState<Conexao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [emAcao, setEmAcao] = useState<string | null>(null)

  /** So para o refresh depois de uma acao — a carga inicial vai direto no efeito abaixo. */
  async function carregar() {
    const r = await listarConexoes()
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    setErro(null)
    setConexoes(r.dados.connections)
  }

  useEffect(() => {
    void (async () => {
      const r = await listarConexoes()
      if (r.ok) {
        setErro(null)
        setConexoes(r.dados.connections)
      } else {
        setErro(r.erro)
      }
    })()
  }, [])

  async function agir(id: string, acao: () => Promise<Resultado<{ ok: true }>>) {
    setEmAcao(id)
    const r = await acao()
    setEmAcao(null)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    await carregar()
  }

  if (conexoes === null) {
    return erro !== null ? (
      <EmptyState title="Não deu para carregar suas conexões" description={erro} />
    ) : (
      <p className={styles.introSubtitle}>Carregando...</p>
    )
  }

  const recebidos = conexoes.filter((c) => c.direction === 'received' && c.status === 'pending')
  const enviados = conexoes.filter((c) => c.direction === 'sent' && c.status === 'pending')
  const aceitas = conexoes.filter((c) => c.status === 'accepted')

  return (
    <>
      <div className={styles.intro}>
        <div className={styles.introTopo}>
          <div>
            <h1 className={styles.introTitle}>Minhas conexões</h1>
            <p className={styles.introSubtitle}>
              Pedidos que você recebeu, pedidos que você enviou, e com quem já está conectada.
            </p>
          </div>
          <ButtonLink href="/app/fornecedores" variant="secondary" size="sm">
            Buscar fornecedores
          </ButtonLink>
        </div>
      </div>

      {erro !== null ? <EmptyState title="Algo não funcionou" description={erro} /> : null}

      <Card title="Pedidos recebidos">
        {recebidos.length === 0 ? (
          <EmptyState title="Nada por aqui" description="Ninguém pediu conexão com você ainda." />
        ) : (
          <ul className={styles.lista}>
            {recebidos.map((c) => (
              <li key={c.id} className={styles.linha}>
                <IconUsers size={20} />
                <div className={styles.linhaTexto}>
                  <span className={styles.linhaTitulo}>{c.otherCompanyName}</span>
                  <span className={styles.linhaDetalhe}>quer se conectar com você</span>
                </div>
                <div className={styles.acoes}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={emAcao === c.id}
                    onClick={() => void agir(c.id, () => recusarConexao(c.id))}
                  >
                    Recusar
                  </Button>
                  <Button
                    size="sm"
                    disabled={emAcao === c.id}
                    onClick={() => void agir(c.id, () => aceitarConexao(c.id))}
                  >
                    Aceitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Pedidos enviados">
        {enviados.length === 0 ? (
          <EmptyState
            title="Nada por aqui"
            description="Você ainda não pediu conexão com ninguém."
          />
        ) : (
          <ul className={styles.lista}>
            {enviados.map((c) => (
              <li key={c.id} className={styles.linha}>
                <IconUsers size={20} />
                <div className={styles.linhaTexto}>
                  <span className={styles.linhaTitulo}>{c.otherCompanyName}</span>
                  <span className={styles.linhaDetalhe}>aguardando resposta</span>
                </div>
                <div className={styles.acoes}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={emAcao === c.id}
                    onClick={() => void agir(c.id, () => encerrarConexao(c.id))}
                  >
                    Cancelar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Conectadas">
        {aceitas.length === 0 ? (
          <EmptyState
            title="Nenhuma conexão ainda"
            description="Quando um pedido for aceito dos dois lados, o contato aparece aqui."
          />
        ) : (
          <ul className={styles.lista}>
            {aceitas.map((c) => (
              <li key={c.id} className={styles.linha}>
                <IconUsers size={20} />
                <div className={styles.linhaTexto}>
                  <span className={styles.linhaTitulo}>{c.otherCompanyName}</span>
                  {c.contact !== null ? (
                    <div className={styles.contato}>
                      <span>{c.contact.phone}</span>
                      {enderecoDe(c.contact) !== null ? <span>{enderecoDe(c.contact)}</span> : null}
                    </div>
                  ) : null}
                </div>
                <div className={styles.acoes}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={emAcao === c.id}
                    onClick={() => void agir(c.id, () => encerrarConexao(c.id))}
                  >
                    Desfazer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
