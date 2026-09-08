-- =====================================================================
-- Verificação: descarte de prefixo burocrático no padrão de regra
-- 09/09/2026 — SÓ LEITURA, seguro rodar quando quiser.
--
-- CONTEXTO
-- "Pagamento de Pix QR Code <loja>" e "Pagamento de boleto <credor>" viravam
-- todos a mesma chave de 18 chars (PAGAMENTODEPIXQRCO / PAGAMENTODEBOLETOC),
-- o que criava regra genérica (armadilha nº7). O código do front
-- (assets/modelo.js) e do serviço Pluggy (server/pluggy/server.mjs) passou a
-- DESCARTAR esses prefixos antes de cortar 18 caracteres, então o padrão
-- agora sai do nome real do estabelecimento (BARBEARIADOTORCEDO, TIMSA...).
--
-- NÃO há reprocessamento em massa (decisão: mais seguro). Os lançamentos
-- afetados já estão na fila da Triar e, ao serem re-triados com o app novo,
-- geram os padrões corretos naturalmente. Estas consultas só ajudam a
-- ACOMPANHAR que está tudo indo como esperado depois do deploy.
-- =====================================================================

-- 1. Regras antigas que ainda carregam um prefixo burocrático no `padrao`.
--    Esperado: idealmente 0. Se aparecer alguma (ex.: PAGAMENTODEPIXQRCO,
--    PAGAMENTODEBOLETOC), é uma regra genérica remanescente — apague-a
--    (ela casaria estabelecimentos sem relação) e deixe o app reaprender
--    a regra específica na próxima triagem:
--      delete from public.regras where padrao = 'PAGAMENTODEPIXQRCO';
--      delete from public.regras where padrao = 'PAGAMENTODEBOLETOC';
select padrao, categoria_id, categoria, cls
  from public.regras
 where padrao in ('PAGAMENTODEPIXQRCO', 'PAGAMENTODEBOLETOC')
    or padrao like 'PAGAMENTODEPIX%'
    or padrao like 'PAGAMENTODEBOLET%';

-- 2. Quantos lançamentos ainda casam a chave genérica antiga E seguem sem
--    categoria (na fila). É o "trabalho restante" de re-triagem.
--    Esperado: cai para 0 conforme você tria.
with base as (
  select t.*,
         left(regexp_replace(upper(t.descricao), '[^A-Z]', '', 'g'), 18) as chave_antiga
    from public.transacoes t
)
select 'pix_na_fila'    as grupo, count(*) as qtd
  from base where chave_antiga = 'PAGAMENTODEPIXQRCO' and categoria_id is null
union all
select 'boleto_na_fila', count(*)
  from base where chave_antiga = 'PAGAMENTODEBOLETOC' and categoria_id is null;

-- 3. Depois do deploy do Pluggy e de re-triar alguns, confira que as regras
--    NOVAS de Pix/boleto nascem com o NOME real (sem o prefixo). Devem
--    aparecer padrões como BARBEARIADOTORCEDO, TIMSA, CAGECECIAAGUAESGOT —
--    e NENHUM começando com PAGAMENTODEPIX/PAGAMENTODEBOLET.
select padrao, categoria, cls
  from public.regras
 order by padrao
 limit 200;
