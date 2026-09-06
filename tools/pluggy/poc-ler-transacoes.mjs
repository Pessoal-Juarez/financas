#!/usr/bin/env node
// poc-ler-transacoes.mjs — Prova de conceito da Fase 1 (plano Pluggy).
//
// O QUE FAZ: autentica no Pluggy, cria (ou reutiliza) um item, lê as
// transações e imprime cada uma CRUA e NORMALIZADA para o formato da tabela
// `transacoes` deste projeto. NÃO grava nada no Supabase — é só para validar
// o mapeamento de dados com olhos humanos antes de escrever a ingestão real.
//
// SEGREDOS: as credenciais vêm de variáveis de ambiente, nunca de arquivo.
// Copie do 1Password ("Credencial Desenvolvedor Pluggy") para o ambiente da
// sessão e rode. Nada sensível toca o disco nem o repositório (que é público).
//
// COMO RODAR (PowerShell):
//   $env:PLUGGY_CLIENT_ID    = "<client id>"
//   $env:PLUGGY_CLIENT_SECRET= "<client secret>"
//   node tools/pluggy/poc-ler-transacoes.mjs
//
//   # opções:
//   #   $env:PLUGGY_ITEM_ID = "<id>"   -> reutiliza um item já conectado
//   #                                     (ex.: uma conta real ligada no meu.pluggy.ai)
//   #   sem PLUGGY_ITEM_ID  -> cria um item no SANDBOX (Pluggy Bank, user-ok)
//
// Requer Node 18+ (usa fetch nativo). Testado no Node 24.

const BASE = 'https://api.pluggy.ai';
const CLIENT_ID = process.env.PLUGGY_CLIENT_ID;
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET;
const ITEM_ID = process.env.PLUGGY_ITEM_ID || null;
const SANDBOX_CONNECTOR_ID = 2; // "Pluggy Bank" (conector de sandbox)

function morrer(msg) {
  console.error('\n[ERRO] ' + msg + '\n');
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  morrer(
    'Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente.\n' +
    '       (copie do 1Password: "Credencial Desenvolvedor Pluggy")'
  );
}

async function api(path, { method = 'GET', apiKey, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-KEY'] = apiKey;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* deixa cru */ }
  if (!res.ok) {
    morrer(`${method} ${path} -> HTTP ${res.status}\n${texto}`);
  }
  return json;
}

// 1) API Key a partir das credenciais de desenvolvedor.
async function autenticar() {
  const r = await api('/auth', {
    method: 'POST',
    body: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
  });
  if (!r || !r.apiKey) morrer('Autenticou mas não veio apiKey.');
  return r.apiKey;
}

// 2) Cria um item no sandbox (ou usa o ITEM_ID informado).
async function obterItem(apiKey) {
  if (ITEM_ID) {
    console.log(`Usando PLUGGY_ITEM_ID informado: ${ITEM_ID}`);
    return await api(`/items/${ITEM_ID}`, { apiKey });
  }
  console.log('Criando item no SANDBOX (Pluggy Bank, user-ok)...');
  const item = await api('/items', {
    method: 'POST',
    apiKey,
    body: {
      connectorId: SANDBOX_CONNECTOR_ID,
      parameters: { user: 'user-ok', password: 'password-ok' },
    },
  });
  return item;
}

// Espera o item sair de estados de execução até UPDATED (ou erro/ação).
async function esperarItem(apiKey, itemId) {
  const PRONTOS = ['UPDATED', 'OUTDATED', 'LOGIN_ERROR', 'WAITING_USER_INPUT'];
  for (let i = 0; i < 30; i++) {
    const it = await api(`/items/${itemId}`, { apiKey });
    const status = it.status;
    process.stdout.write(`  item status: ${status}        \r`);
    if (PRONTOS.includes(status)) { console.log(''); return it; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('');
  return await api(`/items/${itemId}`, { apiKey });
}

async function listarContas(apiKey, itemId) {
  const r = await api(`/accounts?itemId=${itemId}`, { apiKey });
  return (r && r.results) || [];
}

// Paginação por cursor (páginas de 500), conforme a doc.
async function listarTransacoes(apiKey, accountId) {
  // v2/transactions rejeita 'pageSize' como parametro (default ja e 500).
  let todas = [];
  let path = `/v2/transactions?accountId=${accountId}`;
  for (let guarda = 0; guarda < 50 && path; guarda++) {
    const r = await api(path, { apiKey });
    const lote = (r && r.results) || [];
    todas = todas.concat(lote);
    path = montarProximo(r && r.next);
  }
  return todas;
}

// O campo `next` da paginacao por cursor pode vir como URL absoluta, como
// caminho ('/v2/transactions?...') ou como fragmento ('?accountId=...').
// Normalizamos para um caminho que comeca com '/'.
function montarProximo(next) {
  if (!next) return null;
  if (next.startsWith('http')) return next.replace(BASE, '');
  if (next.startsWith('/')) return next;
  if (next.startsWith('?')) return `/v2/transactions${next}`;
  return `/${next}`;
}

// ------------------------------------------------------------------
// NORMALIZAÇÃO — Pluggy -> formato da tabela `transacoes` deste projeto.
// Espelha o mapeamento da seção 4 de plans/pluggy-migracao.md.
// Aqui só transformamos; cls/categoria_id continuam a cargo do motor de
// regras da VPS (fora deste PoC).
// ------------------------------------------------------------------
function normalizar(tx, conta) {
  const ehCartao = (conta.type || '').toUpperCase() === 'CREDIT';
  const cc = tx.creditCardMetadata || null;

  // Sinal do valor -> tipo (saida/entrada). Normalizamos "valor" para
  // sempre positivo e derivamos o tipo.
  //
  // ⚠️ Observado no sandbox (Pluggy Bank) e a base do nosso mapeamento:
  //   - CARTÃO (CREDIT): compra vem com amount NEGATIVO (ex.: Netflix -55.9),
  //     logo amount < 0 = gasto (saida); amount > 0 = estorno/credito (entrada).
  //     Isto contraria a descrição textual da doc, mas bate com o dado real.
  //   - CONTA (BANK): usamos o campo `type` (CREDIT=entrada, DEBIT=saida),
  //     que veio consistente (salário entrada; boleto/luz/condomínio saída).
  // A convenção do cartão deve ser reconfirmada com um conector REAL antes
  // do corte (ver plano, Fase 4).
  let valorBruto = Number(tx.amount) || 0;
  let tipo;
  if (ehCartao) {
    tipo = valorBruto < 0 ? 'saida' : 'entrada';
  } else {
    tipo = (tx.type === 'CREDIT') ? 'entrada' : 'saida';
  }
  const valor = Math.abs(valorBruto);

  // data em GMT-3 (a doc entrega ISO UTC).
  const dataISO = tx.date ? new Date(tx.date) : null;
  const data = dataISO ? toGmt3Date(dataISO) : null;

  // parcela 'pp/tt' quando houver metadados de cartão.
  let parcela = null;
  if (cc && cc.totalInstallments && cc.totalInstallments > 1) {
    parcela = `${cc.installmentNumber}/${cc.totalInstallments}`;
  }

  // data_compra: volta a existir via creditCardMetadata.purchaseDate.
  const data_compra = cc && cc.purchaseDate ? toGmt3Date(new Date(cc.purchaseDate)) : null;

  // src derivado do tipo de conta / conector.
  const src = ehCartao ? 'Cartão' : 'Conta';

  return {
    ext_id: tx.id,               // id do Pluggy -> chave de upsert idempotente
    data,
    descricao: tx.description || '(sem descrição)',
    valor,
    tipo,
    parcela,
    data_compra,
    src,
    // cls / categoria_id: deixados para o motor de regras (fora do PoC)
    _amountOriginal: valorBruto, // só para conferência no PoC
    _status: tx.status,
  };
}

function toGmt3Date(d) {
  // Converte um Date (UTC) para a data-calendário em GMT-3, formato AAAA-MM-DD.
  const gmt3 = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return gmt3.toISOString().slice(0, 10);
}

function brl(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function main() {
  console.log('=== PoC Pluggy — leitura + normalização (sem gravar) ===\n');
  const apiKey = await autenticar();
  console.log('Autenticado. API Key obtida (expira em ~2h).');

  let item = await obterItem(apiKey);
  item = await esperarItem(apiKey, item.id);
  console.log(`Item: ${item.id} · conector: ${item.connector && item.connector.name} · status: ${item.status}\n`);

  const contas = await listarContas(apiKey, item.id);
  if (!contas.length) morrer('Nenhuma conta retornada para este item.');

  for (const conta of contas) {
    console.log('────────────────────────────────────────────────────────');
    console.log(`CONTA: ${conta.name || conta.marketingName || conta.id}`);
    console.log(`  tipo=${conta.type}/${conta.subtype} · saldo=${brl(conta.balance)} · id=${conta.id}`);

    const txs = await listarTransacoes(apiKey, conta.id);
    console.log(`  ${txs.length} transações\n`);

    // Mostra até 12 por conta para não poluir; o total já foi contado acima.
    const amostra = txs.slice(0, 12);
    for (const tx of amostra) {
      const n = normalizar(tx, conta);
      console.log(`  • ${n.data}  ${n.descricao.slice(0, 32).padEnd(32)}  ${n.tipo.padEnd(7)}  ${brl(n.valor).padStart(14)}` +
        (n.parcela ? `  parc ${n.parcela}` : '') +
        (n.data_compra ? `  compra ${n.data_compra}` : ''));
      const cc = tx.creditCardMetadata || null;
      const extra = cc
        ? ` cc={inst:${cc.installmentNumber}/${cc.totalInstallments} bill:${cc.billId || '-'} purchase:${cc.purchaseDate || '-'}}`
        : '';
      console.log(`      cru: amount=${n._amountOriginal} status=${n._status}${extra} ext_id=${n.ext_id}`);
    }
    if (txs.length > amostra.length) {
      console.log(`  ... (+${txs.length - amostra.length} não exibidas)`);
    }
    console.log('');
  }

  console.log('=== Fim. Nada foi gravado. Confira o mapeamento acima. ===');
  console.log('Pontos a validar: sinal do cartão (entrada=pagamento da fatura),');
  console.log('parcela pp/tt, data_compra preenchida, data em GMT-3.');
}

main().catch((e) => morrer(e && e.stack ? e.stack : String(e)));
