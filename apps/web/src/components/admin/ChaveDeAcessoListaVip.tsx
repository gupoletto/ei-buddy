'use client'

import { useSyncExternalStore, type FormEvent, type ReactNode, useState } from 'react'
import { esquecerChaveDaListaVip, lerChaveDaListaVip, salvarChaveDaListaVip } from '@/lib/admin-api'
import { Button } from '@/components/ui/Button'
import { Card, Field, Input, PageHeader } from '@/components/ui/UI'
import styles from './lista-vip.module.css'

/**
 * Porta provisoria do painel da lista de espera — NR-111.
 *
 * Ainda nao existe o primeiro Super Admin (a concessao exige outro Super
 * Admin ja existente — ver a migration 0008), e o painel nao pode esperar
 * por isso. Em vez de sessao, pede uma chave compartilhada e a guarda so no
 * `localStorage` deste navegador; as chamadas de `admin-api.ts` a mandam no
 * cabecalho `x-waitlist-admin-key`, e a api confere (`chaveValida`, em
 * `routes/waitlist.ts`). `proxy.ts` tem a excecao correspondente, sem ela o
 * redirecionamento para `/login` aconteceria antes desta tela sequer
 * carregar.
 *
 * `useSyncExternalStore`, e nao `useEffect` + `setState` — mesma razao de
 * `AvisoDeCookies.tsx`: `localStorage` e armazenamento EXTERNO ao React, e
 * ler no efeito e chamar `setState` no corpo dele e um render inteiro jogado
 * fora toda vez que a tela abre (o compilador reprova, com razao).
 * `getServerSnapshot` devolve `null`: no servidor nao ha `localStorage`, e
 * comecar sempre pelo formulario evita o pisca de trocar de tela na
 * hidratacao.
 *
 * Sem verificacao previa: um valor errado so aparece quando as chamadas do
 * painel falharem (a chave nao viaja de volta com "certa"/"errada", so como
 * 401/403 na resposta) — "Usar outra chave" cobre o caso de digitar errado.
 */

const ouvintes = new Set<() => void>()

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

const chaveNoServidor = (): string | null => null

function avisarOuvintes(): void {
  for (const ouvinte of ouvintes) ouvinte()
}

export default function ChaveDeAcessoListaVip({ children }: { children: ReactNode }) {
  const chave = useSyncExternalStore(assinar, lerChaveDaListaVip, chaveNoServidor)
  const [rascunho, setRascunho] = useState('')

  function entrar(evento: FormEvent) {
    evento.preventDefault()
    const valor = rascunho.trim()
    if (valor === '') return

    salvarChaveDaListaVip(valor)
    avisarOuvintes()
  }

  function trocar() {
    esquecerChaveDaListaVip()
    setRascunho('')
    avisarOuvintes()
  }

  if (chave === null) {
    return (
      <>
        <PageHeader
          title="Lista de espera"
          subtitle="Acesso provisório — cole a chave para entrar"
        />
        <Card title="Chave de acesso">
          <form className={styles.chaveForm} onSubmit={entrar}>
            <Field label="Chave" htmlFor="chave-lista-vip">
              <Input
                id="chave-lista-vip"
                type="password"
                autoComplete="off"
                autoFocus
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                placeholder="Cole a chave de acesso"
              />
            </Field>
            <Button type="submit" disabled={rascunho.trim() === ''}>
              Entrar
            </Button>
          </form>
        </Card>
      </>
    )
  }

  return (
    <>
      {children}
      <button type="button" className={styles.chaveTrocar} onClick={trocar}>
        Usar outra chave
      </button>
    </>
  )
}
