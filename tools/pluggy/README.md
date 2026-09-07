# tools/pluggy — prova de conceito (Fase 1 do plano Pluggy)

Scripts de apoio para validar a integração com o Pluggy **antes** de escrever a
ingestão real. Ver o plano em [`plans/pluggy-migracao.md`](../../plans/pluggy-migracao.md).

> ⚠️ **Segredos nunca entram no repositório** (que é público). As credenciais de
> desenvolvedor do Pluggy vêm de variáveis de ambiente, copiadas do 1Password
> ("Credencial Desenvolvedor Pluggy") na hora de rodar. O `Client Secret` não deve ser
> colado em arquivo nem no chat.

## `poc-ler-transacoes.mjs`

Autentica no Pluggy, cria (ou reutiliza) um item, lê as transações e imprime cada uma
**crua** e **normalizada** para o formato da tabela `transacoes`. **Não grava nada.**

### Como rodar (PowerShell)

```powershell
# 1. Exporte as credenciais na sessão atual (copie do 1Password)
$env:PLUGGY_CLIENT_ID     = "<client id>"
$env:PLUGGY_CLIENT_SECRET = "<client secret>"

# 2a. Sem item -> cria um no SANDBOX (Pluggy Bank, dados sintéticos)
node tools/pluggy/poc-ler-transacoes.mjs

# 2b. Ou reutilize um item já conectado (ex.: conta real ligada no dashboard)
$env:PLUGGY_ITEM_ID = "<id do item>"
node tools/pluggy/poc-ler-transacoes.mjs
```

Para limpar as variáveis depois: feche o terminal, ou
`Remove-Item Env:PLUGGY_CLIENT_ID, Env:PLUGGY_CLIENT_SECRET, Env:PLUGGY_ITEM_ID`.

### O que conferir na saída

- **Sinal do cartão:** compra deve virar `saida`; pagamento da fatura deve virar `entrada`
  (no Pluggy o `amount` do cartão é invertido em relação ao nosso padrão).
- **`parcela`** no formato `pp/tt` para compras parceladas.
- **`data_compra`** preenchida (vem de `creditCardMetadata.purchaseDate`) — o que corrige a
  pendência V1.
- **`data`** convertida para GMT-3.

Requer Node 18+ (usa `fetch` nativo). Nenhuma dependência a instalar.

### Nota sobre `connectorId` do sandbox

O script usa `connectorId: 2` ("Pluggy Bank"). Se o sandbox não conectar, liste os
conectores com sua API Key (`GET /connectors?sandbox=true`) e ajuste o id.

## Fase 2 — conexão via Pluggy Connect

Três peças:

1. **`connect-token-server.mjs`** (roda na VPS): endpoint mínimo que troca
   `clientId`+`secret` por uma API Key e gera o **Connect Token** para o front.
   Adapta o exemplo oficial (Next.js) para Node puro, sem SDK. O `clientSecret`
   fica só aqui, no `.env` da VPS.

   Teste local:
   ```powershell
   $env:PLUGGY_CLIENT_ID="..."; $env:PLUGGY_CLIENT_SECRET="..."
   node tools/pluggy/connect-token-server.mjs
   # POST http://localhost:8791/connect-token  { "clientUserId": "juarez" }
   ```

2. **`conectar.html`** (front, só gestor): abre o widget Pluggy Connect com o
   token, e no `onSuccess` guarda o `itemId` na tabela `conexoes_pluggy`.
   Em `localhost` o front chama `http://localhost:8791`; em produção, a URL
   HTTPS da VPS (constante `API_BASE`, a preencher na Fase 3).

3. **`sql/2026-09-06_conexoes-pluggy.sql`**: tabela `conexoes_pluggy` (só gestor,
   RLS via `is_admin()`), aplicada uma vez no Supabase.

Descoberta: a coluna **`ext_id` já existe** em `transacoes` (o trigger
`trava_colunas_transacao` a referencia). O upsert idempotente da Fase 3 já é
possível sem migração adicional.

### Teste local do fluxo completo

```powershell
# terminal 1 — endpoint
$env:PLUGGY_CLIENT_ID="..."; $env:PLUGGY_CLIENT_SECRET="..."
node tools/pluggy/connect-token-server.mjs

# terminal 2 — front
python -m http.server 8777
# abrir http://localhost:8777/conectar.html (logado como gestor)
```
No `localhost`, o widget mostra o conector de sandbox (`includeSandbox`).
