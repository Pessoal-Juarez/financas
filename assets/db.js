/* =====================================================================
   db.js — Supabase: auth, leitura paginada, cache e gravação

   Exposto em window.DB. Requer supabase-js já carregado.

   O CACHE É OBRIGATÓRIO, NÃO OPCIONAL (spec §5). A leitura completa são
   3.132 linhas em 4 requisições. Sem cache, navegar entre 6 telas refaria
   isso a cada troca — e a arquitetura de vários HTML ficaria PIOR que o
   arquivo único que ela substitui.
   ===================================================================== */
(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://urlxbgngcncndtnhyqyf.supabase.co';
  // Pública por design. O repositório é público e isso está correto: a
  // proteção real é o RLS. Nunca colocar a service_role aqui — ela ignora
  // RLS e mora só na VPS, em /root/financas/.env.
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVybHhiZ25nY25jbmR0bmh5cXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTA3MDksImV4cCI6MjA5NjA4NjcwOX0.nQ58KRAnw1MpxYMW_EUXVeiC8aFQRyye5uvi7FWaa6Y';

  var sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  var PAGINA = 1000;   // PostgREST corta SELECT em 1000 linhas. Não é escolha.
  var TTL_MS = 5 * 60 * 1000;
  var PREFIXO = 'fin.v1.';

  var USER = null, ROLE = 'colab', NOME = '';

  /* ------------------------------------------------------------------
     Cache em sessionStorage
     ------------------------------------------------------------------
     sessionStorage e não localStorage: dado financeiro não deve sobreviver
     ao fechamento da aba. Invalidado por classificar, aplicar lote, editar
     categoria ou puxar-para-atualizar — nunca só pelo TTL. */
  function chave(nome) { return PREFIXO + nome; }

  function lerCache(nome) {
    try {
      var bruto = sessionStorage.getItem(chave(nome));
      if (!bruto) return null;
      var env = JSON.parse(bruto);
      if (!env || typeof env.em !== 'number') return null;
      if (Date.now() - env.em > TTL_MS) return null;
      return env;
    } catch (e) { return null; }   // cota estourada ou JSON corrompido
  }

  function gravarCache(nome, dados) {
    try {
      sessionStorage.setItem(chave(nome), JSON.stringify({ em: Date.now(), dados: dados }));
    } catch (e) {
      // QuotaExceeded no Safari do iPhone com 3.132 linhas é plausível.
      // Perder o cache é degradação de performance, não de correção —
      // seguir sem ele em vez de quebrar a tela.
      try { sessionStorage.removeItem(chave(nome)); } catch (e2) {}
    }
  }

  function invalidar(nome) {
    try {
      if (nome) { sessionStorage.removeItem(chave(nome)); return; }
      for (var i = sessionStorage.length - 1; i >= 0; i--) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(PREFIXO) === 0) sessionStorage.removeItem(k);
      }
    } catch (e) {}
  }

  // "atualizado há X min" — o app diz de quando é o número que mostra.
  function idadeDoCache(nome) {
    var env = lerCache(nome);
    return env ? Date.now() - env.em : null;
  }

  /* ------------------------------------------------------------------
     Auth
     ------------------------------------------------------------------ */
  async function sessaoAtual() {
    var r = await sb.auth.getSession();
    return r.data ? r.data.session : null;
  }

  async function entrar(email, senha) {
    var r = await sb.auth.signInWithPassword({ email: String(email).trim(), password: senha });
    if (r.error) return { erro: r.error.message };
    await carregarPerfil();
    return { ok: true };
  }

  async function sair() {
    invalidar();
    await sb.auth.signOut();
  }

  async function carregarPerfil() {
    var u = await sb.auth.getUser();
    USER = u.data ? u.data.user : null;
    if (!USER) return null;
    var p = await sb.from('profiles').select('role,nome').eq('id', USER.id).maybeSingle();
    ROLE = (p.data && p.data.role) || 'colab';
    NOME = (p.data && p.data.nome) || USER.email;
    return { id: USER.id, role: ROLE, nome: NOME, email: USER.email };
  }

  function ehGestor() { return ROLE === 'admin'; }

  /* ------------------------------------------------------------------
     Leitura paginada
     ------------------------------------------------------------------ */
  async function lerTudo(tabela, ordem) {
    var todas = [], de = 0;
    for (;;) {
      var q = sb.from(tabela).select('*');
      if (ordem) {
        for (var i = 0; i < ordem.length; i++) {
          q = q.order(ordem[i][0], { ascending: !!ordem[i][1] });
        }
      }
      var r = await q.range(de, de + PAGINA - 1);
      if (r.error) throw new Error(r.error.message);
      var lote = r.data || [];
      todas = todas.concat(lote);
      if (lote.length < PAGINA) break;
      de += PAGINA;
    }
    return todas;
  }

  async function comCache(nome, buscar, forcar) {
    if (!forcar) {
      var env = lerCache(nome);
      if (env) return env.dados;
    }
    var dados = await buscar();
    gravarCache(nome, dados);
    return dados;
  }

  function transacoes(forcar) {
    return comCache('tx', function () {
      return lerTudo('transactions', [['data', false], ['id', false]]);
    }, forcar);
  }

  function categorias(forcar) {
    return comCache('cat', function () {
      return lerTudo('categorias', [['ordem', true]]);
    }, forcar);
  }

  function regras(forcar) {
    return comCache('regras', function () { return lerTudo('regras'); }, forcar);
  }

  // Só gestor — o RLS já barra a colab, isto evita o request inútil.
  async function patrimonio(forcar) {
    if (!ehGestor()) return [];
    return comCache('patr', function () { return lerTudo('patrimonio'); }, forcar);
  }

  async function tudo(forcar) {
    var r = await Promise.all([
      transacoes(forcar), categorias(forcar), regras(forcar), patrimonio(forcar)
    ]);
    return { tx: r[0], categorias: r[1], regras: r[2], patrimonio: r[3] };
  }

  /* ------------------------------------------------------------------
     Gravação
     ------------------------------------------------------------------
     Toda escrita invalida o cache do que mexeu. O chamador espera o
     resultado antes de avançar de tela: o cartão de triagem NÃO avança
     até a gravação confirmar (spec §9) — nunca some trabalho em silêncio.

     A colab só consegue alterar categoria/cls/rev; valor, data, tipo,
     descrição e origem são barrados pelo trigger trg_trava_colunas_transacao.
     Tentar aqui só produziria erro 42501 vindo do banco. */
  async function classificar(id, mudancas) {
    var patch = {};
    if ('cls' in mudancas) patch.cls = mudancas.cls;
    if ('categoria_id' in mudancas) patch.categoria_id = mudancas.categoria_id;
    if ('categoria' in mudancas) patch.categoria = mudancas.categoria;
    if ('rev' in mudancas) patch.rev = mudancas.rev;
    if (!Object.keys(patch).length) return { ok: true };

    var r = await sb.from('transactions').update(patch).eq('id', id);
    if (r.error) return { erro: r.error.message };
    invalidar('tx');
    return { ok: true };
  }

  // Ensina uma regra. Chamado quando o usuário MUDA a sugestão — "Mudar" é o
  // evento que ensina, não "Confirmar" (spec §7).
  async function ensinarRegra(descricao, categoria_id, categoria, cls) {
    var padrao = global.M.normalizar(descricao);
    // Padrão curto demais vira regra abrangente que engole o que não devia.
    // Ver o comentário em modelo.js sobre as 119 regras SHOPEE*.
    if (!global.M.podeVirarRegra(padrao)) return { ok: false, motivo: 'padrao-curto' };
    var r = await sb.from('regras')
      .upsert({ padrao: padrao, categoria_id: categoria_id || null,
                categoria: categoria || null, cls: cls }, { onConflict: 'padrao' });
    if (r.error) return { erro: r.error.message };
    invalidar('regras');
    return { ok: true };
  }

  // Varredura retroativa e aplicação em lote. Sequencial de propósito: são
  // ~107 linhas e o que importa é não perder nenhuma, não a velocidade.
  // Devolve o que falhou para a tela poder oferecer "Tentar de novo".
  async function aplicarLote(itens, aoProgredir) {
    var ok = 0, falhas = [];
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i];
      var r = await classificar(it.id, it.mudancas);
      if (r.erro) falhas.push({ id: it.id, erro: r.erro }); else ok++;
      if (aoProgredir) aoProgredir(i + 1, itens.length);
    }
    invalidar('tx');
    return { ok: ok, falhas: falhas };
  }

  function metas(forcar) {
    return comCache('metas', function () { return lerTudo('metas'); }, forcar);
  }

  function config(forcar) {
    return comCache('config', function () { return lerTudo('config'); }, forcar);
  }

  async function salvarConfig(chave, valor) {
    var r = await sb.from('config').upsert(
      { chave: chave, valor: valor, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' });
    if (r.error) return { erro: r.error.message };
    invalidar('config');
    return { ok: true };
  }

  /* "Atualizar do banco" NÃO chama a VPS: insere uma linha em `comandos`
     com status pendente, e o cron de 2 em 2 minutos lá pega, executa e
     marca concluído. É esse desacoplamento que permite o front ser HTML
     estático sem servidor nenhum.

     Diferente de `invalidar()`, que só descarta o cache local e relê o que
     JÁ está no Supabase. */
  async function pedirSync(tipo) {
    var r = await sb.from('comandos')
      .insert({ tipo: tipo || 'sync', status: 'pendente' }).select().maybeSingle();
    if (r.error) return { erro: r.error.message };
    invalidar('comandos');
    return { ok: true, id: r.data && r.data.id };
  }

  function comandos(forcar) {
    return comCache('comandos', function () {
      return lerTudo('comandos', [['id', false]]);
    }, forcar);
  }

  function logAlteracoes(forcar) {
    return comCache('log', function () {
      return lerTudo('log_alteracoes', [['id', false]]);
    }, forcar);
  }

  function perguntas(forcar) {
    return comCache('perg', function () {
      return lerTudo('perguntas', [['id', false]]);
    }, forcar);
  }

  // O Assistente não fala com a VPS: enfileira a pergunta e o cron de 2 em 2
  // minutos responde. É esse desacoplamento que permite o front ser HTML
  // estático sem servidor.
  async function perguntar(texto) {
    var r = await sb.from('perguntas').insert({ pergunta: texto }).select().maybeSingle();
    if (r.error) return { erro: r.error.message };
    invalidar('perg');
    return { ok: true, id: r.data && r.data.id };
  }

  /* Orçamento por GRUPO. `metas.categoria` é a PRIMARY KEY e não pôde ser
     alterada — o dashboard.html antigo lê e ordena por ela. As duas colunas
     guardam o mesmo texto: `grupo` diz o significado, `categoria` mantém a
     chave e o app antigo funcionando. Redundância transitória, deliberada. */
  async function salvarMeta(grupo, valorMes) {
    var r = await sb.from('metas').upsert(
      { categoria: grupo, grupo: grupo, valor_mes: valorMes,
        atualizado_em: new Date().toISOString() },
      { onConflict: 'categoria' });
    if (r.error) return { erro: r.error.message };
    invalidar('metas');
    return { ok: true };
  }

  async function apagarMeta(grupo) {
    var r = await sb.from('metas').delete().eq('categoria', grupo);
    if (r.error) return { erro: r.error.message };
    invalidar('metas');
    return { ok: true };
  }

  /* Metas de ECONOMIA (reserva de emergência, viagem, etc.) — diferente de
     `metas`, que são tetos de GASTO por grupo. Persistidas na tabela
     `savings_goals`, criada para isso na migração 20260824. A coluna
     `config.valor` é NUMERIC, então config não serve para guardar metas.

     A tela trabalha com { id, nome, alvo, guardado, prazo }. Aqui traduzimos
     de/para as colunas reais: name, target_amount, current_amount,
     deadline_date, status. `status` = 'CANCELLED' é tratado como apagado e
     não volta na leitura. Cada meta é uma LINHA — operações são por id, não
     sobrescrita de um array inteiro. */
  function mapearMetaEconomia(row) {
    return {
      id: row.id,
      nome: row.name || 'Meta',
      alvo: Number(row.target_amount) || 0,
      guardado: Number(row.current_amount) || 0,
      prazo: row.deadline_date || ''
    };
  }

  function metasEconomia(forcar) {
    return comCache('savings', function () {
      return lerTudo('savings_goals', [['created_at', true]]);
    }, forcar).then(function (linhas) {
      return (linhas || [])
        .filter(function (r) { return r.status !== 'CANCELLED'; })
        .map(mapearMetaEconomia);
    });
  }

  async function criarMetaEconomia(dados) {
    var payload = {
      scope_id: 'FAMILIA',
      name: dados.nome,
      target_amount: dados.alvo,
      current_amount: 0,
      status: 'IN_PROGRESS'
    };
    // deadline_date é NOT NULL na tabela; sem prazo, guardamos uma data
    // distante como "sem prazo definido". A tela mostra prazo só quando quiser.
    payload.deadline_date = dados.prazo || '2099-12-31';
    var r = await sb.from('savings_goals').insert(payload).select().maybeSingle();
    if (r.error) return { erro: r.error.message };
    invalidar('savings');
    return { ok: true, meta: r.data ? mapearMetaEconomia(r.data) : null };
  }

  async function atualizarMetaEconomia(id, dados) {
    var patch = { updated_at: new Date().toISOString() };
    if ('nome' in dados) patch.name = dados.nome;
    if ('alvo' in dados) patch.target_amount = dados.alvo;
    if ('prazo' in dados) patch.deadline_date = dados.prazo || '2099-12-31';
    var r = await sb.from('savings_goals').update(patch).eq('id', id);
    if (r.error) return { erro: r.error.message };
    invalidar('savings');
    return { ok: true };
  }

  // Deposito/retirada mexem no current_amount. Lê o valor atual da linha
  // (fonte da verdade é o banco, não o estado da tela) e grava o novo,
  // preso entre 0 e o alvo não é imposto aqui — a tela decide, o banco só
  // guarda. Marca COMPLETED quando alcança o alvo, para a tela poder exibir.
  async function ajustarGuardadoMetaEconomia(id, delta) {
    var atual = await sb.from('savings_goals')
      .select('current_amount,target_amount').eq('id', id).maybeSingle();
    if (atual.error) return { erro: atual.error.message };
    if (!atual.data) return { erro: 'Meta não encontrada' };
    var novo = Math.max(0, (Number(atual.data.current_amount) || 0) + delta);
    var alvo = Number(atual.data.target_amount) || 0;
    var status = (alvo > 0 && novo >= alvo) ? 'COMPLETED' : 'IN_PROGRESS';
    var r = await sb.from('savings_goals')
      .update({ current_amount: novo, status: status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (r.error) return { erro: r.error.message };
    invalidar('savings');
    return { ok: true, guardado: novo };
  }

  // Apagar = marcar CANCELLED (soft delete). Preserva histórico e evita
  // remover linha que outra visão possa referenciar.
  async function apagarMetaEconomia(id) {
    var r = await sb.from('savings_goals')
      .update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', id);
    if (r.error) return { erro: r.error.message };
    invalidar('savings');
    return { ok: true };
  }

  // Só as linhas `fonte='manual'` fazem sentido editar aqui: a conta
  // corrente é sobrescrita pelo sync diário e o que for digitado sumiria
  // na manhã seguinte, sem aviso.
  async function salvarPatrimonio(id, valor) {
    var r = await sb.from('patrimonio')
      .update({ valor: valor, atualizado_em: new Date().toISOString() })
      .eq('id', id).eq('fonte', 'manual');
    if (r.error) return { erro: r.error.message };
    invalidar('patr');
    return { ok: true };
  }

  // Arquivar subcategoria em uso move os lançamentos E arquiva, numa
  // transação só. É o único ponto do app onde falha no meio corrompe dado,
  // por isso vive no banco como função e não como duas chamadas daqui.
  async function arquivarCategoria(idOrigem, idDestino) {
    var r = await sb.rpc('arquivar_categoria', {
      p_categoria_id: idOrigem, p_destino_id: idDestino });
    if (r.error) return { erro: r.error.message };
    invalidar('cat'); invalidar('tx'); invalidar('regras');
    return { ok: true, resultado: r.data };
  }

  async function renomearCategoria(id, nome) {
    var r = await sb.from('categorias').update({ nome: nome }).eq('id', id);
    if (r.error) return { erro: r.error.message };
    invalidar('cat'); invalidar('tx');
    return { ok: true };
  }

  async function criarCategoria(grupo, nome, ordem) {
    var r = await sb.from('categorias')
      .insert({ grupo: grupo, nome: nome, ordem: ordem || 0 }).select().maybeSingle();
    if (r.error) return { erro: r.error.message };
    invalidar('cat');
    return { ok: true, categoria: r.data };
  }

  global.DB = {
    sb: sb, PAGINA: PAGINA, TTL_MS: TTL_MS,
    sessaoAtual: sessaoAtual, entrar: entrar, sair: sair,
    carregarPerfil: carregarPerfil, ehGestor: ehGestor,
    get usuario() { return USER; },
    get papel() { return ROLE; },
    get nome() { return NOME; },
    transacoes: transacoes, categorias: categorias, regras: regras,
    patrimonio: patrimonio, tudo: tudo, lerTudo: lerTudo,
    classificar: classificar, ensinarRegra: ensinarRegra,
    aplicarLote: aplicarLote, criarCategoria: criarCategoria,
    metas: metas, salvarMeta: salvarMeta, apagarMeta: apagarMeta,
    metasEconomia: metasEconomia, criarMetaEconomia: criarMetaEconomia,
    atualizarMetaEconomia: atualizarMetaEconomia,
    ajustarGuardadoMetaEconomia: ajustarGuardadoMetaEconomia,
    apagarMetaEconomia: apagarMetaEconomia,
    config: config, salvarConfig: salvarConfig,
    logAlteracoes: logAlteracoes, perguntas: perguntas, perguntar: perguntar,
    pedirSync: pedirSync, comandos: comandos,
    salvarPatrimonio: salvarPatrimonio,
    arquivarCategoria: arquivarCategoria, renomearCategoria: renomearCategoria,
    invalidar: invalidar, idadeDoCache: idadeDoCache
  };
})(window);
