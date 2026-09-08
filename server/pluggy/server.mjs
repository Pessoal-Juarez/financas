#!/usr/bin/env node
// server.mjs — serviço único do Pluggy para o app Finanças (deploy no EasyPanel).
//
// Combina, num só processo/porta, as duas responsabilidades da integração:
//   POST /connect-token  -> gera o Connect Token para o widget (Fase 2)
//   POST /webhook        -> recebe eventos do Pluggy e ingere em `transacoes` (Fase 3)
//   GET  /health         -> healthcheck
//
// Por que um serviço só: o EasyPanel expõe uma porta por App/domínio. As duas
// rotas usam as mesmas credenciais do Pluggy e são leves; isolá-las em dois
// serviços dobraria a operação sem ganho. O controle de acesso é por rota
// (CORS no /connect-token; segredo de header no /webhook).
//
// SEGREDOS: só por variável de ambiente (no EasyPanel, aba Environment do App).
// Nunca no repositório (público).
//   PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET   (obrigatórios)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE       (obrigatórios; service_role ignora RLS)
//   WEBHOOK_SECRET     (recomendado; exigido no header X-Webhook-Secret do /webhook)
//   ALLOWED_ORIGIN     (origem do front; default do app é o GitHub Pages)
//   PLUGGY_WEBHOOK_URL (a URL pública /webhook; repassada ao connectToken)
//   PORT               (default 8790; o EasyPanel injeta a porta a expor)
//
// Node 18+ (fetch nativo). Sem dependências externas.

import http from 'node:http';

const PLUGGY = 'https://api.pluggy.ai';
const CLIENT_ID = process.env.PLUGGY_CLIENT_ID;
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://pessoal-juarez.github.io';
const WEBHOOK_URL = process.env.PLUGGY_WEBHOOK_URL || undefined;
const PORT = Number(process.env.PORT || 8790);

let faltou = false;
for (const [n, v] of Object.entries({
  PLUGGY_CLIENT_ID: CLIENT_ID, PLUGGY_CLIENT_SECRET: CLIENT_SECRET,
  SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE: SB_KEY,
})) if (!v) { console.error(`[ERRO] variável de ambiente ausente: ${n}`); faltou = true; }
if (faltou) process.exit(1);

// ------------------------------------------------------------------
// Pluggy API (API Key cacheada ~2h)
// ------------------------------------------------------------------
let _key = null, _keyEm = 0;
async function apiKey() {
  if (_key && Date.now() - _keyEm < 90 * 60 * 1000) return _key;
  const r = await pluggy('/auth', { method: 'POST', body: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } });
  if (!r || !r.apiKey) throw new Error('auth sem apiKey');
  _key = r.apiKey; _keyEm = Date.now();
  return _key;
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
async function getItem(id) { return pluggy(`/items/${id}`, { key: await apiKey() }); }
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
    const n = r && r.next;
    path = !n ? null : (n.startsWith('http') ? n.replace(PLUGGY, '') : (n.startsWith('/') ? n : (n.startsWith('?') ? `/v2/transactions${n}` : `/${n}`)));
  }
  return todas;
}
async function connectToken(clientUserId) {
  const key = await apiKey();
  const options = {};
  if (WEBHOOK_URL) options.webhookUrl = WEBHOOK_URL;
  if (clientUserId) options.clientUserId = String(clientUserId);
  const r = await pluggy('/connect_token', { method: 'POST', key, body: Object.keys(options).length ? { options } : {} });
  if (!r || !r.accessToken) throw new Error('connect_token sem accessToken');
  return r.accessToken;
}

// ------------------------------------------------------------------
// Supabase REST (service_role)
// ------------------------------------------------------------------
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(`${SB_URL}/rest/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: HTTP ${res.status} ${txt}`);
  return json;
}
async function carregarRegras() {
  const rows = await sb('/regras?select=padrao,categoria,categoria_id,cls');
  return (rows || []).filter((r) => r.padrao);
}

// ------------------------------------------------------------------
// Normalização Pluggy -> transacoes (validada no PoC/sandbox)
// ------------------------------------------------------------------
const ACENTOS = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
const BASES = 'AAAAAEEEEIIIIOOOOOUUUUC';
// Prefixos burocráticos que engolem a janela de 18 chars: "Pagamento de Pix
// QR Code <loja>" e "Pagamento de boleto <credor>" viram todos a MESMA chave
// (PAGAMENTODEPIXQRCO), casando lojas sem relação (armadilha nº7). Descartamos
// o prefixo ANTES de cortar 18, para o padrão sair do nome real do
// estabelecimento. ⚠️ TEM que ser IDÊNTICO ao assets/modelo.js do front — se
// divergir, a regra ensinada no app não casa aqui no sync (quebra silenciosa).
const PREFIXOS_BUROCRATICOS = ['PAGAMENTODEPIXQRCODE', 'PAGAMENTODEBOLETO'];
function descartarPrefixo(letras) {
  for (const p of PREFIXOS_BUROCRATICOS) {
    if (letras.indexOf(p) === 0 && letras.length > p.length) return letras.slice(p.length);
  }
  return letras;
}
function normalizar(d) {
  const s = String(d || '').toUpperCase();
  let f = '';
  for (let i = 0; i < s.length; i++) { const j = ACENTOS.indexOf(s[i]); f += (j === -1) ? s[i] : BASES[j]; }
  return descartarPrefixo(f.replace(/[^A-Z]/g, '')).slice(0, 18);
}
function regraQueCasa(desc, regras) {
  const d = normalizar(desc);
  if (!d) return null;
  let melhor = null;
  for (const r of regras) { if (d.indexOf(r.padrao) === -1) continue; if (!melhor || r.padrao.length > melhor.padrao.length) melhor = r; }
  return melhor;
}
function gmt3(iso) { return new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function srcDe(conta) {
  const cartao = (conta.type || '').toUpperCase() === 'CREDIT';
  const nome = ((conta.connectorName || '') + ' ' + (conta.name || '')).toLowerCase();
  if (/btg/.test(nome)) return cartao ? 'BTG-Cartão' : 'BTG-Conta';
  return cartao ? 'Cartão' : 'Conta';
}
function paraTransacao(tx, conta, regras) {
  const cartao = (conta.type || '').toUpperCase() === 'CREDIT';
  const cc = tx.creditCardMetadata || null;
  const amount = Number(tx.amount) || 0;
  const tipo = cartao ? (amount < 0 ? 'saida' : 'entrada') : (tx.type === 'CREDIT' ? 'entrada' : 'saida');
  const linha = {
    ext_id: tx.id,
    data: gmt3(tx.date),
    descricao: tx.description || '(sem descrição)',
    valor: Math.abs(amount),
    tipo,
    parcela: (cc && cc.totalInstallments > 1) ? `${cc.installmentNumber}/${cc.totalInstallments}` : null,
    data_compra: (cc && cc.purchaseDate) ? gmt3(cc.purchaseDate) : null,
    src: srcDe(conta),
    // Chaves de classificação SEMPRE presentes e uniformes (evita PGRST102
    // "All object keys must match" em lote). O default de `cls` é 'Indefinido'
    // — a coluna é NOT NULL e 'Indefinido' é o valor que joga a transação na
    // fila de triagem (igual ao que o sync do Cumbuca faz). categoria/id ficam
    // null sem regra (essas colunas aceitam null).
    cls: 'Indefinido',
    categoria: null,
    categoria_id: null,
  };
  const regra = regraQueCasa(linha.descricao, regras);
  if (regra) {
    if (regra.cls) linha.cls = regra.cls;
    if (regra.categoria_id != null) linha.categoria_id = regra.categoria_id;
    if (regra.categoria) linha.categoria = regra.categoria;
  }
  return linha;
}

async function processarItem(itemId) {
  const item = await getItem(itemId);
  const regras = await carregarRegras();
  const contas = await getContas(itemId);
  let total = 0;
  const rel = [];
  for (const conta of contas) {
    conta.connectorName = item && item.connector && item.connector.name;
    const r = { conta: conta.name || conta.id, type: conta.type, lidas: 0, gravadas: 0 };
    try {
      const txs = await getTransacoes(conta.id);
      r.lidas = txs.length;
      const linhas = txs.map((t) => paraTransacao(t, conta, regras));
      for (let i = 0; i < linhas.length; i += 200) {
        const lote = linhas.slice(i, i + 200);
        try {
          await sb('/transacoes?on_conflict=ext_id', {
            method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: lote,
          });
          r.gravadas += lote.length; total += lote.length;
        } catch (eLote) {
          // Captura o erro do lote e uma amostra da 1a linha, sem derrubar o
          // resto do processamento.
          if (!r.erro) { r.erro = eLote.message; r.amostraLinha = lote[0]; }
        }
      }
    } catch (eConta) {
      r.erro = eConta.message;
    }
    rel.push(r);
  }
  console.log(`[item ${itemId}] status=${item && item.status} upsert=${total} rel=${JSON.stringify(rel)}`);
  return { total, contas: rel, status: item && item.status };
}
async function apagarPorExtId(ids) {
  if (!ids || !ids.length) return 0;
  let n = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const lista = ids.slice(i, i + 100).map((x) => `"${x}"`).join(',');
    await sb(`/transacoes?ext_id=in.(${encodeURIComponent(lista)})`, { method: 'DELETE', prefer: 'return=minimal' });
    n += Math.min(100, ids.length - i);
  }
  return n;
}
async function processarEvento(evt) {
  try {
    if ((evt.event || '') === 'transactions/deleted') {
      console.log(`[webhook] deleted: ${await apagarPorExtId(evt.transactionIds || [])}`);
      return;
    }
    if (evt.itemId) {
      await processarItem(evt.itemId);
      try {
        const item = await getItem(evt.itemId);
        await sb('/conexoes_pluggy?on_conflict=item_id', {
          method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
          body: [{ item_id: evt.itemId, status: (item && item.status) || 'UPDATED', atualizado_em: new Date().toISOString() }],
        });
      } catch {}
    }
  } catch (e) { console.error('[webhook] erro:', e.message); }
}

// ------------------------------------------------------------------
// HTTP
// ------------------------------------------------------------------
function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function send(res, status, obj, cors) {
  if (cors) corsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function lerCorpo(req) {
  return new Promise((resolve) => {
    let c = ''; req.on('data', (d) => { c += d; if (c.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(c ? JSON.parse(c) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { corsHeaders(res); res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return send(res, 200, { ok: true, service: 'pluggy-financas' });
  }

  // Diagnóstico: lista as contas de um item (tipo/subtipo/nome), para saber se
  // o cartão veio junto. Protegido pelo mesmo segredo do webhook.
  if (req.method === 'GET' && req.url.startsWith('/debug/contas')) {
    if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
      res.writeHead(401); return res.end();
    }
    const u = new URL(req.url, 'http://x');
    const itemId = u.searchParams.get('itemId');
    if (!itemId) return send(res, 400, { error: 'informe ?itemId=' });
    try {
      const contas = await getContas(itemId);
      const resumo = contas.map((c) => ({ id: c.id, type: c.type, subtype: c.subtype, name: c.name || c.marketingName }));
      return send(res, 200, { itemId, contas: resumo });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }

  // Diagnóstico: quantas transações o Pluggy retorna por conta do item, e uma
  // amostra da primeira de cada — para descobrir por que o cartão não entrou.
  if (req.method === 'GET' && req.url.startsWith('/debug/contagem')) {
    if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
      res.writeHead(401); return res.end();
    }
    const u = new URL(req.url, 'http://x');
    const itemId = u.searchParams.get('itemId');
    if (!itemId) return send(res, 400, { error: 'informe ?itemId=' });
    try {
      const contas = await getContas(itemId);
      const out = [];
      for (const c of contas) {
        let info = { id: c.id, type: c.type, name: c.name || c.marketingName };
        try {
          const txs = await getTransacoes(c.id);
          info.transacoes = txs.length;
          const comCC = txs.filter((t) => t.creditCardMetadata && t.creditCardMetadata.totalInstallments > 1).length;
          info.parceladas = comCC;
          if (txs[0]) info.amostra = { date: txs[0].date, description: txs[0].description, amount: txs[0].amount };
        } catch (e2) { info.erro = e2.message; }
        out.push(info);
      }
      return send(res, 200, { itemId, contas: out });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }

  if (req.method === 'POST' && req.url === '/connect-token') {
    const body = await lerCorpo(req);
    try {
      const accessToken = await connectToken(body && body.clientUserId);
      return send(res, 200, { accessToken }, true);
    } catch (e) {
      console.error('[connect-token]', e.message);
      return send(res, 502, { error: 'nao_foi_possivel_gerar_token' }, true);
    }
  }

  // Diagnóstico: processa um item de forma SÍNCRONA e devolve o relatório
  // (erros por conta + amostra da linha problemática). Protegido.
  if (req.method === 'GET' && req.url.startsWith('/debug/processar')) {
    if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
      res.writeHead(401); return res.end();
    }
    const u = new URL(req.url, 'http://x');
    const itemId = u.searchParams.get('itemId');
    if (!itemId) return send(res, 400, { error: 'informe ?itemId=' });
    try {
      const rel = await processarItem(itemId);
      return send(res, 200, rel);
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }

  // Diagnóstico/manutenção: remove duplicatas internas do Pluggy, criadas
  // quando o ext_id de uma transação mudou entre sincronizações (a chave de
  // dedup vira o conteúdo: data|descricao|valor|src). Mantém a "melhor" de
  // cada grupo: classificada (cls != Indefinido) tem prioridade; empate, a de
  // id maior (mais recente). ?dry=1 simula sem apagar. Protegido.
  if (req.method === 'GET' && req.url.startsWith('/debug/dedup')) {
    if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
      res.writeHead(401); return res.end();
    }
    const u = new URL(req.url, 'http://x');
    const dry = u.searchParams.get('dry') === '1';
    try {
      // Lê todas as linhas do Pluggy (ext_id não nulo), paginado.
      let linhas = [], de = 0;
      for (;;) {
        const pg = await sb(`/transacoes?select=id,ext_id,data,descricao,valor,src,cls&ext_id=not.is.null&order=id.asc&limit=1000&offset=${de}`);
        const arr = pg || [];
        linhas = linhas.concat(arr);
        if (arr.length < 1000) break;
        de += 1000;
      }
      // Agrupa por conteúdo.
      const grupos = new Map();
      for (const l of linhas) {
        const k = [l.data, l.descricao, l.valor, l.src].join('|');
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(l);
      }
      // Decide o que apagar.
      const apagar = [];
      let gruposComDup = 0;
      for (const [, arr] of grupos) {
        if (arr.length < 2) continue;
        gruposComDup++;
        arr.sort((a, b) => {
          const ca = (a.cls && a.cls !== 'Indefinido') ? 1 : 0;
          const cb = (b.cls && b.cls !== 'Indefinido') ? 1 : 0;
          if (ca !== cb) return cb - ca;           // classificada primeiro
          return String(b.id).localeCompare(String(a.id)); // id maior primeiro
        });
        for (let i = 1; i < arr.length; i++) apagar.push(arr[i].id);
      }
      if (!dry && apagar.length) {
        for (let i = 0; i < apagar.length; i += 100) {
          const lote = apagar.slice(i, i + 100).join(',');
          await sb(`/transacoes?id=in.(${lote})`, { method: 'DELETE', prefer: 'return=minimal' });
        }
      }
      return send(res, 200, {
        dry, totalPluggy: linhas.length, gruposComDuplicata: gruposComDup,
        aApagar: apagar.length, apagados: dry ? 0 : apagar.length,
      });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
      res.writeHead(401); return res.end();
    }
    const evt = await lerCorpo(req);
    send(res, 200, { received: true });         // responde 2XX < 10s
    setImmediate(() => processarEvento(evt));    // processa depois
    return;
  }

  send(res, 404, { error: 'not_found' });
});

// --once <itemId>: processa um item na hora (teste), sem subir o servidor.
const io = process.argv.indexOf('--once');
if (io !== -1) {
  const itemId = process.argv[io + 1];
  if (!itemId) { console.error('uso: --once <itemId>'); process.exit(1); }
  processarItem(itemId).then((n) => { console.log(`Feito. ${n} linhas.`); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
} else {
  server.listen(PORT, () => {
    console.log(`pluggy-financas ouvindo em :${PORT}`);
    console.log(`  POST /connect-token · POST /webhook · GET /health`);
    console.log(WEBHOOK_SECRET ? '  (/webhook protegido por X-Webhook-Secret)' : '  (aviso: WEBHOOK_SECRET não definido)');
  });
}
