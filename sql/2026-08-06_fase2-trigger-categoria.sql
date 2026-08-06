-- =====================================================================
-- Fase 2 — trigger que resolve texto -> categoria_id — 06/08/2026
--
-- OBJETIVO: `categoria_id` vira a fonte da verdade da leitura SEM que
-- nenhum script em /root/financas/ seja alterado. Isso importa: a VPS é
-- deploy separado, roda por cron às 7h, e um erro lá ficaria invisível
-- até o dia seguinte.
--
-- O PROBLEMA QUE ISTO RESOLVE: a VPS classifica consultando `regras` e
-- grava `regras.categoria`, que é TEXTO ANTIGO — 'Outros', 'Pix pessoas',
-- 'Revenda/Materiais'. O de-para que traduzia esses nomes era uma tabela
-- temporária da Fase 1b e foi destruída. Sem um de-para permanente, todo
-- lançamento novo do cron cairia na fila mesmo tendo regra que o
-- classifica — a fila se realimentaria sozinha, contra a meta de 8%.
--
-- Rollback:
--   drop trigger trg_resolver_categoria on public.transacoes;
--   drop trigger trg_resolver_categoria_regra on public.regras;
--   drop function public.resolver_categoria_id();
--   (a tabela categoria_alias pode ficar — é inerte sem o trigger)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. De-para permanente
-- ---------------------------------------------------------------------
create table if not exists public.categoria_alias (
  alias        text primary key,
  categoria_id bigint not null references public.categorias(id) on delete cascade,
  criado_em    timestamptz not null default now()
);

comment on table public.categoria_alias is
  'Nomes antigos de categoria -> id novo. Existe porque a VPS grava texto antigo e não será alterada. Alimenta o trigger da Fase 2.';

insert into public.categoria_alias (alias, categoria_id)
select d.alias, c.id
  from (values
    ('Supermercado','Alimentação','Supermercado'),
    ('Restaurante','Alimentação','Restaurante'),
    ('Água (galão)','Alimentação','Água (galão)'),
    ('Moradia','Moradia','Aluguel/Moradia'),
    ('Energia','Moradia','Energia'),
    ('Água','Moradia','Água'),
    ('Gás','Moradia','Gás'),
    ('Telefonia','Moradia','Internet/Telefonia'),
    ('Telefonia/Internet','Moradia','Internet/Telefonia'),
    ('Casa','Moradia','Manutenção da casa'),
    ('Farmácia','Saúde','Farmácia'),
    ('Saúde','Saúde','Consulta/Exame'),
    ('Clínica','Saúde','Consulta/Exame'),
    ('Terapia','Saúde','Terapia'),
    ('Combustível','Transporte','Combustível'),
    ('Transporte','Transporte','App/Táxi'),
    ('Estacionamento','Transporte','Estacionamento'),
    ('Automotivo','Transporte','Manutenção do carro'),
    ('Carro/Grande','Transporte','Veículo'),
    ('Vestuário','Cuidado pessoal','Vestuário'),
    ('Estética/Beleza','Cuidado pessoal','Estética/Beleza'),
    ('Barbearia','Cuidado pessoal','Barbearia'),
    ('Academia','Cuidado pessoal','Academia'),
    ('Esporte','Cuidado pessoal','Esporte'),
    ('Pet','Cuidado pessoal','Pet'),
    ('Curso','Educação','Curso'),
    ('Curso (trading)','Educação','Curso'),
    ('Curso digital','Educação','Curso'),
    ('Livraria','Educação','Curso'),
    ('Curso/Mentoria','Educação','Mentoria'),
    ('Viagem','Lazer','Viagem'),
    ('Hotel','Lazer','Viagem'),
    ('Assinatura','Lazer','Assinaturas'),
    ('Assinatura/Cloud','Lazer','Assinaturas'),
    ('Lazer','Lazer','Outros lazer'),
    ('Outros','Compras','Marketplace'),
    ('Eletrônicos','Compras','Eletrônicos'),
    ('Presente','Compras','Presente'),
    ('Secretária/Babá','Serviços & obrigações','Secretária/Babá'),
    ('Pix pessoas','Serviços & obrigações','Pessoas/avulsos'),
    ('Assinatura/Software','Serviços & obrigações','Software/Ferramentas'),
    ('Ferramenta/Software','Serviços & obrigações','Software/Ferramentas'),
    ('Cloud/Ads','Serviços & obrigações','Software/Ferramentas'),
    ('Assinatura intl','Serviços & obrigações','Software/Ferramentas'),
    ('Contabilidade','Serviços & obrigações','Contabilidade'),
    ('Impostos','Serviços & obrigações','Impostos'),
    ('Tarifa/Imposto','Serviços & obrigações','Impostos'),
    ('Tarifa cartão','Serviços & obrigações','Tarifas bancárias'),
    ('China/Insumos','Empresas','Insumos'),
    ('Compras/Insumos','Empresas','Insumos'),
    ('Embalagens','Empresas','Embalagens'),
    ('Revenda','Empresas','Revenda'),
    ('Revenda móveis','Empresas','Revenda'),
    ('Revenda/Materiais','Empresas','Revenda'),
    ('Sala','Empresas','Sala'),
    ('Equipamento','Empresas','Equipamento'),
    ('Recebível sociedade antiga','Receitas','Recebível sociedade antiga'),
    ('Dividendos (sociedade antiga)','Receitas','Dividendos (sociedade antiga)'),
    ('Receita clínica','Receitas','Receita clínica'),
    ('Pagamento cartão','Movimentação','Pagamento de cartão'),
    ('Transfer. própria','Movimentação','Transferência própria'),
    ('Transfer./investimento','Movimentação','Investimento'),
    ('Investimento','Movimentação','Investimento'),
    ('Resgate CDB','Movimentação','Resgate de investimento'),
    ('Transfer./estorno','Movimentação','Estorno'),
    ('Estorno','Movimentação','Estorno'),
    ('Desconto','Movimentação','Desconto'),
    ('Venda de veículo','Movimentação','Venda de bem'),
    ('Venda de veículo (moto)','Movimentação','Venda de bem')
  ) as d(alias, grupo, nome)
  join public.categorias c on c.grupo = d.grupo and c.nome = d.nome
on conflict (alias) do nothing;

alter table public.categoria_alias enable row level security;
drop policy if exists alias_sel on public.categoria_alias;
create policy alias_sel on public.categoria_alias for select using (public.eh_membro());
drop policy if exists alias_ins on public.categoria_alias;
create policy alias_ins on public.categoria_alias for insert with check (public.is_admin());
drop policy if exists alias_upd on public.categoria_alias;
create policy alias_upd on public.categoria_alias for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists alias_del on public.categoria_alias;
create policy alias_del on public.categoria_alias for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. A função do trigger
-- ---------------------------------------------------------------------
-- CONTRATO (spec §6), para texto desconhecido vindo da VPS:
--   * `categoria_id` fica NULO
--   * o texto original é PRESERVADO intacto
--   * o lançamento cai na fila de triagem
--   * NUNCA cria categoria e NUNCA descarta o texto
--
-- Categoria nova nasce por decisão humana na tela de Categorias, não por
-- efeito colateral de um cron às 7h.
-- O trigger também SINCRONIZA o texto com o id. Isso não é enfeite:
--   1. O app ANTIGO (na `main`, no ar hoje) lê `categoria` como TEXTO. Se
--      o app novo mudasse só o `categoria_id`, o casal veria categorias
--      diferentes em cada app durante toda a transição.
--   2. A VPS também raciocina sobre texto.
--   3. Sem isso, toda reclassificação manual deixa texto e id se
--      contradizendo — o apodrecimento que a asserção de coerência do
--      `verificacao.sql` existe para pegar (e pegou, no teste 7).
-- O texto de origem não se perde: está nos CSVs exportados no passo 1.
create or replace function public.resolver_categoria_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  txt   text;
  achou bigint;
  grp   text;
  nm    text;
begin
  achou := new.categoria_id;   -- escolha explícita sempre vence

  if achou is null then
    -- Em UPDATE, só resolve o que NUNCA foi resolvido. Se alguém zerou o
    -- categoria_id de propósito (mandar para a triagem), o trigger não
    -- pode desfazer isso na mesma hora.
    if tg_op = 'UPDATE' and old.categoria_id is not null then
      return new;
    end if;

    txt := btrim(coalesce(new.categoria, ''));
    if txt = '' then
      return new;
    end if;

    -- 1) nome exato de uma subcategoria ativa
    select id into achou from public.categorias
     where nome = txt and ativa order by ordem limit 1;

    -- 2) de-para dos nomes antigos que a VPS ainda grava
    if achou is null then
      select categoria_id into achou from public.categoria_alias where alias = txt;
    end if;

    -- 3) desconhecido: fica nulo, texto preservado, vai para a fila.
    --    NUNCA cria categoria, NUNCA descarta o texto.
    if achou is null then
      return new;
    end if;

    new.categoria_id := achou;
  end if;

  select grupo, nome into grp, nm from public.categorias where id = achou;
  if nm is null then
    return new;
  end if;

  new.categoria := nm;   -- texto acompanha o id

  -- Movimentação nunca entra no eixo de gasto. Sem isto, um 'Desconto'
  -- novo vindo do cron entraria como gasto e quebraria a asserção do
  -- verificacao.sql no dia seguinte, silenciosamente.
  if tg_table_name = 'transacoes'
     and grp = 'Movimentação'
     and coalesce(new.cls,'') <> 'Não é gasto' then
    new.cls := 'Não é gasto';
  end if;

  return new;
end;
$$;

-- Função de trigger: ninguém precisa chamar via RPC.
revoke execute on function public.resolver_categoria_id() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Os gatilhos
-- ---------------------------------------------------------------------
-- Nome escolhido para ordenar ANTES de trg_trava_colunas_transacao
-- (gatilhos BEFORE do mesmo evento disparam em ordem alfabética): a trava
-- avalia colunas protegidas, e `categoria_id` não é uma delas — mas
-- resolver primeiro deixa o estado coerente para qualquer trava futura.
drop trigger if exists trg_a_resolver_categoria on public.transacoes;
create trigger trg_a_resolver_categoria
  before insert or update on public.transacoes
  for each row execute function public.resolver_categoria_id();

drop trigger if exists trg_a_resolver_categoria_regra on public.regras;
create trigger trg_a_resolver_categoria_regra
  before insert or update on public.regras
  for each row execute function public.resolver_categoria_id();
