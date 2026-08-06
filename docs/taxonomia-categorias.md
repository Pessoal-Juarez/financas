# Taxonomia de categorias — proposta

> Estado em 05/08/2026: 73 categorias em texto livre, sem hierarquia.
> "Outros" é 31% de julho — a maior fatia do gráfico não explica nada.
> Decisão do Juarez: dois níveis (grupo › subcategoria), com edição e criação livres.

## Base da proposta

- **Plaid Personal Finance Categories** — padrão de mercado, usado por milhares de
  apps. Reduziu de 600+ para **16 grupos / 104 subcategorias** porque excesso de
  categoria confunde. Fonte da regra "poucas e bem definidas".
- **POF/IBGE** — referência brasileira de orçamento doméstico, ~11 grupos de despesa.
  Usar grupos próximos aos dela permite comparar seu padrão com a média nacional.
- Para **uma família** (não um app comercial), 16/104 é excesso. Proposta: **9 grupos,
  ~40 subcategorias**.

## Princípios

1. **Grupo responde "que tipo de vida isso sustenta"**; subcategoria responde "o quê".
2. **Uma transação tem uma subcategoria**; o grupo vem por herança. Nunca se classifica
   grupo direto.
3. **Movimentação não é categoria.** Pagamento de fatura, transferência, resgate e
   estorno saem do eixo de gasto e viram `cls = Não conta`.
4. **Sem incerteza no rótulo.** `Clínica?` não é categoria — é uma classificação
   pendente. Isso pertence à fila de triagem, não ao nome.
5. **Editável.** O usuário cria e renomeia. A lista abaixo é o ponto de partida, não
   uma prisão.

## Os 9 grupos

**10 grupos de despesa + `Receitas` = 11 grupos, 47 subcategorias** (fechado em 06/08/2026).

| Grupo | Subcategorias | # |
|---|---|---|
| **Alimentação** | Supermercado · Restaurante · Delivery · Água (galão) | 4 |
| **Moradia** | Aluguel/Moradia · Energia · Água · Gás · Internet/Telefonia · Manutenção da casa | 6 |
| **Saúde** | Farmácia · Consulta/Exame · Terapia · Plano de saúde | 4 |
| **Transporte** | Combustível · App/Táxi · Estacionamento · Manutenção do carro · Veículo | 5 |
| **Cuidado pessoal** | Vestuário · Estética/Beleza · Barbearia · Academia · Esporte · Pet | 6 |
| **Educação** | Curso · Mentoria | 2 |
| **Lazer** | Viagem · Assinaturas · Outros lazer | 3 |
| **Compras** ⭐ | **Marketplace** · Eletrônicos · Presente | 3 |
| **Serviços & obrigações** | Secretária/Babá · **Pessoas/avulsos** · Software/Ferramentas · Contabilidade · Impostos · Tarifas bancárias | 6 |
| **Empresas** | Insumos · Embalagens · Revenda · Sala · Equipamento | 5 |
| **Receitas** | Recebível sociedade antiga · Dividendos (sociedade antiga) · Receita clínica | 3 |

`Delivery` e `Plano de saúde` não têm origem no de-para — existem para uso futuro.
`Presente` saiu de Lazer e `Eletrônicos` nasceu em Compras, o grupo criado em 06/08.

### O grupo `Compras` — por que ele existe

`Outros` era 31% de julho e 355 lançamentos. Olhando as **132 regras** que classificavam
para lá, a resposta apareceu: **128 delas são marketplace.**

| Padrão | Usos |
|---|---|
| `AMAZONBR` | 79 |
| ~100 padrões `SHOPEE…`, um por vendedor (`SHOPEEEFCILOFICI`, `SHOPEEDINAMO`…) | ~120 |
| `MERCADOLIVRE…` · `MERCADOPAGO…` | ~35 |

**`Outros` nunca foi bagunça — era marketplace sem nome.** Amazon, Shopee e Mercado Livre
não dizem na descrição *o que* foi comprado, então tudo caía no balde genérico. É um tipo
de gasto legítimo e nomeável, equivalente ao "General Merchandise" do Plaid.

Duas consequências para a migração:

1. Os 355 `Outros` viram **Compras › Marketplace** — fatia nomeada, e **não vão para
   fila nenhuma**. Isso sozinho derrubou a dívida histórica de 388 para **33**.
2. As regras estão **superajustadas** — cada vendedor da Shopee virou regra própria.
   As ~128 se consolidam em **3**: `SHOPEE`, `AMAZON`, `MERCADOLIVRE`. As 4 regras
   `Outros` que não são marketplace vão para a triagem.

## De-para das 73 atuais

### Viram subcategoria direto
Supermercado · Restaurante · Farmácia · Combustível · Transporte → App/Táxi ·
Energia · Água · Gás · Estacionamento · Vestuário · Academia · Pet · Terapia ·
Barbearia · Esporte · Viagem · Presente · Contabilidade · Impostos ·
Estética/Beleza · Moradia → Aluguel/Moradia · Embalagens · Sala · Equipamento ·
Secretária/Babá · Água (galão) · Lazer → Outros lazer · Casa → Manutenção da casa

### Fundem (mesma coisa escrita de vários jeitos)
| Vira | Absorve |
|---|---|
| Curso | `Curso`, `Curso `, `Curso (trading)` |
| Mentoria | `Curso/Mentoria` |
| Assinaturas | `Assinatura`, `Assinatura/Cloud` |
| Software/Ferramentas | `Assinatura/Software`, `Ferramenta/Software` |
| Internet/Telefonia | `Telefonia`, `Telefonia/Internet` |
| Impostos | `Impostos`, `Impostos `, `Tarifa/Imposto` |
| Tarifas bancárias | `Tarifa cartão` |
| Revenda | `Revenda`, `Revenda móveis`, `Revenda/Materiais` |
| Insumos | `China/Insumos`, `Compras/Insumos` |
| Manutenção do carro | `Automotivo` |
| Consulta/Exame | `Saúde`, `Clínica` |
| Veículo | `Carro/Grande` |

### Saem do eixo de gasto → `cls = Não conta`
`Pagamento cartão` · `Transfer. própria` · `Transfer./investimento` ·
`Transfer./estorno` · `Resgate CDB` · `Investimento` · `Estorno` · `Desconto` ·
`Venda de veículo` · `Venda de veículo (moto)`

Não são despesa — são movimentação de dinheiro. Hoje poluem o gráfico e inflam
totais. `Transfer. própria` sozinha soma R$ 82.633 e `Resgate CDB` R$ 137.474.

> **Correção de 06/08/2026 — três categorias saíram desta lista.** Ela tinha 13 itens e
> 36 dos lançamentos afetados estavam como `Pessoal família`. Aplicá-la ao pé da letra
> apagaria dinheiro real:
>
> | Categoria | | Destino corrigido |
> |---|---|---|
> | `Recebível sociedade antiga` | 16 entradas · **R$ 108.272** | **Receitas** — entrou de verdade na conta |
> | `Dividendos (sociedade antiga)` | 3 entradas · **R$ 21.122** | **Receitas** |
> | `Internacional` | 5 **saídas** · R$ 746 | **fila do histórico** — descreve a origem da cobrança, não o que foi comprado |
>
> Movimentação é dinheiro andando de bolso em bolso. Recebível e dividendo são dinheiro
> **chegando**; compra internacional é dinheiro **saindo**. Nenhum dos três é movimentação.

### Grupo `Receitas`

Os outros 10 grupos são de **despesa**. Receita precisava de destino, senão toda entrada
cairia na fila por não ter `categoria_id`. Grupo `Receitas`, 3 subs:

`Recebível sociedade antiga` · `Dividendos (sociedade antiga)` · `Receita clínica`

**Não aparece em Análise nem no orçamento** — esses são sobre para onde o dinheiro vai.
Existe para que toda categoria tenha um grupo, e para dar destino a `Receita clínica`
(4 lançamentos, R$ 4.000), que estava na lista da fila mas é uma categoria perfeitamente
descritiva.

### Voltam para a fila de triagem (não são categoria)
`Indefinido` (69) · `Clínica?` · `Locação (não confirmado)` ·
`Receita a identificar` · `Serviços` · `Despesa OQV` · `Loja esposa` ·
`Internacional` · `Cartão (fatura não detalhada)`

Rótulo com "?" ou "a identificar" é dívida escondida no dado. Vai para a triagem
com o motivo visível.

Ajustes de 06/08/2026 nesta lista: **entram** `Internacional` (5) e
`Cartão (fatura não detalhada)`; **saem** `Receita clínica` (4), que virou sub do grupo
`Receitas`, e **`Outros` (355)**, que virou `Compras › Marketplace`.

> **Como essa lista encolheu — e por que só existe uma fila.**
>
> | Momento | Lançamentos que entrariam na fila |
> |---|---|
> | De-para original (com `Outros`) | **388** — levaria a triagem de 623 para 1.011 |
> | Depois de reconhecer marketplace como categoria | **33** |
>
> Uma fila de 388 exigiria separar dívida histórica de fluxo corrente, para o app não
> estrear com mais trabalho do que o atual. Com **33**, essa separação custaria uma tela
> inteira e um conceito a mais na interface para um punhado de lançamentos. **Fila única:
> `Triar`, com 656** (623 + 33), dos quais 107 caem na varredura retroativa.
>
> A lição vale além deste caso: **classificar direito a categoria mais volumosa vale mais
> que qualquer engenharia de interface em cima da bagunça.**

### Órfãs — o buraco encontrado em 06/08/2026

O de-para da v1 mapeava só as categorias de `transacoes`. Cruzando também com
**`regras`**, apareceram **8 categorias sem destino** — e uma delas com 54 regras
aprendidas apontando para ela. Migrar sem resolver isso dispararia o risco nº 1 da
`spec.md` §13: as regras param de casar e a auto-classificação piora.

| Órfã | Em `transacoes` | Em `regras` | Destino |
|---|---|---|---|
| **`Pix pessoas`** | 74 · R$ 2.124 | **54** | **Serviços & obrigações › Pessoas/avulsos** (sub nova) |
| `Eletrônicos` | — | 2 | Moradia › **Eletrônicos** (sub nova) |
| `Cloud/Ads` | — | 1 | Serviços › Software/Ferramentas |
| `Assinatura intl` | — | 1 | Serviços › Software/Ferramentas |
| `Hotel` | — | 1 | Lazer › Viagem |
| `Curso digital` | — | 1 | Educação › Curso |
| `Livraria` | — | 1 | Educação › Curso |
| `Cartão (fatura não detalhada)` | — | 1 | fila do histórico |

Sobre `Pix pessoas`: as 74 são todas saídas classificadas como `Pessoal família`, média
de R$ 29, para pessoas físicas. Ganharam sub própria em vez de fundir com
`Secretária/Babá` para **preservar as 54 regras intactas** e não misturar prestadores
diferentes. Separar depois, na tela de Categorias, é barato; reensinar 54 regras não é.

⚠️ **Lição para a migração:** o de-para tem que cobrir o `distinct categoria` das **duas**
tabelas, `transacoes` **e** `regras`. Uma asserção em `verificacao.sql` garante isso —
zero linhas órfãs em ambas.

## O que isso exige do banco

Hoje `transacoes.categoria` é texto livre — por isso a dispersão. Proposta mínima:

- Tabela `categorias`: `id`, `grupo`, `nome`, `ativa`, `ordem`.
- `transacoes.categoria_id` como FK (mantendo `categoria` texto durante a transição,
  para não quebrar a VPS e as 520 regras de uma vez).
- Migração em duas fases: primeiro popular e mapear, depois trocar a leitura do front.

⚠️ **A tabela `regras` referencia categoria por texto.** Renomear categorias sem
atualizar as 520 regras faz a auto-classificação parar de acertar. A migração tem
que tratar as duas juntas — está no caminho crítico, antes de qualquer tela nova.

## Fontes

- [Plaid — Personal Finance Category taxonomy](https://plaid.com/blog/transactions-categorization-taxonomy/)
- [Plaid — guia de migração das categorias](https://plaid.com/docs/transactions/pfc-migration/)
- [IBGE — Pesquisa de Orçamentos Familiares (POF) 2017-2018](https://www.ibge.gov.br/estatisticas/sociais/populacao/24786-pesquisa-de-orcamentos-familiares-2.html)
