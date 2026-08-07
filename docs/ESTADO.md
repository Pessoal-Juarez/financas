# Onde paramos

**Última atualização:** 07/08/2026, tarde.
**Leia este arquivo primeiro** ao retomar o projeto.

---

## Em uma frase

**A virada de chave foi feita em 07/08/2026: o app novo está no ar.** A `main` serve as
13 telas, `index.html` é o login e o app antigo virou `legado.html`, sem link. O que
falta é a **Fase B** e as **pendências da VPS**.

## Como rodar em 10 segundos

```bash
cd C:\Users\Samsung\Documents\Claude\Projects\Pessoal\financas
python -m http.server 8777
```
Abrir `http://localhost:8777/`. A sessão fica no `localStorage` do `localhost:8777`,
então normalmente já está logado e o login manda direto para `inicio.html`.
No ar: <https://pessoal-juarez.github.io/financas/>.

---

## Estado das branches

| Branch | O que tem | No ar? |
|---|---|---|
| **`main`** | **app novo** (13 telas + `assets/`) + `legado.html` + migrações SQL | ✅ GitHub Pages |
| `redesign` | mesma coisa — foi mesclada na `main` em `b15822e` | idem |
| `redesign-nomad` | tentativa rejeitada em 05/08 | não mesclar |

Depois da virada as duas branches são a mesma coisa. Pode trabalhar direto na `main`.

⚠️ **O banco é o MESMO para os dois apps.** Todas as migrações já estão aplicadas em
produção. O app antigo continua funcionando porque lê `categoria` como texto, que o
trigger mantém em sincronia com `categoria_id`.

---

## O que existe no app novo

| Tela | Arquivo | Responde |
|---|---|---|
| Início | `inicio.html` | para onde foi meu dinheiro este mês? |
| Triar | `triar.html` | o que falta classificar? |
| Lançamentos | `lancamentos.html` | onde está aquele lançamento? |
| Análise | `analise.html` | qual é o meu padrão ao longo do tempo? |
| Mais | `mais.html` | hub |
| Planejar | `planejar.html` | orçamento, patrimônio, fôlego · **só gestor** |
| Empresas | `empresas.html` | elas se pagam? despesas e receitas de cada uma |
| Parcelamento | `parcelamento.html` | o que já está comprometido |
| Quem me deve | `emprestimos.html` | empréstimos e quanto voltou |
| Receitas | `receitas.html` | o que entrou, de quem, de onde |
| Assistente | `assistente.html` | perguntar em português |
| Alterações | `alteracoes.html` | quem mudou o quê |
| Categorias | `categorias.html` | criar, renomear, arquivar |

Camada compartilhada em `assets/`: `modelo.js` (regras de negócio), `db.js` (auth, leitura
paginada, cache), `ui.js` (nav, toast, estados, gráficos), `app.css` (tokens, tipografia).
**`assets/_verificar.html` mede o que a spec afirma** — abrir logado, esperar 45/45.

---

## O que falta

### 1. Fase B — as três ideias aprovadas (vindas do Firefly III)

| # | O quê | Por quê |
|---|---|---|
| B1 | **Anexo de fatura (PDF/imagem)** em Lançamentos e numa tela de importação | BTG, Nubank e InfinitePay não têm automação. Supabase Storage já está ativo |
| B2 | **Motor de regras com condição + ação** | resolve estruturalmente a armadilha dos 18 caracteres. ⚠️ Exige mexer no sync da VPS, onde as regras são aplicadas |
| B3 | **"Quem me deve" e empresas como contas a receber** | responde "quanto falta me pagarem" sem gambiarra de etiqueta |

### 2. ✅ A virada de chave — feita em 07/08/2026

Fica registrado o que foi decidido, para não ser reaberto:

1. **`index.html` é a porta de entrada** — login que, com sessão, manda para
   `inicio.html`. A raiz responde, então o `start_url: "."` do manifest continua válido e
   os PWAs instalados nos celulares não quebraram.
2. **O app antigo virou `legado.html`**, intacto e sem link em lugar nenhum.
   `dashboard.html` ficou onde estava, também sem link — o "← Painel" dele aponta para o
   legado. São a rede de segurança; apagar daqui a duas semanas se ninguém usar.
3. **`redesign` mesclada na `main`** em `b15822e`, Pages republicado e conferido.

Duas descobertas do dia que valem para qualquer virada futura: **não existe service
worker** neste projeto (o PWA é só um atalho standalone, ninguém fica preso em cache
velho) e **a sessão do Supabase atravessa os dois apps** (mesma URL, mesmo storage), então
ninguém precisou digitar senha de novo.

Reverter, se precisar: `git revert` do merge `b15822e`.

### 3. Pendências na VPS (`/root/financas/`)

Só se resolvem lá, e nenhuma é urgente:

| # | O quê | Impacto |
|---|---|---|
| V1 | **`data_compra` parou de ser gravado em mai/26** | até abr/26 a cobertura era 89–96%; em mai, jun e jul é **zero**. A visão "pela data da compra" só funciona para abr/26 e antes. Afeta o `dashboard.html` antigo também, há três meses |
| V2 | **Confirmar a normalização de acento** que gera `regras.padrao` | o front calcula as duas hipóteses porque não dá para saber daqui |
| V3 | **A janela de 18 caracteres** de `regras.padrao` | curta demais quando o banco antepõe texto burocrático. Foi o que criou a regra que mandava 63 estabelecimentos para Farmácia |

### 4. ✅ Verificação que só o tempo fecha — feita em 07/08/2026

O cron das 7h de 07/08 gravou normalmente e o trigger da Fase 2 funcionou. A linha que
entrou (`Débito automático PERS INFINIT`, R$ 6.928,22) chegou **já com `categoria_id` 48**
e `cls` = `Não é gasto` — não caiu na fila. Verificação: 21 de 21. Não precisa de rollback.

A sobra que isso revelou já foi corrigida no mesmo dia: a asserção nº 1 travava o total em
`3132` e ia acusar `FALHOU` todo dia que o cron rodasse. Agora `esperado` aceita **piso**:
quando o valor começa com `>=`, a comparação é "maior ou igual" em vez de igualdade. A
nº 1 virou `>= 3132` e o número real continua visível na coluna `obtido`, então dá para
ver a base crescer. **Rodado depois da mudança: 22 de 22.**

👉 Convenção para asserções novas: use piso para o que **cresce com o tempo**. Número
travado em coisa que cresce vira ruído, e asserção que grita sozinha deixa de ser lida.

### 5. Pendências do Juarez

1. **Atualizar CDB e BTG** no patrimônio (Mais › Planejar). Parados há 62 dias, e são 57%
   do total — o fôlego de 2,3 meses é estimativa enquanto isso.
2. **Testar a Fase A** e dizer o que incomoda.

---

## Decisões tomadas — não reabrir sem motivo novo

| Decisão | Escolha | Onde |
|---|---|---|
| Critério de sucesso | clareza primeiro, custo de atenção baixo | spec §1 |
| Alvo numérico | sem classificação **< 8% até 30/09/2026** (hoje 19,9%) | spec §1 |
| Navegação | 5 itens, **idêntica para os dois papéis**; o resto em Mais | spec §3 |
| Eixo de análise | **grupo**, com drill-down | spec §4 |
| Fase 3 da migração | **cortada** — era a única operação irreversível | spec §6 |
| Fila de triagem | **uma só**, de 656 | spec §4 |
| Rótulos | Da casa · Do Juarez · Da Raiane · Clínica · Emprestado · Não conta · A classificar | spec §4 |
| Backend | **continua Supabase.** Firefly III avaliado e descartado | ver abaixo |
| Gráficos | **SVG puro, sem Chart.js** — CDN quebraria o app offline | — |

### Por que o Firefly III foi descartado (06/08)

Sugerido como "motor" por trás do app. Três motivos concretos:

1. **O RLS morre.** Toda a proteção é row-level: a Raiane vê tudo **menos** OQV e contas
   PJ, e o patrimônio é só do gestor. O Firefly é uma conta por pessoa; reproduzir isso
   exigiria duas instâncias ou refazer o filtro à mão.
2. **A dupla entrada não encaixa.** Exige conta de origem **e** destino em cada
   transação; compra no cartão via Open Finance não tem isso.
3. **Custo de operação** — mais um serviço PHP para atualizar, fazer backup e manter
   seguro, contra uma spec que declarou "nada de novo será provisionado".

O **Maybe Finance foi arquivado em 27/07/2025** e não é mais mantido — serve como
referência de modelagem, não como dependência.

---

## Armadilhas — todas custaram caro pelo menos uma vez

1. **O repositório é PÚBLICO.** Nunca commitar CSV de lançamento, `service_role` ou
   extrato. A anon key no HTML é pública por design; o resto não.
2. **PostgREST corta SELECT em 1.000 linhas.** Sempre paginar (`DB.lerTudo` já faz).
3. **A lista renderiza no máximo 200 linhas.** Sem o corte são ~50 mil nós de DOM e o
   celular trava. Os **totais** rodam sobre o filtro inteiro, não sobre o desenhado.
4. **`font-size: 16px` em todo campo**, alvo de toque 44px. Abaixo disso o Safari do
   iPhone dá zoom a cada foco.
5. **Nunca escrever policy com `auth.uid() IS NOT NULL`** — é "qualquer um que criou
   conta", não "a família". Usar `eh_membro()` e `is_admin()`.
6. **DM Sans desalinha coluna de dinheiro** (números proporcionais, ignora
   `tabular-nums`). Valor em coluna usa **DM Mono**; número-herói segue em DM Sans.
7. **Regra por prefixo curto é veneno.** As 119 regras `SHOPEE*` cobrem 6 categorias e 5
   classificações, incluindo OQV, Rai Móveis e Slim Fit — uma regra `SHOPEE` genérica
   reclassificaria compras das empresas como gasto pessoal. `M.regraEhGenerica()` protege
   o lote, mas **o cron da VPS não passa por ela**.
8. **Compra parcelada aparece em meses seguidos por construção.** Não é assinatura, e
   contá-la como tal enche o card de anomalias de lixo.
9. **`metas.categoria` é PRIMARY KEY** e o `dashboard.html` antigo depende dela. Por isso
   `grupo` espelha `categoria` em vez de substituí-la.
10. **`index.html` é a porta de entrada** e o `start_url` do manifest é `"."`. Mudar quebra
    os PWAs instalados.

---

## Números do sistema em 06/08/2026

| | |
|---|---|
| `transacoes` | 3.132 · mai/25 a jul/26 |
| Fila de triagem | **656** (620 sem categoria, 623 sem `cls`, união 656) |
| Destes, resolvíveis em lote | **86** |
| `categorias` | **54 subcategorias em 12 grupos** |
| `regras` | **519** (era 520; a `PAGAMENTODEPIXQRCO` foi apagada) |
| `categoria_alias` | 69 — de-para permanente que o trigger usa |
| `metas` | **0** — orçamento ainda não criado |
| `patrimonio` | 3 linhas · R$ 16.628 líquido · **parado há 62 dias** |
| Custo de vida jul/26 | R$ 5.574 + até R$ 1.174 sem classificar |
| Custo de vida 12 meses | R$ 120.402 (R$ 115.651 classificado por grupo) |
| Receita 12 meses | R$ 123.095 |
| Parcelas comprometidas | **R$ 24.387** · 146 compras · ago/26 estoura o teto |
| Empresas, 12 meses | **−R$ 36.326** — a família banca a diferença |
| Piso de sobrevivência | R$ 3.209/mês de fixo |

---

## Documentos

- **`docs/spec.md`** — a especificação aprovada (v1.2) ⭐
- **`plans/redesign-financas.md`** — o plano de construção, 10 passos + Fase A/B ⭐
- `docs/taxonomia-categorias.md` — os 12 grupos e o de-para completo
- `docs/architecture.md` · `docs/workflow.md` · `README.md`
- `sql/verificacao.sql` — **21 asserções**, rodar depois de cada mudança de banco
- `sql/2026-08-0*.sql` — as migrações, na ordem

⚠️ O `CLAUDE.md` do projeto mora **fora do repositório**, em
`C:\Users\Samsung\Documents\Claude\Projects\Pessoal\CLAUDE.md`.

---

## Diário — o que aconteceu em 06/08/2026

Um dia inteiro. Da revisão da spec até a paridade completa do app novo.

**Revisão da spec (v1.0 → v1.2).** Seis decisões, e três achados medidos no banco
derrubaram premissas: o de-para cobria só `transacoes` e deixava 8 categorias órfãs em
`regras` (uma com 54 regras); três categorias mandadas para "Não conta" eram dinheiro real
(R$ 129 mil de receita); e **`Outros` era marketplace** — 128 das 132 regras que
apontavam para lá eram Amazon, Shopee e Mercado Livre. Isso virou o grupo `Compras`, e a
dívida histórica caiu de 388 para 33, dissolvendo a necessidade de duas filas.

**Migração em 2 fases**, ambas reversíveis. A Fase 3 destrutiva foi cortada.

**Trigger da Fase 2** com a tabela `categoria_alias`, que não estava no plano: a VPS grava
texto antigo e o de-para era temporário. Sem ele, todo lançamento novo cairia na fila
mesmo tendo regra.

**Sete telas construídas**, depois mais cinco para fechar a paridade.

**Erros meus, encontrados e corrigidos:** `montarNav()` empilhava barras em vez de
substituir; o total da Análise não era a soma das fatias; a checagem de tolerância fazia
valor zero passar; compras parceladas viravam "assinatura nova"; devedores sem nome eram
somados numa linha só e uma dívida de R$ 300 aparecia como quitada; e o item OQV do Mais
apontava para um arquivo que eu nunca criei.

**Uma regra apagada com autorização:** `PAGAMENTODEPIXQRCO` mandava 63 estabelecimentos
diferentes para Farmácia.

**Uma regressão de ingestão descoberta:** `data_compra` parou em maio, degradando em
silêncio o `dashboard.html` há três meses.
