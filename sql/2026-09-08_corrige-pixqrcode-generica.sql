-- =====================================================================
-- Correção do estrago da regra genérica PAGAMENTODEPIXQRCO — 08/09/2026
--
-- CONTEXTO
-- Reclassificar "Pagamento de Pix QR Code Barbearia Do Torcedor" com
-- escopo "Todos os eventos" recriou a regra genérica PAGAMENTODEPIXQRCO e
-- reaplicou a categoria da barbearia a ~136 lançamentos SEM RELAÇÃO (Posto
-- Marajó etc.). É a armadilha nº7: a descrição normaliza para 18
-- caracteres ANTES do nome do estabelecimento, então "Pagamento de Pix QR
-- Code <QUALQUER LOJA>" gera sempre a MESMA chave.
--
-- O bug de código que permitiu isso já foi corrigido (PR #31): a pergunta
-- de escopo não oferece mais "Todos/Seguintes" para padrão genérico. Este
-- arquivo corrige os DADOS que já foram afetados.
--
-- ⚠️ POR QUE NÃO DÁ PARA "DESFAZER" COM PRECISÃO
-- O app novo NÃO grava o valor antigo em log_alteracoes (só o legado.html
-- gravava). Não há como saber, pela base, qual era a categoria de cada um
-- dos 136 antes da bagunça. E não dá para distinguir por dado quais ~10
-- eram DE FATO a barbearia.
-- Por isso a estratégia é a honesta: mandar TODOS os afetados de volta
-- para a TRIAGEM (categoria_id nulo) e apagar a regra genérica. Você
-- re-classifica na fila — inclusive os ~10 que são mesmo a barbearia, um a
-- um. É a triagem normal, sem chute.
--
-- ⚠️ OPERAÇÃO DE ESCRITA EM PRODUÇÃO, difícil de reverter. NÃO rode inteiro
-- de uma vez. Rode a PARTE 1 (só leitura), confira os números, e só depois
-- decida rodar a PARTE 2. Faça um backup antes (ver PARTE 0).
--
-- Rodar no SQL Editor do Supabase, logado como gestor.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — DIAGNÓSTICO (só leitura, seguro rodar quando quiser)
-- =====================================================================

-- 1a. A regra genérica voltou a existir? (esperado: 1 linha, ou 0 se já foi
--     apagada). Mostra para onde ela aponta hoje.
select 'regra' as o, r.padrao, r.categoria_id, r.categoria, r.cls
  from public.regras r
 where r.padrao = 'PAGAMENTODEPIXQRCO';

-- 1b. Quantos lançamentos casam a chave genérica, e como estão HOJE.
--     A normalização replica a do app (M.normalizar): maiúsculas, só A-Z,
--     18 caracteres. Sem tratar acento aqui — as descrições do Pix chegam
--     sem acento; se aparecer acento, revisar.
with base as (
  select t.*,
         left(regexp_replace(upper(t.descricao), '[^A-Z]', '', 'g'), 18) as chave
    from public.transacoes t
)
select 'afetados_total' as metrica, count(*)::text as valor
  from base where chave = 'PAGAMENTODEPIXQRCO'
union all
select 'afetados_na_categoria_barbearia',
       count(*)::text
  from base b
  join public.categorias c on c.id = b.categoria_id
 where b.chave = 'PAGAMENTODEPIXQRCO' and c.nome = 'Barbearia';

-- 1c. Detalhe: distribuição por categoria atual dos que casam a chave.
--     Ajuda a ver o estrago (muitos estabelecimentos numa categoria só).
with base as (
  select t.*,
         left(regexp_replace(upper(t.descricao), '[^A-Z]', '', 'g'), 18) as chave
    from public.transacoes t
)
select coalesce(c.grupo || ' › ' || c.nome, '(sem categoria)') as categoria_atual,
       b.cls,
       count(*) as qtd
  from base b
  left join public.categorias c on c.id = b.categoria_id
 where b.chave = 'PAGAMENTODEPIXQRCO'
 group by 1, 2
 order by qtd desc;

-- 1d. Amostra das descrições distintas que casam a chave — a prova de que
--     são estabelecimentos diferentes (Posto Marajó, Barbearia, etc.).
with base as (
  select t.*,
         left(regexp_replace(upper(t.descricao), '[^A-Z]', '', 'g'), 18) as chave
    from public.transacoes t
)
select distinct b.descricao
  from base b
 where b.chave = 'PAGAMENTODEPIXQRCO'
 order by b.descricao
 limit 50;


-- =====================================================================
-- PARTE 0 — BACKUP (rode ANTES da PARTE 2)
-- =====================================================================
-- Guarda o estado atual dos afetados numa tabela, para poder auditar/reverter.
-- Se algo sair diferente do esperado, os valores de antes ficam aqui.

create table if not exists public.backup_pixqrcode_20260908 as
with base as (
  select t.id, t.descricao, t.categoria_id, t.categoria, t.cls,
         left(regexp_replace(upper(t.descricao), '[^A-Z]', '', 'g'), 18) as chave
    from public.transacoes t
)
select id, descricao, categoria_id, categoria, cls, now() as salvo_em
  from base
 where chave = 'PAGAMENTODEPIXQRCO';

-- Confere quantas linhas foram guardadas (deve bater com 1b "afetados_total").
select count(*) as linhas_no_backup from public.backup_pixqrcode_20260908;


-- =====================================================================
-- PARTE 2 — CORREÇÃO (ESCRITA — rode só depois de conferir a PARTE 1)
-- =====================================================================
-- Envolvida numa transação: ou aplica tudo, ou nada.
-- Descomente o bloco abaixo para executar.

/*
begin;

  -- 2a. Apaga a regra genérica reintroduzida. Sem isso, todo Pix QR Code
  --     novo volta a ser sugerido com a categoria errada.
  delete from public.regras where padrao = 'PAGAMENTODEPIXQRCO';

  -- 2b. Manda os afetados de volta para a TRIAGEM. Zera categoria_id E o
  --     texto categoria (senão o trigger trg_a_resolver_categoria
  --     re-sincroniza o texto). cls volta a 'Indefinido' para caírem na
  --     fila por completo — a triagem reclassifica cada um certo.
  --
  --     Emprestimo fica de fora por precaução (cls = 'Empréstimo' nunca
  --     entra em regra automática e não deveria ter sido tocado).
  update public.transacoes t
     set categoria_id = null,
         categoria    = null,
         cls          = 'Indefinido'
   where t.id in (select id from public.backup_pixqrcode_20260908)
     and t.cls <> 'Empréstimo';

  -- Confere: quantas foram para a fila.
  -- (rode como SELECT depois do commit, ou olhe o "UPDATE N")

commit;
*/

-- =====================================================================
-- PARTE 3 — VERIFICAÇÃO (depois da PARTE 2)
-- =====================================================================
-- A regra sumiu?
select count(*) as regra_generica_restante
  from public.regras where padrao = 'PAGAMENTODEPIXQRCO';

-- Os afetados estão na fila (categoria_id nulo)?
select count(*) as ainda_com_categoria
  from public.transacoes t
  join public.backup_pixqrcode_20260908 b on b.id = t.id
 where t.categoria_id is not null;

-- Depois de reclassificar tudo na Triar e confirmar que ficou certo, dá
-- para descartar o backup:
--   drop table public.backup_pixqrcode_20260908;
