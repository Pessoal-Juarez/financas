-- =====================================================================
-- Correção do SINAL do cartão de crédito (Pluggy) — 09/09/2026
--
-- PROBLEMA (diagnóstico fechado com dados reais)
-- No cartão do Itaú via Pluggy, o `tipo` foi gravado INVERTIDO:
--   * COMPRAS (gasto) entraram como `entrada`  -> deveriam ser `saida`
--   * PAGAMENTO DE FATURA / ESTORNO entraram como `saida` -> `entrada`
-- Causa: a ingestão assumia amount<0 = saida, mas no cartão do Pluggy é o
-- inverso (amount>0 = compra). Corrigido no código em server/pluggy/server.mjs.
--
-- ESCOPO — MEXER SÓ NO CARTÃO-PLUGGY. Confirmado no banco:
--   src='Cartão' AND ext_id IS NOT NULL  -> 1627 entrada + 123 saida
-- NÃO tocar:
--   * Conta (receitas/gastos vieram CORRETOS)  -> ver E.1/E.2 do diagnóstico
--   * BTG e BTG-*                                -> fora de escopo
--   * Cartão-Cumbuca (ext_id NULL, 646 saida)   -> já corretos, dado antigo
--
-- D.2 confirmou: NENHUMA entrada de cartão-Pluggy é pagamento/estorno/crédito
-- (0 linhas). Todas as 1627 entradas são compra. Seguro inverter.
--
-- ⚠️ ESCRITA EM PRODUÇÃO, ~1750 linhas. Rode PARTE 1 (leitura), depois
-- PARTE 0 (backup), e só então PARTE 2. Faça no SQL Editor do Supabase.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — CONFERÊNCIA (só leitura). Os números devem bater com o diagnóstico.
-- =====================================================================
select tipo, count(*) as qtd, sum(valor) as total
  from public.transacoes
 where src = 'Cartão' and ext_id is not null
 group by tipo;
-- Esperado: entrada ~1627 (compras, viram saida) · saida ~123 (pagamento/
-- estorno, viram entrada).


-- =====================================================================
-- PARTE 0 — BACKUP (rode antes da PARTE 2)
-- =====================================================================
create table if not exists public.backup_sinal_cartao_20260909 as
select id, data, descricao, valor, tipo, cls, src, ext_id, now() as salvo_em
  from public.transacoes
 where src = 'Cartão' and ext_id is not null;

select count(*) as linhas_no_backup from public.backup_sinal_cartao_20260909;


-- =====================================================================
-- PARTE 2 — CORREÇÃO (ESCRITA). Descomente para executar.
-- =====================================================================
-- Troca entrada<->saida num ÚNICO update com CASE. Sem valor-sentinela
-- (evita esbarrar num CHECK que só aceite 'entrada'/'saida') e sem risco
-- de um update desfazer o outro.
--
-- ⚠️ O trigger trg_trava_colunas_transacao BLOQUEIA alterar `tipo` para
-- quem não é gestor — e no SQL Editor `is_admin()` é falso (sem usuário
-- autenticado), então ele barra mesmo você sendo o dono do banco. Por isso
-- desabilitamos o trigger SÓ durante esta transação e reabilitamos no fim.
-- Tudo num begin/commit: se algo falhar, nada muda e o trigger volta ativo.
-- (Requer ser superusuário/dono da tabela, o que o SQL Editor é.)
/*
begin;

  alter table public.transacoes disable trigger trg_trava_colunas_transacao;

  update public.transacoes
     set tipo = case tipo when 'entrada' then 'saida' else 'entrada' end
   where src = 'Cartão'
     and ext_id is not null
     and tipo in ('entrada','saida');

  alter table public.transacoes enable trigger trg_trava_colunas_transacao;

commit;
*/


-- =====================================================================
-- PARTE 3 — VERIFICAÇÃO (depois da PARTE 2)
-- =====================================================================
-- Os números devem ter TROCADO em relação à PARTE 1:
--   entrada ~123 (pagamento/estorno) · saida ~1627 (compras)
select tipo, count(*) as qtd, sum(valor) as total
  from public.transacoes
 where src = 'Cartão' and ext_id is not null
 group by tipo;

-- Custo de vida de AGOSTO agora (deve se aproximar dos ~R$ 11.400 do papel:
-- conta + cartão do Itaú, saídas de custo de vida da família).
select sum(valor) as custo_vida_agosto_itau
  from public.transacoes
 where to_char(data,'YYYY-MM') = '2026-08'
   and src in ('Conta','Cartão')
   and tipo = 'saida'
   and cls in ('Pessoal família','Pessoal Juarez','Pessoal Raiane');

-- Depois de conferir tudo, pode descartar o backup:
--   drop table if exists public.backup_sinal_cartao_20260909;
