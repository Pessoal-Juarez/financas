-- =====================================================================
-- verificacao.sql — asserções do redesign
--
-- Rodar DEPOIS DE CADA FASE. Retorna uma linha por asserção, com
-- PASSOU ou FALHOU. Não altera nada — é seguro rodar quando quiser.
--
-- Não existe suíte automatizada neste projeto e não vai existir
-- (2 usuários; teste quebrado é pior que teste ausente — spec §12).
-- Este arquivo é o único mecanismo de validação.
--
-- Uso: colar no SQL Editor do Supabase e rodar.
-- =====================================================================

with a as (

  -- 1. Nenhuma transação foi perdida
  select 1 as ord, 'Total de transações' as assercao,
         (select count(*) from transacoes)::text as obtido,
         '3132' as esperado

  -- 2. Toda transação está classificada OU na fila. Nunca um 3º estado.
  union all select 2, 'Transações sem categoria (falta categoria_id)',
         (select count(*) from transacoes where categoria_id is null)::text, '620'

  union all select 3, 'Transações sem cls',
         (select count(*) from transacoes
           where cls is null or btrim(cls) in ('','Indefinido'))::text, '623'

  union all select 4, 'FILA DE TRIAGEM (falta categoria OU cls)',
         (select count(*) from transacoes
           where categoria_id is null
              or cls is null or btrim(cls) in ('','Indefinido'))::text, '656'

  -- 3. Coerência texto <-> id.
  --    Existe porque a Fase 3 foi cortada (spec §6): as duas representações
  --    convivem para sempre e a denormalização apodreceria em silêncio.
  --
  --    Não dá para exigir `c.nome = t.categoria` — o de-para funde nomes de
  --    propósito ('Clínica' e 'Saúde' viram Consulta/Exame). O que TEM que
  --    valer é o determinismo: o mesmo texto sempre resolve para o mesmo id.
  --    Se um dia 'Supermercado' apontar para dois ids diferentes, a
  --    denormalização quebrou.
  union all select 5, 'Textos de categoria apontando para ids diferentes',
         (select count(*) from (
            select btrim(categoria) as txt
              from transacoes
             where categoria_id is not null and btrim(coalesce(categoria,'')) <> ''
             group by 1 having count(distinct categoria_id) > 1
          ) x)::text, '0'

  union all select 51, 'Idem em regras',
         (select count(*) from (
            select btrim(categoria) as txt
              from regras
             where categoria_id is not null and btrim(coalesce(categoria,'')) <> ''
             group by 1 having count(distinct categoria_id) > 1
          ) x)::text, '0'

  -- 4. Integridade referencial das regras (o risco nº 1 da spec §13)
  union all select 6, 'Regras apontando para categoria inexistente',
         (select count(*) from regras r
           where r.categoria_id is not null
             and not exists (select 1 from categorias c where c.id = r.categoria_id))::text, '0'

  union all select 7, 'Regras apontando para categoria arquivada',
         (select count(*) from regras r
            join categorias c on c.id = r.categoria_id
           where not c.ativa)::text, '0'

  union all select 8, 'Regras sem categoria (só as que vão para triagem)',
         (select count(*) from regras where categoria_id is null)::text, '27'

  -- 5. Taxonomia íntegra
  union all select 9, 'Subcategorias cadastradas',
         (select count(*) from categorias)::text, '54'

  union all select 10, 'Grupos',
         (select count(distinct grupo) from categorias)::text, '12'

  -- 6. Movimentação nunca entra no eixo de gasto
  union all select 11, 'Movimentação com cls diferente de "Não é gasto"',
         (select count(*) from transacoes t
            join categorias c on c.id = t.categoria_id
           where c.grupo = 'Movimentação'
             and coalesce(t.cls,'') <> 'Não é gasto')::text, '0'

  -- 7. Segurança — a falha corrigida em 05/08 não pode voltar
  union all select 12, 'Policies com auth.uid() IS NOT NULL (proibido)',
         (select count(*) from pg_policies
           where schemaname = 'public'
             and (coalesce(qual,'') ilike '%auth.uid() is not null%'
               or coalesce(with_check,'') ilike '%auth.uid() is not null%'))::text, '0'

  union all select 13, 'RLS ligado em categorias',
         (select relrowsecurity from pg_class where oid='public.categorias'::regclass)::text, 'true'

  -- 8. A soma por grupo tem que reproduzir o total classificado
  union all select 14, 'Soma por grupo = soma das transações classificadas',
         (select case when
            (select coalesce(sum(valor),0) from transacoes where categoria_id is not null)
            = (select coalesce(sum(t.valor),0) from transacoes t
                 join categorias c on c.id = t.categoria_id)
          then 'ok' else 'divergente' end), 'ok'

  -- 9. Auxiliar da migração não pode ter sobrado
  union all select 15, 'Tabela auxiliar depara_tmp removida',
         (select count(*) from information_schema.tables
           where table_schema='public' and table_name='depara_tmp')::text, '0'
)
select ord as "#",
       ascerto.assercao,
       ascerto.esperado,
       ascerto.obtido,
       case when ascerto.obtido = ascerto.esperado then 'PASSOU' else 'FALHOU' end as resultado
  from a as ascerto
 order by ord;

-- =====================================================================
-- Diagnóstico complementar (não é asserção — olhar quando algo FALHAR)
-- =====================================================================

-- Volume por grupo. `Compras › Marketplace` herdou os 355 antigos `Outros`:
-- se voltar a dominar o gráfico, só trocou de nome (risco em spec §13).
-- select c.grupo, count(*) n, round(sum(t.valor)::numeric,2) total
--   from transacoes t join categorias c on c.id=t.categoria_id
--  group by 1 order by n desc;

-- Categorias em texto que não têm destino no de-para (esperado: só as de triagem)
-- select btrim(categoria) categoria, count(*) n from transacoes
--  where categoria_id is null and btrim(coalesce(categoria,'')) <> ''
--  group by 1 order by n desc;
