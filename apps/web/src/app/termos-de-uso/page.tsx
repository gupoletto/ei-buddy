import type { Metadata } from 'next'
import PaginaLegal, { Pendente } from '@/components/legal/PaginaLegal'
import { BRAND } from '@/content/site'

export const metadata: Metadata = {
  title: `Termos de Uso — ${BRAND}`,
  description: 'O que o sistema faz, o que e seu, e o que se espera de cada lado.',
}

/**
 * Termos de Uso — NR-085.
 *
 * ## Por que esta pagina e mais curta que a de privacidade
 *
 * Porque a de privacidade descreve o que o SISTEMA faz, e isso esta no codigo.
 * Termos de uso sao um CONTRATO: preco, prazo de pagamento, nivel de servico,
 * limite de responsabilidade, rescisao, foro. Nada disso da para inferir de
 * codigo, e quase tudo depende de decisoes de negocio abertas — a de cobranca
 * (DEC-010) e a de meio de pagamento (DEC-006 e DEC-015).
 *
 * Entao aqui esta o que ja e verdade e verificavel, e o resto esta marcado. Um
 * contrato inventado por quem escreve software seria pior que a lacuna
 * declarada: teria cara de clausula e nao valeria nada — e, no caso de limite
 * de responsabilidade, poderia prometer ao lojista uma protecao que ninguem se
 * comprometeu a dar.
 *
 * A pagina existe agora porque o formulario de cadastro exige o aceite e
 * linkava para 404: a pessoa marcava "li e aceito" apontando para nada.
 */
export default function TermosDeUso() {
  return (
    <PaginaLegal eyebrow="Documentos" titulo="Termos de Uso" atualizadoEm="2026-09-09">
      <Pendente>
        As condicoes comerciais — preco, forma e prazo de pagamento, nivel de servico, limite de
        responsabilidade, rescisao e foro — estao em elaboracao e serao publicadas aqui antes de o
        sistema entrar em operacao comercial. O que esta abaixo ja vale e descreve o funcionamento
        real do produto.
      </Pendente>

      <h2>O que o {BRAND} e</h2>

      <p>
        Um sistema de gestao para comercio: vendas, estoque, financeiro, emissao fiscal e
        relatorios, com um assistente que responde em linguagem natural. O acesso e por conta, e
        cada conta pertence a uma empresa.
      </p>

      <h2>Sua conta</h2>

      <ul>
        <li>
          Cada pessoa com acesso tem credencial propria e um papel, que define o que ela pode fazer.
          Credencial compartilhada tira de voce a capacidade de saber quem lancou o que — a trilha
          de auditoria registra a pessoa, nao o computador.
        </li>
        <li>
          Voce e responsavel por manter suas credenciais em sigilo e por revogar o acesso de quem
          sai da empresa. O sistema permite as duas coisas.
        </li>
        <li>
          Sair encerra a sessao no servidor. Se suspeitar que alguem obteve seu acesso, troque a
          senha e encerre as sessoes.
        </li>
      </ul>

      <h2>Os dados sao seus</h2>

      <p>
        O que voce lanca no sistema e seu. Isso tem consequencias praticas, e nao e apenas uma
        declaracao:
      </p>

      <ul>
        <li>
          Voce pode <strong>exportar tudo</strong> em formato aberto, quando quiser, com um
          manifesto que permite conferir se o pacote esta completo.
        </li>
        <li>
          A exportacao continua disponivel mesmo com a conta suspensa por falta de pagamento. Seus
          dados nao servem de garantia de cobranca.
        </li>
        <li>
          Nao vendemos seus dados, nao os cedemos para publicidade e nao os usamos para treinar
          modelos.
        </li>
      </ul>

      <p>
        Como cada dado e tratado esta na{' '}
        <a href="/politica-de-privacidade">Politica de Privacidade</a>.
      </p>

      <h2>Sua responsabilidade sobre os dados de terceiros</h2>

      <p>
        Ao cadastrar clientes, fornecedores e funcionarios, voce decide o que coletar e para que.
        Perante essas pessoas, quem responde e voce; nos tratamos esses dados por sua conta e ordem.
      </p>

      <p>
        O sistema oferece as ferramentas para voce cumprir essa obrigacao — exportar os dados de um
        cliente e anonimiza-los mediante pedido de exclusao, preservando o que a legislacao fiscal
        obriga a reter.
      </p>

      <h2>Emissao fiscal</h2>

      <p>
        O sistema transmite notas em seu nome, com as credenciais que voce fornecer. A
        responsabilidade pelo conteudo fiscal — dados cadastrais, classificacao, tributacao — e do
        contribuinte, ou seja, sua e do seu contador. Recusa da Secretaria da Fazenda e devolvida a
        voce com o motivo informado por ela.
      </p>

      <h2>Uso aceitavel</h2>

      <p>Nao e permitido usar o sistema para:</p>

      <ul>
        <li>
          atividade ilicita, ou emissao de documento fiscal que nao corresponda a operacao real;
        </li>
        <li>
          tentar acessar dados de outra empresa, ou contornar os controles de isolamento e de
          permissao;
        </li>
        <li>
          carga automatizada que degrade o servico para os demais, fora dos limites documentados.
        </li>
      </ul>

      <h2>Encerramento</h2>

      <p>
        Voce pode encerrar sua conta quando quiser. Antes de qualquer remocao, a exportacao completa
        fica disponivel.
      </p>

      <Pendente>
        Os prazos de aviso, de retencao apos o encerramento e as hipoteses de suspensao por nossa
        parte serao definidos junto com as condicoes comerciais.
      </Pendente>

      <h2>Mudancas nestes termos</h2>

      <p>
        Alteracoes relevantes serao avisadas dentro do sistema antes de passarem a valer. A data no
        topo diz qual versao voce esta lendo.
      </p>
    </PaginaLegal>
  )
}
