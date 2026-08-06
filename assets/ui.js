/* =====================================================================
   ui.js — navegação, formatação e estados de tela

   Exposto em window.UI. Depende de modelo.js e db.js.
   ===================================================================== */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------
     Formatação
     ------------------------------------------------------------------ */
  var fmtBRL = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2
  });
  function BRL(v) { return fmtBRL.format(Number(v) || 0); }

  // Sem centavos, para números-herói. R$ 5.569 lê melhor que R$ 5.569,00
  // quando o ponto é a ordem de grandeza.
  var fmtBRL0 = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0
  });
  function BRL0(v) { return fmtBRL0.format(Number(v) || 0); }

  function pct(x) { return Math.round((Number(x) || 0) * 100) + '%'; }

  function haQuanto(ms) {
    if (ms == null) return 'agora';
    var min = Math.floor(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return 'há ' + min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return 'há ' + h + 'h';
    return 'há ' + Math.floor(h / 24) + 'd';
  }

  /* ------------------------------------------------------------------
     Modo privado (olho) — esconde os valores sem sair da tela
     ------------------------------------------------------------------ */
  var CHAVE_OLHO = 'fin.privado';
  function privado() {
    try { return localStorage.getItem(CHAVE_OLHO) === '1'; } catch (e) { return false; }
  }
  function alternarPrivado() {
    try { localStorage.setItem(CHAVE_OLHO, privado() ? '0' : '1'); } catch (e) {}
    aplicarPrivado();
  }
  function aplicarPrivado() {
    document.documentElement.classList.toggle('privado', privado());
  }

  /* ------------------------------------------------------------------
     Navegação inferior — 5 itens, IDÊNTICA para os dois papéis
     ------------------------------------------------------------------
     Planejar, Categorias e OQV moram dentro de "Mais"; Planejar e OQV só
     aparecem para o gestor. Barra que muda por papel foi avaliada e
     descartada (spec §3): 6 alvos numa barra de celular apertam os toques
     abaixo dos 44px que corrigimos em e38fe5b. */
  var ITENS = [
    { id: 'inicio', href: 'inicio.html', rotulo: 'Início', icone: '◎' },
    { id: 'triar', href: 'triar.html', rotulo: 'Triar', icone: '⌁', contador: true },
    { id: 'lancamentos', href: 'lancamentos.html', rotulo: 'Lançar', icone: '≡' },
    { id: 'analise', href: 'analise.html', rotulo: 'Análise', icone: '◐' },
    { id: 'mais', href: 'mais.html', rotulo: 'Mais', icone: '⋯' }
  ];

  function montarNav(ativo, pendentes) {
    var nav = document.createElement('nav');
    nav.className = 'nav';
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.innerHTML = ITENS.map(function (it) {
      var atual = it.id === ativo;
      // Triar é o ÚNICO item com contador.
      var badge = (it.contador && pendentes > 0)
        ? '<span class="nav-badge" aria-hidden="true">' + (pendentes > 99 ? '99+' : pendentes) + '</span>'
        : '';
      var rotuloA11y = it.rotulo + (it.contador && pendentes > 0
        ? ', ' + pendentes + ' para classificar' : '');
      return '<a class="nav-item' + (atual ? ' ativo' : '') + '" href="' + it.href + '"' +
             (atual ? ' aria-current="page"' : '') +
             ' aria-label="' + rotuloA11y + '">' +
             '<span class="nav-icone" aria-hidden="true">' + it.icone + badge + '</span>' +
             '<span class="nav-rotulo">' + it.rotulo + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    return nav;
  }

  /* ------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------ */
  var toastEl = null, toastTimer = null;
  function toast(msg, tipo) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      // Leitor de tela anuncia sem roubar o foco de quem está classificando.
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'toast visivel' + (tipo ? ' ' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 2600);
  }

  /* ------------------------------------------------------------------
     Estados de tela — esqueleto, vazio, erro
     ------------------------------------------------------------------
     Nunca spinner solto: o esqueleto mostra a forma do que vem, o spinner
     só informa que algo trava. Erro sempre com ação de recuperação. */
  function esqueleto(el, linhas) {
    var n = linhas || 6;
    el.innerHTML = '<div class="esqueleto" aria-busy="true" aria-label="Carregando">' +
      Array.from({ length: n }, function () {
        return '<div class="esq-linha"><div class="esq" style="max-width:60px"></div>' +
               '<div class="esq"></div><div class="esq" style="max-width:88px"></div></div>';
      }).join('') + '</div>';
  }

  function vazio(el, titulo, explicacao, acaoHtml) {
    el.innerHTML = '<div class="estado"><p class="estado-titulo">' + titulo + '</p>' +
      '<p class="estado-texto">' + (explicacao || '') + '</p>' +
      (acaoHtml || '') + '</div>';
  }

  function erro(el, mensagem, aoTentarDeNovo) {
    el.innerHTML = '<div class="estado erro"><p class="estado-titulo">Não consegui carregar</p>' +
      '<p class="estado-texto">' + (mensagem || '') + '</p>' +
      '<button class="btn" id="btnTentarDeNovo">Tentar de novo</button></div>';
    var b = $('btnTentarDeNovo');
    if (b && aoTentarDeNovo) b.onclick = aoTentarDeNovo;
  }

  /* ------------------------------------------------------------------
     Frescor — "atualizado há X min" + puxar-para-atualizar
     ------------------------------------------------------------------ */
  function marcarFrescor(el, nomeCache) {
    if (!el) return;
    el.textContent = 'atualizado ' + haQuanto(global.DB.idadeDoCache(nomeCache || 'tx'));
  }

  // Puxar-para-atualizar só quando a página já está no topo — senão brigaria
  // com a rolagem normal da lista.
  function puxarParaAtualizar(aoAtualizar) {
    var y0 = null, disparado = false;
    var LIMIAR = 70;
    document.addEventListener('touchstart', function (e) {
      y0 = (window.scrollY <= 0) ? e.touches[0].clientY : null;
      disparado = false;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (y0 == null || disparado) return;
      if (e.touches[0].clientY - y0 > LIMIAR) {
        disparado = true;
        toast('Atualizando…');
        aoAtualizar();
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Guarda de sessão — toda tela começa por aqui
     ------------------------------------------------------------------ */
  async function exigirSessao() {
    var s = await global.DB.sessaoAtual();
    if (!s) { location.replace('index.html'); return null; }
    return await global.DB.carregarPerfil();
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.UI = {
    $: $, BRL: BRL, BRL0: BRL0, pct: pct, haQuanto: haQuanto, escapar: escapar,
    privado: privado, alternarPrivado: alternarPrivado, aplicarPrivado: aplicarPrivado,
    montarNav: montarNav, toast: toast,
    esqueleto: esqueleto, vazio: vazio, erro: erro,
    marcarFrescor: marcarFrescor, puxarParaAtualizar: puxarParaAtualizar,
    exigirSessao: exigirSessao
  };

  aplicarPrivado();
})(window);
