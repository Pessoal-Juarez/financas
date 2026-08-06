# Onde paramos

**Última atualização:** 06/08/2026.
**Leia este arquivo primeiro** ao retomar o projeto.

---

## Em uma frase

Spec aprovada (v1.2), plano de construção escrito
([`plans/redesign-financas.md`](../plans/redesign-financas.md), 10 passos) e os
**passos 1 a 4 estão feitos**: a migração de dados foi aplicada e as 15 asserções do
`verificacao.sql` passam. O próximo é o **passo 5, a camada `assets/`**.

## Estado da migração (06/08/2026)

| Passo | | |
|---|---|---|
| 1 | Export CSV de `transacoes` e `regras` | ✅ em `Pessoal\backups\2026-08-06\` (fora do repo) |
| 2 | Tabela `categorias` + seed + RLS | ✅ **54 subs, 12 grupos** |
| 3 | `categoria_id` + backfill nas duas tabelas | ✅ aplicado |
| 4 | `sql/verificacao.sql` | ✅ **15/15 PASSOU** |
| 5–10 | `assets/` e telas | pendente |

**Números depois da migração:**

| | |
|---|---|
| Transações | 3.132 · zero perdidas |
| `Compras › Marketplace` | **355** (os antigos `Outros`) |
| Fila de triagem | **656** — 620 sem categoria, 623 sem `cls`, união 656 |
| Regras sem categoria | 27 (todas intencionais: `Indefinido`, `Internacional`, `Serviços`…) |
| `cls` corrigidos para "Não é gasto" | 13 (12 `Desconto` + 1 `Estorno`) |

⚠️ **A `main` do GitHub Pages ainda serve o app ANTIGO** — ele lê `categoria` como texto,
que continua intacto, então nada quebrou para vocês. A Fase 2 (front lendo `categoria_id`)
é o passo 6.

---

## O que foi feito em 06/08/2026 — revisão da spec

Revisão bloco a bloco da spec com o Juarez. Seis decisões, três delas vindas de números
medidos no banco durante a sessão.

### Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Planejar mora dentro de "Mais"** | a barra tinha 5 itens e 8 telas; promovê-la exigiria barra variando por papel (a Raiane não vê Planejar), e 6 itens apertariam os alvos de 44px |
| 2 | **Alvo numérico: sem classificação < 8% até 30/09/2026** | hoje 19,9%. Único número que diz se o redesign funcionou |
| 3 | **Fase 3 da migração cortada** | única operação irreversível do plano, em banco free sem PITR, por ganho cosmético. Texto e `categoria_id` convivem para sempre |
| 4 | **Trigger com comportamento definido** | texto desconhecido da VPS → `categoria_id` nulo, texto preservado, vai pra fila. Nunca cria categoria |
| 5 | **Rótulos leves aprovados** | Da casa · Do Juarez · Da Raiane · Clínica · Emprestado · Não conta · **A classificar** |

### O achado do dia: `Outros` era marketplace

Ao quebrar a spec em plano, a pesquisa foi ver **por que** `Outros` era 31% de julho. As
**132 regras** que classificavam para lá: `AMAZONBR` (79 usos), ~100 padrões `SHOPEE…`
(um por vendedor!), `MERCADOLIVRE…`. **128 de 132 são marketplace.**

`Outros` nunca foi bagunça — era **marketplace sem nome**. Virou o grupo **`Compras`**
(Marketplace · Eletrônicos · Presente), o "General Merchandise" do Plaid.

| | Antes | Depois |
|---|---|---|
| Dívida histórica que iria pra fila | 388 | **33** |
| Fila total pós-migração | 1.011 | **656** |
| Regras de marketplace | 128 superajustadas | **3** por prefixo |
| Telas de fila a construir | 2 | **1** |

Isso **reverteu a decisão das duas filas**: elas existiam para proteger de uma fila de
388, e o número deixou de existir.

**Lição:** classificar direito a categoria mais volumosa vale mais que qualquer
engenharia de interface em cima da bagunça.

### ⚠️ Correção importante: NÃO consolidar regras por prefixo

A ideia de fundir as ~128 regras de marketplace em 3 (`SHOPEE`, `AMAZON`,
`MERCADOLIVRE`) chegou a ser aprovada — e estava **errada**. Ao implementar, medi as
regras `SHOPEE*` inteiras, não só as que apontavam para `Outros`:

| Prefixo | Regras | Categorias | `cls` distintos |
|---|---|---|---|
| **`SHOPEE`** | **119** | 6 | **5** — inclui **OQV, Rai Móveis, Slim Fit** |
| `MERCADOPAGO` | 7 | 2 | 2 — inclui Rai Móveis |

Uma regra `SHOPEE` genérica reclassificaria compras das empresas como gasto pessoal da
família — **destruindo a separação PF/PJ** que a blindagem de RLS de 05/08 protegeu.

**As regras por vendedor não são superajustadas: elas guardam qual vendedor pertence a
qual negócio.** Só a categoria foi remapeada; todos os 520 padrões foram preservados.
O erro de origem foi tirar conclusão de 132 regras sem olhar as outras 119.

### Outros achados da pesquisa

| Achado | Consequência |
|---|---|
| O de-para cobria só `transacoes` — **8 categorias órfãs em `regras`**, uma com **54 regras** (`Pix pessoas`) | 2 subs novas; asserção obrigatória nas duas tabelas |
| 3 categorias mandadas para "Não conta" eram **dinheiro real**: R$ 129 mil de receita (recebível + dividendos da sociedade antiga) e R$ 746 de gasto (`Internacional`) | grupo `Receitas` criado; `Internacional` vai pra triagem |
| Taxonomia final | **11 grupos, 47 subcategorias** (era "9 grupos, ~38 subs") |

### Números medidos na sessão (não são estimativa)

| | |
|---|---|
| Pendentes que casam com regra existente | **107** de 623 — a varredura retroativa se confirma |
| Fila única pós-migração | **656** (623 + 33) |
| `Compras › Marketplace` | **355** lançamentos (os antigos `Outros`) |

### Open Finance — CDB verificado ✅ (pendência antiga, resolvida)

A API devolve **uma única conta**: a corrente do Itaú. **O CDB não vem e não virá.**

| Linha de `patrimonio` | Registrado (05/06) | Fonte daqui pra frente |
|---|---|---|
| Conta corrente Itaú | R$ 9.261,99 | **automática** (diária, balde barato) |
| CDB Itaú | R$ 7.365,79 | manual |
| BTG (garantia do cartão) | R$ 12.000,00 | manual |

Saldo real da conta em 06/08 às 14:10: **R$ 12.778,44** — R$ 3.516 acima do registrado.
A automação cobre 1 das 3 linhas; as duas manuais são 57% do patrimônio. Por isso o
**alerta de 30 dias virou requisito**, não acabamento.

---

## Decisões anteriores (05/08/2026) — não reabrir sem motivo novo

| Decisão | Escolha |
|---|---|
| Critério de sucesso | **(b) clareza** primeiro, **(d) custo de atenção baixo** |
| Tela inicial | **opção C adaptada** — lidera com clareza e declara a incerteza |
| Eixo principal | **categoria**, em 2 níveis (9 grupos › ~38 subs) |
| Eixo secundário | classificação, com rótulos mais leves |
| Padrão de Análise e orçamento | **grupo** (9), com drill-down |
| Fatia "a classificar" no gráfico | **opção C** — rosca limpa + linha de honestidade |
| Patrimônio | automatizar o Itaú pelo sync; manual o resto |
| Arquitetura | **vários HTML sem build** + `assets/` compartilhado |

O que já está **no ar** desde 05/08: blindagem de RLS (`28aaf8b`) e as melhorias de base
da UI — paginação, alvos de toque, contraste (`e38fe5b`).

---

## Próximo passo

**Passo 1 do plano: export CSV.** O plano completo, com contexto próprio por passo, está
em [`plans/redesign-financas.md`](../plans/redesign-financas.md):

| # | Passo | |
|---|---|---|
| 1 | Export CSV de `transacoes` e `regras` | rede de segurança — plano free, sem PITR |
| 2 | Fase 1a: `categorias` + seed (11 grupos, 47 subs) + RLS | |
| 3 | Fase 1b: `categoria_id` + backfill + **consolidação das 128 regras de marketplace** | passo mais delicado |
| 4 | `sql/verificacao.sql` | única validação do projeto |
| 5 | `assets/` — modelo.js, db.js, ui.js, app.css | cache é obrigatório |
| 6 | Fase 2: trigger + front lendo por `categoria_id` | VPS não muda |
| 7–10 | Telas: Triar → Início → Análise → resto | |

⚠️ Não começar pelas telas. Tela sem taxonomia consolidada é retrabalho garantido.

> A v1.0 apontava `/break` como próximo comando. **Esse comando não existe** nesta
> instalação do Claude Code — o plano foi gerado com o skill `blueprint`.

---

## Pendências do Juarez

1. **Atualizar CDB e BTG** no patrimônio (a conta corrente passa a vir sozinha).
   Parado desde 05/06 — o fôlego de 1,8 meses ainda não é confiável.
2. **Gerar as telas no Google Stitch** a partir de [`stitch-prompts.md`](stitch-prompts.md)
   — os prompts ainda refletem a v1.0 e precisam ser atualizados (Planejar em Mais,
   duas filas, rótulos novos) antes de serem usados.

---

## Estado do repositório

| Branch | Situação |
|---|---|
| `main` | segurança + UI de base + documentação. **No ar** no GitHub Pages |
| `redesign-nomad` | redesign rejeitado em 05/08. Preservado, **não mesclar** |

Documentos em `docs/`:

- **`spec.md`** — a especificação aprovada (v1.2) ⭐
- **`../plans/redesign-financas.md`** — o plano de construção, 10 passos ⭐
- `taxonomia-categorias.md` — os 9 grupos e o de-para das 73 categorias
- `stitch-prompts.md` — prompts para gerar as telas (⚠️ desatualizados, ver pendência 2)
- `architecture.md` · `workflow.md` · `README.md` — o sistema como ele é hoje
- `mockups/` — artefatos visuais das decisões

⚠️ O `CLAUDE.md` do projeto mora **fora do repositório**, em
`C:\Users\Samsung\Documents\Claude\Projects\Pessoal\CLAUDE.md`. Ele continua sendo o
contexto que o Claude Code carrega automaticamente; os documentos técnicos canônicos
são os daqui.
