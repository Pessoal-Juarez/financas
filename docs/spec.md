# spec.md — Redesign do app Finanças da Família

**Versão:** 1.2 · **Data:** 06/08/2026 · **Status:** ✅ **revisada e aprovada pelo Juarez**

Especificação do redesign completo das telas. Consolida as decisões do brainstorming de
05/08/2026 e da revisão de 06/08/2026. **Não contém implementação** — o próximo passo é
quebrar em tarefas e executar a Fase 1 da migração.

### O que mudou da v1.0 para a v1.1 (revisão de 06/08/2026)

| # | Mudança | Onde |
|---|---|---|
| 1 | **Planejar passa a morar dentro de "Mais"** — a barra tinha 5 itens e a tela ficara órfã | §3 |
| 2 | **Alvo numérico de sucesso**: sem classificação < 8% até 30/09/2026 | §1 |
| 3 | **Fase 3 da migração cortada do escopo** — única operação irreversível, em banco sem PITR, por ganho cosmético | §6, §10 |
| 4 | **Comportamento do trigger definido** para texto desconhecido vindo da VPS | §6 |
| 5 | **CDB não vem pelo Open Finance** — verificado em 06/08. Automação cobre 1 das 3 linhas do patrimônio | §7 |

### v1.2 — o que a pesquisa de implementação mudou (mesmo dia)

Ao quebrar a spec em plano de construção, três medições no banco mudaram decisões:

| # | Achado | Consequência |
|---|---|---|
| 7 | O de-para cobria só `transacoes`. **8 categorias órfãs em `regras`**, uma com **54 regras** (`Pix pessoas`) | 2 subs novas; asserção obrigatória cobrindo as duas tabelas |
| 8 | **132 regras classificavam para `Outros` — 128 delas são marketplace** (Amazon/Shopee/ML) | grupo **`Compras`** criado; `Outros` deixa de existir; 128 regras superajustadas viram 3 |
| 9 | 3 categorias mandadas para "Não conta" eram **dinheiro real** (R$ 129 mil de receita, R$ 746 de gasto) | grupo `Receitas` criado; `Internacional` vai para triagem |
| 10 | Com marketplace nomeado, a dívida histórica caiu de **388 para 33** | **as duas filas viraram uma só** (`Triar`, 656) — a separação deixou de se pagar |

A decisão nº 3 da v1.1 (duas filas) foi **revertida pela nº 10**: ela existia para
proteger de uma fila de 388, e o número deixou de existir.

---

## 1. Objetivo e critério de sucesso

O app existe para **controlar melhor as finanças pessoais**. Traduzido em critério
verificável, na ordem de prioridade que o Juarez definiu:

1. **(b) Clareza** — saber para onde vai o dinheiro sem precisar parar para pensar.
2. **(d) Custo de atenção baixo** — gastar o mínimo de tempo dentro do app.

Não são objetivos: cortar gastos por disciplina imposta (o app não é um freio), nem
maximizar o fôlego da reserva. Esses podem ser consequência, não a métrica.

### Alvo verificável (definido em 06/08/2026)

**Lançamentos sem classificação abaixo de 8% até 30/09/2026** — hoje são 19,9%
(623 de 3.132). É o único número que diz se o redesign funcionou; o resto é gosto.

Como o alvo é atingível sem heroísmo: 107 dos 623 caem na varredura retroativa de um
clique (§7, verificado no banco em 06/08), e o restante depende da triagem ficar rápida
o bastante para caber num intervalo de café. A fila total pós-migração é de **656**
(§4) — 623 do fluxo corrente mais 33 de dívida antiga.

### A tensão central que governa o design

Lançamentos chegam automaticamente, mas **20–27% chegam sem classificação**. Em julho
de 2026, "a classificar" era a **segunda maior fatia do mês** (R$ 2.006, 30%), atrás só
de Alimentação. Enquanto isso não for resolvido, todo número do app pode estar errado
em até um terço.

Consequência de design, aplicada em todas as telas: **o app declara sua própria
incerteza em vez de fingir precisão** — mas sem transformar a interface em cobrança
permanente, porque o objetivo (d) é gastar menos tempo, não se sentir devedor.

---

## 2. Serviços envolvidos — o que já existe e será reaproveitado

Nada aqui é criado do zero. O redesign é **camada de apresentação**.

| Serviço | Papel | Situação |
|---|---|---|
| **GitHub Pages** (`Pessoal-Juarez/financas`) | hospedagem do front | ativo · deploy = `git push` na `main` |
| **Supabase** (`urlxbgngcncndtnhyqyf`) | Postgres + Auth + Storage + RLS | ativo · plano **free** |
| **VPS** (`root@srv1093562`) | sync automático via Claude Code | ativo · 3 crons |
| **Open Finance MCP** (Cumbuca) | leitura do Itaú | ativo · 1 instituição conectada |
| **Supabase Storage** | upload de faturas PDF/CSV | ativo |

**Cotas que restringem o desenho:** o balde barato do Open Finance (saldo + 7 dias)
tem ~240 chamadas/mês; o caro (histórico, faturas, `list_accounts`) tem **8/mês**.
Qualquer funcionalidade que dependa do balde caro precisa justificar o consumo.

**Nada de novo será provisionado.** Sem novo banco, sem novo webhook, sem novo serviço.

---

## 3. Telas

Navegação inferior fixa, **5 itens, idêntica para os dois papéis**. `Triar` exibe
contador de pendentes — e é o **único** item com contador.

```
Início · Triar · Lançamentos · Análise · Mais
```

| # | Tela | Pergunta que responde | Onde fica | Papel |
|---|---|---|---|---|
| 1 | **Início** | "para onde foi meu dinheiro este mês?" | barra | ambos |
| 2 | **Triar** | "o que falta classificar?" | barra | ambos |
| 3 | **Lançamentos** | "onde está aquele lançamento?" | barra | ambos |
| 4 | **Análise** | "qual é o meu padrão ao longo do tempo?" | barra | ambos (colab sem empresas) |
| 5 | **Mais** | ferramentas e preferências | barra | ambos |
| 5a | **Planejar** | "quanto posso gastar? quanto tenho?" | dentro de Mais | **só gestor** |
| 5b | **Categorias** | editar grupos e subcategorias | dentro de Mais | ambos (colab só cria) |
| 5c | **OQV** | contas da empresa | dentro de Mais | **só gestor** |

**Decisão de 06/08/2026 — Planejar mora dentro de "Mais".** Na v1.0 a barra declarava 5
itens mas a tabela listava 8 telas, e Planejar (orçamento + patrimônio + fôlego) tinha
ficado de fora sem lugar definido. As alternativas eram promovê-la a 5º item — o que
obrigaria a **barra a mudar conforme o papel**, já que a Raiane não vê Planejar (§8) — ou
ir para 6 itens, o que aperta os alvos de toque abaixo dos 44px que acabamos de corrigir
em `e38fe5b`. Com ela dentro de Mais, a barra é a mesma para os dois, e o que varia por
papel é só a lista dentro de Mais.

### Decisões de conteúdo

- **Início lidera com clareza, não com trabalho.** O número grande é o custo de vida
  do mês; abaixo dele, a faixa de incerteza ("+ até R$ 1.174 ainda sem classificar")
  com atalho para triar. A opção descartada era abrir com a lista de pendências —
  contradizia o objetivo (d).
- **Fôlego é o menor card do Início**, uma linha. É informação importante mas ansiosa;
  o detalhe mora em Planejar.
- **Análise mostra rosca limpa + linha de honestidade** ("calculado sobre 70% de julho;
  R$ 2.006 ainda sem classificar"). Descartadas: mostrar a fatia hachurada (pune
  visualmente todo mês) e omitir sem avisar (mente por omissão).
- **Planejar tem o estado de primeira vez como tela principal**, porque `metas` está
  vazia há meses. O botão "Sugerir meu orçamento" preenche a partir da média de 3
  meses. Ninguém preenche orçamento à mão — foi por isso que a tabela nunca saiu do zero.

Prompts detalhados de cada tela: [`stitch-prompts.md`](stitch-prompts.md).

---

## 4. Nomenclatura

### Classificações — rótulos mais leves

"Pessoal Juarez" ao lado de "Pessoal Raiane" transforma o app num placar de quem gastou
mais. Num app de casal, isso azeda.

| Chave no banco (não muda) | Rótulo exibido |
|---|---|
| `Pessoal família` | Da casa |
| `Pessoal Juarez` | Do Juarez |
| `Pessoal Raiane` | Da Raiane |
| `Dra. Raiane` | Clínica |
| `Empréstimo` | Emprestado |
| `Não é gasto` | Não conta |
| `Indefinido` | **A classificar** |
| `Slim Fit` · `Rai Móveis` · `OQV` | inalterados |

**As chaves do banco NÃO mudam.** O mapa vive em `assets/modelo.js`. Renomear passa a
custar uma linha em vez de migrar 3.132 lançamentos + 520 regras.

`Indefinido → A classificar` é a mudança de tom mais importante: 623 lançamentos deixam
de ser marcados como defeito e passam a ser fila de trabalho.

### Categorias — dois níveis

**11 grupos, 47 subcategorias** — 10 de despesa mais `Receitas`. Base: padrão Plaid
(16/104, reduzido de 600+ porque excesso confunde) e grupos da POF/IBGE, dimensionado
para uma família.

Grupos de despesa: Alimentação · Moradia · Saúde · Transporte · Cuidado pessoal ·
Educação · Lazer · **Compras** · Serviços & obrigações · Empresas.
Mais o grupo **`Receitas`**, que não aparece em Análise nem no orçamento — existe para
que toda categoria tenha um grupo.

**Grupo é o eixo padrão** de Análise e do orçamento; subcategoria aparece no drill-down.
Orçamento com 10 linhas se revisa em dois minutos; com 47, é abandonado no segundo mês.

Taxonomia completa e de-para: [`taxonomia-categorias.md`](taxonomia-categorias.md).

### `Outros` era marketplace — o achado que reorganizou a taxonomia

Na v1.1 esta seção descrevia um problema: o de-para mandava 9 categorias de volta para a
fila, `Outros` entre elas, e a triagem saltaria de **623 para 1.011**. A solução desenhada
era separar em duas filas. Investigando **por que** `Outros` era tão grande, o problema
se dissolveu.

**As 132 regras que classificavam para `Outros` são, 128 delas, marketplace** — `AMAZONBR`
(79 usos), ~100 padrões `SHOPEE…` (um por vendedor) e `MERCADOLIVRE…`/`MERCADOPAGO…`.
`Outros` nunca foi bagunça: era **marketplace sem nome**. Amazon, Shopee e Mercado Livre
não dizem na descrição *o que* foi comprado, então tudo caía no balde genérico.

Isso é um tipo de gasto legítimo e nomeável — o "General Merchandise" do Plaid. Virou o
grupo **`Compras`** (Marketplace · Eletrônicos · Presente).

| | Com `Outros` na fila | Com `Compras › Marketplace` |
|---|---|---|
| Dívida histórica | 388 | **33** |
| Triagem total | 1.011 | **656** |
| Regras superajustadas | 128 | **3** (`SHOPEE`, `AMAZON`, `MERCADOLIVRE`) |
| Telas necessárias | 2 filas | **1** |

**Decisão: fila única.** `Triar` com 656 — 623 do fluxo corrente + 33 de dívida antiga,
dos quais 107 caem na varredura retroativa. A separação em duas filas existia para
proteger de um número que deixou de existir; mantê-la custaria uma tela inteira e um
conceito a mais na interface para 33 lançamentos.

**A lição, que vale para o resto do projeto:** classificar direito a categoria mais
volumosa vale mais que qualquer engenharia de interface construída em cima da bagunça.

---

## 5. Arquitetura de arquivos

Vários HTML sem build. Descartadas: arquivo único (viraria 2.000+ linhas) e build com
Vite/framework (exigiria Node para qualquer alteração, sem ganho para 2 usuários).

```
financas/
├── index.html          porta de entrada: login → redireciona
├── inicio.html · triar.html · lancamentos.html · analise.html
├── planejar.html · mais.html · categorias.html · oqv.html
├── assets/
│   ├── app.css         tokens, temas, componentes, navegação
│   ├── db.js           Supabase: auth, leitura paginada, cache, gravação
│   ├── modelo.js       grupos, rótulos, classes, regras de negócio
│   └── ui.js           nav inferior, toast, BRL, olho, esqueleto
├── fonts/              DM Sans + DM Mono (auto-hospedadas)
├── sql/                migrações e verificação
└── docs/               spec.md · architecture.md · workflow.md · README.md
```

**`index.html` continua sendo a porta de entrada** — o `start_url` do manifest é `"."`,
então mudar isso quebraria os PWAs já instalados nos celulares.

**Cache obrigatório.** `fetchAllTx` lê 3.132 linhas em 4 requisições. Sem cache,
navegar entre 6 telas refaria isso a cada troca. `db.js` guarda o conjunto em
`sessionStorage` com validade; invalidado por: classificar, aplicar lote, trocar de mês,
editar categoria, ou puxar-para-atualizar. **Sem isso, esta arquitetura seria pior que
o arquivo único.**

### Tipografia

DM Sans (a fonte da Nomad, licença OFL) para texto; **DM Mono para valores empilhados**.
Medido em 05/08/2026: DM Sans tem números proporcionais — "1111111111" ocupa 103px e
"0000000000" ocupa 268px — e **ignora `font-variant-numeric: tabular-nums`**. Numa coluna
de dinheiro isso desalinha. DM Mono dá 240px nos dois casos. Números-herói continuam em
DM Sans (são um número, não coluna).

---

## 6. Arquitetura de dados

### Tabelas existentes

`transacoes` (3.132) · `regras` (520) · `metas` (**0**) · `patrimonio` (3) · `config` ·
`log_alteracoes` · `comandos` · `perguntas` · `perfis` · `audit_log`

Views em inglês (`transactions`, `profiles`) com `security_invoker=on` sobre as tabelas
em português. **Não mexer** — o front atual e a VPS dependem delas.

### Mudanças

| Tabela | Mudança | Volume |
|---|---|---|
| **`categorias`** (nova) | `id`, `grupo` (text), `nome`, `ativa`, `ordem` | seed **47 linhas** |
| `transacoes` | + `categoria_id` FK nullable; `categoria` texto **permanece** | backfill 3.132 |
| `regras` | + `categoria_id` FK nullable; `categoria` texto permanece | backfill 520 |
| `metas` | recriada com `grupo` como chave | **zero** (está vazia) |
| `patrimonio` | + `fonte` (`manual` \| `itau`) | 3 |

**Grupo é texto em `categorias`**, não tabela própria: 9 valores estáveis vindos de
padrão externo. Tabela separada seria cerimônia sem ganho.

**Assinaturas recorrentes: calculado, sem tabela.** Mesma descrição normalizada em 3 dos
últimos 4 meses, valor dentro de ±15%. Uma tabela exigiria manutenção manual a cada
mudança de preço, e ninguém faz isso.

### Migração em 2 fases — ambas reversíveis

**Fase 1 — aditiva.** Cria `categorias`, semeia, adiciona `categoria_id`, faz backfill.
O texto continua sendo a fonte da verdade. VPS, regras e telas atuais seguem funcionando
sem saber que algo mudou.

**Fase 2 — o front lê por `categoria_id`.** Um **trigger de insert** resolve o texto que
a VPS grava para o `categoria_id` correspondente. **Os scripts em `/root/financas/` não
precisam de nenhuma alteração.** Isso importa: a VPS é deploy separado com cron às 7h;
um erro lá ficaria invisível até o dia seguinte.

> **Comportamento do trigger quando o texto é desconhecido** (definido em 06/08/2026 —
> a v1.0 não dizia). Se a VPS gravar um `categoria` que não existe em `categorias`:
> `categoria_id` fica **nulo**, o texto original é **preservado intacto**, e o lançamento
> cai na fila de triagem. O trigger **nunca cria categoria** e **nunca descarta o texto**.
> Categoria nova nasce por decisão humana na tela de Categorias, não por efeito colateral
> de um cron às 7h.

**A Fase 3 (destrutiva) foi cortada do escopo em 06/08/2026.** Ela removeria
`transacoes.categoria` e `regras.categoria` após um mês estável. Motivo do corte: era a
**única operação irreversível de todo o plano**, num Supabase **plano free — sem
point-in-time recovery**, em troca de um ganho puramente cosmético (duas colunas de texto
em 3.132 linhas não custam performance nem dinheiro). Mantidas, elas ainda servem de
**backup legível** do de-para e deixam a VPS funcionando mesmo que o trigger falhe.
Consequência assumida: o dado fica denormalizado para sempre, e toda escrita de categoria
precisa manter texto e `categoria_id` coerentes — responsabilidade do trigger e das
asserções de `verificacao.sql` (§10).

⚠️ **`regras.categoria` é texto.** Renomear ou fundir categorias sem atualizar as 520
regras na mesma transação faz a auto-classificação parar de acertar — piorando
justamente o objetivo (d). As duas migram juntas, sem exceção.

---

## 7. Fluxos e gatilhos

### Triagem — o laço de aprendizado

```
lançamento sem classificação
   → busca regra cujo `padrao` esteja contido na descrição normalizada
   → achou:    cartão com sugestão preenchida
      → Confirmar : grava. A regra já acertou, nada a aprender.
      → Mudar     : grava + ATUALIZA a regra (ela vinha errando)
      → Pular     : não grava, volta ao fim da fila
   → não achou: cartão vazio, "Primeira vez que vejo este lugar"
      → escolha do usuário CRIA regra nova
```

**"Mudar" é o evento que ensina**, não "Confirmar". É por aí que os 22% caem.

### Varredura retroativa

**107 dos 623 pendentes já casam com regras existentes** — nunca foram reprocessados
porque regras só valem para lançamentos novos. Tela de lote com os 107, sugestão por
linha, desmarcável, e um "Aplicar todos". Derruba a fila para ~516 num clique.

✅ **Verificado no banco em 06/08/2026:** rodando a normalização real (NFKD, só A-Z,
maiúsculas, 18 chars) dos 623 pendentes contra as 520 regras por "contém", o resultado
é exatamente **107**. O número não é estimativa.

**Propor, nunca aplicar calado.** Mexer em 107 lançamentos sem o usuário ver seria
rápido e errado.

### Consolidação das regras de marketplace

Parte da migração, não da tela: as **128 regras superajustadas** de marketplace (uma por
vendedor da Shopee) viram **3** — `SHOPEE`, `AMAZON`, `MERCADOLIVRE` — apontando para
`Compras › Marketplace`. As 4 regras `Outros` que não são marketplace vão para a triagem.

Isso não é limpeza cosmética: com uma regra por vendedor, **todo vendedor novo da Shopee
gera um lançamento sem classificação**, e a fila se realimenta sozinha. Três regras por
prefixo cortam essa torneira.

### Detecção de anomalias (card "O que fugiu do padrão")

| Alerta | Regra | Trava anti-ruído |
|---|---|---|
| Grupo acima do normal | total do mês ≥ 2× a média dos 3 anteriores | só se ≥ R$ 200 |
| Assinatura nova | recorrente detectada aparecendo pela 1ª vez | exige 2 ocorrências |
| Parcela alta à frente | soma de parcelas com vencimento futuro | só se ≥ R$ 500 |

Sem as travas, o card viraria alarme permanente por variação de R$ 30 — e seria ignorado.

### Patrimônio automático

O saldo da conta corrente Itaú **passa a vir do sync** (balde barato, diário) em vez de
digitação manual. Rows com `fonte='itau'` são atualizadas pelo cron; `fonte='manual'`
(BTG preso como garantia) exibe lápis e alerta quando passa de 30 dias sem atualização.

✅ **Verificado em 06/08/2026 — e a resposta é não.** O Open Finance devolve **uma única
conta**: a corrente do Itaú (`CONTA_DEPOSITO_A_VISTA`, conjunta). **Não existe conta de
investimento na resposta — o CDB não vem pela API e não virá.**

| Linha de `patrimonio` | Valor registrado (05/06) | Fonte a partir de agora |
|---|---|---|
| Conta corrente Itaú | R$ 9.261,99 | **`itau`** — automática, diária, balde barato |
| CDB Itaú | R$ 7.365,79 | `manual` |
| BTG (preso como garantia) | R$ 12.000,00 | `manual` |

O saldo real da conta em 06/08 às 14:10 era **R$ 12.778,44** (integralmente em aplicação
automática) — **R$ 3.516 acima** do registrado. Só isso já move o fôlego.

**Consequência de design:** a automação cobre **1 das 3 linhas**, e as duas manuais são
57% do patrimônio. O alerta de 30 dias deixa de ser detalhe de acabamento e passa a ser
**a peça que sustenta a confiabilidade do fôlego** — sem ele, Planejar volta a exibir um
número velho com cara de número fresco. Tratar como requisito, não como enfeite.

### Crons existentes (inalterados)

`0 7 * * *` sync da conta · `0 8 * * 1` sync do cartão semanal ·
`0 9 1-3 * *` sync do cartão mensal · `*/2 * * * *` fila de comandos

---

## 8. Papéis e segurança

| | Raiane (colab) | Juarez (gestor) |
|---|---|---|
| Triar / Lançamentos / Análise | sem OQV e sem contas PJ | tudo |
| **Planejar, patrimônio, fôlego** | **não vê** | sim |
| Criar subcategoria | sim | sim |
| Renomear ou arquivar categoria | **não** | sim |
| Editar valor, data, tipo, origem | **não** | sim |

As três primeiras linhas **já são RLS de verdade** desde a migração
`2026-08-05_blindagem-rls.sql`, não filtro de tela. `categorias` precisa de política nova
na mesma lógica: leitura para membro, escrita destrutiva só para admin.

**Regra de ouro herdada:** nunca escrever policy com `auth.uid() IS NOT NULL` — isso
significa "qualquer um que criou conta", não "a família". Usar `eh_membro()` e
`is_admin()`.

---

## 9. Erros, estados e frescor

**A falha que mais importa:** perder classificações feitas em sequência quando o sinal
oscila. **Não haverá fila offline** (complexidade alta, conflito com o sync da VPS). Em
vez disso: o cartão **não avança até a gravação confirmar**; se falhar, permanece no
cartão com o erro e "Tentar de novo". Nunca some trabalho silenciosamente.

**Operação atômica obrigatória:** arquivar subcategoria em uso exige mover os lançamentos
**e** arquivar. Vira **função Postgres chamada por RPC**, numa transação. É o único ponto
do app onde falha no meio corrompe dado.

**Estados por tela:** todas têm esqueleto (nunca spinner solto), vazio explicativo e erro
com ação de recuperação. Planejar tem o estado de primeira vez como principal.

**Frescor:** cada tela exibe "atualizado há X min"; puxar-para-baixo força releitura.

---

## 10. Validação e reversão

Sem suíte automatizada — dois usuários, e teste quebrado é pior que teste ausente.

1. **`sql/verificacao.sql`** — asserções após cada fase: "toda transação tem
   `categoria_id`", "nenhuma regra aponta para categoria inexistente", "soma por grupo
   bate com o total". Retorna PASSOU/FALHOU por linha.
2. **Checklist manual por tela** em `docs/workflow.md`.
3. **Validação no navegador medida, não observada** — alturas de toque, contraste,
   contagem de linhas. Foi assim que se descobriu o desalinhamento do DM Sans.

**Reversão: todo o plano é reversível.** As duas fases são aditivas — desfazer é remover
a coluna `categoria_id` e o trigger; o texto nunca deixa de existir. Com a Fase 3 cortada
(§6), **não há nenhuma operação destrutiva no roteiro**, o que era a única exposição real
num plano free sem point-in-time recovery.

Ainda assim, **exportar `transacoes` e `regras` em CSV antes da Fase 1** e guardar fora
do banco. Custa dois minutos e cobre o cenário que sobrou: um `UPDATE` de backfill mal
escrito rodando em 3.132 linhas.

**Asserção extra exigida pelo corte da Fase 3:** como texto e `categoria_id` convivem
para sempre, `verificacao.sql` precisa checar **coerência entre os dois** — nenhuma linha
onde `categoria_id` aponte para uma categoria cujo nome divirja do texto gravado. Sem
isso, a denormalização apodrece em silêncio.

---

## 11. Variáveis de ambiente e segredos

Nenhuma variável nova.

| Onde | Chave | Observação |
|---|---|---|
| Front (público) | `SUPABASE_URL`, anon key | embutidas no HTML — correto por design; a proteção é o RLS |
| VPS `/root/financas/.env` | `SB`, `SR` (service_role) | `chmod 600` · **nunca commitar** · ignora RLS |

O repositório é **público** e continua assim. Com o RLS correto e o cadastro fechado
(feito em 05/08/2026), torná-lo privado não agrega e custaria GitHub Pro para manter o
Pages funcionando.

---

## 12. Fora de escopo (YAGNI declarado)

- Tabela de grupos, de assinaturas, ou orçamento por subcategoria
- Fila offline / outbox de sincronização
- Renomear `cls` no banco (só rótulo no front)
- Login com Google (avaliado e descartado: ganho é conforto, não segurança)
- Build com Vite/framework
- Suíte de testes automatizados

---

## 13. Riscos abertos

| Risco | Impacto | Mitigação |
|---|---|---|
| Renomear categorias sem atualizar as 520 regras | auto-classificação degrada; piora o objetivo (d) | migrar as duas na mesma transação; asserção em `verificacao.sql` |
| Texto e `categoria_id` divergirem com o tempo (consequência de cortar a Fase 3) | dado denormalizado apodrece em silêncio | trigger é o único caminho de escrita + asserção de coerência em `verificacao.sql` (§10) |
| `UPDATE` de backfill mal escrito em 3.132 linhas | perda de dado em plano free sem PITR | export CSV de `transacoes` e `regras` antes da Fase 1 |
| Cache servindo dado velho após o cron | decisão sobre número desatualizado | TTL + "atualizado há X min" + pull-to-refresh |
| ~~CDB pode não vir pelo Open Finance~~ | **confirmado em 06/08: não vem** | 2 das 3 linhas do patrimônio seguem manuais; alerta de 30 dias vira requisito (§7) |
| 516 pendentes continuam exigindo julgamento humano | fila não zera sozinha | triagem otimizada para velocidade; "Mudar" ensina a regra |
| `Compras › Marketplace` virar o novo `Outros` — um balde grande que não explica nada | 31% do gráfico só troca de nome | drill-down por loja (Amazon/Shopee/ML) e revisão do tamanho da fatia após 2 meses de uso |
| Regra por prefixo (`SHOPEE`) capturar o que não devia | classificação errada em massa, silenciosa | prefixos são 3 e específicos; `verificacao.sql` reporta o volume classificado por cada um |
| Patrimônio parado desde 05/06 | fôlego de 1,8 meses pode estar errado | conta corrente automatizada; alerta de 30 dias nas duas linhas manuais (57% do total) |

---

## 14. Próximo passo

Spec **aprovada em 06/08/2026**. Quebrar em tarefas pequenas e sequenciais, começando
pela **migração de dados** — caminho crítico, bloqueia Análise e Planejar — e pela camada
compartilhada `assets/`. **Não pelas telas:** tela sem taxonomia consolidada é retrabalho
garantido.

Ordem de ataque:

1. Export CSV de `transacoes` e `regras` (§10)
2. **Fase 1** — `categorias` + seed dos 11 grupos/47 subs + `categoria_id` + backfill + consolidação das regras de marketplace + `verificacao.sql`
3. `assets/modelo.js` (grupos, rótulos, classes) e `assets/db.js` (leitura paginada + cache)
4. **Fase 2** — trigger de resolução + front lendo por `categoria_id`
5. Telas, na ordem: Triar → Início → Análise → Lançamentos → Mais/Planejar

> **Nota de 06/08/2026:** a v1.0 apontava `/break` como próximo comando. Esse comando não
> existe nesta instalação do Claude Code — o equivalente é o skill `blueprint` (plano de
> construção passo a passo) ou `to-issues`.
