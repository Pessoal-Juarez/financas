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
