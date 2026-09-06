#!/usr/bin/env node
// connect-token-server.mjs — endpoint MINIMO para gerar o Connect Token do
// Pluggy no SERVIDOR (VPS), para o front abrir o widget Pluggy Connect com
// segurança. Adapta o exemplo oficial (Next.js) para a stack deste projeto:
// Node puro, sem framework, sem SDK — só fetch nativo (Node 18+).
//
// POR QUE NO SERVIDOR: o CLIENT_SECRET nunca pode ir para o browser (o repo é
// público e o front é estático). O servidor troca clientId+secret por uma
// API Key (~2h) e com ela gera um connectToken (~30 min), que é o único valor
// que vai para o front.
//
// SEGREDOS: vêm do ambiente (no deploy real, do /root/financas/.env com
// chmod 600, ao lado da service_role). Nunca commitar.
//   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET      (obrigatórios)
//   PORT           (opcional, default 8791)
//   ALLOWED_ORIGIN (opcional, default '*' — em produção, o domínio do app)
//   PLUGGY_WEBHOOK_URL (opcional, repassado ao item para os webhooks da Fase 3)
//
// COMO RODAR (teste local, PowerShell):
//   $env:PLUGGY_CLIENT_ID="..."; $env:PLUGGY_CLIENT_SECRET="..."
//   node tools/pluggy/connect-token-server.mjs
//   # depois: POST http://localhost:8791/connect-token  { "clientUserId": "juarez" }
//
// Este arquivo roda na VPS, NÃO no GitHub Pages. Está em tools/ como fonte;
// o deploy é copiá-lo para /root/financas/ e rodar sob o gerenciador de
// processo de lá (systemd/pm2), atrás de HTTPS.

import http from 'node:http';

const BASE = 'https://api.pluggy.ai';
const CLIENT_ID = process.env.PLUGGY_CLIENT_ID;
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET;
const PORT = Number(process.env.PORT || 8791);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const WEBHOOK_URL = process.env.PLUGGY_WEBHOOK_URL || undefined;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('[ERRO] Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente.');
  process.exit(1);
}

async function pluggy(path, { method = 'GET', apiKey, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json = null; try { json = texto ? JSON.parse(texto) : null; } catch {}
  if (!res.ok) {
    const msg = (json && json.message) || texto || `HTTP ${res.status}`;
    const erro = new Error(`Pluggy ${method} ${path}: ${msg}`);
    erro.status = res.status;
    throw erro;
  }
  return json;
}

// API Key (server-side) a partir das credenciais de desenvolvedor.
async function criarApiKey() {
  const r = await pluggy('/auth', {
    method: 'POST',
    body: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
  });
  if (!r || !r.apiKey) throw new Error('Auth não retornou apiKey.');
  return r.apiKey;
}

// Connect Token para o front. `clientUserId` liga o item ao nosso usuário.
async function criarConnectToken(clientUserId) {
  const apiKey = await criarApiKey();
  const options = {};
  if (WEBHOOK_URL) options.webhookUrl = WEBHOOK_URL;
  if (clientUserId) options.clientUserId = String(clientUserId);
  const body = Object.keys(options).length ? { options } : {};
  const r = await pluggy('/connect_token', { method: 'POST', apiKey, body });
  if (!r || !r.accessToken) throw new Error('connect_token não retornou accessToken.');
  return r.accessToken;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, obj) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && req.url === '/connect-token') {
    let corpo = '';
    req.on('data', (c) => { corpo += c; if (corpo.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let clientUserId;
      try { clientUserId = corpo ? (JSON.parse(corpo).clientUserId) : undefined; } catch {}
      try {
        const accessToken = await criarConnectToken(clientUserId);
        return json(res, 200, { accessToken });
      } catch (e) {
        console.error('[connect-token]', e.message);
        // Não vaza detalhe do Pluggy para o cliente.
        return json(res, 502, { error: 'nao_foi_possivel_gerar_token' });
      }
    });
    return;
  }

  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`connect-token server ouvindo em http://localhost:${PORT}`);
  console.log(`  POST /connect-token  -> { accessToken }`);
  console.log(`  GET  /health`);
});
