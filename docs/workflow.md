# workflow.md — regras de negócio e fluxos

O que o sistema decide e por quê. Estado em 05/08/2026.

---

## O que o app existe para responder

Ver o **custo de vida real** da família, separado das empresas, com visibilidade
suficiente para decidir. O Juarez saiu do CLT em set/2025 e vive de reserva enquanto a
OQV não fatura — daí a importância do fôlego.

---

## Conceitos

### Classificação (`cls`)

Dez valores de texto livre. **Chave estável no banco**; o rótulo exibido vive no front.

| Chave | Rótulo | Entra em |
|---|---|---|
| `Pessoal família` | Da casa | **custo de vida** |
| `Pessoal Juarez` | Do Juarez | **custo de vida** |
| `Pessoal Raiane` | Da Raiane | **custo de vida** |
| `Dra. Raiane` | Clínica | empresas |
| `Slim Fit` | Slim Fit | empresas |
| `Rai Móveis` | Rai Móveis | empresas |
| `OQV` | OQV | empresas |
| `Empréstimo` | Emprestado | nenhum |
| `Não é gasto` | Não conta | nenhum |
| `Indefinido` | A classificar | nenhum |

- **Custo de vida** = soma das três `Pessoal *`.
- **Não conta** = resgates, transferências, pagamento de fatura. Não é despesa — é
  movimentação de dinheiro.

### Origem (`src`)

`Conta` · `Cartão` · `BTG` · `BTG-Cartão` · `BTG-Conta`. Futuro: Nubank, InfinitePay.

---

## Regras de negócio

### Cartão: competência e parcela

`data` = mês da **competência** (o mês anterior ao vencimento da fatura). Cada parcela cai
no mês da sua fatura. `parcela` = `'pp/tt'`; `data_compra` = data original, quando vem
do PDF.

O dashboard tem duas leituras: **parcela a parcela** (confiável) e **pela data da compra**
(valor cheio × total de parcelas; só calcula quando `data_compra` existe).

O sync mensal do cartão **substitui o mês inteiro** — DELETE + INSERT, sem `ext_id`.

### Pagamento de fatura

Linhas "PERS INFINIT" (Itaú) e "Pagamento de fatura BTG" são `cls = Não é gasto`,
categoria `Pagamento cartão`. Ficam fora do custo de vida e alimentam o gráfico de
"cartão pago" (só Itaú, valor absoluto).

Sem essa regra, o gasto seria contado duas vezes: uma na compra, outra no pagamento.

### Empréstimo para a família

`cls = Empréstimo`, categoria = nome da pessoa. Não conta no custo de vida. Quando a
pessoa paga por Pix, a entrada recebe a mesma marcação, e o dashboard cruza em "Quem me
deve".

**Empréstimo nunca vira regra automática** — a mesma pessoa pode aparecer noutro contexto.

### Classificação que aprende

Ao classificar, o app faz upsert em `regras`:

- `padrao` = descrição normalizada (NFKD, só A-Z, maiúsculas, 18 caracteres)
- match por "contém"
- o sync consulta `regras` antes de classificar

**Estado real:** 520 regras aprendidas, e ainda assim 20–27% chegam sem classificação
todo mês. O problema não é regra quebrada — são estabelecimentos genuinamente novos
(cauda longa). Dos 623 pendentes, só **107** casam com alguma regra existente.

### Fixo / Variável / Adicional

Mapeado por categoria na constante `TIER` do `dashboard.html`.

---

## Papéis

`perfis.role` = `admin` (Juarez) ou `colab` (Raiane).

**A Raiane edita livre**, sem fila de aprovação: muda a classificação na hora, cada
mudança grava em `log_alteracoes` e o gestor é notificado. O fluxo antigo de propostas
foi removido em 05/08/2026.

| | colab | admin |
|---|---|---|
| Ver OQV e contas PJ | não | sim |
| Ver patrimônio | não | sim |
| Alterar `categoria`, `cls`, `rev` | sim | sim |
| Alterar `valor`, `data`, `tipo`, `descricao`, `src` | **não** | sim |

As três primeiras são RLS; a última é o trigger `trg_trava_colunas_transacao`.

---

## Fluxos

### Atualizar dados (botão 🔄)

```
front insere linha em `comandos` (pendente)
   → cron da VPS a cada 2 min pega
   → executa o sync
   → marca `concluido`
```

O front não fala com a VPS. É o desacoplamento que permite ser um HTML estático.

### Enviar fatura

```
usuário escolhe PDF/CSV
   → upload no Supabase Storage
   → linha em `comandos` apontando o arquivo
   → VPS parseia e grava os lançamentos
```

### Assistente

Pergunta vai para a tabela `perguntas`; `perguntar.sh` na VPS responde com
`claude -p --model sonnet`. Latência de ~2 minutos.

**Uso real: 3 perguntas.** Considerado para recolhimento em "Mais" no redesign.

---

## Convenções e armadilhas

- **PostgREST limita SELECT a 1.000 linhas.** Sempre paginar.
- **A tabela do front renderiza no máximo 200 linhas por vez.** Não remover esse corte:
  cada linha carrega um `<select>` de 10 `<option>`; sem ele são ~50 mil nós de DOM e o
  celular trava. Os totais não dependem disso — `recompute()` roda sobre os dados
  filtrados, não sobre as linhas desenhadas.
- **Campo de digitação no mobile precisa de `font-size: 16px`.** Abaixo disso o Safari
  do iPhone dá zoom a cada foco. Alvo de toque mínimo 44px.
- **Ao renomear uma classe ou categoria:** atualizar `transacoes` **e** `regras` na mesma
  transação. `regras.categoria` é texto — renomear sem tratar as 520 regras faz a
  auto-classificação parar de acertar.
- **Descrições de cartão vindas de PDF ficam grudadas**; as do MCP vêm limpas.
- **O nome da esposa é Raiane** (com i). A classe da clínica dela é `Dra. Raiane`.
- **Nunca commitar a `service_role`.**

---

## Roteiro

**Feito:** cartão detalhado · auto-categorização que aprende · patrimônio e fôlego ·
fixo/variável · controle de parcelamento · empréstimos · aba OQV · sync do cartão ·
blindagem de RLS (05/08/2026).

**Especificado, não implementado:** o redesign completo — ver [`spec.md`](spec.md).

**Ainda sem especificação:** separação PF/PJ por origem (quando conectar Nubank e
InfinitePay) · backfill dos pagamentos de cartão de mai/jun.
