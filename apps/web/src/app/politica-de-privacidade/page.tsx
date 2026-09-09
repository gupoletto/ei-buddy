import type { Metadata } from 'next'
import PaginaLegal, { Pendente } from '@/components/legal/PaginaLegal'
import { BRAND } from '@/content/site'

export const metadata: Metadata = {
  title: `Politica de Privacidade — ${BRAND}`,
  description:
    'Quais dados o sistema trata, com qual base legal, por quanto tempo, e como exercer seus direitos.',
}

/**
 * Politica de Privacidade — NR-085, LGPD.
 *
 * ## O que esta pagina e, e o que ela nao e
 *
 * O conteudo abaixo descreve o que o SISTEMA faz, e isso da para afirmar com
 * precisao porque esta no codigo: quais tabelas existem, o que cada uma guarda,
 * o que a exportacao cobre (`exportCollectionSchema`), o que a anonimizacao
 * preserva e por que (`anonymize-customer.ts`), como a sessao e guardada
 * (NR-083), como o isolamento entre lojas funciona (ADR-0001).
 *
 * O que NAO esta aqui, e esta marcado com `Pendente`, e o que nao da para
 * inferir de codigo nenhum: razao social e CNPJ do controlador, contato do
 * encarregado (art. 41), prazo de retencao alem do minimo fiscal, e a lista
 * final de operadores — que depende de decisoes de fornecedor ainda abertas.
 *
 * Preencher esses campos por conta propria produziria um documento com cara de
 * oficial e conteudo inventado, que e pior que a lacuna visivel: ninguem
 * desconfia de um documento que parece completo.
 *
 * ## A distincao que sustenta o resto
 *
 * Ha dois papeis diferentes no mesmo produto, e eles vem da arquitetura, nao de
 * uma escolha de redacao:
 *
 * - dos dados do LOJISTA (conta, empresa, cobranca) somos **controlador**;
 * - dos dados dos CLIENTES do lojista somos **operador** — quem decide o que
 *   coletar e para que e ele, e o isolamento por RLS existe para que nenhuma
 *   loja alcance a base da outra.
 *
 * Misturar os dois faria a pagina prometer, ao consumidor final, direitos que
 * so o lojista pode atender — e faria o lojista achar que a obrigacao dele e
 * nossa.
 */
export default function PoliticaDePrivacidade() {
  return (
    <PaginaLegal eyebrow="Documentos" titulo="Politica de Privacidade" atualizadoEm="2026-09-09">
      <p>
        Esta pagina explica quais dados o {BRAND} trata, por que, por quanto tempo e o que voce pode
        exigir a respeito. Ela descreve o funcionamento real do sistema.
      </p>

      <Pendente>
        A identificacao do controlador (razao social e CNPJ) e o contato do encarregado pelo
        tratamento de dados, exigido pelo art. 41 da LGPD, ainda serao definidos e publicados aqui.
      </Pendente>

      <h2>Dois papeis diferentes, e a diferenca importa</h2>

      <p>
        O {BRAND} e um sistema de gestao usado por comerciantes. Isso cria duas situacoes que a lei
        trata de forma distinta:
      </p>

      <ul>
        <li>
          <strong>Dados da sua conta e da sua empresa.</strong> Aqui nos somos o controlador: somos
          nos que decidimos quais dados sao necessarios para o sistema funcionar e para cobrar a
          mensalidade.
        </li>
        <li>
          <strong>Dados dos clientes do comerciante.</strong> Aqui nos somos apenas o operador. Quem
          decide o que registrar sobre cada cliente e o comerciante, e e a ele que o cliente final
          deve se dirigir. Nos apenas guardamos e processamos por conta dele, e cada loja enxerga
          somente a propria base.
        </li>
      </ul>

      <p>
        Se voce e cliente de uma loja que usa o {BRAND} e quer acessar ou apagar seus dados, o
        pedido e para a loja. Ela tem, dentro do sistema, as ferramentas para atender voce.
      </p>

      <h2>O que o sistema guarda</h2>

      <h3>Sobre voce e sua empresa</h3>

      <ul>
        <li>Nome, e-mail e telefone de cada pessoa com acesso, e o papel de cada uma.</li>
        <li>Razao social, CNPJ, endereco, regime tributario e contatos da empresa.</li>
        <li>
          Credenciais de emissao fiscal, quando voce as informa. Elas sao guardadas cifradas e nao
          voltam a ser exibidas.
        </li>
        <li>
          Registro de acesso: quando cada sessao comecou e terminou, e o endereco de origem das
          tentativas de login — usado para conter tentativa em massa de adivinhar senha.
        </li>
      </ul>

      <h3>Sobre a operacao da loja</h3>

      <p>
        Vendas e itens, pagamentos, contas a pagar e a receber, baixas e estornos, movimentos de
        estoque, produtos, compromissos da agenda, plano de contas, transacoes bancarias importadas,
        chamados de suporte e a trilha de auditoria. Nos dados de clientes da loja, o que o
        comerciante registrar: nome, telefone, e-mail, CPF ou CNPJ, endereco e saldo em aberto.
      </p>

      <h3>Sua senha</h3>

      <p>
        Nao e guardada. O que fica e uma verificacao derivada dela, que permite conferir se a senha
        digitada esta certa sem que ninguem — inclusive nos — consiga reconstruir a original.
      </p>

      <h2>Por que tratamos cada coisa</h2>

      <ul>
        <li>
          <strong>Execucao do contrato</strong> (art. 7, V): sua conta, sua empresa, a sessao e todo
          o dado de operacao. Sem eles nao ha produto.
        </li>
        <li>
          <strong>Obrigacao legal</strong> (art. 7, II): documentos fiscais e a trilha de auditoria.
          E o que a legislacao fiscal e contabil obriga a guardar.
        </li>
        <li>
          <strong>Legitimo interesse</strong> (art. 7, IX): registros de seguranca, como o controle
          de tentativas de login, para proteger a sua conta e as das outras lojas.
        </li>
      </ul>

      <p>
        <strong>
          Nao vendemos seus dados, nao os cedemos para publicidade e nao os usamos para treinar
          modelos.
        </strong>
      </p>

      <h2>Quem mais tem acesso</h2>

      <p>
        Para funcionar, o sistema depende de terceiros — cada um com acesso apenas ao que a funcao
        dele exige. Hoje esta definido o provedor de emissao fiscal, que recebe os dados da nota que
        voce emite porque e ele quem a transmite a Secretaria da Fazenda.
      </p>

      <Pendente>
        A lista completa de operadores — hospedagem, meio de pagamento, envio de mensagens e
        assistente — sera publicada aqui quando cada fornecedor for escolhido. Enquanto isso, o
        sistema nao esta em operacao comercial.
      </Pendente>

      <h2>Por quanto tempo</h2>

      <p>
        Documentos fiscais ficam <strong>cinco anos</strong>, porque a legislacao fiscal exige. A
        trilha de auditoria e somente-insercao: nao pode ser alterada nem apagada, inclusive por
        nos, e e o que permite reconstruir quem fez o que.
      </p>

      <Pendente>
        Os prazos de retencao dos demais dados apos o encerramento da conta ainda serao definidos.
      </Pendente>

      <h2>Seus direitos, e como exercer</h2>

      <p>O art. 18 da LGPD garante, entre outros, o direito de:</p>

      <ul>
        <li>saber que dados existem sobre voce e obter copia deles;</li>
        <li>corrigir dado incompleto ou desatualizado;</li>
        <li>
          pedir a exclusao, no que a lei permitir apagar — o que a legislacao fiscal obriga a manter
          fica;
        </li>
        <li>levar seus dados para outro fornecedor, em formato aberto.</li>
      </ul>

      <h3>Exportacao completa</h3>

      <p>
        Voce pode pedir todos os dados da sua empresa em formato aberto, com um manifesto que diz
        quantos registros de cada tipo vieram — para dar para conferir se o pacote esta completo, em
        vez de receber um arquivo e ter de confiar. A exportacao continua disponivel mesmo com a
        conta suspensa por falta de pagamento: seus dados nao ficam de refem.
      </p>

      <h3>Exclusao de um cliente</h3>

      <p>
        Quando um cliente da sua loja pede exclusao, o sistema substitui os dados pessoais dele e
        apaga as conversas, mas <strong>preserva as vendas</strong> — sem os dados pessoais. Isso e
        deliberado: apagar as vendas mudaria o seu faturamento e o seu resultado, o que seria
        falsear a contabilidade para atender um pedido de privacidade. Os totais e relatorios
        continuam iguais depois da anonimizacao.
      </p>

      <p>
        As notas fiscais nao sao alteradas. O XML e assinado digitalmente: mexer nele destroi o
        proprio documento que a lei obriga a guardar. O CPF que consta ali esta amparado em
        obrigacao legal, e nao em interesse nosso.
      </p>

      <h3>Como pedir</h3>

      <p>
        Abra um chamado em <strong>Suporte</strong>, dentro do sistema. Todo pedido recebe
        protocolo, e a conversa fica registrada — para voce e para nos.
      </p>

      <Pendente>
        Um canal de contato para quem nao tem conta no sistema, e o prazo de resposta, serao
        publicados junto com o contato do encarregado.
      </Pendente>

      <h2>Seguranca</h2>

      <ul>
        <li>
          Cada loja e isolada no banco de dados por politica aplicada pelo proprio banco, e nao
          apenas pelo codigo da aplicacao. Consulta sem loja definida falha, em vez de devolver dado
          de outra.
        </li>
        <li>O token da sua sessao nunca fica ao alcance do JavaScript da pagina.</li>
        <li>
          Sair encerra a sessao no servidor, e nao apenas no seu aparelho: um token copiado deixa de
          valer.
        </li>
        <li>Credenciais de terceiros que voce informa sao guardadas cifradas.</li>
      </ul>

      <h2>Cookies</h2>

      <p>
        Ha um cookie, e ele e essencial. Nao usamos cookie de analise, de publicidade ou de
        rastreamento. O inventario completo esta na{' '}
        <a href="/politica-de-cookies">Politica de Cookies</a>.
      </p>

      <h2>Mudancas nesta pagina</h2>

      <p>
        Alteracoes relevantes serao avisadas dentro do sistema antes de passarem a valer. A data no
        topo diz qual versao voce esta lendo.
      </p>
    </PaginaLegal>
  )
}
