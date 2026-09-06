'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { clientes as todosClientes } from '@/lib/mock-data'
import { confirmarImportacaoClientes, pendenciaTotal, temVencido } from '@/lib/clientes-api'
import { isValidCNPJ, isValidCPF } from '@/lib/validation'
import { daysUntil, formatDate, formatMoney } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui/UI'
import { Button, ButtonLink } from '@/components/ui/Button'
import { IconPlus, IconSearch, IconUpload } from '@/components/Icons'
import { COMANDOS_CLIENTES } from '@/lib/comandos'
import ComandosWhatsApp from '@/components/app/ComandosWhatsApp'
import ImportarPlanilha from '@/components/app/ImportarPlanilha'
import styles from './clientes.module.css'

/** Campos que a planilha de clientes pode alimentar. */
/*
 * Cidade e UF NAO estao aqui, e a ausencia e de proposito.
 *
 * A tabela `customers` nao tem endereco — nem coluna, nem contrato. Enquanto
 * elas ficavam no mapeamento, o lojista escolhia a coluna da planilha dele e o
 * dado era descartado em silencio: pior que nao oferecer, porque parece que
 * funcionou. Voltam quando houver onde guardar.
 */
const CAMPOS_PLANILHA = [
  {
    key: 'nome',
    label: 'Nome / Razao social',
    obrigatorio: true,
    reconhece: (c: string) => c.includes('nome') || c.includes('razao'),
  },
  {
    key: 'documento',
    label: 'CPF / CNPJ',
    obrigatorio: true,
    reconhece: (c: string) => c.includes('cpf') || c.includes('cnpj') || c.includes('documento'),
  },
  {
    key: 'celular',
    label: 'Celular',
    obrigatorio: false,
    reconhece: (c: string) => c.includes('tel') || c.includes('cel') || c.includes('whats'),
  },
  {
    key: 'email',
    label: 'E-mail',
    obrigatorio: false,
    reconhece: (c: string) => c.includes('mail'),
  },
]

/** Sem comprar ha mais que isto = cliente inativo. */
const INATIVO_APOS_DIAS = 60

type Filtro = 'todos' | 'pendencia' | 'inativos'

export default function ClientesLista() {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [importando, setImportando] = useState(false)

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const somenteDigitos = termo.replace(/\D/g, '')

    return todosClientes.filter((c) => {
      /* Busca por nome ou por documento — comparando so os digitos, para
         achar tanto quem digitou com pontuacao quanto sem. */
      if (termo) {
        const porNome = c.nome.toLowerCase().includes(termo)
        const porDoc =
          somenteDigitos.length > 0 && c.documento.replace(/\D/g, '').includes(somenteDigitos)
        if (!porNome && !porDoc) return false
      }

      if (filtro === 'pendencia') return pendenciaTotal(c.id) > 0

      if (filtro === 'inativos') {
        if (!c.ultimaCompra) return true
        return Math.abs(daysUntil(c.ultimaCompra)) > INATIVO_APOS_DIAS
      }

      return true
    })
  }, [busca, filtro])

  const comPendencia = todosClientes.filter((c) => pendenciaTotal(c.id) > 0)
  const totalPendente = comPendencia.reduce((acc, c) => acc + pendenciaTotal(c.id), 0)
  const inativos = todosClientes.filter(
    (c) => c.ultimaCompra && Math.abs(daysUntil(c.ultimaCompra)) > INATIVO_APOS_DIAS,
  )

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Base de clientes, pendencias e historico"
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportando(true)}>
              <IconUpload size={17} />
              Importar planilha
            </Button>
            <ButtonLink href="/app/clientes/novo">
              <IconPlus size={17} />
              Novo cliente
            </ButtonLink>
          </>
        }
      />

      <div className="statRow">
        <Stat label="Clientes cadastrados" value={String(todosClientes.length)} />
        <Stat
          label="Com pendencia"
          value={String(comPendencia.length)}
          hint={formatMoney(totalPendente)}
          tone={comPendencia.length ? 'warning' : 'neutral'}
        />
        <Stat
          label="Sem comprar ha 60 dias"
          value={String(inativos.length)}
          hint="vale mandar um Whats"
        />
      </div>

      <Card>
        {/* --- Busca e filtros --- */}
        <div className={styles.toolbar}>
          <label className={styles.busca}>
            <IconSearch size={17} />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou CPF/CNPJ"
              aria-label="Buscar cliente"
            />
          </label>

          <div className={styles.filtros} role="group" aria-label="Filtros">
            {(
              [
                ['todos', 'Todos'],
                ['pendencia', 'Com pendencia'],
                ['inativos', 'Sem compras recentes'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                className={`${styles.filtro} ${filtro === valor ? styles.filtroAtivo : ''}`}
                onClick={() => setFiltro(valor)}
                aria-pressed={filtro === valor}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* --- Lista --- */}
        {listaFiltrada.length === 0 ? (
          todosClientes.length === 0 ? (
            <EmptyState
              title="Nenhum cliente cadastrado"
              description="Cadastre o primeiro cliente ou traga sua base de uma planilha. Leva menos de um minuto."
              action={
                <div className={styles.emptyAcoes}>
                  <ButtonLink href="/app/clientes/novo">
                    <IconPlus size={17} />
                    Cadastrar o primeiro
                  </ButtonLink>
                  <Button variant="secondary" onClick={() => setImportando(true)}>
                    <IconUpload size={17} />
                    Importar planilha
                  </Button>
                </div>
              }
            />
          ) : (
            <EmptyState
              title="Nenhum cliente encontrado"
              description="Nenhum resultado para esta busca ou filtro. Tente outro termo."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setBusca('')
                    setFiltro('todos')
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          )
        ) : (
          <ul className={styles.lista}>
            {listaFiltrada.map((cliente) => {
              const pendente = pendenciaTotal(cliente.id)
              const vencido = temVencido(cliente.id)

              return (
                <li key={cliente.id}>
                  <Link href={`/app/clientes/${cliente.id}`} className={styles.item}>
                    <span className={styles.avatar} aria-hidden="true">
                      {cliente.nome.slice(0, 2).toUpperCase()}
                    </span>

                    <span className={styles.itemPrincipal}>
                      <strong>{cliente.nome}</strong>
                      <span>{cliente.documento}</span>
                    </span>

                    <span className={styles.itemContato}>
                      ({cliente.ddd}) {cliente.celular}
                    </span>

                    <span className={styles.itemUltima}>
                      {cliente.ultimaCompra
                        ? `Ultima: ${formatDate(cliente.ultimaCompra)}`
                        : 'Nunca comprou'}
                    </span>

                    <span className={styles.itemStatus}>
                      {pendente > 0 ? (
                        <Badge tone={vencido ? 'warning' : 'info'}>
                          {vencido ? 'Vencido' : 'Em aberto'} · {formatMoney(pendente)}
                        </Badge>
                      ) : (
                        <Badge tone="success">Em dia</Badge>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div className={styles.comandosWrap}>
        <ComandosWhatsApp comandos={COMANDOS_CLIENTES} />
      </div>

      {importando ? (
        <ImportarPlanilha
          titulo="Importar clientes"
          campos={CAMPOS_PLANILHA}
          /*
           * Vazio: a lista desta tela ainda vem de `mock-data`, e conferir
           * duplicidade contra dados de exemplo diria "ja cadastrado" para
           * quem nunca foi cadastrado. Repetido DENTRO da planilha continua
           * sendo detectado, e o servidor recusa o que precisar recusar.
           */
          chavesExistentes={[]}
          chaveDuplicidade={(v) => (v.documento ?? '').replace(/\D/g, '')}
          validar={(v) => {
            if (!v.nome?.trim()) return 'Nome vazio'
            const doc = (v.documento ?? '').replace(/\D/g, '')
            if (!doc) return 'CPF/CNPJ vazio'
            const ok =
              doc.length === 11 ? isValidCPF(doc) : doc.length === 14 ? isValidCNPJ(doc) : false
            return ok ? null : 'CPF/CNPJ invalido'
          }}
          onConfirmar={confirmarImportacaoClientes}
          onClose={() => setImportando(false)}
        />
      ) : null}
    </>
  )
}
