#!/usr/bin/env node
// ingest-webhook-server.mjs — Fase 3: ingestão do Pluggy por webhook (VPS).
//
// FLUXO:
//   Pluggy sincroniza o item (diário/automático) -> dispara webhook aqui ->
//   respondemos 2XX em < 10s -> em segundo plano: lemos a API do Pluggy,
//   normalizamos para o formato de `transacoes`, aplicamos o motor de regras
//   e fazemos UPSERT por ext_id no Supabase (service_role).
//
// POR QUE ASSIM (ver docs/architecture.md e plans/pluggy-migracao.md):
//   - O webhook só traz IDs, não os dados. Buscamos os dados via GET.
//   - Precisa responder 2XX rápido; processamento pesado vai depois da resposta.
//   - service_role ignora RLS (igual ao sync atual da VPS). NUNCA no front.
//
// SEGREDOS (ambiente / .env da VPS com chmod 600 — nunca commitar):
//   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET
//   SUPABASE_URL              (ex.: https://urlxbgngcncndtnhyqyf.supabase.co)
//   SUPABASE_SERVICE_ROLE     (a service_role secret)
//   WEBHOOK_SECRET            (opcional; header X-Webhook-Secret exigido se setado)
//   PORT                      (opcional, default 8792)
//
// Este arquivo é a FONTE; roda na VPS atrás de HTTPS (nginx/caddy) e sob
// systemd/pm2. Localmente dá para testar o processamento com --once (ver abaixo),
// sem precisar de webhook real.
//
// Requer Node 18+ (fetch nativo).

import http from 'node:http';

const PLUGGY = 'https://api.pluggy.ai';
const CLIENT_ID = process.env.PLUGGY_CLIENT_ID;
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;
const PORT = Number(process.env.PORT || 8792);

function faltando(nome) { console.error(`[ERRO] variável de ambiente ausente: ${nome}`); }
let ok = true;
for (const [n, v] of Object.entries({ PLUGGY_CLIENT_ID: CLIENT_ID, PLUGGY_CLIENT_SECRET: CLIENT_SECRET, SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE: SB_KEY })) {
  if (!v) { faltando(n); ok = false; }
}
if (!ok) process.exit(1);

// ------------------------------------------------------------------
// Pluggy API (API Key com cache simples; expira ~2h)
// ------------------------------------------------------------------
let _apiKey = null, _apiKeyEm = 0;
async function apiKey() {
  if (_apiKey && (Date.now() - _apiKeyEm) < 90 * 60 * 1000) return _apiKey;
  const r = await pluggy('/auth', { method: 'POST', body: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } });
  if (!r || !r.apiKey) throw new Error('auth sem apiKey');
  _apiKey = r.apiKey; _apiKeyEm = Date.now();
  return _apiKey;
}
async function pluggy(path, { method = 'GET', body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['X-API-KEY'] = key;
  const res = await fetch(PLUGGY + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) throw new Error(`Pluggy ${method} ${path}: HTTP ${res.status} ${txt}`);
  return json;
}

async function getItem(itemId) { return pluggy(`/items/${itemId}`, { key: await apiKey() }); }
async function getContas(itemId) {
  const r = await pluggy(`/accounts?itemId=${itemId}`, { key: await apiKey() });
  return (r && r.results) || [];
}
async function getTransacoes(accountId) {
  const key = await apiKey();
  let todas = [], path = `/v2/transactions?accountId=${accountId}`;
  for (let g = 0; g < 100 && path; g++) {
    const r = await pluggy(path, { key });
    todas = todas.concat((r && r.results) || []);
    const next = r && r.next;
    path = !next ? null : (next.startsWith('http') ? next.replace(PLUGGY, '') : (next.startsWith('/') ? next : (next.startsWith('?') ? `/v2/transactions${next}` : `/${next}`)));
  }
  return todas;
}

// ------------------------------------------------------------------
// Supabase REST (service_role — ignora RLS)
// ------------------------------------------------------------------
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(`${SB_URL}/rest/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: HTTP ${res.status} ${txt}`);
  return json;
}

// Carrega regras (padrao -> categoria/cls) uma vez por processamento.
async function carregarRegras() {
  const rows = await sb('/regras?select=padrao,categoria,categoria_id,cls');
  return (rows || []).filter((r) => r.padrao);
}
// Categorias conhecidas (para exigir texto+id coerentes na gravação).
async function carregarConexoes() {
  const rows = await sb('/conexoes_pluggy?select=instituicao,item_id,status');
  return rows || [];
}

// ------------------------------------------------------------------
// Normalização — igual ao PoC (validada no sandbox). Pluggy -> transacoes.
// ------------------------------------------------------------------
const ACENTOS = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
const BASES = 'AAAAAEEEEIIIIOOOOOUUUUC';
function normalizar(descricao) {
  const s = String(descricao || '').toUpperCase();
  let fora = '';
  for (let i = 0; i < s.length; i++) {
    const j = ACENTOS.indexOf(s[i]);
    fora += (j === -1) ? s[i] : BASES[j];
  }
  return fora.replace(/[^A-Z]/g, '').slice(0, 18);
}
// Match "contém", padrão mais longo ganha — espelha M.regraQueCasa.
function regraQueCasa(descricao, regras) {
  const d = normalizar(descricao);
  if (!d) return null;
  let melhor = null;
  for (const r of regras) {
    if (d.indexOf(r.padrao) === -1) continue;
    if (!melhor || r.padrao.length > melhor.padrao.length) melhor = r;
  }
  return melhor;
}
function toGmt3Date(iso) {
  const d = new Date(iso);
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function srcDe(conta) {
  const ehCartao = (conta.type || '').toUpperCase() === 'CREDIT';
  const nome = ((conta.connectorName || '') + ' ' + (conta.name || '')).toLowerCase();
  if (/btg/.test(nome)) return ehCartao ? 'BTG-Cartão' : 'BTG-Conta';
  return ehCartao ? 'Cartão' : 'Conta';
}

// Uma transação do Pluggy -> linha de `transacoes`, já classificada por regra.
function paraTransacao(tx, conta, regras) {
  const ehCartao = (conta.type || '').toUpperCase() === 'CREDIT';
  const cc = tx.creditCardMetadata || null;
  const amount = Number(tx.amount) || 0;

  // Sinal (validado no sandbox): cartão amount<0 = gasto (saida). Conta usa type.
  const tipo = ehCartao ? (amount < 0 ? 'saida' : 'entrada') : (tx.type === 'CREDIT' ? 'entrada' : 'saida');
  const valor = Math.abs(amount);

  const parcela = (cc && cc.totalInstallments > 1) ? `${cc.installmentNumber}/${cc.totalInstallments}` : null;
  const data_compra = (cc && cc.purchaseDate) ? toGmt3Date(cc.purchaseDate) : null;

  const linha = {
    ext_id: tx.id,
    data: toGmt3Date(tx.date),
    descricao: tx.description || '(sem descrição)',
    valor,
    tipo,
    parcela,
    data_compra,
    src: srcDe(conta),
  };

  // Classificação pelo motor de regras. Sem regra -> fica sem cls/categoria e
  // cai na triagem (comportamento atual). O texto acompanha o id (armadilha #9).
  const regra = regraQueCasa(linha.descricao, regras);
  if (regra) {
    if (regra.cls) linha.cls = regra.cls;
    if (regra.categoria_id != null) linha.categoria_id = regra.categoria_id;
    if (regra.categoria) linha.categoria = regra.categoria;
  }
  return linha;
}

// ------------------------------------------------------------------
// Processamento de um item: lê tudo, normaliza, faz upsert por ext_id.
// ------------------------------------------------------------------
async function processarItem(itemId) {
  const item = await getItem(itemId);
  console.log(`[item ${itemId}] status=${item && item.status} conector=${item && item.connector && item.connector.name}`);

  const regras = await carregarRegras();
  const contas = await getContas(itemId);
  let totalUpsert = 0;

  for (const conta of contas) {
    conta.connectorName = item && item.connector && item.connector.name;
    const txs = await getTransacoes(conta.id);
    if (!txs.length) continue;
    const linhas = txs.map((t) => paraTransacao(t, conta, regras));

    // Upsert em lotes por ext_id (idempotente). A coluna ext_id já existe.
    for (let i = 0; i < linhas.length; i += 200) {
      const lote = linhas.slice(i, i + 200);
      await sb('/transacoes?on_conflict=ext_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: lote,
      });
      totalUpsert += lote.length;
    }
    console.log(`  conta ${conta.name || conta.id}: ${linhas.length} transações processadas`);
  }
  console.log(`[item ${itemId}] upsert total: ${totalUpsert}`);
  return totalUpsert;
}

// Remove por ext_id (webhook transactions/deleted).
async function apagarPorExtId(ids) {
  if (!ids || !ids.length) return 0;
  // PostgREST: filtro in.(...) — em lotes para não estourar a URL.
  let apagados = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const lista = lote.map((x) => `"${x}"`).join(',');
    await sb(`/transacoes?ext_id=in.(${encodeURIComponent(lista)})`, { method: 'DELETE', prefer: 'return=minimal' });
    apagados += lote.length;
  }
  return apagados;
}

// ------------------------------------------------------------------
// Servidor HTTP do webhook
// ------------------------------------------------------------------
function lerCorpo(req) {
  return new Promise((resolve) => {
    let c = ''; req.on('data', (d) => { c += d; if (c.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(c ? JSON.parse(c) : {}); } catch { resolve({}); } });
  });
}

// Processa o evento DEPOIS de já ter respondido 2XX ao Pluggy.
async function processarEvento(evt) {
  try {
    const tipo = evt.event || '';
    if (tipo === 'transactions/deleted') {
      const n = await apagarPorExtId(evt.transactionIds || []);
      console.log(`[webhook] transactions/deleted: ${n} apagadas`);
      return;
    }
    // created/updated e eventos de item: recarregamos o item inteiro.
    // Simples e correto; a Pluggy recomenda GET /items/{id} ao receber evento.
    if (evt.itemId) {
      await processarItem(evt.itemId);
      // Atualiza o status na conexoes_pluggy (se existir a linha).
      try {
        const item = await getItem(evt.itemId);
        await sb('/conexoes_pluggy?on_conflict=item_id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: [{ item_id: evt.itemId, status: (item && item.status) || 'UPDATED', atualizado_em: new Date().toISOString() }],
        });
      } catch (e) { /* conexao pode nao existir ainda; nao e critico */ }
    }
  } catch (e) {
    console.error('[webhook] erro ao processar evento:', e.message);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
  }
  if (req.method === 'POST' && req.url === '/webhook') {
    // Segurança opcional por header secreto (além do whitelist de IP no nginx).
    if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
      res.writeHead(401); return res.end();  // 401 -> Pluggy nao repete (proposital)
    }
    const evt = await lerCorpo(req);
    // Responde 2XX IMEDIATAMENTE; processa depois (regra dos 10s do Pluggy).
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"received":true}');
    setImmediate(() => processarEvento(evt));
    return;
  }
  res.writeHead(404); res.end();
});

// Modo --once <itemId>: processa um item na hora, sem webhook (teste na VPS).
const argOnce = process.argv.indexOf('--once');
if (argOnce !== -1) {
  const itemId = process.argv[argOnce + 1];
  if (!itemId) { console.error('uso: --once <itemId>'); process.exit(1); }
  processarItem(itemId).then((n) => { console.log(`Feito. ${n} linhas.`); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
} else {
  server.listen(PORT, () => {
    console.log(`ingest webhook server ouvindo em http://localhost:${PORT}`);
    console.log(`  POST /webhook   (Pluggy)`);
    console.log(`  GET  /health`);
    console.log(WEBHOOK_SECRET ? '  (protegido por X-Webhook-Secret)' : '  (sem X-Webhook-Secret — configure em produção)');
  });
}
