# Deploy do serviço Pluggy no EasyPanel

Serviço único (Node, sem dependências) com as rotas do Pluggy:
`POST /connect-token`, `POST /webhook`, `GET /health`. Uma porta (8790), um domínio.
O EasyPanel cuida do HTTPS e do proxy, como nos outros serviços.

## Passo a passo (interface do EasyPanel)

1. **Projeto `pessoal`** → **Criar serviço** → **App**.
2. **Fonte (Source):** GitHub → repositório `Pessoal-Juarez/financas`, branch `main`
   (mesclar o PR antes), **Build Path / Root Directory:** `server/pluggy`.
   - Build: **Dockerfile** (o arquivo já está em `server/pluggy/Dockerfile`).
3. **Porta exposta:** `8790`.
4. **Environment** (aba de variáveis do App) — cole as chaves (do 1Password / Supabase):
   ```
   PLUGGY_CLIENT_ID=...
   PLUGGY_CLIENT_SECRET=...
   SUPABASE_URL=https://urlxbgngcncndtnhyqyf.supabase.co
   SUPABASE_SERVICE_ROLE=...            # a service_role secret (a mesma da VPS/sync)
   WEBHOOK_SECRET=...                   # invente um valor forte
   ALLOWED_ORIGIN=https://pessoal-juarez.github.io
   PLUGGY_WEBHOOK_URL=https://<dominio-que-o-easypanel-gerar>/webhook
   ```
   Observação sobre `PLUGGY_WEBHOOK_URL`: só dá para preencher **depois** de conhecer o
   domínio. Faça o deploy uma vez, copie o domínio gerado (passo 5), volte aqui e preencha,
   e faça redeploy.
5. **Domínio:** o EasyPanel gera algo como
   `https://pessoal-pluggy-oqv.8vtq9a.easypanel.host/` apontando para a porta 8790.
   Anote — é a base que o front e o Pluggy vão usar.
6. **Deploy.** Depois, testar o health no navegador:
   `https://<dominio>/health` → deve responder `{"ok":true,...}`.

## Depois do serviço no ar

- **Front (`conectar.html`):** preencher a constante `API_BASE` (produção) com
  `https://<dominio>` — o front chama `<API_BASE>/connect-token`.
- **Migração SQL:** aplicar `sql/2026-09-06_conexoes-pluggy.sql` no Supabase (uma vez).
- **Webhook:** com `PLUGGY_WEBHOOK_URL` preenchido, todo item conectado pelo widget já
  notifica `/webhook`. (Alternativa: registrar webhook global via API do Pluggy.)

## Teste de ingestão sem esperar webhook

Depois de conectar um item real pelo widget e ter o `itemId`, dá para forçar o
processamento pelo shell do container (aba Terminal do serviço no EasyPanel):

```bash
node server.mjs --once <itemId>
```
⚠️ Isso grava em `transacoes` (produção). Rodar Pluggy e Cumbuca **em paralelo** e
comparar os números antes de desligar o Cumbuca (Fase 4 do plano).

## Segurança — checklist

- [ ] Segredos só na aba Environment do EasyPanel (nunca no repo, que é público).
- [ ] `WEBHOOK_SECRET` definido; o `/webhook` exige o header `X-Webhook-Secret`.
- [ ] `ALLOWED_ORIGIN` = domínio real do front.
- [ ] `SUPABASE_SERVICE_ROLE` é a service_role (ignora RLS) — nunca vai para o front.
