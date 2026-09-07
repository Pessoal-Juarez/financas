# Deploy na VPS — Fase 3 (ingestão Pluggy por webhook)

Guia para colocar a ingestão do Pluggy no ar em `/root/financas/`, ao lado do que já
existe. Nada aqui roda no GitHub Pages. Ver o desenho em
[`../../plans/pluggy-migracao.md`](../../plans/pluggy-migracao.md).

Dois serviços Node entram:

| Serviço | Arquivo | Porta | Função |
|---|---|---|---|
| Connect Token | `connect-token-server.mjs` | 8791 | gera o token para o widget (Fase 2) |
| Ingestão | `ingest-webhook-server.mjs` | 8792 | recebe webhook do Pluggy, grava em `transacoes` (Fase 3) |

## 1. Segredos — `/root/financas/.env` (chmod 600)

Nunca commitar. Ao lado da `service_role` que já existe.

```
PLUGGY_CLIENT_ID=...          # UUID do dashboard Pluggy
PLUGGY_CLIENT_SECRET=...      # secret do dashboard Pluggy
SUPABASE_URL=https://urlxbgngcncndtnhyqyf.supabase.co
SUPABASE_SERVICE_ROLE=...     # a "service_role secret" (a mesma do sync atual)
WEBHOOK_SECRET=...            # invente um valor forte; exigido no header do webhook
PLUGGY_WEBHOOK_URL=https://SEU-DOMINIO/pluggy/webhook   # usado pelo connect-token
ALLOWED_ORIGIN=https://pessoal-juarez.github.io         # origem do front (CORS)
```

Carregue no ambiente antes de subir (ou use o `EnvironmentFile` do systemd, abaixo).

## 2. HTTPS + reverse proxy (nginx)

O Pluggy **só aceita webhook em HTTPS** e recomenda whitelist do IP `52.67.145.81`.
O front (HTTPS) também só chama o token por HTTPS (senão dá mixed content).

Exemplo nginx (ajuste domínio/certificado — use certbot/Let's Encrypt):

```nginx
server {
  listen 443 ssl;
  server_name SEU-DOMINIO;

  ssl_certificate     /etc/letsencrypt/live/SEU-DOMINIO/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/SEU-DOMINIO/privkey.pem;

  # Token (Fase 2) — chamado pelo front
  location /pluggy/connect-token {
    proxy_pass http://127.0.0.1:8791/connect-token;
  }

  # Webhook (Fase 3) — chamado pelo Pluggy. Restringe ao IP do Pluggy.
  location /pluggy/webhook {
    allow 52.67.145.81;
    deny all;
    proxy_pass http://127.0.0.1:8792/webhook;
  }
}
```

Depois, no front, em `conectar.html`, preencher `API_BASE` com `https://SEU-DOMINIO/pluggy`
(e o endpoint vira `/pluggy/connect-token`). Ajustar se necessário.

## 3. systemd (dois serviços)

`/etc/systemd/system/pluggy-token.service`:
```ini
[Unit]
Description=Pluggy connect-token
After=network.target
[Service]
WorkingDirectory=/root/financas
EnvironmentFile=/root/financas/.env
ExecStart=/usr/bin/node /root/financas/connect-token-server.mjs
Restart=always
[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/pluggy-ingest.service`: igual, trocando Description e o ExecStart
para `ingest-webhook-server.mjs`.

```bash
systemctl daemon-reload
systemctl enable --now pluggy-token pluggy-ingest
systemctl status pluggy-token pluggy-ingest
```

## 4. Registrar o webhook no Pluggy

O jeito mais simples: passar `PLUGGY_WEBHOOK_URL` no `.env` — o `connect-token-server.mjs`
já repassa isso como `webhookUrl` do connectToken, então todo item criado pelo widget
notifica nosso endpoint. Alternativa: criar um webhook global via API
(`POST /webhooks`, event `all`, url `https://SEU-DOMINIO/pluggy/webhook`, header
`X-Webhook-Secret`).

## 5. Aplicar a migração SQL

No Supabase (SQL editor), rodar uma vez:
`sql/2026-09-06_conexoes-pluggy.sql`. (A coluna `ext_id` em `transacoes` já existe.)

## 6. Teste na própria VPS, sem esperar webhook

Depois de conectar um item real pelo widget (Fase 2) e ter o `itemId`:

```bash
cd /root/financas
set -a; . ./.env; set +a
node ingest-webhook-server.mjs --once <itemId>
```

Isso lê o item, normaliza e faz upsert em `transacoes` na hora. Confira no app
(Início/Lançamentos) se os números batem. **Rodar Pluggy e Cumbuca em paralelo** por
alguns dias antes de desligar o cron do Cumbuca (Fase 4 do plano).

## 7. Corte (Fase 4)

Quando os números baterem: desligar os crons do Cumbuca, remover o MCP, e atualizar
`docs/architecture.md`, `docs/workflow.md` e `docs/ESTADO.md`.

## Segurança — checklist

- [ ] `.env` com `chmod 600`, nunca no git.
- [ ] `service_role` só na VPS.
- [ ] Webhook atrás de HTTPS, IP do Pluggy no allowlist, `X-Webhook-Secret` setado.
- [ ] `ALLOWED_ORIGIN` = domínio real do app (não `*`) em produção.
