# plano — migrar o Open Finance do Cumbuca (MCP) para o Pluggy

**Status:** proposta, aguardando validação de cobertura e custo · **Data:** 05/09/2026

Objetivo: trocar a fonte de ingestão de transações — hoje o **MCP do Cumbuca**, rodando
por cron na VPS — pela **Pluggy** (<https://www.pluggy.ai/>), que agrega Open Finance
Brasil e **mantém os dados sincronizados diariamente de forma automática**. Isso resolve a
dor principal: atualização diária do cartão sem depender do nosso próprio agendamento.

> ⚠️ **Escopo e onde o trabalho mora.** Este repositório é só o **front** (HTML/JS/SVG
> estático no GitHub Pages). A ingestão vive na **VPS** (`/root/financas/`), com
> `service_role`, e é lá que a maior parte desta migração acontece. O front só ganha uma
> tela de conexão. Nada aqui deve enfraquecer as regras de ouro do projeto (RLS,
> `service_role` fora do repositório, paginação, etc.).

---

## 1. Por que Pluggy (e o que muda de verdade)

O modelo atual é **pull**: crons na VPS puxam o Cumbuca em janelas (7 dias, competência,
fechamento mensal), gastando cotas do Open Finance (balde caro = 8/mês). Ver
`docs/architecture.md › Ingestão (VPS)`.

O modelo Pluggy é **push**: a Pluggy é dona do sync e **atualiza os itens diariamente
sozinha** (processos de batch do lado do cliente são proibidos por ela). A cada mudança,
dispara **webhooks** (`transactions/created`, `transactions/updated`,
`transactions/deleted`). A VPS deixa de "puxar a cada X horas" e passa a "reagir ao
webhook".

Ganhos esperados:

- **Atualização diária do cartão** nativa, sem cron de sync nosso.
- **`data_compra` volta a existir** — o Pluggy entrega `creditCardMetadata.purchaseDate`,
  o que corrige a pendência **V1** (zerada desde mai/26).
- **Descrições limpas** (hoje o PDF do cartão vem grudado; ver `workflow.md`).
- **Menos código de agendamento** para manter na VPS.

Conteúdo sobre a Pluggy resumido/reescrito das fontes públicas para conformidade de
licença. Fontes: <https://docs.pluggy.ai/llms.txt> · autenticação, transações, data-sync e
webhooks.

---

## 2. Como a API do Pluggy funciona (o mínimo necessário)

**Autenticação (dois níveis):**

1. **`API Key`** — obtida no servidor com `CLIENT_ID` + `CLIENT_SECRET`
   (`POST /auth`). Dá acesso total à API; **expira em ~2h**; vive só na VPS.
2. **`Connect Token`** — gerado com a API Key (`POST /connect_token`); **expira em 30 min**;
   usado no front pelo **widget Pluggy Connect** para o usuário conectar/atualizar uma
   conta. Escopo reduzido (não lê os produtos detalhados).

**Conceito de `Item`:** cada conexão com uma instituição é um *Item*. Ao criar, traz até
**365 dias** de histórico. Depois, a Pluggy sincroniza o Item **diariamente**. Também dá
para forçar um Update manual (via widget ou API).

**Ler transações:** `GET /v2/transactions?accountId=...`, paginação por cursor, páginas de
500. Retorna até 12 meses.

**Campos de transação relevantes** (ver o mapeamento na seção 4):
`id, date, description, amount, type (DEBIT/CREDIT), status (PENDING/POSTED),
creditCardMetadata { installmentNumber, totalInstallments, totalAmount, purchaseDate,
billId }`.

**Webhooks de sincronização:** configurar `transactions/created`, `transactions/updated`,
`transactions/deleted`. O evento traz um link/lista de IDs para paginar e aplicar no nosso
banco.

---

## 3. Arquitetura proposta

```
Pluggy (sync diário automático)
   │  webhook: transactions/created|updated|deleted
   ▼
VPS /root/financas/  (endpoint HTTP público + service_role)
   │  1. valida o webhook
   │  2. lê a API Pluggy (paginado)
   │  3. NORMALIZA para o formato de `transacoes`
   │  4. aplica o motor de regras (cls/categoria_id) — inalterado
   │  5. grava (upsert por ext_id) via service_role
   ▼
Supabase  ──anon+RLS──►  front (GitHub Pages)  ── inalterado na leitura
```

Duas mudanças estruturais em relação a hoje:

- **A VPS precisa expor um endpoint HTTP público** para receber webhooks (hoje ela só
  faz saídas via cron). Alternativa sem servidor exposto: um cron curto que chama
  `POST /items/{id}` (Update) e depois lê — mas isso reintroduz polling e a Pluggy
  desencoraja. **Preferência: webhook.**
- **Nova coluna `ext_id`** em `transacoes` (o `id` da transação no Pluggy), para upsert
  idempotente. Hoje o sync do cartão faz DELETE+INSERT do mês inteiro; com `ext_id` o sync
  vira incremental e para de apagar/reinserir. ⚠️ A Pluggy avisa que o `id` **pode mudar**
  se data/descrição/valor mudarem muito (aí ela deleta e recria) — por isso tratamos os
  três eventos de webhook.

---

## 4. Mapeamento de dados (contrato que NÃO pode quebrar)

`transacoes` é lida por Início, Análise, Parcelamento, triagem e o `dashboard.html` antigo.
A saída do Pluggy precisa virar exatamente este formato.

| `transacoes` | Origem no Pluggy | Tratamento |
|---|---|---|
| `data` | `date` (ISO, UTC) | converter para **GMT-3**; para cartão, usar a competência da fatura |
| `descricao` | `description` | já vem limpo |
| `valor` | `amount` | ⚠️ **inverter sinal do cartão**: no Pluggy, compra = positivo e pagamento = negativo; no nosso modelo o sinal é o oposto. Normalizar por `account.type = CREDIT` |
| `tipo` | `type` (DEBIT/CREDIT) | mapear saída/entrada |
| `parcela` `'pp/tt'` | `creditCardMetadata.installmentNumber` / `totalInstallments` | montar a string |
| `data_compra` | `creditCardMetadata.purchaseDate` | **corrige a pendência V1** |
| `src` | `account.type` + connector (Itaú/BTG/Nubank...) | derivar (`Conta`, `Cartão`, `BTG`...) |
| `cls` | **motor de regras atual** | inalterado — a Pluggy NÃO decide `cls` |
| `categoria_id` | **motor de regras atual** (via `categoria_alias` + trigger) | inalterado |
| `ext_id` (novo) | `id` do Pluggy | chave de upsert idempotente |

Regras de negócio que precisam ser revalidadas contra os dados do Pluggy:

- **Competência do cartão** (`data` = mês anterior ao vencimento). Conferir se derivamos
  isso de `billId`/`billForecastDate` ou do vencimento.
- **Pagamento de fatura** (`cls = Não é gasto`) — garantir que o `amount` negativo do
  Pluggy (pagamento) não seja contado como gasto.
- **De-duplicação de parcelas** (`M.projecaoParcelas`) já assume `parcela` + `data_compra`;
  com `purchaseDate` de volta, deve melhorar.
- **Normalização de descrição** que gera `regras.padrao` (pendências V2/V3) — como as
  descrições do Pluggy são limpas e diferentes das do Cumbuca, **as regras existentes (520)
  podem casar de forma diferente**. Risco real; ver seção 6.

---

## 5. Fases de execução

### Fase 0 — Descoberta (VOCÊ, antes de qualquer código)
- [ ] No **dashboard de desenvolvedor** do Pluggy, obter `CLIENT_ID` + `CLIENT_SECRET`.
      (O `meu.pluggy.ai` conecta contas para você ver dados, mas a integração por API usa
      as credenciais de desenvolvedor.)
- [ ] Conferir **cobertura dos conectores** que a família usa: **Itaú, BTG, Nubank,
      InfinitePay** — quais têm Open Finance regulado e cobertura de **cartão de crédito**.
      (docs: connectors-coverage / credit-cards-coverage.)
- [ ] Conferir **plano/custo** e o que exige assinatura Pro (categorização e `merchant` são
      Pro; para nós isso é opcional, pois usamos o nosso motor de regras).
- [ ] Decidir se a VPS pode **expor um endpoint HTTPS** para webhooks.

### Fase 1 — Sandbox e prova de conceito (eu + você)
- [ ] Testar no **Sandbox** (Pluggy Bank) o fluxo: API Key → connect_token → criar Item →
      ler transações.
- [ ] Escrever um script de leitura que imprime as transações já **normalizadas** para o
      formato de `transacoes`, sem gravar. Validar o mapeamento da seção 4 com olhos humanos.

### Fase 2 — Conexão no front (roda 100% neste repositório)
- [ ] Nova tela/fluxo (ex.: `conectar.html`, só gestor) que:
      abre o **Pluggy Connect** com um `connectToken`, e no `onSuccess` guarda o `itemId`.
- [ ] O `connectToken` é gerado no servidor (VPS), nunca no front. O front pede à VPS
      (via uma linha em `comandos`, como o resto do app já faz) ou a um endpoint dedicado.
- [ ] Guardar `itemId`/instituição numa tabela nova (ex.: `conexoes_pluggy`), só gestor.

### Fase 3 — Ingestão por webhook (VPS — eu escrevo, você instala)
- [ ] Endpoint HTTP na VPS que recebe os webhooks e valida a origem.
- [ ] Serviço que, ao receber evento, lê a API Pluggy (paginado), normaliza, aplica o
      motor de regras e faz **upsert por `ext_id`** em `transacoes`.
- [ ] Migração SQL: adicionar `ext_id` (nullable, único quando presente) a `transacoes`.
- [ ] Tratar `created` / `updated` / `deleted`.

### Fase 4 — Corte em paralelo
- [ ] Rodar Pluggy e Cumbuca **em paralelo** por alguns dias, comparando os números
      (custo de vida do mês, parcelas comprometidas, contagem de transações).
- [ ] Quando bater, **desligar os crons do Cumbuca** e remover o MCP.
- [ ] Atualizar `docs/architecture.md`, `docs/workflow.md` e `docs/ESTADO.md`.

---

## 6. Riscos e decisões em aberto

| Risco | Impacto | Mitigação |
|---|---|---|
| **Cobertura** de BTG/Nubank/InfinitePay no Pluggy pode ser parcial | alguns bancos continuam manuais | validar na Fase 0 antes de codar |
| **Descrições diferentes** do Cumbuca podem fazer as 520 regras casarem diferente | classificação erra por um tempo | rodar em paralelo (Fase 4) e medir a fila de triagem antes de cortar |
| **Sinal invertido** do cartão | gasto vira receita e vice-versa | normalizar por `account.type`; teste explícito na Fase 1 |
| **`id` do Pluggy muda** entre syncs | duplicatas ou órfãs | tratar os 3 webhooks; upsert por `ext_id` + limpeza no `deleted` |
| **VPS precisa de endpoint público** | superfície de ataque nova | validar assinatura do webhook; HTTPS; sem `service_role` exposta |
| **Custo** do plano Pluggy | recorrente | decidir na Fase 0; o projeto tem regra de "nada novo provisionado sem justificar" |
| **Competência do cartão** derivada errada | parcelas caem no mês errado | validar contra dados reais na Fase 1 |

**Decisões que precisam de você:**
1. A VPS pode expor um webhook HTTPS público? (senão, caímos no polling, menos ideal)
2. Migrar todos os bancos de uma vez ou só o Itaú primeiro (o único hoje automatizado)?
3. Manter o motor de regras atual (recomendado) ou experimentar a categorização do Pluggy?

---

## 7. O que dá para fazer daqui (front) vs. o que é seu (VPS/conta)

| Daqui (eu, neste repo) | Você / VPS |
|---|---|
| Este plano | Criar credenciais de desenvolvedor no Pluggy |
| Script de PoC de leitura+normalização (Fase 1) | Validar cobertura e custo |
| Tela `conectar.html` + Pluggy Connect (Fase 2) | Rodar scripts na VPS; expor webhook |
| Migração SQL do `ext_id` (arquivo) | Aplicar a migração no Supabase |
| Ajustes de mapeamento e docs | Comparar números e dar o corte |

---

## 8. Próximo passo imediato

Você faz a **Fase 0** (credenciais + cobertura + custo). Com isso em mãos, começo a
**Fase 1** (PoC de leitura no sandbox) e a **Fase 2** (tela de conexão), que são as partes
que rodam a partir deste repositório.
