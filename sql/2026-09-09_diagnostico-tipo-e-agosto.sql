-- =====================================================================
-- Diagnóstico — 09/09/2026 (SÓ LEITURA, seguro rodar)
--
-- Duas perguntas:
--   A) Quais DESPESAS estão marcadas como `tipo = 'entrada'` (aparecem em
--      verde como se fossem receita)? Ex.: nbsburger 29/06.
--   B) O que falta triar em AGOSTO/2026 e por que o total diverge dos
--      ~R$ 11.400 feitos no papel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Entradas "suspeitas" — provável tipo errado
-- ---------------------------------------------------------------------
-- A.1  O caso relatado: nbsburger.
select id, data, descricao, valor, tipo, cls, categoria, src
  from public.transacoes
 where descricao ilike '%nbsburger%'
 order by data;

-- A.2  TODAS as entradas: uma receita de verdade é rara e reconhecível
--      (salário, recebível, dividendo, estorno). Entrada num
--      estabelecimento de consumo (burger, mercado, farmácia, posto...)
--      é quase certamente tipo errado vindo da ingestão.
--      Olhe a lista: as que são claramente consumo estão com tipo trocado.
select id, data, descricao, valor, tipo, cls, categoria, src
  from public.transacoes
 where tipo = 'entrada'
 order by data desc;

-- A.3  Resumo: quantas entradas há por mês e somando quanto. Ajuda a ver
--      se o volume de "entradas" está inflado por tipo errado.
--      OBS: `data` é do tipo DATE — usar to_char, não left().
select to_char(data, 'YYYY-MM') as mes, count(*) as qtd_entradas, sum(valor) as total_entradas
  from public.transacoes
 where tipo = 'entrada'
 group by 1
 order by 1 desc;

-- A.4  Entradas no CARTÃO — o caso do nbsburger (src = Cartão). No cartão,
--      compra vem com amount negativo (saída); entrada = amount positivo,
--      que costuma ser ESTORNO/reembolso. Olhe a lista: estorno legítimo
--      fica como entrada; compra comum com sinal trocado vira saída.
select id, data, descricao, valor, tipo, cls, src
  from public.transacoes
 where tipo = 'entrada' and src in ('Cartão', 'BTG-Cartão')
 order by data desc;


-- ---------------------------------------------------------------------
-- B) Fechamento de AGOSTO/2026
-- ---------------------------------------------------------------------
-- B.1  Fila de triagem de agosto: o que ainda falta classificar.
--      (mesma definição do app: sem categoria_id OU cls Indefinido/vazio)
select count(*) as faltam_triar_agosto,
       sum(valor) as valor_em_aberto
  from public.transacoes
 where to_char(data, 'YYYY-MM') = '2026-08'
   and (categoria_id is null or coalesce(cls,'') in ('', 'Indefinido'));

-- B.2  Amostra do que falta triar em agosto (as maiores primeiro).
select id, data, descricao, valor, tipo, cls, categoria, src
  from public.transacoes
 where to_char(data, 'YYYY-MM') = '2026-08'
   and (categoria_id is null or coalesce(cls,'') in ('', 'Indefinido'))
 order by valor desc
 limit 50;

-- B.3  Custo de vida de agosto, do jeito que o app calcula:
--      só SAÍDAS com cls Pessoal família/Juarez/Raiane.
--      É esse número que deve se aproximar dos ~R$ 11.400 do papel.
select sum(valor) as custo_de_vida_agosto
  from public.transacoes
 where to_char(data, 'YYYY-MM') = '2026-08'
   and tipo = 'saida'
   and cls in ('Pessoal família', 'Pessoal Juarez', 'Pessoal Raiane');

-- B.4  Decomposição de agosto por cls (todas as saídas), para ver onde o
--      dinheiro está e o quanto ainda está "A classificar" (Indefinido).
--      Se o "Indefinido" for grande, o custo de vida real está subestimado
--      até você triar.
select coalesce(nullif(cls,''), '(vazio)') as cls,
       count(*) as qtd,
       sum(valor) as total
  from public.transacoes
 where to_char(data, 'YYYY-MM') = '2026-08'
   and tipo = 'saida'
 group by 1
 order by total desc;

-- B.5  Total geral de agosto por tipo — para enxergar se há entrada
--      inflando (ligado à parte A) e o total de saídas do mês.
select tipo, count(*) as qtd, sum(valor) as total
  from public.transacoes
 where to_char(data, 'YYYY-MM') = '2026-08'
 group by tipo;
