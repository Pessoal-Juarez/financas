-- =====================================================================
-- Fase 1b — `categoria_id` em transacoes e regras + backfill — 06/08/2026
--
-- ADITIVA E REVERSÍVEL. O texto `categoria` PERMANECE nas duas tabelas
-- (a Fase 3 destrutiva foi cortada do escopo — spec §6), servindo de
-- backup legível e mantendo a VPS funcionando sem alteração.
--
-- Rollback:
--   alter table public.transacoes drop column categoria_id;
--   alter table public.regras     drop column categoria_id;
--
-- ⚠️ NÃO consolidar regras de marketplace por prefixo.
--    Medido em 06/08: as 119 regras `SHOPEE*` cobrem 6 categorias e 5
--    classificações — OQV, Rai Móveis e Slim Fit entre elas. Uma regra
--    `SHOPEE` genérica reclassificaria compras das empresas como gasto
--    pessoal, destruindo a separação PF/PJ. As regras por vendedor não
--    são excesso de granularidade: elas guardam a informação de qual
--    vendedor pertence a qual negócio. Só a categoria é remapeada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------
alter table public.transacoes
  add column if not exists categoria_id bigint references public.categorias(id);
alter table public.regras
  add column if not exists categoria_id bigint references public.categorias(id);

create index if not exists transacoes_categoria_id_idx on public.transacoes (categoria_id);
create index if not exists regras_categoria_id_idx     on public.regras (categoria_id);

comment on column public.transacoes.categoria_id is
  'FK para categorias. Nulo = precisa de triagem. O texto `categoria` permanece como backup legível.';

-- ---------------------------------------------------------------------
-- 2. De-para: texto antigo -> (grupo, nome) novo
--    Origem: docs/taxonomia-categorias.md
--    O join usa btrim(), então variantes com espaço sobrando
--    ('Curso ', 'Impostos ') colapsam sozinhas.
-- ---------------------------------------------------------------------
-- Tabela auxiliar comum aos dois backfills. Criada e destruída aqui mesmo —
-- `temporary ... on commit drop` não é confiável quando o executor decide
-- sozinho se envolve a migração numa transação.
drop table if exists public.depara_tmp;
create table public.depara_tmp (antigo text primary key, grupo text, nome text);

insert into public.depara_tmp (antigo, grupo, nome) values
  -- Alimentação
  ('Supermercado',                  'Alimentação',           'Supermercado'),
  ('Restaurante',                   'Alimentação',           'Restaurante'),
  ('Água (galão)',                  'Alimentação',           'Água (galão)'),
  -- Moradia
  ('Moradia',                       'Moradia',               'Aluguel/Moradia'),
  ('Energia',                       'Moradia',               'Energia'),
  ('Água',                          'Moradia',               'Água'),
  ('Gás',                           'Moradia',               'Gás'),
  ('Telefonia',                     'Moradia',               'Internet/Telefonia'),
  ('Telefonia/Internet',            'Moradia',               'Internet/Telefonia'),
  ('Casa',                          'Moradia',               'Manutenção da casa'),
  -- Saúde
  ('Farmácia',                      'Saúde',                 'Farmácia'),
  ('Saúde',                         'Saúde',                 'Consulta/Exame'),
  ('Clínica',                       'Saúde',                 'Consulta/Exame'),
  ('Terapia',                       'Saúde',                 'Terapia'),
  -- Transporte
  ('Combustível',                   'Transporte',            'Combustível'),
  ('Transporte',                    'Transporte',            'App/Táxi'),
  ('Estacionamento',                'Transporte',            'Estacionamento'),
  ('Automotivo',                    'Transporte',            'Manutenção do carro'),
  ('Carro/Grande',                  'Transporte',            'Veículo'),
  -- Cuidado pessoal
  ('Vestuário',                     'Cuidado pessoal',       'Vestuário'),
  ('Estética/Beleza',               'Cuidado pessoal',       'Estética/Beleza'),
  ('Barbearia',                     'Cuidado pessoal',       'Barbearia'),
  ('Academia',                      'Cuidado pessoal',       'Academia'),
  ('Esporte',                       'Cuidado pessoal',       'Esporte'),
  ('Pet',                           'Cuidado pessoal',       'Pet'),
  -- Educação
  ('Curso',                         'Educação',              'Curso'),
  ('Curso (trading)',               'Educação',              'Curso'),
  ('Curso digital',                 'Educação',              'Curso'),
  ('Livraria',                      'Educação',              'Curso'),
  ('Curso/Mentoria',                'Educação',              'Mentoria'),
  -- Lazer
  ('Viagem',                        'Lazer',                 'Viagem'),
  ('Hotel',                         'Lazer',                 'Viagem'),
  ('Assinatura',                    'Lazer',                 'Assinaturas'),
  ('Assinatura/Cloud',              'Lazer',                 'Assinaturas'),
  ('Lazer',                         'Lazer',                 'Outros lazer'),
  -- Compras
  ('Outros',                        'Compras',               'Marketplace'),
  ('Eletrônicos',                   'Compras',               'Eletrônicos'),
  ('Presente',                      'Compras',               'Presente'),
  -- Serviços & obrigações
  ('Secretária/Babá',               'Serviços & obrigações', 'Secretária/Babá'),
  ('Pix pessoas',                   'Serviços & obrigações', 'Pessoas/avulsos'),
  ('Assinatura/Software',           'Serviços & obrigações', 'Software/Ferramentas'),
  ('Ferramenta/Software',           'Serviços & obrigações', 'Software/Ferramentas'),
  ('Cloud/Ads',                     'Serviços & obrigações', 'Software/Ferramentas'),
  ('Assinatura intl',               'Serviços & obrigações', 'Software/Ferramentas'),
  ('Contabilidade',                 'Serviços & obrigações', 'Contabilidade'),
  ('Impostos',                      'Serviços & obrigações', 'Impostos'),
  ('Tarifa/Imposto',                'Serviços & obrigações', 'Impostos'),
  ('Tarifa cartão',                 'Serviços & obrigações', 'Tarifas bancárias'),
  -- Empresas
  ('China/Insumos',                 'Empresas',              'Insumos'),
  ('Compras/Insumos',               'Empresas',              'Insumos'),
  ('Embalagens',                    'Empresas',              'Embalagens'),
  ('Revenda',                       'Empresas',              'Revenda'),
  ('Revenda móveis',                'Empresas',              'Revenda'),
  ('Revenda/Materiais',             'Empresas',              'Revenda'),
  ('Sala',                          'Empresas',              'Sala'),
  ('Equipamento',                   'Empresas',              'Equipamento'),
  -- Receitas  (correção de 06/08: NÃO são movimentação, é dinheiro que entrou)
  ('Recebível sociedade antiga',    'Receitas',              'Recebível sociedade antiga'),
  ('Dividendos (sociedade antiga)', 'Receitas',              'Dividendos (sociedade antiga)'),
  ('Receita clínica',               'Receitas',              'Receita clínica'),
  -- Movimentação  (dinheiro andando de bolso em bolso)
  ('Pagamento cartão',              'Movimentação',          'Pagamento de cartão'),
  ('Transfer. própria',             'Movimentação',          'Transferência própria'),
  ('Transfer./investimento',        'Movimentação',          'Investimento'),
  ('Investimento',                  'Movimentação',          'Investimento'),
  ('Resgate CDB',                   'Movimentação',          'Resgate de investimento'),
  ('Transfer./estorno',             'Movimentação',          'Estorno'),
  ('Estorno',                       'Movimentação',          'Estorno'),
  ('Desconto',                      'Movimentação',          'Desconto'),
  ('Venda de veículo',              'Movimentação',          'Venda de bem'),
  ('Venda de veículo (moto)',       'Movimentação',          'Venda de bem');

-- Categorias que NÃO entram no de-para, de propósito — vão para a triagem:
--   Indefinido · Clínica? · Locação (não confirmado) · Receita a identificar ·
--   Serviços · Despesa OQV · Loja esposa · Internacional ·
--   Cartão (fatura não detalhada) · (vazio)
-- Rótulo com "?" ou "a identificar" é dívida escondida no dado.

-- ---------------------------------------------------------------------
-- 3. Backfill de transacoes
-- ---------------------------------------------------------------------
update public.transacoes t
   set categoria_id = c.id
  from public.depara_tmp d
  join public.categorias c on c.grupo = d.grupo and c.nome = d.nome
 where btrim(coalesce(t.categoria,'')) = d.antigo
   and t.categoria_id is null;

-- ---------------------------------------------------------------------
-- 4. Backfill de regras — mesmo de-para, mais 5 exceções por padrão
-- ---------------------------------------------------------------------
update public.regras r
   set categoria_id = c.id
  from public.depara_tmp d
  join public.categorias c on c.grupo = d.grupo and c.nome = d.nome
 where btrim(coalesce(r.categoria,'')) = d.antigo
   and r.categoria_id is null;

-- Assinaturas da Amazon não são marketplace: viraram 'Outros' por falta de
-- lugar melhor, e o de-para acima as mandaria para Compras › Marketplace.
update public.regras r
   set categoria_id = c.id
  from public.categorias c
 where c.grupo = 'Lazer' and c.nome = 'Assinaturas'
   and r.padrao in ('AMAZONMUSIC', 'AMAZONPRIMEBR');

update public.regras r
   set categoria_id = c.id
  from public.categorias c
 where c.grupo = 'Lazer' and c.nome = 'Outros lazer'
   and r.padrao = 'MPLOTERIASONLINEUB';

-- Ambíguas demais para adivinhar: ficam sem categoria e vão para a triagem.
update public.regras
   set categoria_id = null
 where padrao in ('BANCARECREIO', 'CONSORCIOSHOPPING');

-- As três exceções acima ficariam com o texto antigo ('Outros') apontando para
-- um id diferente do resto de 'Outros' — o mesmo texto resolvendo para dois ids.
-- É exatamente o apodrecimento que a asserção de coerência do verificacao.sql
-- existe para pegar (e pegou). O texto acompanha o id.
update public.regras set categoria = 'Assinatura'
 where padrao in ('AMAZONMUSIC', 'AMAZONPRIMEBR');
update public.regras set categoria = 'Lazer'
 where padrao = 'MPLOTERIASONLINEUB';

-- ---------------------------------------------------------------------
-- 5. Correções de `cls` (spec §4, taxonomia "Saem do eixo de gasto")
--    Movimentação não é gasto nem receita. 13 linhas estavam como
--    'Pessoal família' (12 Desconto) e 'OQV' (1 Estorno), inflando o
--    custo de vida e o resultado da OQV.
--
--    NÃO tocar em Recebível/Dividendos (receita real, R$ 129 mil) nem
--    em Internacional (gasto real, R$ 746) — corrigido em 06/08.
-- ---------------------------------------------------------------------
update public.transacoes t
   set cls = 'Não é gasto'
  from public.categorias c
 where t.categoria_id = c.id
   and c.grupo = 'Movimentação'
   and coalesce(t.cls,'') <> 'Não é gasto';

-- ---------------------------------------------------------------------
-- 6. Limpeza
-- ---------------------------------------------------------------------
drop table if exists public.depara_tmp;
