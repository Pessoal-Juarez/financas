#!/usr/bin/env node
// listar.mjs — utilitario de apoio (Fase 1). Lista o que existe na sua conta
// de desenvolvedor Pluggy: conectores reais (para conferir cobertura) e itens
// ja conectados (para descobrir o itemId de uma conta real).
//
// SEGREDOS: so por variavel de ambiente (1Password). Nada em arquivo.
//
// COMO RODAR (PowerShell):
//   $env:PLUGGY_CLIENT_ID     = "<client id>"
//   $env:PLUGGY_CLIENT_SECRET = "<client secret>"
//   node tools/pluggy/listar.mjs
//
// Requer Node 18+.

const BASE = 'https://api.pluggy.ai';
const CLIENT_ID = process.env.PLUGGY_CLIENT_ID;
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET;

function morrer(msg) { console.error('\n[ERRO] ' + msg + '\n'); process.exit(1); }
if (!CLIENT_ID || !CLIENT_SECRET) {
  morrer('Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET (copie do 1Password).');
}

async function api(path, { method = 'GET', apiKey, body, tolerar404 = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json = null; try { json = texto ? JSON.parse(texto) : null; } catch {}
  if (!res.ok) {
    if (tolerar404 && (res.status === 404 || res.status === 403)) {
      return { _erro: res.status, _corpo: texto };
    }
    morrer(`${method} ${path} -> HTTP ${res.status}\n${texto}`);
  }
  return json;
}

async function autenticar() {
  const r = await api('/auth', { method: 'POST', body: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } });
  if (!r || !r.apiKey) morrer('Sem apiKey.');
  return r.apiKey;
}

// Conectores reais que interessam a familia.
const ALVOS = ['itau', 'itaú', 'btg', 'nubank', 'infinitepay', 'infinite'];

async function main() {
  const apiKey = await autenticar();
  console.log('Autenticado.\n');

  // 1) Conectores: cobertura dos bancos da familia.
  console.log('=== CONECTORES (bancos da familia) ===');
  const conns = await api('/connectors', { apiKey });
  const lista = (conns && conns.results) || [];
  console.log(`Total de conectores disponiveis: ${lista.length}`);
  const relevantes = lista.filter((c) => {
    const nome = (c.name || '').toLowerCase();
    return ALVOS.some((a) => nome.includes(a));
  });
  if (!relevantes.length) {
    console.log('Nenhum conector dos alvos (Itau/BTG/Nubank/InfinitePay) encontrado pelo nome.');
  }
  for (const c of relevantes) {
    console.log(`  • id=${c.id}  ${c.name}  [${c.type || '?'}]  ${c.isSandbox ? '(sandbox)' : ''}` +
      `  produtos: ${(c.products || []).join(', ')}`);
  }

  // 2) Itens ja conectados (endpoint opt-in; pode estar desabilitado).
  console.log('\n=== ITENS JA CONECTADOS ===');
  const itens = await api('/items', { apiKey, tolerar404: true });
  if (itens && itens._erro) {
    console.log(`Listagem de itens indisponivel (HTTP ${itens._erro}).`);
    console.log('Esse endpoint e opt-in no Pluggy. Duas saidas:');
    console.log('  a) Pedir ao suporte Pluggy para habilitar "list items" na sua conta; ou');
    console.log('  b) Conectar uma conta pelo dashboard/meu.pluggy.ai e anotar o itemId mostrado,');
    console.log('     depois rodar: $env:PLUGGY_ITEM_ID="<id>"; node tools/pluggy/poc-ler-transacoes.mjs');
  } else {
    const arr = (itens && itens.results) || (Array.isArray(itens) ? itens : []);
    if (!arr.length) {
      console.log('Nenhum item conectado ainda nesta aplicacao.');
    } else {
      for (const it of arr) {
        console.log(`  • itemId=${it.id}  conector=${it.connector && it.connector.name}  status=${it.status}`);
      }
    }
  }

  console.log('\n=== Fim. Nada foi gravado. ===');
}

main().catch((e) => morrer(e && e.stack ? e.stack : String(e)));
