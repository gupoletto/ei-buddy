-- Hora de fim e local do compromisso — NR-035, RF-089, RF-093.
--
-- Mesmo defeito do endereco (0019), noutra tela: o formulario da agenda pede
-- horario de inicio, horario de FIM e local desde sempre, e so o inicio tinha
-- coluna. Os outros dois eram digitados e descartados.
--
-- Nao e cosmetico. Sem `ends_at` a agenda nao sabe quanto dura nada: uma
-- reuniao das 16h e um almoco das 12h ocupam o mesmo ponto na tela, e a
-- pergunta "tenho a tarde livre?" nao tem resposta. E sem `location` a entrega
-- na Rua Xavier da Silva, 88 vira "Entrega Padaria Sol" sem endereco nenhum,
-- que e a informacao pela qual se abre o compromisso.

-- ---------------------------------------------------------------------------
-- ends_at — anulavel, e nao com um padrao de trinta minutos
-- ---------------------------------------------------------------------------
--
-- "Pagar aluguel as 10h" nao tem duracao, e inventar meia hora para ele
-- ocuparia a agenda com um bloco que ninguem pediu. NULL aqui significa
-- "compromisso pontual", e a tela desenha um marcador em vez de uma faixa.
--
-- Quando existe, tem de ser DEPOIS do inicio. O CHECK e a ultima linha de
-- defesa: `contracts` valida o que entra por HTTP, mas migration, script e
-- worker escrevem por fora, e um compromisso que termina antes de comecar
-- quebra qualquer calculo de sobreposicao que venha depois.
ALTER TABLE appointments
  ADD COLUMN ends_at timestamptz,
  ADD COLUMN location text;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_fim_depois_do_inicio
    CHECK (ends_at IS NULL OR ends_at > starts_at);

-- O mesmo teto de `notes`, pelo mesmo motivo: o limite mora onde o dado mora.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_local_tamanho
    CHECK (location IS NULL OR char_length(location) <= 200);

COMMENT ON COLUMN appointments.ends_at IS
  'Fim do compromisso, em UTC. NULL = pontual, sem duracao (NR-035).';

COMMENT ON COLUMN appointments.location IS
  'Onde e o compromisso, em texto livre. Nao e endereco estruturado: '
  '"Loja", "Sala de reuniao" e "Rua Xavier da Silva, 88" sao todos validos.';
