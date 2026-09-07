-- =====================================================================
-- Conexões Pluggy — 06/09/2026  (Fase 2 da migração para o Pluggy)
--
-- Guarda o vínculo entre cada instituição conectada e o `itemId` do Pluggy,
-- criado pelo widget Pluggy Connect na tela conectar.html. A Fase 3 (VPS)
-- usa esses item_ids para ler as transações e gravar em `transacoes`.
--
-- SÓ GESTOR: conexão bancária é decisão do dono. Segue o padrão de
-- patrimonio/audit_log (is_admin()). A VPS usa service_role e ignora RLS.
--
-- Aplicar no Supabase (SQL editor) uma vez. Nada destrutivo.
-- =====================================================================

create table if not exists public.conexoes_pluggy (
  id           uuid primary key default gen_random_uuid(),
  instituicao  text not null,                 -- 'Itaú', 'BTG', 'Nubank', 'InfinitePay'
  item_id      text not null unique,          -- itemId do Pluggy
  status       text not null default 'CREATED',
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.conexoes_pluggy is
  'Vínculo instituição <-> itemId do Pluggy. Só gestor. Alimenta a ingestão da VPS (Fase 3).';

alter table public.conexoes_pluggy enable row level security;

-- Só o gestor vê e mexe. (A VPS, com service_role, ignora RLS.)
drop policy if exists conexoes_sel on public.conexoes_pluggy;
create policy conexoes_sel on public.conexoes_pluggy for select using (public.is_admin());

drop policy if exists conexoes_ins on public.conexoes_pluggy;
create policy conexoes_ins on public.conexoes_pluggy for insert with check (public.is_admin());

drop policy if exists conexoes_upd on public.conexoes_pluggy;
create policy conexoes_upd on public.conexoes_pluggy for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists conexoes_del on public.conexoes_pluggy;
create policy conexoes_del on public.conexoes_pluggy for delete using (public.is_admin());

-- Mantém atualizado_em em dia.
create or replace function public.touch_conexoes_pluggy()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

drop trigger if exists trg_touch_conexoes_pluggy on public.conexoes_pluggy;
create trigger trg_touch_conexoes_pluggy
  before update on public.conexoes_pluggy
  for each row execute function public.touch_conexoes_pluggy();
