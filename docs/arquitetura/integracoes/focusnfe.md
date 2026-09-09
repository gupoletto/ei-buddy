# Focus NFe — contrato da integração

O que **nós** mandamos e o que **nós** gravamos. Não é a documentação da Focus
(CT-e, MDF-e, NFCom e o resto estão fora). Fonte oficial:
[doc.focusnfe.com.br](https://doc.focusnfe.com.br/reference/introducao.md).

Sequência (cadastro síncrono, tokens, emissão, webhooks, mapa de rotas):
[`fluxo-focus.md`](fluxo-focus.md).

Decisão: [ADR-0002](../../decisoes/adr/0002-focus-nfe.md) (origem
[DEC-004](../../decisoes/README.md#dec-004)). Elegibilidade:
[DEC-017](../../decisoes/README.md#dec-017).

A SEFAZ não é sistema externo nosso. A Focus assina, transmite e devolve o
resultado. Persistimos o espelho útil para a tela da venda e para o prazo legal
de XML.

---

## Ambiente e autenticação

| Ambiente    | URL base                              |
| ----------- | ------------------------------------- |
| Homologação | `https://homologacao.focusnfe.com.br` |
| Produção    | `https://api.focusnfe.com.br`         |

Rotas no prefixo `/v2`. HTTP Basic: **usuário** = token da empresa na Focus,
**senha** vazia.

No primeiro recorte usamos o **token da conta plataforma** (nossa integração
multi-CNPJ) para `POST /v2/empresas`, e o **token da empresa emitente** (devolvido
no cadastro) para emitir NFC-e e NFS-e Nacional daquele CNPJ. Tokens de emitente
ficam no gerenciador de segredos, referenciados por
`company_integrations.fiscal_token_secret_ref` — nunca no Postgres em claro, nunca no log.

`ref` da nota: alfanumérico, único por token. Usamos o `id` da nossa `invoices`
(sem hífen) ou um prefixo estável `inv` + id compacto. NFC-e e NFS-e **não**
compartilham o mesmo `ref` se forem documentos distintos; cada linha de
`invoices` tem o seu.

---

## Operações que usamos

| Operação                     | Método                   | Quando                                                                          |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Cadastrar/atualizar emitente | `POST/PUT /v2/empresas`  | Jornada G — empresa pronta para NF                                              |
| Emitir NFC-e                 | `POST /v2/nfce?ref=`     | Depois da venda gravada (fila `invoice-issue`)                                  |
| Consultar NFC-e              | `GET /v2/nfce/{ref}`     | Timeout, reconciliação, webhook perdido                                         |
| Cancelar NFC-e               | `DELETE /v2/nfce/{ref}`  | Dentro do prazo legal, com justificativa                                        |
| Emitir NFS-e Nacional        | `POST /v2/nfsen?ref=`    | Depois da venda gravada (mesma fila; tipo `nfse`)                               |
| Consultar NFS-e Nacional     | `GET /v2/nfsen/{ref}`    | Assíncrona — autorização vem depois                                             |
| Cancelar NFS-e Nacional      | `DELETE /v2/nfsen/{ref}` | Só se `autorizado`                                                              |
| Webhook                      | cadastrado na Focus      | `nfsen` (autorização / rejeição / cancelamento); NFC-e só contingência/consulta |

**Não usamos neste recorte:** NF-e (modelo 55), NFS-e municipal (`/v2/nfse`),
CT-e, MDF-e, NFCom, DCe, NFGás, NF-e recebidas, comunicador offline.

NFS-e Nacional (`/v2/nfsen`, DPS): mesmo `invoices.kind = nfse`. Não duplicar
tabela. Não ligar `habilita_nfse` junto com `habilita_nfsen_producao`.

O passo de tela (escolher NFC-e, NFS-e ou sem nota) **entra no recorte**; o
layout ainda será definido. O contrato abaixo não depende disso.

**Gate (RF-146):** `POST /v2/empresas` com flags de emissão, upload de A1/CSC e
a fila `invoice-issue` só correm se `isEligibleForFiscalEmission` for verdadeiro.
Inelegível usa o ERP; a API nossa recusa a Focus com mensagem de produto, não
de provedor.

---

## Empresa na Focus — o que enviamos

Espelha o cadastro em `/app/empresa` + certificado. Campos mínimos para NFC-e
e NFS-e Nacional:

| Campo Focus                                                               | Origem nossa                                                                                                                                              | Persistimos?                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `nome`                                                                    | `companies.legal_name`                                                                                                                                    | sim (cadastro)                      |
| `nome_fantasia`                                                           | `companies.trade_name`                                                                                                                                    | sim                                 |
| `cnpj`                                                                    | `companies.cnpj`                                                                                                                                          | sim                                 |
| `inscricao_estadual`                                                      | `companies.state_registration`                                                                                                                            | sim                                 |
| `inscricao_municipal`                                                     | `companies.municipal_registration`                                                                                                                        | sim                                 |
| `logradouro`, `numero`, `complemento`, `bairro`, `cep`, `municipio`, `uf` | `companies.street`, `street_number`, `complement`, `neighborhood`, `postal_code`, `city`, `state`                                                         | sim                                 |
| `email`, `telefone`                                                       | `companies`                                                                                                                                               | sim                                 |
| `regime_tributario`                                                       | `companies.tax_regime` — **só se elegível**: `mei`→**4**, `simples_nacional`→**1**. Nunca enviamos `3` (Normal). Sublimite Focus (`2`) fora deste recorte | sim o enum nosso                    |
| `habilita_nfce`                                                           | `true` quando o lojista pede NFC-e **e** é elegível                                                                                                       | sim `company_integrations.fiscal_nfce_enabled`    |
| `habilita_nfsen_homologacao` / `habilita_nfsen_producao`                  | `true` quando o lojista pede NFS-e Nacional **e** é elegível                                                                                              | sim `company_integrations.fiscal_nfse_enabled`    |
| `arquivo_certificado_base64`                                              | upload `.pfx`/`.p12` no request                                                                                                                           | **não**                             |
| `senha_certificado`                                                       | campo senha do upload                                                                                                                                     | **não**                             |
| `csc_nfce_producao` / `csc_nfce_homologacao`                              | formulário Empresa                                                                                                                                        | **não** o valor; sim `fiscal_has_nfce_csc` |
| `id_token_nfce_producao` / `_homologacao`                                 | formulário Empresa                                                                                                                                        | **não** o valor; sim `fiscal_has_nfce_csc` |

O A1 **transita** no nosso backend e segue para a Focus. Resposta 422
(senha, CNPJ, vencido) vira mensagem na tela; nada de arquivo fica gravado.

Consulta CNPJ/CEP para autofill pode usar as APIs acessórias da Focus
(`/v2/cnpjs`, `/v2/ceps`) atrás da nossa API — o browser não chama a Focus.
A consulta **pode sugerir** MEI vs Simples; **não** informa Híbrido.

`companies.tax_rate` (alíquota da venda) **não** vai no POST da Focus.

---

## Empresa na Focus — o que recebemos e gravamos

| Campo / fato Focus                                                        | Coluna / uso                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| id da empresa na Focus                                                    | `company_integrations.fiscal_company_id`                  |
| token do emitente                                                         | secret ref, não coluna em claro                   |
| certificado aceito                                                        | `company_integrations.fiscal_certificate_status = valid`        |
| validade extraída pela Focus ou pelo parse na borda **sem guardar o PFX** | `company_integrations.fiscal_certificate_expires_at`            |
| rejeição de A1                                                            | `fiscal_certificate_status = rejected` + última mensagem |
| `habilita_nfce` efetivo                                                   | `company_integrations.fiscal_nfce_enabled`                      |
| `habilita_nfsen_*` efetivo                                                | `company_integrations.fiscal_nfse_enabled`                      |

Sem certificado `valid`, a venda fecha **sem** enfileirar nota (`not_configured`).
NFC-e ainda exige CSC. NFS-e Nacional ainda exige código de tributação nacional
(e NBS) no item; IM só se o município cadastrou no emissor nacional.

---

## NFC-e — o que enviamos

Montado em `packages/fiscal` a partir da venda já persistida. A Focus documenta
os campos em [Emitir NFC-e](https://doc.focusnfe.com.br/reference/emitir_nfce.md).
Mínimo que o nosso domínio precisa ter para montar o JSON:

| Dado                    | Onde vive                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `ref`                   | id da `invoices`                                                                             |
| emitente                | cadastro da empresa (já na Focus)                                                            |
| destinatário            | `customers` se a venda tiver cliente com documento; NFC-e admite consumidor não identificado |
| itens                   | `sale_items` (snapshot de `ncm`) + CFOP/CSOSN **padrão do adapter** MEI/Simples              |
| pagamentos              | `payments` (forma mapeada para o código Focus)                                               |
| totais                  | já calculados em `domain` na venda                                                           |
| `forma_emissao=offline` | só se a Focus/contingência estiver habilitada na empresa                                     |

Não reimplementamos o XML. Não “transmitimos à SEFAZ”.

NFC-e na Focus é **síncrona** no caso feliz: a resposta da emissão já traz
autorização ou rejeição. Timeout ou `pending_operation` → consultar / webhook.

---

## NFC-e — o que recebemos e gravamos em `invoices`

`kind = nfce`. Contingência (`contingency`) só existe neste tipo.

| Campo Focus                                                               | Coluna                                        |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| `status` (`autorizado`, `erro_autorizacao`, `processando_autorizacao`, …) | `status` (nosso enum mapeado)                 |
| `status_sefaz`                                                            | `provider_status_code`                        |
| `mensagem_sefaz`                                                          | `provider_message`                            |
| `chave_nfe`                                                               | `access_key`                                  |
| `numero` / `serie`                                                        | `number`, `series`                            |
| `caminho_xml_nota_fiscal`                                                 | `xml_path` (e cópia no object storage)        |
| URL/caminho DANFCe, QR Code                                               | `danfe_url`, `qr_code`                        |
| corpo bruto relevante                                                     | `provider_payload` jsonb (sem dado de cartão) |

Estados que a tela da venda **compõe** (não um `sales.status` fiscal):

| Lojista vê         | `invoices.status`              |
| ------------------ | ------------------------------ |
| Sem NF configurada | sem linha, ou `not_configured` |
| Aguardando Focus   | `processing`                   |
| Autorizada         | `authorized`                   |
| Rejeitada          | `rejected` (venda permanece)   |
| Contingência       | `contingency`                  |
| Cancelada          | `cancelled`                    |

Cancelamento NFC-e: `DELETE` na Focus **antes** de estornar estoque/recebível
([fluxos](../fluxos.md#cancelamento-de-venda-com-nota-emitida)).

---

## NFS-e Nacional — o que enviamos

Montado em `packages/fiscal` a partir da venda já persistida. Campos na Focus:
[Emitir DPS nacional](https://doc.focusnfe.com.br/reference/emitir_dps_nacional.md).

Pré-validação é **síncrona** (campos, prestador). Autorização no Ambiente
Nacional é **assíncrona** — a venda já fechou; a nota fica `processing` até
webhook `nfsen` ou `GET /v2/nfsen/{ref}`.

| Dado                                           | Onde vive                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ref`                                          | id da `invoices`                                                                                    |
| `cnpj_prestador` / `codigo_municipio_emissora` | `companies` (+ `city_ibge_code`)                                                                    |
| `inscricao_municipal`                          | `companies` — omitir se o município **não** cadastrou a IM no emissor nacional                      |
| `tomador`                                      | `customers` — Nacional **admite** sem tomador; se a venda tiver cliente, manda documento e endereço |
| `valor_servico`                                | totais da venda (itens de serviço)                                                                  |
| `codigo_tributacao_nacional_iss`               | snapshot em `sale_items` (cadastro em `products`)                                                   |
| `codigo_nbs`                                   | snapshot; só se o município/serviço exigir                                                          |
| `descricao_servico`                            | descrição dos itens / da venda                                                                      |
| `codigo_municipio_prestacao`                   | IBGE da prestação (`companies` ou override na venda)                                                |

Não reimplementamos o XML do Ambiente Nacional. Contingência
`forma_emissao=offline` é **só NFC-e**; NFS-e espera na fila até o nacional
responder.

Município aderente pode tornar obrigatório um campo opcional do schema
(ex.: código municipal). Exceção de cidade não vira coluna nossa até aparecer
no recorte de um cliente real.

---

## NFS-e Nacional — o que recebemos e gravamos em `invoices`

Mesma tabela da NFC-e, com `kind = nfse`.

| Campo Focus                                                               | Coluna                                     |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| `status` (`processando_autorizacao`, `autorizado`, `erro_autorizacao`, …) | `status`                                   |
| mensagem / código do Ambiente Nacional                                    | `provider_status_code`, `provider_message` |
| `numero` / `codigo_verificacao`                                           | `number` (e payload)                       |
| `caminho_xml_nota_fiscal` / `url_danfse`                                  | `xml_path`, `danfe_url`                    |
| corpo bruto relevante                                                     | `provider_payload` jsonb                   |

`access_key` (44 dígitos) é típico de NFC-e; em NFS-e Nacional a tela mostra
número e código de verificação.

Cancelamento: só com status autorizado. Cidades aderentes ao emissor nacional
aceitam cancelamento por webservice.

---

## Webhooks

Cadastrar gatilhos na Focus para `nfsen` (e, se usarmos, `nfsen_recebida`).
NFC-e: só `nfce_contingencia` / `nfce_consulta_automatica` se habilitados.
Validar autenticidade conforme a documentação deles. Responder 200 e processar
na fila `webhook-process`. Idempotência pela `ref` + status: autorização tardia
não duplica nota.

---

## Variáveis de ambiente

| Variável                  | Uso                                        |
| ------------------------- | ------------------------------------------ |
| `FISCAL_PROVIDER`         | `fake` \| `focusnfe`                       |
| `FOCUSNFE_BASE_URL`       | homologação ou produção                    |
| `FOCUSNFE_PLATFORM_TOKEN` | token da integração (cadastro de empresas) |
| `FISCAL_ENVIRONMENT`      | `homologacao` \| `producao`                |

Token por emitente não é env global: é segredo por `company_id`.

Detalhe da matriz: [`ambientes.md`](../../engenharia/ambientes.md).

---

## Adapter

`packages/fiscal` implementa `InvoiceIssuer` + porta de cadastro de emitente
(`upsertFocusCompany`, `uploadCertificate`). Modo `fake` cobre autorização,
rejeição, certificado vencido, timeout e NFS-e Nacional em `processing`.

## Documentos relacionados

- [`fluxo-focus.md`](fluxo-focus.md) — fluxo no tempo e catálogo de rotas
- [ADR-0002](../../decisoes/adr/0002-focus-nfe.md)
- [`packages/fiscal`](../../../packages/fiscal/README.md)
- [`dados.md`](../dados.md)
- [Dump bruto antigo](https://doc.focusnfe.com.br/llms.txt) — não versionar de novo no repo
