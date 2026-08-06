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

  // IDEMPOTENTE por construção: chamar de novo SUBSTITUI a barra, não
  // empilha outra. As telas chamam isto sempre que o contador de pendentes
  // muda (classificar um lançamento mexe no número), e a versão que só
  // acrescentava produzia duas barras sobrepostas — pego pela verificação
  // em 06/08, quando a bateria rodou duas vezes na mesma página.
  function montarNav(ativo, pendentes) {
    var antiga = document.querySelector('nav.nav');
    if (antiga) antiga.parentNode.removeChild(antiga);

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
     Barras com linha de tendência
     ------------------------------------------------------------------
     SVG puro, sem Chart.js — dependência de CDN quebraria o app offline.

     A tendência é uma REGRESSÃO LINEAR (mínimos quadrados) sobre a série,
     não a ligação entre o primeiro e o último ponto: dois meses atípicos
     nas pontas inclinariam a reta para qualquer lado e ela mentiria com
     ar de rigor.

     `pontos` = [{ rotulo, valor, destaque? }] */
  function barrasComTendencia(pontos, opcoes) {
    var o = opcoes || {};
    var L = 300, A = 120, base = A - 18, topoY = 8;
    var max = Math.max.apply(null, pontos.map(function (p) { return p.valor; }).concat([1]));
    var larg = L / (pontos.length || 1);
    var corBar = o.cor || 'var(--acento)';

    var barras = pontos.map(function (p, i) {
      var h = Math.max(1, (p.valor / max) * (base - topoY));
      var x = i * larg + larg * 0.18, w = larg * 0.64;
      return '<rect x="' + x.toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="2" fill="' + (p.destaque ? 'var(--badge-fg)' : corBar) +
        '"><title>' + escapar(p.rotulo) + ': ' + BRL(p.valor) + '</title></rect>';
    }).join('');

    // Mínimos quadrados: y = a + b·x
    var n = pontos.length, linha = '';
    if (n >= 3) {
      var sx = 0, sy = 0, sxy = 0, sxx = 0;
      pontos.forEach(function (p, i) { sx += i; sy += p.valor; sxy += i * p.valor; sxx += i * i; });
      var den = n * sxx - sx * sx;
      if (den !== 0) {
        var b = (n * sxy - sx * sy) / den;
        var a = (sy - b * sx) / n;
        var yDe = a, yAte = a + b * (n - 1);
        var py = function (v) {
          var vv = Math.max(0, Math.min(max, v));
          return (base - (vv / max) * (base - topoY)).toFixed(1);
        };
        linha = '<line x1="' + (larg * 0.5).toFixed(1) + '" y1="' + py(yDe) +
          '" x2="' + (L - larg * 0.5).toFixed(1) + '" y2="' + py(yAte) +
          '" stroke="var(--perigo)" stroke-width="2" stroke-dasharray="5 4" ' +
          'stroke-linecap="round" opacity=".85"></line>';
        o.inclinacao = b;
      }
    }

    var rotulos = pontos.map(function (p, i) {
      return '<text x="' + (i * larg + larg / 2).toFixed(1) + '" y="' + (A - 4) +
        '" text-anchor="middle" font-size="9" fill="var(--muted)">' +
        escapar(String(p.rotulo).slice(0, 3)) + '</text>';
    }).join('');

    return '<svg viewBox="0 0 ' + L + ' ' + A + '" width="100%" height="' + A +
      '" role="img" aria-label="' + escapar(o.titulo || 'Gráfico de barras') +
      '">' + barras + linha + rotulos + '</svg>';
  }

  // Texto que traduz a inclinação da tendência. Uma reta pontilhada sem
  // legenda é enfeite; com a leitura em palavras, vira informação.
  function leituraDaTendencia(pontos) {
    if (!pontos || pontos.length < 3) return '';
    var n = pontos.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    pontos.forEach(function (p, i) { sx += i; sy += p.valor; sxy += i * p.valor; sxx += i * i; });
    var den = n * sxx - sx * sx;
    if (!den) return '';
    var b = (n * sxy - sx * sy) / den;
    // Denominador em valor absoluto: numa série negativa (o resultado das
    // empresas, por exemplo) dividir pela média com sinal invertia a leitura.
    var media = Math.abs(sy / n);
    if (!media) return '';
    var pctMes = (b / media) * 100;
    if (Math.abs(pctMes) < 2) return 'Tendência estável no período.';
    return 'Tendência de ' + (b > 0 ? 'alta' : 'queda') + ' de ' +
      BRL(Math.abs(b)) + ' por mês (' + Math.abs(pctMes).toFixed(0) + '% da média).';
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
    exigirSessao: exigirSessao,
    barrasComTendencia: barrasComTendencia, leituraDaTendencia: leituraDaTendencia
  };

  aplicarPrivado();
})(window);
