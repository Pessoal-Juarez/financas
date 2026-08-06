-- =====================================================================
-- Passo 10 — orçamento por grupo, fonte do patrimônio e arquivamento
-- atômico de subcategoria — 06/08/2026
--
-- ADITIVA. O `dashboard.html` que está NO AR lê `metas.categoria` e
-- ordena por ela, então a coluna não pode sumir — só passa a aceitar
-- nulo. Dropá-la quebraria produção durante a transição.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `metas` passa a ter GRUPO como chave
--    Orçamento com 10 linhas se revisa em dois minutos; com 47, é
--    abandonado no segundo mês. A tabela está VAZIA desde sempre — nunca
--    foi usada — então não há nada a migrar.
-- ---------------------------------------------------------------------
-- ⚠️ `metas.categoria` é PRIMARY KEY: não pode virar nula nem sumir. A
-- primeira versão desta migração tentou `drop not null` e o Postgres
-- recusou (42P16). Em vez de mexer na chave — o que quebraria o
-- `dashboard.html` que está no ar — as duas colunas guardam o mesmo
-- texto: `grupo` diz o que o valor significa, `categoria` existe para a
-- PK e para o app antigo. Redundância transitória, e deliberada.
alter table public.metas add column if not exists grupo text;
alter table public.metas add column if not exists atualizado_por uuid;

comment on column public.metas.grupo is
  'Chave semântica do orçamento a partir de 06/08/2026. Espelha `categoria`, que continua sendo a PK por causa do dashboard antigo.';

-- Faltava policy de DELETE: sem ela, nem o gestor consegue apagar uma meta.
drop policy if exists metas_del on public.metas;
create policy metas_del on public.metas for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. `patrimonio` ganha `fonte`
--    Verificado em 06/08: o Open Finance devolve UMA conta, a corrente do
--    Itaú. O CDB não vem pela API e não virá. Logo 2 das 3 linhas — 57%
--    do patrimônio — seguem manuais, e o alerta de desatualização é
--    requisito, não acabamento.
-- ---------------------------------------------------------------------
alter table public.patrimonio add column if not exists fonte text not null default 'manual';

alter table public.patrimonio drop constraint if exists patrimonio_fonte_valida;
alter table public.patrimonio add constraint patrimonio_fonte_valida
  check (fonte in ('manual', 'itau'));

update public.patrimonio set fonte = 'itau'
 where nome ilike '%conta corrente%' and fonte <> 'itau';

comment on column public.patrimonio.fonte is
  'manual = digitado (CDB, BTG) · itau = atualizado pelo sync diário da conta corrente.';

-- ---------------------------------------------------------------------
-- 3. Arquivar subcategoria em uso — ATÔMICO
--    É o único ponto do app onde falha no meio corrompe dado: mover os
--    lançamentos e arquivar a categoria têm que acontecer juntos. Se
--    movesse sem arquivar, a categoria continuaria escolhível e vazia; se
--    arquivasse sem mover, os lançamentos apontariam para categoria morta.
--    Por isso é função no banco, e não duas chamadas do JavaScript.
-- ---------------------------------------------------------------------
create or replace function public.arquivar_categoria(
  p_categoria_id bigint,
  p_destino_id   bigint
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  movidas int;
  nm      text;
begin
  if not public.is_admin() then
    raise exception 'Só o gestor pode arquivar categoria.' using errcode = '42501';
  end if;
  if p_categoria_id = p_destino_id then
    raise exception 'A categoria de destino tem que ser diferente.' using errcode = '22023';
  end if;

  select nome into nm from public.categorias where id = p_categoria_id;
  if nm is null then
    raise exception 'Categoria não encontrada.' using errcode = '02000';
  end if;
  if not exists (select 1 from public.categorias where id = p_destino_id and ativa) then
    raise exception 'Categoria de destino não existe ou está arquivada.' using errcode = '02000';
  end if;

  -- O trigger trg_a_resolver_categoria sincroniza o texto `categoria`
  -- automaticamente, então não é preciso atualizá-lo aqui.
  update public.transacoes set categoria_id = p_destino_id where categoria_id = p_categoria_id;
  get diagnostics movidas = row_count;

  update public.regras set categoria_id = p_destino_id where categoria_id = p_categoria_id;

  -- Arquiva em vez de apagar: `categoria_alias` referencia o id, e o
  -- histórico de para onde as coisas foram tem valor.
  update public.categorias set ativa = false where id = p_categoria_id;

  return json_build_object('ok', true, 'movidas', movidas, 'arquivada', nm);
end;
$$;

revoke execute on function public.arquivar_categoria(bigint, bigint) from public, anon;
grant execute on function public.arquivar_categoria(bigint, bigint) to authenticated;
