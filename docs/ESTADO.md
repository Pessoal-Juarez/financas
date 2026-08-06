# Onde paramos

**Última atualização:** 06/08/2026.
**Leia este arquivo primeiro** ao retomar o projeto.

---

## Em uma frase

A [`spec.md`](spec.md) foi **revisada e aprovada** (v1.1) e o roteiro está definido.
Nada do redesign foi implementado ainda. O próximo passo é a **Fase 1 da migração de
dados** — tabela `categorias`, seed, `categoria_id`, backfill.

---

## O que foi feito em 06/08/2026 — revisão da spec

Revisão bloco a bloco da spec com o Juarez. Seis decisões, três delas vindas de números
medidos no banco durante a sessão.

### Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Planejar mora dentro de "Mais"** | a barra tinha 5 itens e 8 telas; promovê-la exigiria barra variando por papel (a Raiane não vê Planejar), e 6 itens apertariam os alvos de 44px |
| 2 | **Alvo numérico: sem classificação < 8% até 30/09/2026** | hoje 19,9%. Único número que diz se o redesign funcionou |
| 3 | **Duas filas separadas** | a taxonomia jogaria +387 na triagem (623 → **1.010**). "Triar" = fluxo corrente com contador; "Arrumar o histórico" = dívida antiga, sem contador e sem prazo |
| 4 | **Fase 3 da migração cortada** | única operação irreversível do plano, em banco free sem PITR, por ganho cosmético. Texto e `categoria_id` convivem para sempre |
| 5 | **Trigger com comportamento definido** | texto desconhecido da VPS → `categoria_id` nulo, texto preservado, vai pra fila. Nunca cria categoria |
| 6 | **Rótulos leves aprovados** | Da casa · Do Juarez · Da Raiane · Clínica · Emprestado · Não conta · **A classificar** |

### Números medidos na sessão (não são estimativa)

| | |
|---|---|
| Pendentes que casam com regra existente | **107** de 623 — a varredura retroativa se confirma |
| Lançamentos que a taxonomia desclassificaria | **+387** · R$ 21.754 em saídas |
| Fila se a taxonomia fosse aplicada de forma ingênua | **1.010** |

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

**Fase 1 da migração.** Ordem de ataque definida na [`spec.md`](spec.md) §14:

1. Export CSV de `transacoes` e `regras` (rede de segurança — plano free, sem PITR)
2. **Fase 1** — `categorias` + seed dos 9 grupos/~38 subs + `categoria_id` + backfill + `verificacao.sql`
3. `assets/modelo.js` e `assets/db.js` (leitura paginada + cache)
4. **Fase 2** — trigger de resolução + front lendo por `categoria_id`
5. Telas: Triar → Início → Análise → Lançamentos → Mais/Planejar

⚠️ Não começar pelas telas. Tela sem taxonomia consolidada é retrabalho garantido.

> A v1.0 apontava `/break` como próximo comando. **Esse comando não existe** nesta
> instalação do Claude Code — o equivalente é o skill `blueprint` ou `to-issues`.

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

- **`spec.md`** — a especificação aprovada (v1.1) ⭐
- `taxonomia-categorias.md` — os 9 grupos e o de-para das 73 categorias
- `stitch-prompts.md` — prompts para gerar as telas (⚠️ desatualizados, ver pendência 2)
- `architecture.md` · `workflow.md` · `README.md` — o sistema como ele é hoje
- `mockups/` — artefatos visuais das decisões

⚠️ O `CLAUDE.md` do projeto mora **fora do repositório**, em
`C:\Users\Samsung\Documents\Claude\Projects\Pessoal\CLAUDE.md`. Ele continua sendo o
contexto que o Claude Code carrega automaticamente; os documentos técnicos canônicos
são os daqui.
