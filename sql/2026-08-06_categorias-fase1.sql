-- =====================================================================
-- Fase 1a da migração de categorias — 06/08/2026
--
-- Cria a tabela `categorias` e semeia a taxonomia de 2 níveis.
-- ADITIVA: não toca em `transacoes` nem em `regras`. O texto continua
-- sendo a fonte da verdade, a VPS e as telas atuais seguem funcionando
-- sem saber que algo mudou.
--
-- Taxonomia: 11 grupos (10 de despesa + Receitas), 47 subcategorias.
-- Origem e de-para completo: docs/taxonomia-categorias.md
--
-- `ordem` é global: (índice do grupo × 100) + posição da sub. Ordena
-- grupos e subs com um único ORDER BY, sem tabela de grupos.
--
-- Rollback: drop table public.categorias;  (nada depende dela ainda)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
create table if not exists public.categorias (
  id        bigint generated always as identity primary key,
  grupo     text    not null,
  nome      text    not null,
  ativa     boolean not null default true,
  ordem     integer not null default 0,
  criado_em timestamptz not null default now(),
  constraint categorias_grupo_nome_unico unique (grupo, nome)
);

comment on table public.categorias is
  'Taxonomia de categorias em 2 níveis. Grupo é texto: 11 valores estáveis vindos de padrão externo (Plaid/POF), tabela separada seria cerimônia sem ganho.';
comment on column public.categorias.ordem is
  'Ordenação global: (índice do grupo × 100) + posição da sub dentro do grupo.';

create index if not exists categorias_grupo_idx on public.categorias (grupo);

-- ---------------------------------------------------------------------
-- 2. Seed — 47 subcategorias
-- ---------------------------------------------------------------------
insert into public.categorias (grupo, nome, ordem) values
  -- 1. Alimentação
  ('Alimentação',           'Supermercado',                   101),
  ('Alimentação',           'Restaurante',                    102),
  ('Alimentação',           'Delivery',                       103),
  ('Alimentação',           'Água (galão)',                   104),
  -- 2. Moradia
  ('Moradia',               'Aluguel/Moradia',                201),
  ('Moradia',               'Energia',                        202),
  ('Moradia',               'Água',                           203),
  ('Moradia',               'Gás',                            204),
  ('Moradia',               'Internet/Telefonia',             205),
  ('Moradia',               'Manutenção da casa',             206),
  -- 3. Saúde
  ('Saúde',                 'Farmácia',                       301),
  ('Saúde',                 'Consulta/Exame',                 302),
  ('Saúde',                 'Terapia',                        303),
  ('Saúde',                 'Plano de saúde',                 304),
  -- 4. Transporte
  ('Transporte',            'Combustível',                    401),
  ('Transporte',            'App/Táxi',                       402),
  ('Transporte',            'Estacionamento',                 403),
  ('Transporte',            'Manutenção do carro',            404),
  ('Transporte',            'Veículo',                        405),
  -- 5. Cuidado pessoal
  ('Cuidado pessoal',       'Vestuário',                      501),
  ('Cuidado pessoal',       'Estética/Beleza',                502),
  ('Cuidado pessoal',       'Barbearia',                      503),
  ('Cuidado pessoal',       'Academia',                       504),
  ('Cuidado pessoal',       'Esporte',                        505),
  ('Cuidado pessoal',       'Pet',                            506),
  -- 6. Educação
  ('Educação',              'Curso',                          601),
  ('Educação',              'Mentoria',                       602),
  -- 7. Lazer
  ('Lazer',                 'Viagem',                         701),
  ('Lazer',                 'Assinaturas',                    702),
  ('Lazer',                 'Outros lazer',                   703),
  -- 8. Compras  (nasceu em 06/08: `Outros` era marketplace)
  ('Compras',               'Marketplace',                    801),
  ('Compras',               'Eletrônicos',                    802),
  ('Compras',               'Presente',                       803),
  -- 9. Serviços & obrigações
  ('Serviços & obrigações', 'Secretária/Babá',                901),
  ('Serviços & obrigações', 'Pessoas/avulsos',                902),
  ('Serviços & obrigações', 'Software/Ferramentas',           903),
  ('Serviços & obrigações', 'Contabilidade',                  904),
  ('Serviços & obrigações', 'Impostos',                       905),
  ('Serviços & obrigações', 'Tarifas bancárias',              906),
  -- 10. Empresas
  ('Empresas',              'Insumos',                       1001),
  ('Empresas',              'Embalagens',                    1002),
  ('Empresas',              'Revenda',                       1003),
  ('Empresas',              'Sala',                          1004),
  ('Empresas',              'Equipamento',                   1005),
  -- 11. Receitas  (não aparece em Análise nem no orçamento)
  ('Receitas',              'Recebível sociedade antiga',    1101),
  ('Receitas',              'Dividendos (sociedade antiga)', 1102),
  ('Receitas',              'Receita clínica',               1103),
  -- 12. Movimentação  (dinheiro andando de bolso em bolso — cls 'Não é gasto')
  ('Movimentação',          'Pagamento de cartão',           1201),
  ('Movimentação',          'Transferência própria',         1202),
  ('Movimentação',          'Investimento',                  1203),
  ('Movimentação',          'Resgate de investimento',       1204),
  ('Movimentação',          'Estorno',                       1205),
  ('Movimentação',          'Desconto',                      1206),
  ('Movimentação',          'Venda de bem',                  1207)
on conflict (grupo, nome) do nothing;

-- Nota (06/08/2026): `Movimentação` não estava na taxonomia original, que dizia
-- apenas "movimentação não é categoria — sai do eixo de gasto". Correto para a
-- ANÁLISE, mas no modelo de dados deixaria 197 lançamentos sem `categoria_id`,
-- indistinguíveis da fila de triagem. Eles são excluídos dos gráficos por
-- `cls = 'Não é gasto'`, não por falta de categoria. Mesmo papel de `Receitas`:
-- existe para que toda linha tenha grupo, e nunca aparece em Análise/orçamento.

-- ---------------------------------------------------------------------
-- 3. RLS
--    Leitura: membro da família.
--    Criar sub: membro (a Raiane cria, spec §8).
--    Renomear/arquivar/apagar: só gestor.
--
--    NUNCA usar `auth.uid() IS NOT NULL` — isso é "qualquer um que criou
--    conta", não "a família". Foi a falha corrigida em 05/08/2026.
-- ---------------------------------------------------------------------
alter table public.categorias enable row level security;

drop policy if exists cat_sel on public.categorias;
create policy cat_sel on public.categorias for select
  using (public.eh_membro());

drop policy if exists cat_ins on public.categorias;
create policy cat_ins on public.categorias for insert
  with check (public.eh_membro());

drop policy if exists cat_upd on public.categorias;
create policy cat_upd on public.categorias for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists cat_del on public.categorias;
create policy cat_del on public.categorias for delete
  using (public.is_admin());
