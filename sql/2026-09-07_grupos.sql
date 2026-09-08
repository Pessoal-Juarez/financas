-- =====================================================================
-- Grupos como entidade de primeira classe — 07/09/2026
--
-- Até aqui o GRUPO era só uma coluna de texto em `categorias`, e a lista
-- de grupos (com cor, ordem e tier fixo/variável/adicional) vivia
-- CODIFICADA em assets/modelo.js. Isso bastava enquanto os grupos eram
-- fixos. Agora o usuário quer CRIAR, RENOMEAR e ARQUIVAR grupo pela tela
-- Categorias (como já faz com subcategoria) — e um grupo criado sem cor,
-- sem ordem e sem tier sumiria da Análise, do Início e do orçamento.
--
-- Solução: tabela `grupos` com a metadata que estava no front. As telas
-- seguem lendo M.GRUPOS_DESPESA / M.COR_GRUPO / M.TIER — só muda a FONTE:
-- passam a ser hidratadas desta tabela, com os valores atuais como
-- fallback (o app funciona mesmo se a leitura falhar).
--
-- ADITIVA. Não altera `categorias`, `transacoes`, `regras` nem `metas`.
-- O grupo continua sendo o TEXTO em categorias.grupo — a tabela nova é
-- metadata + chave estável para renomear/arquivar de forma atômica.
--
-- ⚠️ `grupos.nome` espelha `categorias.grupo` (texto). Renomear um grupo
-- tem que atualizar as DUAS tabelas + `metas` (que usa o nome do grupo
-- como chave) na MESMA transação, senão a auto-classificação e o
-- orçamento apontam para nome morto. Por isso renomear/arquivar são
-- funções no banco, como `arquivar_categoria`.
--
-- Rollback:
--   drop function public.renomear_grupo(bigint, text);
--   drop function public.arquivar_grupo(bigint, text);
--   drop function public.criar_grupo(text, text, text, text);
--   drop table public.grupos;
--   (nada mais depende delas — categorias.grupo continua sendo a verdade)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
create table if not exists public.grupos (
  id        bigint generated always as identity primary key,
  nome      text    not null unique,
  cor       text    not null default '#9aa3b2',
  -- 'fixo' | 'variável' | 'adicional' — usado pelo "piso de sobrevivência"
  -- da Análise. Null = grupo que não entra no piso (Receitas/Movimentação).
  tier      text,
  -- 'despesa' entra em Análise e orçamento; 'receita' e 'movimentacao'
  -- existem para toda categoria ter grupo, mas ficam FORA desses eixos.
  eixo      text    not null default 'despesa',
  ordem     integer not null default 0,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint grupos_tier_valido check (tier is null or tier in ('fixo','variável','adicional')),
  constraint grupos_eixo_valido check (eixo in ('despesa','receita','movimentacao'))
);

comment on table public.grupos is
  'Metadata do grupo (cor, ordem, tier, eixo). O grupo em si continua sendo o texto em categorias.grupo; esta tabela dá chave estável e metadata para editar grupo sem quebrar Análise/orçamento.';

-- ---------------------------------------------------------------------
-- 2. Seed — os 12 grupos atuais, com a cor/tier/ordem que estavam em
--    modelo.js (GRUPOS_DESPESA, COR_GRUPO, TIER). Ordem em passos de 10
--    para caber grupo novo no meio sem renumerar tudo.
-- ---------------------------------------------------------------------
insert into public.grupos (nome, cor, tier, eixo, ordem) values
  ('Alimentação',            '#2f6df0', 'variável',  'despesa',       10),
  ('Moradia',                '#7a5cf0', 'fixo',      'despesa',       20),
  ('Saúde',                  '#0f9d58', 'variável',  'despesa',       30),
  ('Transporte',             '#b5560e', 'variável',  'despesa',       40),
  ('Cuidado pessoal',        '#e36fae', 'variável',  'despesa',       50),
  ('Educação',               '#127c8a', 'fixo',      'despesa',       60),
  ('Lazer',                  '#d98c00', 'adicional', 'despesa',       70),
  ('Compras',                '#c2410c', 'adicional', 'despesa',       80),
  ('Serviços & obrigações',  '#5c6675', 'fixo',      'despesa',       90),
  ('Empresas',               '#8a6d3b', 'adicional', 'despesa',      100),
  ('Receitas',               '#0f9d58', null,        'receita',      110),
  ('Movimentação',           '#9aa3b2', null,        'movimentacao', 120)
on conflict (nome) do nothing;

-- Segurança: qualquer grupo que já exista em `categorias` mas não tenha
-- entrado no seed acima (não deveria haver) ganha uma linha inerte, para
-- a lista de grupos do app nunca perder um grupo com lançamento.
insert into public.grupos (nome, cor, eixo, ordem)
select distinct c.grupo, '#9aa3b2', 'despesa', 900
  from public.categorias c
 where c.grupo is not null
   and not exists (select 1 from public.grupos g where g.nome = c.grupo)
on conflict (nome) do nothing;

create index if not exists grupos_ordem_idx on public.grupos (ordem);

-- ---------------------------------------------------------------------
-- 3. RLS
--    Leitura: membro da família.
--    Criar/renomear/arquivar: SÓ GESTOR. Grupo é estrutural — um grupo
--    solto quebra Análise, Início e orçamento para os dois usuários. Por
--    isso, diferente de subcategoria (que a colab cria), mexer em grupo é
--    só do gestor.
--
--    NUNCA usar `auth.uid() IS NOT NULL` (falha corrigida em 05/08/2026).
-- ---------------------------------------------------------------------
alter table public.grupos enable row level security;

drop policy if exists grupos_sel on public.grupos;
create policy grupos_sel on public.grupos for select
  using (public.eh_membro());

drop policy if exists grupos_ins on public.grupos;
create policy grupos_ins on public.grupos for insert
  with check (public.is_admin());

drop policy if exists grupos_upd on public.grupos;
create policy grupos_upd on public.grupos for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists grupos_del on public.grupos;
create policy grupos_del on public.grupos for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Criar grupo — validação central no banco
--    Retorna a linha criada. A tela poderia inserir direto (RLS já barra
--    a colab), mas centralizar aqui garante nome único normalizado e
--    ordem no fim da lista sem corrida.
-- ---------------------------------------------------------------------
create or replace function public.criar_grupo(
  p_nome text,
  p_cor  text default '#9aa3b2',
  p_tier text default null,
  p_eixo text default 'despesa'
) returns public.grupos
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nm   text := btrim(coalesce(p_nome, ''));
  nova public.grupos;
  ord  integer;
begin
  if not public.is_admin() then
    raise exception 'Só o gestor pode criar grupo.' using errcode = '42501';
  end if;
  if nm = '' then
    raise exception 'O grupo precisa de um nome.' using errcode = '22023';
  end if;
  if exists (select 1 from public.grupos where lower(nome) = lower(nm)) then
    raise exception 'Já existe um grupo com esse nome.' using errcode = '23505';
  end if;

  select coalesce(max(ordem), 0) + 10 into ord from public.grupos;

  insert into public.grupos (nome, cor, tier, eixo, ordem)
  values (nm, coalesce(nullif(btrim(p_cor), ''), '#9aa3b2'), p_tier,
          coalesce(nullif(btrim(p_eixo), ''), 'despesa'), ord)
  returning * into nova;

  return nova;
end;
$$;

revoke execute on function public.criar_grupo(text, text, text, text) from public, anon;
grant execute on function public.criar_grupo(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Renomear grupo — ATÔMICO
--    O nome do grupo é chave de texto em três lugares. Mudar num só deixa
--    os outros apontando para nome morto:
--      * categorias.grupo   -> a taxonomia inteira
--      * metas.categoria/grupo -> o orçamento (categoria é PK)
--      * grupos.nome        -> a metadata
--    `regras` referencia categoria (subcategoria), não grupo, então não
--    entra aqui.
-- ---------------------------------------------------------------------
create or replace function public.renomear_grupo(
  p_id        bigint,
  p_novo_nome text
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  antigo text;
  novo   text := btrim(coalesce(p_novo_nome, ''));
  n_cats int;
begin
  if not public.is_admin() then
    raise exception 'Só o gestor pode renomear grupo.' using errcode = '42501';
  end if;
  if novo = '' then
    raise exception 'O grupo precisa de um nome.' using errcode = '22023';
  end if;

  select nome into antigo from public.grupos where id = p_id;
  if antigo is null then
    raise exception 'Grupo não encontrado.' using errcode = '02000';
  end if;
  if antigo = novo then
    return json_build_object('ok', true, 'movidas', 0, 'inalterado', true);
  end if;
  if exists (select 1 from public.grupos where lower(nome) = lower(novo) and id <> p_id) then
    raise exception 'Já existe um grupo com esse nome.' using errcode = '23505';
  end if;

  update public.grupos set nome = novo where id = p_id;

  update public.categorias set grupo = novo where grupo = antigo;
  get diagnostics n_cats = row_count;

  -- Orçamento: `metas.categoria` é PK e espelha o nome do grupo; `grupo`
  -- é a coluna semântica. Atualizar as duas mantém o app antigo e o novo
  -- coerentes (ver db.js › salvarMeta).
  update public.metas set categoria = novo, grupo = novo
   where categoria = antigo or grupo = antigo;

  return json_build_object('ok', true, 'subcategorias', n_cats,
                           'de', antigo, 'para', novo);
end;
$$;

revoke execute on function public.renomear_grupo(bigint, text) from public, anon;
grant execute on function public.renomear_grupo(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Arquivar grupo — ATÔMICO
--    Move TODAS as subcategorias do grupo (e, por tabela, seus
--    lançamentos e regras) para um grupo de destino, depois marca o grupo
--    como inativo. Falha no meio corromperia: subcategoria apontando para
--    grupo morto, ou grupo sumindo com lançamentos órfãos.
--
--    Ao contrário de arquivar SUBcategoria, aqui não se remaneja para uma
--    subcategoria específica: as subcategorias do grupo simplesmente
--    passam a pertencer ao grupo de destino, preservando cada lançamento
--    na sua subcategoria (que continua descritiva). Se o destino já tiver
--    uma subcategoria de mesmo nome, as duas se fundem.
-- ---------------------------------------------------------------------
create or replace function public.arquivar_grupo(
  p_id           bigint,
  p_destino_nome text
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  origem  text;
  destino text := btrim(coalesce(p_destino_nome, ''));
  movidas int := 0;
  fundidas int := 0;
  r record;
  id_dest bigint;
begin
  if not public.is_admin() then
    raise exception 'Só o gestor pode arquivar grupo.' using errcode = '42501';
  end if;

  select nome into origem from public.grupos where id = p_id;
  if origem is null then
    raise exception 'Grupo não encontrado.' using errcode = '02000';
  end if;
  if destino = '' or destino = origem then
    raise exception 'Escolha um grupo de destino diferente.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.grupos where nome = destino and ativa) then
    raise exception 'Grupo de destino não existe ou está arquivado.' using errcode = '02000';
  end if;

  -- Para cada subcategoria do grupo de origem, ou funde com a homônima já
  -- existente no destino, ou move a subcategoria para o destino. O trigger
  -- trg_a_resolver_categoria mantém o texto coerente.
  --
  -- A busca do destino homônimo NÃO filtra por `ativa`: a unique
  -- (grupo, nome) inclui arquivadas, então mover uma sub cujo nome colide
  -- com uma arquivada do destino violaria a constraint. Preferindo a ativa
  -- quando houver as duas.
  for r in select * from public.categorias where grupo = origem loop
    select id into id_dest from public.categorias
      where grupo = destino and lower(nome) = lower(r.nome) and id <> r.id
      order by ativa desc, ordem limit 1;

    if id_dest is not null then
      -- Funde: garante o destino ATIVO (vai receber lançamentos vivos —
      -- regra/transação apontando para arquivada quebraria a asserção 7 do
      -- verificacao.sql), reaponta lançamentos e regras, arquiva a origem.
      update public.categorias   set ativa = true  where id = id_dest and not ativa;
      update public.transacoes set categoria_id = id_dest where categoria_id = r.id;
      update public.regras       set categoria_id = id_dest where categoria_id = r.id;
      update public.categorias   set ativa = false where id = r.id;
      fundidas := fundidas + 1;
    else
      -- Move a subcategoria inteira para o grupo de destino.
      update public.categorias set grupo = destino where id = r.id;
      movidas := movidas + 1;
    end if;
  end loop;

  -- Orçamento do grupo de origem deixa de fazer sentido — remove.
  delete from public.metas where categoria = origem or grupo = origem;

  update public.grupos set ativa = false where id = p_id;

  return json_build_object('ok', true, 'de', origem, 'para', destino,
                           'movidas', movidas, 'fundidas', fundidas);
end;
$$;

revoke execute on function public.arquivar_grupo(bigint, text) from public, anon;
grant execute on function public.arquivar_grupo(bigint, text) to authenticated;
