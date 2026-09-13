# EiBuddy — Wireframe 1

> Fonte: [ZapGestor_Apresentacao.pdf](../assets/ZapGestor_Apresentacao.pdf) · página 5 (módulos) e páginas 6–10 (campos e fluxos).
>
> Cada tela abaixo corresponde a **um módulo** da estrutura mapeada: Empresa, Clientes/CRM, Produtos, Vendas, Contas a Pagar, Contas a Receber, Bancos, Plano de Contas, Agenda.

---

## Chrome compartilhado

Todas as telas usam o mesmo casco. O assistente Zap (WhatsApp) é um painel lateral persistente: qualquer ação do ERP também pode ser disparada por mensagem.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  EiBuddy            Empresa: [ Barbearia Central ▼ ]    🔔  👤  [Zap ▸]     │
├────────────┬───────────────────────────────────────────────────┬─────────────┤
│            │                                                   │             │
│  Emp       │                                                   │  Zap        │
│  Empresa   │                                                   │  Assistente │
│            │              ÁREA DA TELA                         │             │
│  Cli       │              (módulo ativo)                       │  [chat]     │
│  Clientes  │                                                   │             │
│            │                                                   │  contexto   │
│  Prod      │                                                   │  da         │
│  Produtos  │                                                   │  conversa   │
│            │                                                   │             │
│  Vnd       │                                                   │             │
│  Vendas    │                                                   │             │
│            │                                                   │             │
│  Pag       │                                                   │             │
│  A pagar   │                                                   │             │
│            │                                                   │             │
│  Rec       │                                                   │             │
│  A receber │                                                   │             │
│            │                                                   │             │
│  Bco       │                                                   │             │
│  Bancos    │                                                   │             │
│            │                                                   │             │
│  PdC       │                                                   │             │
│  Plano de  │                                                   │             │
│  contas    │                                                   │             │
│            │                                                   │             │
│  Agd       │                                                   │             │
│  Agenda    │                                                   │             │
│            │                                                   │             │
└────────────┴───────────────────────────────────────────────────┴─────────────┘
```

Legenda do menu: **Emp** Empresa · **Cli** Clientes/CRM · **Prod** Produtos · **Vnd** Vendas · **Pag** Contas a Pagar · **Rec** Contas a Receber · **Bco** Bancos · **PdC** Plano de Contas · **Agd** Agenda.

---

## Mapa de telas (1 página = 1 módulo)

```
Emp ──► Empresa
Cli ──► Clientes / CRM
Prod ─► Produtos
Vnd ──► Vendas          (fluxo: cliente → carrinho → itens → pagamento → NF)
Pag ──► Contas a Pagar
Rec ──► Contas a Receber
Bco ──► Bancos
PdC ──► Plano de Contas
Agd ──► Agenda
```

---

## 1. Emp — Empresa

Base cadastral da empresa. Busca automática por CEP e CNPJ. Relatórios de faturamento, ranking e DRE saem daqui (e também via WhatsApp).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Empresa                                                                     │
│  Cadastro da empresa ·                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [ Dados ]  [ Comissões ]  [ Relatórios ]                                    │
│                                                                              │
│  ┌ Dados da empresa ─────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  CNPJ *          [ 00.000.000/0001-00        ]  [ Buscar CNPJ ]       │   │   Com o cnpj busca todos os outros dados (da onde? API?)
│  │  Razão social    [ __________________________ ]                       │   │
│  │  Nome fantasia   [ __________________________ ]                       │   │
│  │                                                                       │   │
│  │  IE              [ ________________ ]   IM  [ ________________ ]      │   │
│  │  Ramo            [ __________________________ ▼ ]                     │   │
│  │                                                                       │   │
│  │  DDD / celular   [ (  )  _____________ ]                              │   │
│  │                                                                       │   │
│  │  CEP *           [ ______-___ ]  [ Buscar CEP ]                       │   │ Com o cnpj busca todos os outros dados (da onde? API?)
│  │  Endereço        [ __________________________ ]  Nº [ ____ ]          │   │
│  │  Complemento     [ ________________ ]  Bairro [ ________________ ]    │   │
│  │  Cidade          [ ________________ ]  UF     [ __ ▼ ]                │   │
│  │                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Cupom atrelado as associações ────────────────────────────────────────┐   │
│  │              │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │   │
│                                                                              │
│                                      [ Cancelar ]  [ Salvar empresa ]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp**

- “Faturamento mês a mês dos últimos X meses”
- “Ranking de clientes e de produtos”
- “Gerar DRE”

---

## 2. Cli — Clientes / CRM

Cadastro de clientes com busca de CEP, CPF e CNPJ; importação em lote. Ações de CRM (última compra, inativos, envio de WhatsApp) na mesma tela.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Clientes / CRM                                                              │
│  Cadastro · importação · relacionamento                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Buscar  [ nome, CPF, CNPJ, celular ________ ]  [ Buscar CPF/CNPJ ]          │
│                                                                              │
│  [ + Novo cliente ]   [ Importar planilha ]   Filtro [ todos ▼ ]             │
│                                                                              │
│  ┌ Lista ───────────────────────────┐  ┌ Ficha ──────────────────────────┐   │
│  │                                  │  │                                 │   │
│  │  João Silva        (41) 99999…   │  │  CPF/CNPJ *  [ ______________ ] │   │
│  │  Maria Souza       123.456.789-00│  │              [ Buscar CPF/CNPJ] │   │
│  │  ► Pedro Alves     (41) 98888…   │  │  Nome *      [ ______________ ] │   │
│  │  …                               │  │  DDD/celular [ (  ) _________ ] │   │
│  │                                  │  │                                 │   │
│  │                                  │  │  CEP         [ ______-___ ]     │   │
│  │                                  │  │              [ Buscar CEP ]     │   │
│  │                                  │  │  Endereço    [ ______________ ] │   │
│  │                                  │  │  Nº [ ___ ]  Compl. [ _______ ] │   │
│  │                                  │  │  Bairro      [ ______________ ] │   │
│  │                                  │  │  Cidade      [ ____ ] UF [ __ ] │   │
│  │                                  │  │                                 │   │
│  │                                  │  │  Última compra   12/08/2026     │   │
│  │                                  │  │  Ticket médio    R$ 87,00       │   │
│  │                                  │  │                                 │   │
│  │                                  │  │  [ Salvar ]  [ Nova venda ]     │   │
│  └──────────────────────────────────┘  └─────────────────────────────────┘   │
│                                                                              │
│  ┌ CRM ──────────────────────────────────────────────────────────────────┐   │
│  │  [ Última compra do cliente ]                                         │   │
│  │  [ Clientes sem compra há muito tempo ]                               │   │
│  │  Enviar WhatsApp: [ ________________________________ ]  [ Enviar ]    │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp**

- “Cadastra um cliente novo para mim”
- “Quando foi a última compra do cliente X”
- “Quais clientes não compram há muito tempo”
- “Envie um Whats para o cliente X dizendo...”

---

## 3. Prod — Produtos

Cadastro com código, descrição, imagem, NCM, custos e preços. Categoria e fornecedor em tabelas próprias. Inteligência de reposição e rentabilidade.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Produtos                                                                    │
│  Catálogo · reposição · rentabilidade                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Buscar  [ descrição, EAN, NCM ________ ]  [ Buscar EAN ]  [ Buscar NCM ]    │
│                                                                              │
│  [ + Novo produto ]   [ Importar planilha ]                                  │
│  Categoria [ todas ▼ ]   Fornecedor [ todos ▼ ]                              │
│                                                                              │
│  ┌ Lista ───────────────────────────┐  ┌ Ficha ──────────────────────────┐   │
│  │  Cód.  Descrição        Preço    │  │  Código *     [ ____________ ]  │   │
│  │  001   Corte masculino  45,00    │  │  Descrição *  [ ____________ ]  │   │
│  │  ►002  Pomada           32,00    │  │                                 │   │
│  │  003   Shampoo          28,00    │  │  [  imagem  ]  [ Enviar foto ]  │   │
│  │                                  │  │                                 │   │
│  │                                  │  │  NCM          [ ____________ ]  │   │
│  │                                  │  │               [ Buscar NCM ]    │   │
│  │                                  │  │  EAN          [ ____________ ]  │   │
│  │                                  │  │               [ Buscar EAN ]    │   │
│  │                                  │  │                                 │   │
│  │                                  │  │  Custo        [ R$ _________ ]  │   │
│  │                                  │  │  Venda        [ R$ _________ ]  │   │
│  │                                  │  │  Margem       38%               │   │
│  │                                  │  │                                 │   │
│  │                                  │  │  Categoria    [ __________ ▼ ]  │   │
│  │                                  │  │               [ + nova ]        │   │
│  │                                  │  │  Fornecedor   [ __________ ▼ ]  │   │
│  │                                  │  │               [ + novo ]        │   │
│  │                                  │  │                                 │   │
│  │                                  │  │  [ Salvar produto ]             │   │
│  └──────────────────────────────────┘  └─────────────────────────────────┘   │
│                                                                              │
│  ┌ Inteligência ─────────────────────────────────────────────────────────┐   │
│  │  [ Sem venda há X tempo ]   [ Mais vendidos ]   [ Mais lucrativos ]   │   │
│  │  [ Precisam de reposição ]                                            │   │
│  │  [ Whats para quem já comprou este produto ]                          │   │
│  │  [ Gerar link do catálogo e enviar ao cliente ]                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp**

- “Quais produtos estão sem venda há X tempo”
- “Ranking de produtos mais vendidos”
- “Quais produtos são mais lucrativos”
- “Quais produtos precisam de reposição”
- “Envie um Whats para quem já comprou este produto”
- “Gerar link do catálogo e enviar para o cliente”

---

## 4. Vnd — Vendas

Fluxo único: cliente → carrinho (com leitor de código de barras) → ajuste de itens → pagamento → emissão fiscal. No fechamento, o sistema calcula custo, imposto e tarifa de cartão e lança o valor líquido em contas a receber.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Vendas                                                                      │
│  ① Cliente → ② Carrinho → ③ Itens → ④ Pagamento → ⑤ Fiscal                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [ ● 1 Cliente ]──[ ○ 2 Carrinho ]──[ ○ 3 Itens ]──[ ○ 4 Pagto ]──[ ○ 5 NF ] │
│                                                                              │
│  ┌ 1. Selecionar cliente ────────────────────────────────────────────────┐   │
│  │  ( ) Venda avulsa                                                     │   │
│  │  (•) Cliente   [ buscar nome / CPF / celular ________ ]               │   │
│  │                João Silva  ·  (41) 99999-9999                         │   │
│  │                                                      [ Continuar → ]  │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ 2. Montar carrinho ───────────────────────────────────────────────────┐   │
│  │  Catálogo  [ buscar / EAN ________ ]     [ 📷 Ler código de barras ]  │   │
│  │                                                                       │   │
│  │  Corte masculino     R$ 45,00     [ + ]                               │   │
│  │  Pomada              R$ 32,00     [ + ]                               │   │
│  │                                                                       │   │
│  │  Carrinho:  Corte x1  45,00  ·  Pomada x1  32,00                      │   │
│  │  Subtotal R$ 77,00                               [ Continuar → ]      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ 3. Ajustar itens ─────────────────────────────────────────────────────┐   │
│  │  Item              Qtd   Unit.    Desc.    Total                      │   │
│  │  Corte masculino    1    45,00    [ 0 ]    45,00   [ editar ] [ x ]   │   │
│  │  Pomada             1    32,00    [ 0 ]    32,00   [ editar ] [ x ]   │   │
│  │                                                                       │   │
│  │  [ Enviar PDF ]   [ Cancelar venda ]                                  │   │
│  │  Total R$ 77,00                                  [ Continuar → ]      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ 4. Pagamento ─────────────────────────────────────────────────────────┐   │
│  │  ( ) Débito   ( ) Crédito   ( ) Pix   ( ) Dinheiro   ( ) Carteira     │   │
│  │                                                                       │   │
│  │  Bruto          R$ 77,00                                              │   │
│  │  Custo itens    R$ 22,00                                              │   │
│  │  Imposto        R$  4,10                                              │   │
│  │  Tarifa cartão  R$  1,80                                              │   │
│  │  Líquido a receber  R$ 71,10   → lança em Contas a Receber            │   │
│  │                                                      [ Continuar → ]  │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ 5. Emitir fiscal ─────────────────────────────────────────────────────┐   │
│  │  ( ) NFC-e   Nota fiscal de consumidor eletrônica                     │   │
│  │  ( ) NFS-e   Nota fiscal de serviço eletrônica                        │   │
│  │  ( ) Sem nota                                                         │   │
│  │                                                                       │   │
│  │                              [ Voltar ]  [ Finalizar venda ]          │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp** — lançar, consultar e estornar vendas (ex.: “lançar uma venda”, estorno).

---

## 5. Pag — Contas a Pagar

Controle de saídas com baixa total, parcial ou estorno. Filtros por vencimento e resumo por plano de contas.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Contas a Pagar                                                              │
│  Baixa total · parcial · estorno                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Filtro  [ hoje ▼ ]  até  [ __/__/____ ]   Plano  [ todos ▼ ]                │
│  Banco   [ todos ▼ ]                                                         │
│                                                                              │
│  [ + Nova conta ]                                                            │
│                                                                              │
│  ┌ Lista ────────────────────────────────────────────────────────────────┐   │
│  │  Venc.      Fornecedor      Plano         Banco      Valor    Status  │   │
│  │  24/08      Fornecedor A    Mercadoria    Itaú     320,00   em aberto │   │
│  │  ►24/08     Aluguel         Custo fixo    Itaú     950,00   em aberto │   │
│  │  01/09      Energia         Utilidades    Nubank   180,00   em aberto │   │
│  │                                                                       │   │
│  │  Total a pagar no filtro: R$ 1.450,00                                 │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Lançamento / baixa ───────────────────────────────────────────────────┐   │
│  │  Banco *         [ Itaú                    ▼ ]                        │   │
│  │  Plano de contas [ Custo fixo              ▼ ]                        │   │
│  │  Fornecedor      [ Aluguel                 ▼ ]                        │   │
│  │  Vencimento *    [ 24/08/2026 ]                                       │   │
│  │  Valor *         [ R$ 950,00 ]                                        │   │
│  │  Descrição       [ Aluguel agosto ________________ ]                  │   │
│  │                                                                       │   │
│  │  [ Salvar ]  [ Baixa total ]  [ Baixa parcial ]  [ Estornar ]         │   │
│  │                                                                       │   │
│  │  Baixa parcial: valor  [ R$ ______ ]                                  │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Resumo ───────────────────────────────────────────────────────────────┐   │
│  │  [ O que há para pagar hoje / até uma data ]                          │   │
│  │  [ Total a pagar resumido por plano de contas ]                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp**

- “O que há para pagar hoje / até uma data”
- “Qual o total a pagar, resumido por plano de contas”
- “Baixa esta conta para mim”

---

## 6. Rec — Contas a Receber

Controle de entradas geradas pelas vendas. Baixa total, parcial ou estorno. Cobrança por WhatsApp para em aberto e vencidos.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Contas a Receber                                                            │
│  Baixa total · parcial · estorno · cobrança                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Filtro  [ em aberto ▼ ]  [ vencidos ]  [ hoje ]  até  [ __/__/____ ]        │
│  Banco   [ todos ▼ ]   Cliente  [ todos ▼ ]                                  │
│                                                                              │
│  [ + Novo recebível ]                                                        │
│                                                                              │
│  ┌ Lista ────────────────────────────────────────────────────────────────┐   │
│  │  Emissão  Venc.    Cliente       Tipo     Banco    Valor     Status   │   │
│  │  20/08    24/08    João Silva    Pix      Itaú    71,10    em aberto  │   │
│  │  ►18/08   18/08    Maria Souza   Crédito  Itaú    45,00    vencido    │   │
│  │  12/08    12/08    Pedro Alves   Dinheiro Itaú    32,00    baixado    │   │
│  │                                                                       │   │
│  │  A receber no filtro: R$ 116,10                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Lançamento / baixa ───────────────────────────────────────────────────┐   │
│  │  Banco *      [ Itaú                     ▼ ]                          │   │
│  │  Cliente *    [ Maria Souza              ▼ ]                          │   │
│  │  Emissão      [ 18/08/2026 ]   Vencimento [ 18/08/2026 ]              │   │
│  │  Referente a  [ Venda #1042 ________________ ]                        │   │
│  │  Tipo         [ Crédito ▼ ]  Débito · Crédito · Pix · Dinheiro · Cart.│   │
│  │  Valor *      [ R$ 45,00 ]                                            │   │
│  │                                                                       │   │
│  │  Origem da venda: líquido já descontou imposto e tarifa de cartão     │   │
│  │                                                                       │   │
│  │  [ Salvar ]  [ Baixa total ]  [ Baixa parcial ]  [ Estornar ]         │   │
│  │  [ Enviar cobrança por WhatsApp ]                                     │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Cobrança e ranking ───────────────────────────────────────────────────┐   │
│  │  [ O que há a receber — enviar cobrança por Whats ]                   │   │
│  │  [ O que está vencido — enviar cobrança por Whats ]                   │   │
│  │  [ Ranking de recebimentos ]                                          │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp**

- “O que há a receber — enviar cobrança por Whats”
- “O que está vencido — enviar cobrança por Whats”
- “Ranking de recebimentos”
- “Baixa para mim”

---

## 7. Bco — Bancos

Cadastro de contas e conciliação de saldo via Open Finance. Ponto de consulta do saldo atual.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Bancos                                                                      │
│  Contas · Open Finance · conciliação                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Saldo consolidado   R$ 4.820,00          [ Qual é o saldo atual? ]          │
│                                                                              │
│  [ + Novo banco ]                                                            │
│                                                                              │
│  ┌ Contas ───────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  ┌ Itaú ─────────────────────────────────────────────── ► selecionado┐│   │
│  │  │  Nome           Itaú PJ                                           ││   │
│  │  │  Integração     Open Finance   [ Conectado ✓ ]  [ Reconectar ]    ││   │
│  │  │  Saldo concil.  R$ 3.100,00                                       ││   │
│  │  │  Última concil. hoje, 18:40                                       ││   │
│  │  └───────────────────────────────────────────────────────────────────┘│   │
│  │                                                                       │   │
│  │  ┌ Nubank ───────────────────────────────────────────────────────────┐│   │
│  │  │  Nome           Nubank                                            ││   │
│  │  │  Integração     Open Finance   [ Conectar ]                       ││   │
│  │  │  Saldo concil.  R$ 1.720,00                                       ││   │
│  │  └───────────────────────────────────────────────────────────────────┘│   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Cadastro / conciliação ───────────────────────────────────────────────┐   │
│  │  Nome do banco *  [ __________________________ ]                      │   │
│  │  [ ] Integração via Open Finance                                      │   │
│  │                                                                       │   │
│  │  [ Salvar ]   [ Conciliar saldo agora ]                               │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp**

- “Qual é o saldo atual?”

---

## 8. PdC — Plano de Contas

Estrutura de contas do negócio. Custos fixos vinculados (nome, plano, banco, dia de vencimento, valor) geram contas a pagar automaticamente.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Plano de Contas                                                             │
│  Estrutura · custos fixos · geração automática de contas a pagar             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [ + Nova conta ]   [ + Novo custo fixo ]                                    │
│                                                                              │
│  ┌ Plano (por nome) ──────────────┐  ┌ Custos fixos vinculados ──────────┐   │
│  │                                │  │                                   │   │
│  │  Receitas                      │  │  Nome            Aluguel          │   │
│  │    Vendas                      │  │  Plano           Custo fixo       │   │
│  │  Despesas                      │  │  Banco           Itaú             │   │
│  │    ► Custo fixo                │  │  Dia vencimento  10               │   │
│  │    Mercadoria                  │  │  Valor           R$ 950,00        │   │
│  │    Utilidades                  │  │                                   │   │
│  │    Tarifas                     │  │  Nome            Energia          │   │
│  │    Impostos                    │  │  Plano           Utilidades       │   │
│  │                                │  │  Banco           Nubank           │   │
│  │                                │  │  Dia vencimento  15               │   │
│  │                                │  │  Valor           R$ 180,00        │   │
│  │                                │  │                                   │   │
│  └────────────────────────────────┘  └───────────────────────────────────┘   │
│                                                                              │
│  ┌ Cadastro ─────────────────────────────────────────────────────────────┐   │
│  │  Nome do plano *     [ Custo fixo ______________ ]                    │   │
│  │                                                                       │   │
│  │  Custo fixo — nome   [ __________________________ ]                   │   │
│  │  Plano de contas     [ Custo fixo              ▼ ]                    │   │
│  │  Banco               [ Itaú                    ▼ ]                    │   │
│  │  Dia de vencimento   [ 10 ]                                           │   │
│  │  Valor               [ R$ 950,00 ]                                    │   │
│  │                                                                       │   │
│  │  [ Salvar ]   [ Gerar contas a pagar automaticamente ]                │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Análise ──────────────────────────────────────────────────────────────┐   │
│  │  [ Ranking de gastos ]                                                │   │
│  │  [ Gastos mês a mês ]                                                 │   │
│  │  [ Gasto de um plano de contas específico ]                           │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Via WhatsApp**

- “Ranking de gastos”
- “Gastos mês a mês”
- “Gasto de um plano de contas específico”
- “Gerar contas a pagar automaticamente”

---

## 9. Agd — Agenda

Módulo mapeado na página 5 (e confirmado na página 15). Calendário operacional do lojista, integrado a clientes e, quando fizer sentido, a vendas.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Agenda                                                                      │
│  Compromissos do negócio · vínculo com cliente                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [ ◀ ]  Agosto 2026  [ ▶ ]     Visão  [ semana ▼ ]  dia · semana · mês       │
│                                                                              │
│  [ + Novo compromisso ]                                                      │
│                                                                              │
│  ┌ Semana ───────────────────────────────────────────────────────────────┐   │
│  │         Seg 24     Ter 25     Qua 26     Qui 27     Sex 28            │   │
│  │  09:00  João       —          Maria      —          Pedro             │   │
│  │         Corte                 Barba                 Corte + barba     │   │
│  │  10:00  —          Ana        —          —          —                 │   │
│  │                    Coloração                                          │   │
│  │  11:00  ► João     —          —          —          —                 │   │
│  │         retorno                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌ Compromisso ──────────────────────────────────────────────────────────┐   │
│  │  Título *     [ Retorno João Silva ______________ ]                   │   │
│  │  Cliente      [ João Silva                     ▼ ]  [ ver ficha ]     │   │
│  │  Data *       [ 24/08/2026 ]   Início [ 11:00 ]  Fim [ 11:30 ]        │   │
│  │  Local / obs  [ ________________________________ ]                    │   │
│  │  Lembrete     [ 30 min antes ▼ ]                                      │   │
│  │                                                                       │   │
│  │  [ Salvar ]  [ Converter em venda ]  [ Enviar Whats ao cliente ]      │   │
│  │  [ Cancelar compromisso ]                                             │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

> A apresentação lista **Agenda** como módulo definido, sem detalhar campos nas páginas 6–10. Os campos acima são o mínimo operacional para a tela existir no mesmo padrão das demais; a especificação fina fica em aberto.

---

## Painel Zap (todas as telas)

O painel direito é o mesmo em todas as páginas. Exemplos da apresentação (página 11):

```
┌─────────────────────────────┐
│  Zap · Assistente           │
│  contexto da conversa ligado│
├─────────────────────────────┤
│                             │
│  você                       │
│  cadastra o cliente João    │
│  Silva, 41999999999         │
│                             │
│  zap                        │
│  Cliente João Silva         │
│  cadastrado!                │
│                             │
│  você                       │
│  o que tenho pra pagar hoje?│
│                             │
│  zap                        │
│  Você tem 2 contas hoje:    │
│  Fornecedor A R$ 320        │
│  e Aluguel R$ 950.          │
│                             │
│  você                       │
│  gera o link do catálogo    │
│  e manda pro João           │
│                             │
│  [ mensagem ________ ] [➤]  │
└─────────────────────────────┘
```

O assistente já cobre, por texto: cadastro de clientes, produtos e fornecedores; lançar e estornar vendas; consultar contas a pagar e a receber; enviar cobranças e catálogos; relatórios (ranking, DRE, faturamento mensal); memória de contexto.

---

## Relação módulo × tela × origem no PDF

| Módulo (pág. 5)      | Tela                 | Detalhe no PDF                      |
| -------------------- | -------------------- | ----------------------------------- |
| Emp Empresa          | 1. Empresa           | pág. 6                              |
| Cli Clientes / CRM   | 2. Clientes / CRM    | pág. 6                              |
| Prod Produtos        | 3. Produtos          | pág. 7                              |
| Vnd Vendas           | 4. Vendas (5 passos) | pág. 8 e 12                         |
| Pag Contas a Pagar   | 5. Contas a Pagar    | pág. 9                              |
| Rec Contas a Receber | 6. Contas a Receber  | pág. 9                              |
| Bco Bancos           | 7. Bancos            | pág. 10                             |
| PdC Plano de Contas  | 8. Plano de Contas   | pág. 10                             |
| Agd Agenda           | 9. Agenda            | pág. 5 e 15 (sem campos detalhados) |
