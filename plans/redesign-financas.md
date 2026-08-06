# Plano de construção — redesign do app Finanças da Família

> ## Situação em 06/08/2026, fim do dia
>
> **Os 10 passos deste plano estão CONCLUÍDOS.** Depois deles, o teste do Juarez revelou
> que a spec havia **dropado 7 seções que já funcionavam** no app antigo, sem declarar —
> o plano foi estendido com duas fases novas.
>
> | Fase | O quê | Estado |
> |---|---|---|
> | 1–10 | migração de dados + camada `assets/` + 5 telas | ✅ |
> | **A** | paridade: Empresas, Parcelamento, Quem me deve, Receitas, Assistente, Alterações, piso de sobrevivência, linhas de tendência | ✅ |
> | **B** | anexo de fatura (PDF/imagem) · motor de regras condição+ação · contas a receber | ⬜ |
> | — | **virada de chave** (`index.html`, `dashboard.html`, merge na `main`) | ⬜ decisão do Juarez |
>
> **O estado atual e as pendências vivem em [`docs/ESTADO.md`](../docs/ESTADO.md)** — é o
> arquivo a ler primeiro. Este plano fica como registro de como se chegou aqui.

**Criado:** 06/08/2026 · **Fonte:** [`docs/spec.md`](../docs/spec.md) v1.1 (aprovada)
**Repo:** `Pessoal-Juarez/financas` · **Pasta:** `C:\Users\Samsung\Documents\Claude\Projects\Pessoal\financas`

10 passos. Cada um traz um **contexto próprio** — um agente novo consegue executar
qualquer passo sem ter lido os anteriores.

---

## Contexto comum a todos os passos

**O sistema vive em 3 lugares** (detalhe em [`docs/architecture.md`](../docs/architecture.md)):

| Camada | Onde | Observação crítica |
|---|---|---|
| Front | GitHub Pages, `Pessoal-Juarez/financas` | deploy = `git push` na `main`, publica em ~1 min |
| Dados | Supabase `urlxbgngcncndtnhyqyf` | plano **free**, **sem point-in-time recovery** |
| Ingestão | VPS `root@srv1093562` | usa `service_role`, **ignora RLS**, roda por cron |

**Cinco armadilhas que já custaram caro neste projeto:**

1. **O repositório é PÚBLICO.** Nunca commitar CSV de lançamentos, `service_role`, nem
   qualquer extrato. A anon key no HTML é pública por design; o resto não.
2. **PostgREST corta SELECT em 1.000 linhas.** A base tem 3.132 → sempre paginar com
   `.range()`.
3. **A tabela renderiza no máximo 200 linhas.** Sem esse corte são ~50 mil nós de DOM e
   o celular trava. Os totais rodam sobre o conjunto completo, não sobre o que foi
   desenhado.
4. **`font-size: 16px` em qualquer campo de digitação**, alvo de toque mínimo 44px. Abaixo
   disso o Safari do iPhone dá zoom a cada foco.
5. **Nunca escrever policy com `auth.uid() IS NOT NULL`.** Isso é "qualquer um que criou
   conta", não "a família". Usar `eh_membro()` e `is_admin()`.

**`index.html` é a porta de entrada e continua sendo.** O `start_url` do manifest é `"."`
— mudar quebra os PWAs já instalados nos celulares.

**Estado do banco em 06/08/2026** (medido, não estimado):

| | |
|---|---|
| `transacoes` | 3.132 · 15 meses (mai/25 a jul/26) |
| `regras` | 520, referenciando 51 categorias distintas |
| `metas` | **0** — orçamento nunca foi usado |
| `patrimonio` | 3 linhas · parado desde 05/06 |
| `perfis` | 2 (Juarez admin, Raiane colab) |
| Fila "Triar" hoje (cls indefinido) | **623** — destes, **107** casam com regra existente |
| Entram na fila pela taxonomia | **+33** → fila única de **656** |

---

## Grafo de dependências

```
1 (backup)
└── 2 (categorias + seed)
    └── 3 (categoria_id + backfill)
        └── 4 (verificacao.sql)
            ├── 5 (assets/) ──┐
            └── 6 (Fase 2: trigger + front lê id)
                              └── 7 (Triar) ── 8 (Início) ── 9 (Análise) ── 10 (resto)
```

**Serial até o passo 4.** Nada de front antes da taxonomia consolidada — tela sem
taxonomia é retrabalho garantido. Os passos 5 e 6 podem ser paralelos entre si (arquivos
diferentes); 7–10 são serial porque cada tela reusa componentes da anterior.

**Branches:** passos 1–4 e 6 (SQL) aplicam direto no Supabase de produção — não existe
staging no plano free; a proteção é a reversibilidade + `verificacao.sql`. Passos 5 e
7–10 vão numa branch `redesign` e só entram na `main` quando a tela estiver pronta,
porque **`main` publica direto para os celulares de vocês**.

---

## Passo 1 — Rede de segurança: export CSV

**Objetivo:** ter uma cópia legível de `transacoes` e `regras` fora do banco antes de
qualquer `UPDATE`.

**Contexto:** o Supabase é plano free — **não há point-in-time recovery**. Com a Fase 3
cortada (spec §6), nenhum passo deste plano é destrutivo, mas o passo 3 roda um `UPDATE`
de backfill em 3.132 linhas. Um `UPDATE` mal escrito é o único jeito de perder dado aqui.

**Tarefas:**
- Exportar `transacoes` (3.132) e `regras` (520) em CSV.
- Salvar **fora do repositório** — sugestão: `C:\Users\Samsung\Documents\Claude\Projects\Pessoal\backups\2026-08-06\`.
- Conferir a contagem de linhas do arquivo.

**Verificação:** `transacoes.csv` com 3.133 linhas (3.132 + cabeçalho), `regras.csv` com 521.

**Critério de saída:** os dois arquivos existem, abrem, e **não** estão dentro da pasta do repo.

**⚠️ Não commitar.** O repo é público.

---

## Passo 2 — Fase 1a: tabela `categorias` + seed

**Objetivo:** criar a hierarquia de categorias, sem tocar em nada existente.

**Contexto:** hoje `transacoes.categoria` é texto livre — daí as 73 categorias dispersas,
com `Outros` sendo 31% de julho. A taxonomia final está em
[`docs/taxonomia-categorias.md`](../docs/taxonomia-categorias.md): **10 grupos de despesa
(44 subs) + `Receitas` (3 subs) = 11 grupos, 47 subcategorias**. Grupo é texto na própria
tabela, não tabela separada — 11 valores estáveis vindos de padrão externo (Plaid/POF).

⚠️ **Dois grupos nasceram da pesquisa de 06/08, não do brainstorming:** `Compras`
(porque `Outros` era marketplace — ver passo 3) e `Receitas` (porque entrada precisava de
destino, senão toda receita cairia na fila).

**Tarefas:**
- `sql/2026-08-06_categorias-fase1.sql`:
  - `create table categorias (id, grupo text, nome text, ativa bool default true, ordem int)`,
    com `unique (grupo, nome)`.
  - Seed das 47 linhas, `ordem` refletindo a ordem de exibição.
  - RLS: leitura para `eh_membro()`, escrita para `is_admin()`. **Nunca `auth.uid() IS NOT NULL`.**
- Aplicar via migration no Supabase.

**Verificação:**
```sql
select grupo, count(*) from categorias group by 1 order by 1;  -- 11 grupos, 47 linhas
```

**Critério de saída:** 47 linhas, 11 grupos, RLS ativo, e a Raiane (colab) consegue ler
mas não deletar.

**Rollback:** `drop table categorias`. Nada depende dela ainda.

---

## Passo 3 — Fase 1b: `categoria_id` + backfill

**Objetivo:** ligar `transacoes` e `regras` à nova tabela, mantendo o texto intacto.

**Contexto — o passo mais delicado do plano.** Três coisas acontecem juntas e **têm que
estar na mesma transação**:

1. `transacoes` e `regras` ganham `categoria_id` FK **nullable**. O texto **permanece**
   (a Fase 3 foi cortada — spec §6). As colunas de texto viram backup legível.
2. O de-para roda nas **duas** tabelas. ⚠️ **A v1 do de-para só cobria `transacoes`** e
   deixou 8 órfãs de fora, uma delas com **54 regras** apontando para ela (`Pix pessoas`).
   Renomear categoria sem atualizar as regras faz a auto-classificação parar de acertar —
   é o risco nº 1 da spec §13.
3. **Consolidação das regras de marketplace.** ⚠️ **Este item quase não existiu — e é o
   mais importante do passo.** 132 regras classificavam para `Outros`, e **128 delas são
   marketplace**: `AMAZONBR` (79 usos), ~100 padrões `SHOPEE…` (um por vendedor),
   `MERCADOLIVRE…`/`MERCADOPAGO…`. `Outros` nunca foi bagunça — era marketplace sem nome.
   As 128 viram **3 regras por prefixo** (`SHOPEE`, `AMAZON`, `MERCADOLIVRE`) apontando
   para `Compras › Marketplace`. As outras 4 vão para a triagem.
   **Sem isso, cada vendedor novo da Shopee gera um lançamento sem classificação e a fila
   se realimenta sozinha** — o cron das 7h despejaria trabalho todo dia contra a meta de 8%.
4. Três correções de `cls`, decididas em 06/08 (ver `taxonomia-categorias.md`):
   - `Recebível sociedade antiga` (16 entradas, R$ 108.272) e
     `Dividendos (sociedade antiga)` (3, R$ 21.122) → grupo **`Receitas`**, **não** "Não conta".
   - `Internacional` (5 **saídas**, R$ 746) → triagem, **não** "Não conta".
   - As demais 10 categorias de movimentação → `cls = 'Não é gasto'`.

**A fila não precisa de coluna nova** — deriva de `categoria_id IS NULL` (656 linhas:
623 com `cls` indefinido + 33 desclassificados pela taxonomia).

**Tarefas:**
- `sql/2026-08-06_categoria-id-backfill.sql`, tudo numa transação:
  - `alter table transacoes add column categoria_id bigint references categorias(id)`
  - idem em `regras`
  - CTE de de-para (texto → `categoria_id`), aplicada nas duas
  - consolidação das 128 regras de marketplace em 3
  - os três ajustes de `cls`
  - índice em `transacoes(categoria_id)`

**Verificação:** rodar o passo 4 imediatamente. Números esperados:

| Asserção | Esperado |
|---|---|
| `transacoes` total | 3.132 |
| `transacoes` com `categoria_id` nulo | **656** (623 + 33) |
| `transacoes` em `Compras › Marketplace` | **355** (os antigos `Outros`) |
| `regras` com `categoria_id` nulo | **≤ 5** (as 4 `Outros` não-marketplace + `Cartão (fatura não detalhada)`) |
| `regras` total após consolidação | **~395** (520 − 128 + 3) |
| Categorias órfãs em `transacoes` **e** `regras` | **0** |

**Critério de saída:** os números batem exatamente. Qualquer divergência = rollback.

> **Nota de método.** A primeira versão deste passo afirmava que só **1** regra ficaria
> sem categoria. A revisão do plano mediu e achou **157**. O erro veio de checar o de-para
> só contra `transacoes` — o mesmo erro que a v1 do `taxonomia-categorias.md` cometeu.
> **Toda asserção sobre categoria tem que rodar nas duas tabelas.**

**Rollback:** `alter table ... drop column categoria_id` nas duas. O texto nunca saiu do lugar.

---

## Passo 4 — `sql/verificacao.sql`

**Objetivo:** transformar "parece que deu certo" em PASSOU/FALHOU por linha.

**Contexto:** não há suíte automatizada e não vai haver (spec §12 — dois usuários, teste
quebrado é pior que teste ausente). Este arquivo é o único mecanismo de validação do
projeto, e roda depois de **cada** fase.

**Tarefas — asserções obrigatórias:**
- Toda `transacoes` tem `categoria_id` **ou** está na fila (nunca um terceiro estado).
- Nenhuma `regras.categoria_id` aponta para categoria inexistente ou inativa.
- **Volume classificado por cada regra de prefixo** (`SHOPEE`, `AMAZON`, `MERCADOLIVRE`)
  — regra por prefixo é poderosa e pode capturar o que não devia; o número tem que
  aparecer, não ficar implícito.
- **Coerência texto ↔ id**: nenhuma linha onde `categoria_id` aponte para nome que
  divirja do texto gravado. *Esta asserção existe por causa do corte da Fase 3* — como as
  duas representações convivem para sempre, a denormalização apodreceria em silêncio sem ela.
- Zero categorias órfãs em `transacoes` **e** em `regras`.
- Soma por grupo bate com o total geral.
- Contagem da fila: **656**.

**Critério de saída:** todas as linhas retornam PASSOU.

---

## Passo 5 — Camada `assets/`

**Objetivo:** a base compartilhada pelas 8 telas.

**Contexto:** a arquitetura é **vários HTML sem build** (spec §5) — sem Vite, sem
framework, porque exigiria Node para qualquer alteração e o ganho para 2 usuários é zero.

**O cache é obrigatório, não opcional.** `fetchAllTx` lê 3.132 linhas em 4 requisições.
Sem cache, navegar entre 6 telas refaria isso a cada troca — e **esta arquitetura ficaria
pior que o arquivo único**. `sessionStorage` com TTL, invalidado por: classificar,
aplicar lote, trocar de mês, editar categoria, puxar-para-atualizar.

**Tarefas:**
- `assets/modelo.js` — grupos, os 46 pares grupo›sub, mapa de rótulos leves
  (`Pessoal família`→"Da casa", `Indefinido`→"A classificar" etc.), classes, `cls` de
  custo de vida vs empresas. **As chaves do banco não mudam** — renomear passa a custar
  uma linha aqui.
- `assets/db.js` — auth, leitura paginada, cache, gravação.
- `assets/ui.js` — nav inferior (5 itens, iguais para os dois papéis), toast, BRL, olho, esqueleto.
- `assets/app.css` — tokens, temas, componentes. **DM Mono nas colunas de valor**: DM Sans
  tem números proporcionais e ignora `font-variant-numeric: tabular-nums` (medido em
  05/08 — "1111111111" ocupa 103px e "0000000000" 268px). Números-herói seguem em DM Sans.

**Verificação:** abrir uma página de teste, confirmar no DevTools que a segunda navegação
não refaz as 4 requisições, e medir a largura de duas linhas de valores diferentes.

**Critério de saída:** cache funcionando e colunas de dinheiro alinhadas.

---

## Passo 6 — Fase 2: trigger + front lendo por `categoria_id`

**Objetivo:** `categoria_id` vira a fonte da verdade da leitura, **sem tocar na VPS**.

**Contexto:** os scripts em `/root/financas/` gravam `categoria` como texto. Eles **não
serão alterados** — a VPS é deploy separado, com cron às 7h; um erro lá ficaria invisível
até o dia seguinte. Um trigger de insert resolve o texto para o id.

**Comportamento obrigatório do trigger quando o texto é desconhecido** (spec §6):
`categoria_id` fica **nulo**, o texto é **preservado intacto**, e o lançamento cai na
fila. **Nunca cria categoria** e **nunca descarta o texto** — categoria nova nasce por
decisão humana na tela de Categorias, não por efeito colateral de um cron.

**Tarefas:**
- `sql/2026-08-06_trigger-categoria.sql` — trigger de insert/update em `transacoes` e `regras`.
- Front passa a ler `categoria_id`, com o texto como fallback de exibição.

**Verificação:** inserir uma linha de teste com categoria conhecida (resolve), outra com
texto inventado (fica nula, texto preservado, aparece na fila). Apagar as duas depois.
Rodar `verificacao.sql`.

**Critério de saída:** os dois casos se comportam como descrito e a VPS segue intacta.
Conferir na manhã seguinte que o cron das 7h gravou normalmente.

**Rollback:** `drop trigger`. O front volta a ler texto.

---

## Passo 7 — Tela Triar + varredura retroativa

**Objetivo:** a tela que ataca o alvo de §1 — sem classificação **< 8% até 30/09/2026**
(hoje 19,9%). **Fila única de 656** — a separação em "Triar" e "Arrumar o histórico" foi
descartada quando a dívida histórica caiu de 388 para 33 (spec §4).

**Contexto — o laço de aprendizado:**

```
lançamento sem classificação
   → busca regra cujo `padrao` esteja contido na descrição normalizada
   → achou:    cartão com sugestão preenchida
      → Confirmar : grava. A regra acertou, nada a aprender.
      → Mudar     : grava + ATUALIZA a regra (ela vinha errando)
      → Pular     : não grava, volta ao fim da fila
   → não achou: cartão vazio, "Primeira vez que vejo este lugar"
      → a escolha CRIA regra nova
```

**"Mudar" é o evento que ensina**, não "Confirmar". É por aí que os 22% caem.

**Varredura retroativa:** **107 dos 623 já casam com regra existente** — nunca foram
reprocessados porque regras só valem para lançamentos novos. (Verificado em 06/08 rodando
a normalização real — NFKD, só A-Z, maiúsculas, 18 chars — contra as 520 regras.) Tela de
lote com os 107, sugestão por linha, desmarcável, e "Aplicar todos". Derruba a fila para
~516 num clique. **Propor, nunca aplicar calado.**

**Falha que mais importa:** perder classificações feitas em sequência quando o sinal
oscila. **Não haverá fila offline** (spec §12). O cartão **não avança até a gravação
confirmar**; se falhar, permanece com o erro e "Tentar de novo".

**Critério de saída:** a varredura derruba a fila de 623 para ~516, e classificar 10
seguidos num celular com sinal ruim não perde nenhum.

---

## Passo 8 — Tela Início

**Objetivo:** responder "para onde foi meu dinheiro este mês?" sem fazer pensar.

**Contexto:** **lidera com clareza, não com trabalho.** O número grande é o custo de vida
do mês; abaixo, a faixa de incerteza ("+ até R$ 1.174 ainda sem classificar") com atalho
para Triar. Abrir com a lista de pendências foi avaliado e **descartado** — contradiz o
objetivo (d), custo de atenção baixo.

**Fôlego é o menor card, uma linha.** É informação importante mas ansiosa; o detalhe mora
em Planejar. ⚠️ E hoje é **não confiável**: o patrimônio está parado desde 05/06 e 57% dele
(CDB + BTG) é manual.

Card "O que fugiu do padrão", com travas anti-ruído — sem elas vira alarme por R$ 30 e é ignorado:

| Alerta | Regra | Trava |
|---|---|---|
| Grupo acima do normal | ≥ 2× a média dos 3 meses anteriores | só se ≥ R$ 200 |
| Assinatura nova | recorrente aparecendo pela 1ª vez | exige 2 ocorrências |
| Parcela alta à frente | soma de parcelas futuras | só se ≥ R$ 500 |

Assinaturas são **calculadas, não tabeladas**: mesma descrição normalizada em 3 dos
últimos 4 meses, valor dentro de ±15%.

---

## Passo 9 — Tela Análise

**Objetivo:** "qual é o meu padrão ao longo do tempo?"

**Contexto:** eixo padrão é **grupo** (10), com drill-down para subcategoria. Orçamento e
análise com 9 linhas se revisam em dois minutos; com 40, são abandonados no segundo mês.

**Rosca limpa + linha de honestidade** — "calculado sobre 70% de julho; R$ 2.006 ainda sem
classificar". Descartadas: fatia hachurada (pune visualmente todo mês) e omitir sem avisar
(mente por omissão).

⚠️ **Vigiar `Compras › Marketplace`.** Ele herda os 355 lançamentos que eram `Outros`; se
virar 31% do gráfico de novo, só trocou de nome. O drill-down por loja (Amazon/Shopee/ML)
é o mínimo, e o tamanho da fatia deve ser reavaliado após 2 meses de uso (risco em spec §13).

Cartão por **competência**: `data` é o mês da competência, cada parcela cai no mês da sua
fatura. Duas visões — "parcela a parcela" (confiável) e "pela data da compra" (só quando
`data_compra` existe).

---

## Passo 10 — Lançamentos, Mais, Planejar, Categorias

**Objetivo:** fechar as telas restantes.

**Contexto:**
- **Navegação:** 5 itens, **idêntica para os dois papéis** — `Início · Triar · Lançamentos
  · Análise · Mais`. Triar é o **único** com contador. Planejar, Categorias e OQV moram
  **dentro de Mais**; Planejar e OQV só aparecem para o gestor.
- **Planejar abre no estado de primeira vez**, porque `metas` está vazia há meses. Botão
  "Sugerir meu orçamento" preenche a partir da média de 3 meses. **Ninguém preenche
  orçamento à mão** — foi por isso que a tabela nunca saiu do zero.
- **Patrimônio:** o saldo da conta corrente Itaú passa a vir do sync (`fonte='itau'`,
  diário, balde barato). ⚠️ **O CDB não vem pela API** — verificado em 06/08: a resposta
  traz uma única conta. CDB e BTG são 57% do patrimônio e continuam manuais, então o
  **alerta de 30 dias é requisito**, não acabamento.
- **Operação atômica:** arquivar subcategoria em uso exige mover os lançamentos **e**
  arquivar, numa transação. Vira **função Postgres chamada por RPC**. É o único ponto do
  app onde falha no meio corrompe dado.
- **Papéis:** a Raiane não vê Planejar, patrimônio, fôlego, OQV nem contas PJ. As três
  primeiras linhas já são **RLS de verdade** desde `2026-08-05_blindagem-rls.sql` — o
  filtro no front é estética.

---

## Invariantes — verificar depois de todo passo

1. `verificacao.sql` retorna **PASSOU** em todas as linhas.
2. A VPS não foi alterada, e o cron das 7h gravou normalmente na manhã seguinte.
3. Nenhum segredo e nenhum CSV de lançamento commitado. **O repo é público.**
4. Campos de digitação a 16px, alvos de toque a 44px.
5. Nenhuma policy nova com `auth.uid() IS NOT NULL`.
6. `index.html` continua servindo a raiz — os PWAs instalados dependem disso.

## Protocolo de desvio

Passo que não couber em uma sessão: dividir e registrar aqui. Passo que virar
desnecessário: marcar como abandonado **com o motivo**, não apagar. Decisão nova que
contrarie a spec: atualizar `docs/spec.md` **antes** de codar, e anotar em
`docs/ESTADO.md` — foi assim que a revisão de 06/08 pegou seis furos que teriam virado
retrabalho.
