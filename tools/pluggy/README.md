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

## Fase 3 — ingestão por webhook (VPS)

`ingest-webhook-server.mjs`: recebe os webhooks do Pluggy, responde 2XX em <10s e, em
segundo plano, lê a API do Pluggy, normaliza para o formato de `transacoes`, aplica o
motor de regras (padrão→cls/categoria, igual ao app) e faz **upsert por `ext_id`** no
Supabase com a `service_role`.

- Trata `transactions/created|updated` (recarrega o item) e `transactions/deleted`
  (apaga por `ext_id`). A normalização é a mesma validada no PoC (sinal do cartão,
  parcela, `data_compra`, GMT-3).
- Segurança: HTTPS + IP allowlist do Pluggy (`52.67.145.81`) no nginx, e
  `X-Webhook-Secret` opcional. `service_role` só no `.env` da VPS.

Teste local do processamento (sem webhook), com um item real já conectado:
```powershell
$env:PLUGGY_CLIENT_ID="..."; $env:PLUGGY_CLIENT_SECRET="..."
$env:SUPABASE_URL="https://urlxbgngcncndtnhyqyf.supabase.co"; $env:SUPABASE_SERVICE_ROLE="..."
node tools/pluggy/ingest-webhook-server.mjs --once <itemId>
```
⚠️ `--once` **grava em `transacoes`** (produção). Use só quando for validar de verdade,
e rode Pluggy e Cumbuca em paralelo antes de cortar (Fase 4).

**Deploy completo na VPS:** ver [`DEPLOY-VPS.md`](DEPLOY-VPS.md) (nginx HTTPS, systemd,
registro do webhook, migração SQL, teste e corte).
