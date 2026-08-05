-- =====================================================================
-- Blindagem de RLS — 05/08/2026
--
-- PROBLEMA: todas as políticas de leitura eram `auth.uid() IS NOT NULL`,
-- ou seja "qualquer usuário logado". Com o cadastro aberto no Auth e a
-- anon key publicada no repo público, qualquer pessoa da internet podia
-- criar conta e ler/editar as 3.132 transações, o patrimônio e a config.
--
-- SOLUÇÃO: trocar "logado" por "é membro da família" (tem linha em perfis),
-- restringir patrimônio/auditoria ao gestor, aplicar a separação PF/PJ no
-- banco (e não só no JS), e limitar quais colunas a colab pode editar.
--
-- A VPS usa service_role, que ignora RLS — o sync não é afetado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helper: é membro da família?
-- ---------------------------------------------------------------------
create or replace function public.eh_membro()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select exists (select 1 from public.perfis where id = auth.uid()); $$;

comment on function public.eh_membro() is
  'True se o usuário logado tem perfil cadastrado. Substitui auth.uid() IS NOT NULL nas policies.';

-- ATENÇÃO: PUBLIC tem EXECUTE por padrão, então revogar só de `anon` não
-- surte efeito — tem que revogar de `public` primeiro e regrantear.
-- As policies avaliam com os privilégios de quem consulta, logo o membro
-- logado precisa de EXECUTE nestas duas.
revoke execute on function public.eh_membro() from public, anon, authenticated;
revoke execute on function public.is_admin()  from public, anon, authenticated;
grant  execute on function public.eh_membro() to authenticated;
grant  execute on function public.is_admin()  to authenticated;

-- ---------------------------------------------------------------------
-- 2. transacoes — leitura por membro, com separação PF/PJ no banco
-- ---------------------------------------------------------------------
drop policy if exists tx_leitura on public.transacoes;
create policy tx_leitura on public.transacoes for select
using (
  public.is_admin()
  or (
    public.eh_membro()
    and coalesce(cls,'') <> 'OQV'
    and coalesce(src,'') !~* '^(BTG|Nubank|Infinit)'
  )
);

-- tx_update_all deixava qualquer logado reescrever valor/data/tipo.
drop policy if exists tx_update_all on public.transacoes;
create policy tx_update_membro on public.transacoes for update
using (
  public.is_admin()
  or (
    public.eh_membro()
    and coalesce(cls,'') <> 'OQV'
    and coalesce(src,'') !~* '^(BTG|Nubank|Infinit)'
  )
)
with check (public.eh_membro());

-- Colab só pode mexer em categoria/cls/rev. Valor, data, descrição e
-- origem vêm do banco e não se editam à mão.
create or replace function public.trava_colunas_transacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.valor is distinct from old.valor
     or new.data is distinct from old.data
     or new.tipo is distinct from old.tipo
     or new.descricao is distinct from old.descricao
     or new.src is distinct from old.src
     or new.ext_id is distinct from old.ext_id
     or new.data_compra is distinct from old.data_compra
     or new.parcela is distinct from old.parcela then
    raise exception
      'Sem permissão: só o gestor altera valor, data, tipo, descrição ou origem.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trava_colunas_transacao on public.transacoes;
create trigger trg_trava_colunas_transacao
  before update on public.transacoes
  for each row execute function public.trava_colunas_transacao();

-- Função de trigger: ninguém precisa chamar via RPC.
revoke execute on function public.trava_colunas_transacao() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. patrimonio e audit_log — só o gestor
-- ---------------------------------------------------------------------
drop policy if exists patr_sel on public.patrimonio;
create policy patr_sel on public.patrimonio for select using (public.is_admin());

drop policy if exists audit_leitura on public.audit_log;
create policy audit_leitura on public.audit_log for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. Demais tabelas — "logado" vira "membro"
--    config fica em membro de propósito: o dashboard da Raiane usa
--    renda_ref/pct_parcela na projeção de parcelamento.
-- ---------------------------------------------------------------------
drop policy if exists cfg_sel on public.config;
create policy cfg_sel on public.config for select using (public.eh_membro());

drop policy if exists metas_sel on public.metas;
create policy metas_sel on public.metas for select using (public.eh_membro());

drop policy if exists regras_sel on public.regras;
create policy regras_sel on public.regras for select using (public.eh_membro());
drop policy if exists regras_ins on public.regras;
create policy regras_ins on public.regras for insert with check (public.eh_membro());
drop policy if exists regras_upd on public.regras;
create policy regras_upd on public.regras for update
  using (public.eh_membro()) with check (public.eh_membro());

drop policy if exists log_sel on public.log_alteracoes;
create policy log_sel on public.log_alteracoes for select using (public.eh_membro());
drop policy if exists log_ins on public.log_alteracoes;
create policy log_ins on public.log_alteracoes for insert with check (public.eh_membro());

drop policy if exists comandos_sel on public.comandos;
create policy comandos_sel on public.comandos for select using (public.eh_membro());
drop policy if exists comandos_ins on public.comandos;
create policy comandos_ins on public.comandos for insert with check (public.eh_membro());

drop policy if exists perg_leitura on public.perguntas;
create policy perg_leitura on public.perguntas for select using (public.eh_membro());

-- ---------------------------------------------------------------------
-- 5. Entulho do fluxo de aprovação (removido do produto)
--    propostas e audit_log estavam com 0 linhas na data desta migração.
--    classe_da_colab ainda listava "Rayane" com y — nome errado.
-- ---------------------------------------------------------------------
-- Ordem importa: a policy prop_insert depende de classe_da_colab(), então
-- a tabela sai antes da função.
drop view if exists public.proposals;
drop function if exists public.aprovar_proposta(bigint);
drop function if exists public.recusar_proposta(bigint);
drop table if exists public.propostas;
drop function if exists public.classe_da_colab(text);
