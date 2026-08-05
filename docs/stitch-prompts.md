# Prompts para o Google Stitch — app Finanças da Família

> **Como usar:** cole o **Contexto mestre** primeiro. Depois gere **uma tela por vez**,
> colando o contexto + o prompt daquela tela. Não peça o app inteiro num prompt só —
> o resultado fica genérico.
>
> **Por que em inglês:** o Stitch entende instrução em inglês com mais precisão.
> Os textos da interface estão explícitos em português para não haver tradução torta.
>
> Direção escolhida em 05/08/2026: **tela inicial orientada a ação** (opção C).
> Todos os números abaixo são reais, extraídos do Supabase em 05/08/2026.

---

## Contexto mestre

```
You are designing a mobile-first personal finance PWA for a Brazilian family
of two users. All UI text must be in Brazilian Portuguese, exactly as written
in these prompts. Currency is BRL formatted as "R$ 1.234,56" (dot for
thousands, comma for decimals). Dates as DD/MM.

THE PRODUCT
"Finanças da Família" — a private app for one couple, not a commercial product.
It reads bank and credit card transactions automatically and helps them
understand and control their real cost of living. It is NOT a bank: there are
no transfers, no payments, no cards to manage. Every screen exists to answer a
question or to complete a piece of work.

THE TWO USERS
- Juarez (role "gestor"/admin): left his salaried job in Sep 2025 and lives off
  savings while his automation company ramps up. He needs to decide.
- Raiane (role "colab"): his wife. She reviews and classifies transactions.
  She must never see company accounts or the family net worth.

THE CENTRAL TENSION — this drives the whole design
Transactions arrive automatically but 20-27% arrive UNCLASSIFIED ("Indefinido").
Until they are classified, every number in the app is potentially wrong by up to
a quarter. So the app must always be honest about its own reliability, and must
make classifying fast and satisfying. Never show a confident number on top of
dirty data without saying so.

VISUAL DIRECTION
- Clean, calm, generous white space. Light and dark themes.
- One big number per screen maximum. Everything else quiet and small.
- Rounded cards (14px radius), 1px hairline borders, very soft shadows.
- No decorative illustrations, no gradients, no glassmorphism, no 3D.
- Bottom navigation bar, 5 items, icon + label.
- Minimum touch target 44px. Body text 16px on mobile.
- Use outline vector icons of a single consistent family. No emoji as icons.

COLORS — use these exactly, do not invent a palette
Light theme: background #f4f6f9, card #ffffff, primary text #1a2230,
secondary text #5c6675, border #e6e9ef
Dark theme: background #0f141b, card #1a2230, primary text #e7ebf0,
secondary text #97a2b2, border #2a3442
Accent / primary action: #2f6df0 (blue)
Positive: #0f9d58 (green). Negative / alert: #d23f3f (red). Warning: #d98c00.

CLASSIFICATION COLORS (fixed, used in charts and tags)
Pessoal família #2f6df0 · Pessoal Juarez #0f9d58 · Pessoal Raiane #e36fae
Dra. Raiane #b5560e · Slim Fit #7a5cf0 · Rai Móveis #c2410c · OQV #127c8a
Empréstimo #d98c00 · Não é gasto #9aa3b2 · Indefinido #d23f3f

TYPOGRAPHY
DM Sans for everything. Numbers that appear stacked in a column or list must
use a monospaced/tabular font (DM Mono) so digits align vertically. Big hero
numbers use DM Sans Bold, not monospace.

BOTTOM NAVIGATION (same on every screen)
Início · Triar · Lançamentos · Análise · Mais
"Triar" shows a red badge with the number of unclassified items (e.g. 30).
```

---

## Tela 1 — Início

```
Screen: "Início" (Home). This is the screen that opens the app.

Its job is to answer "what do I need to do or look at today?". It leads with
things that require action, not with a dashboard. If nothing needs attention,
it degrades gracefully into a calm summary.

From top to bottom:

1. Compact header: "Finanças da Família" on the left, current month "Julho 2026"
   on the right, plus an eye icon to hide all monetary values.

2. ATTENTION CARD (amber/warning, most prominent element on screen):
   Title: "30 lançamentos sem classificar"
   Body: "22% de julho. Enquanto isso, os números abaixo podem mudar."
   Primary button, full width: "Triar agora"
   This card disappears entirely when there is nothing pending.

3. CARD "O que fugiu do padrão" — a short list of anomalies, each row with a
   small icon, a label, and a right-aligned value:
   - "Farmácia" · "3× a média" (in red)
   - "Assinatura nova detectada" · "R$ 49,90/mês"
   - "Parcela alta em agosto" · "R$ 890"
   Each row is tappable and has a chevron.

4. CARD "Fôlego da reserva" — smaller than the cards above, secondary:
   Big number "1,8 meses" in red, label above it in small uppercase.
   Sub-line: "R$ 16.628 líquidos ÷ R$ 9.057/mês"
   A thin horizontal progress bar, 15% filled, red.
   Small caption in muted text: "patrimônio atualizado à mão em 12/07"

5. CARD "Custo de vida — julho": "R$ 5.569" with a small green pill next to it
   reading "−38% vs. média de 3 meses", and a muted caption "parcial · 30
   lançamentos ainda sem classificar".

Design the empty state too: when there is nothing pending and no anomaly, the
attention card is replaced by a quiet card saying "Tudo classificado. Nada fora
do padrão neste mês." with a small check icon.
```

---

## Tela 2 — Triar

```
Screen: "Triar" (Triage). This is the work screen — the most important
interaction in the entire app.

The user classifies unclassified transactions one at a time, like a card deck.
It must feel fast and satisfying, with an obvious sense of progress. The app has
learned 520 rules from past classifications, so it can suggest an answer.

Layout:

1. Progress header: "30 pendentes · julho" with a slim progress bar showing how
   many have been done in this session.

2. One large card, centered, one transaction at a time:
   - Merchant description, large and bold: "DROGARIA PACHECO"
   - Below it, muted and smaller: "R$ 87,40 · 12/07 · Cartão"

3. Suggestion block inside the card, visually distinct (light blue tint):
   Label: "Parecido com 4 lançamentos anteriores"
   Two suggested values shown as fields:
   - Categoria: "Farmácia"
   - Classificação: "Pessoal família"

4. Two buttons side by side, large:
   - Primary, blue, wide: "Confirmar"
   - Secondary, outline: "Mudar"
   Below them, a subtle text link: "pular"

5. When the user taps "Mudar", show the alternatives as a list of large tappable
   chips, not a dropdown. Classification options, each with its color dot:
   Pessoal família · Pessoal Juarez · Pessoal Raiane · Dra. Raiane · Slim Fit ·
   Rai Móveis · OQV · Empréstimo · Não é gasto

6. Design the finished state: when the queue reaches zero, show a calm success
   screen with a check icon, "Tudo classificado" and a line reading
   "Os números do app agora estão completos." plus a button "Ver o resumo".

Also design a variant of the card that shows NO suggestion (when the app has
never seen this merchant): the suggestion block is replaced by empty category
and classification fields with the label "Primeira vez que vejo este lugar".
```

---

## Tela 3 — Lançamentos

```
Screen: "Lançamentos" (Transactions). This is the archive — for looking things
up, not for doing work. Classification happens on the Triar screen.

Layout:

1. Search field at the top, full width, with a magnifier icon:
   placeholder "buscar lançamento…"

2. A horizontal row of filter chips that scrolls sideways:
   "Julho" (selected, with a chevron for month picker) · "Origem" ·
   "Classificação" · "Só indefinidos"

3. Transactions grouped by day. Each group has a small sticky date header with
   the day and the day's total, e.g. "12 de julho" on the left and "R$ 342,10"
   on the right in muted text.

4. Each transaction is a row, not a table cell:
   - Left: merchant name in medium weight ("Supermercado Pão de Açúcar"),
     below it in small muted text the category and source ("Supermercado · Cartão")
   - Right: the amount, right-aligned, tabular figures ("R$ 218,40"), and below
     it a small colored tag with the classification ("Pessoal família") using
     that classification's color.
   - Rows classified as "Não é gasto" are dimmed with the amount struck through.
   - Rows still "Indefinido" have a thin red left border.

5. Infinite scroll — do not design pagination controls.

Design the empty state: "Nenhum lançamento com esses filtros." with a button
"Limpar filtros".
```

---

## Tela 4 — Análise

```
Screen: "Análise". This is where the user understands patterns over time. There
are 15 months of history available (May 2025 to July 2026).

Layout, as a vertical scroll of cards:

1. Segmented control at top: "3 meses" · "6 meses" · "12 meses" · "Tudo"

2. CARD "Custo de vida ao longo do tempo": a clean line chart, one line, no
   gridline clutter, with the monthly average drawn as a dashed horizontal
   reference line. Months that are unusually high are marked with a small dot.
   Below the chart: "média R$ 9.057/mês".

3. CARD "Para onde vai o dinheiro": a donut chart with a maximum of 8 slices —
   the 7 largest categories plus "Outros". Legend below as rows, each with a
   color dot, the category name, the percentage and the value, right-aligned:
   Supermercado 24% R$ 4.780 · Restaurante 13% R$ 2.679 ·
   Secretária/Babá 6% R$ 1.245 · Combustível 6% R$ 1.217 ·
   Energia 6% R$ 1.164 · Farmácia 5% R$ 1.037 · Telefonia 4% R$ 819 ·
   Outros 36% R$ 7.500

4. CARD "Fixo, variável e adicional": three horizontal stacked bars comparing
   the last three months, showing what share of spending is fixed vs variable
   vs one-off.

5. CARD "Assinaturas recorrentes": a list of subscriptions detected
   automatically, each row showing name, monthly value and, in muted text on the
   right, the yearly cost:
   - "Academia" · "R$ 129,90/mês" · "R$ 1.558/ano"
   - "Streaming" · "R$ 49,90/mês" · "R$ 598/ano"
   Header of the card shows the total: "6 assinaturas · R$ 423/mês · R$ 5.076/ano"
```

---

## Tela 5 — Planejar

```
Screen: "Planejar". Visible only to the "gestor" role. This is where limits and
goals are set. Today the budget table is empty, so the FIRST-RUN state matters
more than the filled state — design both.

FIRST-RUN STATE (design this first):
A single centered card explaining: "Você ainda não definiu orçamento."
Body: "Posso sugerir um limite por categoria com base na sua média dos últimos
3 meses. Você ajusta o que quiser depois."
Primary button, full width: "Sugerir meu orçamento"
This matters because nobody fills in 22 categories by hand.

FILLED STATE:
1. Header card: "Orçamento de julho" with a big number "R$ 5.569 de R$ 9.000"
   and a thick progress bar, 62% filled, green. Caption: "faltam 3 dias".

2. A list of categories, each as a row with two lines:
   - Line 1: category name on the left, "R$ 4.780 / R$ 5.000" on the right
   - Line 2: a thin progress bar, colored green under 80%, amber 80-100%,
     red above 100%, with the percentage as a small label on the left
   Categories over budget are sorted to the top.
   Example rows: Supermercado 96%, Restaurante 89%, Farmácia 104% (red),
   Combustível 61%, Energia 78%

3. CARD "Patrimônio e fôlego": list of the accounts entered by hand, each with
   name, value and a small "líquido" tag when applicable. A row at the bottom
   shows the total and the resulting runway "1,8 meses". An edit button.

4. CARD "Taxa de poupança": a single big percentage with a small line chart of
   the last 6 months underneath.
```

---

## Tela 6 — Mais

```
Screen: "Mais". A plain settings-style list, grouped in sections with small
uppercase section headers. Rows have an icon on the left, a label, and a
chevron on the right.

Section "Ferramentas"
- "Enviar fatura" — with muted subtitle "PDF ou CSV do cartão"
- "Assistente" — muted subtitle "perguntas sobre suas finanças"
- "Histórico de alterações" — muted subtitle "o que a Raiane mudou"
- "OQV" — muted subtitle "contas da empresa" (only for the gestor role)

Section "Preferências"
- "Tema" — with a segmented control on the right: Sistema · Claro · Escuro
- "Esconder valores" — with a toggle switch

Section "Conta"
- The user's name and role, e.g. "Juarez · Gestor"
- "Sair" in red text
```

---

## Estados que valem pedir depois

Se as telas principais agradarem, peça ao Stitch estes três, que são onde
aplicativos costumam falhar:

- **Carregando:** a tela Início e a Lançamentos com esqueleto (shimmer), não spinner.
- **Erro de conexão:** a tela Lançamentos com uma mensagem e um botão "Tentar de novo".
- **Visão da Raiane:** a tela Início sem o card de Fôlego e sem a aba OQV, já que
  ela não pode ver patrimônio nem contas da empresa.

## O que trazer de volta

Exporte as telas (imagem ou link do Figma) e me mande. A partir delas eu escrevo o
`spec.md` mapeando cada elemento para as tabelas do Supabase que já existem
(`transacoes`, `regras`, `metas`, `patrimonio`, `config`, `log_alteracoes`) e para
as políticas de RLS por papel. Nada aqui exige tabela nova, com uma exceção:
"assinaturas recorrentes" pode ser detecção calculada ou tabela própria — decidimos
no spec.
