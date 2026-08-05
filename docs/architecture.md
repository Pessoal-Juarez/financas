# architecture.md — como as peças conversam

Descreve o sistema **como ele é hoje** (05/08/2026). Para o que está planejado, ver
[`spec.md`](spec.md).

---

## Visão geral

```
   ┌──────────────┐
   │  Itaú        │  Open Finance (Cumbuca MCP) — 1 instituição conectada
   └──────┬───────┘
          │ leitura
   ┌──────▼─────────────────────┐
   │  VPS  root@srv1093562      │  Claude Code + crons
   │  /root/financas/           │  usa service_role → IGNORA RLS
   └──────┬─────────────────────┘
          │ grava
   ┌──────▼─────────────────────┐        ┌─────────────────────────┐
   │  Supabase                  │◄───────┤  GitHub Pages           │
   │  urlxbgngcncndtnhyqyf      │  anon  │  index + dashboard.html │
   │  Postgres · Auth · Storage │  key   │  PWA instalado nos      │
   │  RLS por papel             │        │  celulares              │
   └────────────────────────────┘        └─────────────────────────┘

   BTG · Nubank · InfinitePay ──► exportação manual (CSV/PDF) ──► parser ──► SQL
```

**Três lugares, três responsabilidades:**

| Camada | Onde | Responsabilidade |
|---|---|---|
| Apresentação | GitHub Pages | ler e exibir; classificar; enfileirar comandos |
| Dados e autorização | Supabase | guardar; **decidir quem vê o quê** (RLS) |
| Ingestão | VPS | puxar do banco, parsear faturas, gravar |

O front **nunca** decide autorização — isso é RLS. Filtro no JavaScript é estética.

---

## Frente (GitHub Pages)

- `index.html` — app: login, abas Gastos/Receitas/Assistente/Alterações/OQV
- `dashboard.html` — gráficos (Chart.js)
- `manifest.webmanifest` + ícones — PWA. `start_url` é `"."`, então a raiz serve
  `index.html`. **Mudar isso quebra os PWAs já instalados.**
- `fonts/` — DM Sans e DM Mono auto-hospedadas (funcionam offline)

**Deploy = `git push` na `main`.** O Pages republica em ~1 min.

**A anon key está embutida no HTML e isso está correto** — ela é pública por design. A
proteção real é o RLS. O repositório é público.

**Armadilha:** PostgREST limita SELECT a 1.000 linhas. A base tem 3.132 → sempre paginar
com `.range()` (ver `fetchAllTx`).

---

## Banco (Supabase)

**Tabelas em português; views em inglês por cima**, com `security_invoker=on` (sem isso
a view ignoraria o RLS da tabela base):

| View | Tabela real |
|---|---|
| `transactions` | `transacoes` |
| `profiles` | `perfis` |

Tabelas: `transacoes` · `regras` · `metas` · `patrimonio` · `config` · `log_alteracoes` ·
`comandos` · `perguntas` · `perfis` · `audit_log`

### Autorização

Duas funções `security definer`, com EXECUTE concedido só a `authenticated`:

- **`eh_membro()`** — tem linha em `perfis`. É o piso de qualquer policy.
- **`is_admin()`** — `perfis.role = 'admin'`. Para patrimônio, auditoria e escrita sensível.

**Regra de ouro:** nunca escrever policy com `auth.uid() IS NOT NULL`. Isso significa
"qualquer um que criou conta", não "a família" — foi exatamente a falha corrigida em
05/08/2026 (`sql/2026-08-05_blindagem-rls.sql`).

Um trigger (`trg_trava_colunas_transacao`) impede que a colaboradora altere `valor`,
`data`, `tipo`, `descricao` ou `src`. RLS controla **linhas**; colunas exigem trigger.

---

## Ingestão (VPS)

`/root/financas/` — Claude Code rodando por cron, com **service_role** (ignora RLS).

| Cron | Script | O que faz |
|---|---|---|
| `0 7 * * *` | `sync.sh` | conta Itaú, janela de 7 dias (balde barato) |
| `0 8 * * 1` | `sync-cartao.sh semanal` | cartão por competência |
| `0 9 1-3 * *` | `sync-cartao-mensal.sh` | fechamento do mês |
| `*/2 * * * *` | `check-comandos.sh` | processa as filas `comandos` e `perguntas` |

**Cotas do Open Finance:** balde barato (saldo + 7 dias) ~240/mês; balde caro (histórico
> 7 dias, faturas, `list_accounts`) **8/mês**. Qualquer feature que dependa do caro
precisa justificar o consumo.

**BTG, Nubank e InfinitePay não têm API conectada** — entram por exportação manual
(CSV/PDF) → parser → SQL.

---

## Como o front fala com o banco

```
navegador → supabase-js (anon key) → PostgREST → RLS avalia → linhas permitidas
```

O botão "🔄 Atualizar" **não chama a VPS diretamente**. Ele insere uma linha em
`comandos` com status `pendente`; o cron de 2 em 2 minutos na VPS pega, executa e marca
`concluido`. Mesma mecânica para o Assistente, via `perguntas`.

Esse desacoplamento é o que permite o front ser um HTML estático sem servidor.

---

## Segredos

| Onde | O quê | Regra |
|---|---|---|
| HTML público | `SUPABASE_URL` + anon key | público por design |
| VPS `/root/financas/.env` | `service_role` | `chmod 600` · **nunca commitar** |

A `service_role` correta é a "service_role secret" da aba *Legacy anon, service_role API
keys* — não a anon, não as novas `sb_secret`.

---

## O que muda no redesign

Ver [`spec.md`](spec.md) seções 5 e 6. Em resumo: a camada de apresentação passa de 2
arquivos grandes para ~9 arquivos com `assets/` compartilhado, e a tabela `categorias`
entra para dar hierarquia às categorias. **A VPS não precisa de nenhuma alteração** — um
trigger de insert resolve o texto que ela grava para o novo `categoria_id`.
