/* =====================================================================
   modelo.js — as regras de negócio, num lugar só

   Sem build, sem módulos ES: carregado com <script src> e exposto em
   window.M. As telas leem daqui; nenhuma delas redefine constante de
   negócio por conta própria.

   REGRA DE OURO: as chaves do banco NÃO mudam. `cls` é texto livre em
   `transacoes` e em `regras`; renomear no banco custaria migrar 3.132
   lançamentos + 520 regras. Aqui só traduzimos para exibição.
   ===================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
     Classificação (`cls`) — de quem é o dinheiro
     ------------------------------------------------------------------ */

  // Ordem de exibição. Os valores são as chaves reais do banco.
  var CLS = [
    'Pessoal família', 'Pessoal Juarez', 'Pessoal Raiane',
    'Dra. Raiane', 'Slim Fit', 'Rai Móveis', 'OQV',
    'Empréstimo', 'Não é gasto', 'Indefinido'
  ];

  // Rótulos leves (spec §4). "Pessoal Juarez" ao lado de "Pessoal Raiane"
  // transforma o app num placar de quem gastou mais — num app de casal isso
  // azeda. E `Indefinido` marcava 623 lançamentos como defeito; "A classificar"
  // é fila de trabalho.
  var ROTULO_CLS = {
    'Pessoal família': 'Da casa',
    'Pessoal Juarez': 'Do Juarez',
    'Pessoal Raiane': 'Da Raiane',
    'Dra. Raiane': 'Clínica',
    'Slim Fit': 'Slim Fit',
    'Rai Móveis': 'Rai Móveis',
    'OQV': 'OQV',
    'Empréstimo': 'Emprestado',
    'Não é gasto': 'Não conta',
    'Indefinido': 'A classificar'
  };

  var COR_CLS = {
    'Pessoal família': '#2f6df0', 'Pessoal Juarez': '#0f9d58',
    'Pessoal Raiane': '#e36fae', 'Dra. Raiane': '#b5560e',
    'Slim Fit': '#7a5cf0', 'Rai Móveis': '#c2410c', 'OQV': '#127c8a',
    'Empréstimo': '#d98c00', 'Não é gasto': '#9aa3b2', 'Indefinido': '#d23f3f'
  };

  // Custo de vida = o que a família consome. Empresas = o que é do negócio.
  // `Não é gasto`, `Empréstimo` e `Indefinido` não entram em nenhum dos dois.
  var CUSTO_DE_VIDA = ['Pessoal família', 'Pessoal Juarez', 'Pessoal Raiane'];
  var EMPRESAS = ['Dra. Raiane', 'Slim Fit', 'Rai Móveis', 'OQV'];

  var CLS_INDEFINIDO = 'Indefinido';
  var CLS_NAO_CONTA = 'Não é gasto';

  /* ------------------------------------------------------------------
     Grupos de categoria
     ------------------------------------------------------------------ */

  // Os 10 grupos de despesa, na ordem de exibição. `Receitas` e
  // `Movimentação` existem no banco para que toda categoria tenha grupo,
  // mas NÃO aparecem em Análise nem no orçamento — esses são sobre para
  // onde o dinheiro vai.
  var GRUPOS_DESPESA = [
    'Alimentação', 'Moradia', 'Saúde', 'Transporte', 'Cuidado pessoal',
    'Educação', 'Lazer', 'Compras', 'Serviços & obrigações', 'Empresas'
  ];
  var GRUPO_RECEITAS = 'Receitas';
  var GRUPO_MOVIMENTACAO = 'Movimentação';

  var COR_GRUPO = {
    'Alimentação': '#2f6df0', 'Moradia': '#7a5cf0', 'Saúde': '#0f9d58',
    'Transporte': '#b5560e', 'Cuidado pessoal': '#e36fae', 'Educação': '#127c8a',
    'Lazer': '#d98c00', 'Compras': '#c2410c', 'Serviços & obrigações': '#5c6675',
    'Empresas': '#8a6d3b', 'Receitas': '#0f9d58', 'Movimentação': '#9aa3b2'
  };

  /* ------------------------------------------------------------------
     Fixo / Variável / Adicional — herdado do dashboard, agora por GRUPO
     ------------------------------------------------------------------ */
  var TIER = {
    'Moradia': 'fixo', 'Serviços & obrigações': 'fixo', 'Educação': 'fixo',
    'Alimentação': 'variável', 'Transporte': 'variável', 'Saúde': 'variável',
    'Cuidado pessoal': 'variável',
    'Lazer': 'adicional', 'Compras': 'adicional', 'Empresas': 'adicional'
  };

  /* ------------------------------------------------------------------
     Normalização de descrição — TEM que casar com a da VPS
     ------------------------------------------------------------------
     A VPS gera `regras.padrao` a partir da descrição: maiúsculas, só A-Z,
     18 caracteres. Se esta função divergir da de lá, a varredura retroativa
     e a sugestão de regra erram em silêncio.

     ⚠️ PONTO EM ABERTO (06/08/2026): não se sabe o que a VPS faz com
     ACENTO. Duas hipóteses dão resultados diferentes —

        'E-Fácil'  →  EFCIL    (acento sumindo junto com a letra)
        'E-Fácil'  →  EFACIL   (acento dobrado para a letra base)

     O banco não desempata: as descrições que o Itaú entrega já chegam sem
     acento ('SHOPEE Efcil Oficial'), e nenhuma das 173 descrições
     acentuadas gerou regra. O script fica em /root/financas/ e não está
     nesta máquina.

     Em vez de chutar: `normalizar()` devolve a versão que preserva mais
     informação (acento vira a letra base), e `regraQueCasa()` testa AS
     DUAS. Assim uma eventual divergência com a VPS não esconde sugestão.
     Confirmar no script da VPS na próxima vez que mexer nela.

     Foi com esta normalização que se mediu, em 06/08/2026, que 107 dos 623
     pendentes já casam com regra existente. */
  var ACENTOS = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
  var BASES = 'AAAAAEEEEIIIIOOOOOUUUUC';

  function normalizar(descricao) {
    var s = String(descricao || '').toUpperCase();
    var fora = '';
    for (var i = 0; i < s.length; i++) {
      var j = ACENTOS.indexOf(s[i]);
      fora += (j === -1) ? s[i] : BASES[j];
    }
    return fora.replace(/[^A-Z]/g, '').slice(0, 18);
  }

  // A hipótese alternativa: o acento cai fora junto com a letra.
  function normalizarSemDobra(descricao) {
    return String(descricao || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 18);
  }

  // Match por "contém", igual ao da VPS. Testa as duas normalizações
  // enquanto a da VPS não está confirmada — para descrição sem acento (a
  // esmagadora maioria) as duas são idênticas e isto não custa nada.
  function regraQueCasa(descricao, regras) {
    var d1 = normalizar(descricao);
    var d2 = normalizarSemDobra(descricao);
    if (!d1 && !d2) return null;
    var melhor = null;
    for (var i = 0; i < regras.length; i++) {
      var r = regras[i];
      if (!r.padrao) continue;
      if (d1.indexOf(r.padrao) === -1 && d2.indexOf(r.padrao) === -1) continue;
      // Padrão mais longo ganha: 'AMAZONBRLIVRO' é mais específico que
      // 'AMAZONBR'. A VPS pode desempatar de outro jeito — por isso o app
      // NUNCA cria regra por prefixo curto (ver abaixo).
      if (!melhor || r.padrao.length > melhor.padrao.length) melhor = r;
    }
    return melhor;
  }

  /* ------------------------------------------------------------------
     ⚠️ Por que o app não consolida regras por prefixo
     ------------------------------------------------------------------
     Medido em 06/08/2026: as 119 regras `SHOPEE*` cobrem 6 categorias e 5
     classificações — OQV, Rai Móveis e Slim Fit entre elas. Uma regra
     `SHOPEE` genérica reclassificaria compras das empresas como gasto
     pessoal da família, destruindo a separação PF/PJ que o RLS protege.

     As regras por vendedor não são excesso de granularidade: elas guardam
     qual vendedor pertence a qual negócio. Regra nasce do padrão completo
     que a VPS gera, nunca de um prefixo inventado pelo front. */
  var PREFIXO_MINIMO_REGRA = 8;

  function podeVirarRegra(padrao) {
    return !!padrao && padrao.length >= PREFIXO_MINIMO_REGRA;
  }

  /* ------------------------------------------------------------------
     Regra genérica — a armadilha da janela de 18 caracteres
     ------------------------------------------------------------------
     `padrao` sai dos 18 primeiros caracteres da descrição normalizada.
     Quando o banco antepõe texto burocrático longo, a janela se esgota
     ANTES do nome do estabelecimento e a regra passa a valer para todo
     mundo. Caso real, encontrado em 06/08/2026:

       'Pagamento de Pix QR Code <QUALQUER LOJA>' -> PAGAMENTODEPIXQRCO

     Uma única regra com esse padrão mandava 63 estabelecimentos
     diferentes para Farmácia — inclusive uma fintech de parcelamento.

     Como distinguir isso de uma rede legítima: 'PAGUEMENOS' também casa
     com 16 descrições, mas todas CONTÊM "Pague Menos" e geram chaves de
     18 chars diferentes entre si. O caso patológico é outro: todas as
     descrições produzem a MESMA chave de 18 caracteres e mesmo assim são
     estabelecimentos distintos — prova de que a janela nunca chegou ao
     que diferencia.

     `descricoes` é a lista de descrições que a regra casou. */
  function regraEhGenerica(descricoes) {
    if (!descricoes || descricoes.length < 3) return false;
    var chaves = {}, distintas = {};
    for (var i = 0; i < descricoes.length; i++) {
      chaves[normalizar(descricoes[i])] = 1;
      distintas[descricoes[i]] = 1;
    }
    return Object.keys(chaves).length === 1 && Object.keys(distintas).length >= 3;
  }

  /* ------------------------------------------------------------------
     Estado de um lançamento — a fila de triagem sai daqui
     ------------------------------------------------------------------
     Um lançamento pode faltar categoria, faltar classificação, ou as duas.
     Medido em 06/08: 620 sem categoria, 623 sem cls, 656 na união. Quem
     usar só uma das duas contas erra. */
  function faltaCls(t) {
    var c = (t.cls || '').trim();
    return !c || c === CLS_INDEFINIDO;
  }
  function faltaCategoria(t) { return !t.categoria_id; }
  function precisaTriagem(t) { return faltaCategoria(t) || faltaCls(t); }

  function motivoTriagem(t) {
    if (faltaCategoria(t) && faltaCls(t)) return 'sem categoria e sem classificação';
    if (faltaCategoria(t)) return 'sem categoria';
    return 'sem classificação';
  }

  /* ------------------------------------------------------------------
     Somas
     ------------------------------------------------------------------ */
  function ehCustoDeVida(t) { return CUSTO_DE_VIDA.indexOf(t.cls) !== -1; }
  function ehEmpresa(t) { return EMPRESAS.indexOf(t.cls) !== -1; }
  function ehSaida(t) { return (t.tipo || 'saida') === 'saida'; }

  function somar(lista, filtro) {
    var t = 0;
    for (var i = 0; i < lista.length; i++) {
      if (!filtro || filtro(lista[i])) t += Number(lista[i].valor) || 0;
    }
    return t;
  }

  // O número-herói do Início. Só saídas de custo de vida.
  function custoDeVida(lista) {
    return somar(lista, function (t) { return ehSaida(t) && ehCustoDeVida(t); });
  }

  // A "faixa de incerteza" que aparece embaixo dele: quanto do mês ainda
  // pode virar custo de vida quando alguém triar. O app declara sua própria
  // incerteza em vez de fingir precisão (spec §1).
  function incertezaDoMes(lista) {
    return somar(lista, function (t) { return ehSaida(t) && faltaCls(t); });
  }

  // "calculado sobre 78% de julho" — a linha de honestidade da Análise.
  function percentualClassificado(lista) {
    var total = somar(lista, ehSaida);
    if (!total) return 1;
    return 1 - (incertezaDoMes(lista) / total);
  }

  /* ------------------------------------------------------------------
     Detecção de anomalias — "O que fugiu do padrão"
     ------------------------------------------------------------------
     As travas NÃO são detalhe de ajuste fino: sem elas o card dispara por
     variação de R$ 30 todo mês, vira alarme permanente e passa a ser
     ignorado — que é o mesmo que não existir. */
  var TRAVAS = {
    grupoRazao: 2,          // >= 2x a média dos 3 meses anteriores
    grupoMinimo: 200,       // ...e só se o mês passar de R$ 200
    parcelaMinima: 500,     // soma de parcelas futuras
    assinaturaOcorrencias: 2,
    assinaturaTolerancia: 0.15,  // ±15% no valor
    assinaturaMinima: 10         // abaixo disso não vale interromper ninguém
  };

  /* Vale para os dois detectores de assinatura. Escrita como função porque a
     primeira versão trazia `med === 0 ||` embutido para evitar divisão por
     zero — e com isso fazia todo valor ZERO passar como "dentro da
     tolerância". O card chegou a anunciar uma assinatura de R$ 0,00.
     Guarda contra divisão virou porta de entrada. */
  function valoresConstantes(vals) {
    if (!vals.length) return false;
    var med = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    if (!(med >= TRAVAS.assinaturaMinima)) return false;
    return vals.every(function (v) {
      return Math.abs(v - med) / med <= TRAVAS.assinaturaTolerancia;
    });
  }
  function media(vals) {
    return vals.reduce(function (a, b) { return a + b; }, 0) / (vals.length || 1);
  }

  function porMes(lista) {
    var m = {};
    for (var i = 0; i < lista.length; i++) {
      var k = ym(lista[i].data);
      (m[k] = m[k] || []).push(lista[i]);
    }
    return m;
  }

  // Só despesa da família entra em anomalia. Empresa e movimentação têm
  // ritmo próprio e disparariam alarme sem significado.
  function despesaFamiliar(t) { return ehSaida(t) && ehCustoDeVida(t); }

  function gruposAcimaDoNormal(txMes, txAnteriores, grupoDe) {
    var atual = {}, hist = {}, meses = {};
    txMes.filter(despesaFamiliar).forEach(function (t) {
      var g = grupoDe(t); if (!g) return;
      atual[g] = (atual[g] || 0) + (Number(t.valor) || 0);
    });
    txAnteriores.filter(despesaFamiliar).forEach(function (t) {
      var g = grupoDe(t); if (!g) return;
      hist[g] = (hist[g] || 0) + (Number(t.valor) || 0);
      (meses[g] = meses[g] || {})[ym(t.data)] = 1;
    });
    var fora = [];
    Object.keys(atual).forEach(function (g) {
      var nMeses = meses[g] ? Object.keys(meses[g]).length : 0;
      if (!nMeses) return;                       // sem histórico não há "normal"
      var media = hist[g] / nMeses;
      if (atual[g] < TRAVAS.grupoMinimo) return;
      if (atual[g] < TRAVAS.grupoRazao * media) return;
      fora.push({ grupo: g, valor: atual[g], media: media, razao: atual[g] / media });
    });
    return fora.sort(function (a, b) { return b.valor - a.valor; });
  }

  // Cada parcela cai no mês da sua fatura (competência). `parcela` é 'pp/tt';
  // o que ainda vai pesar nos próximos meses é valor × (tt − pp).
  function parcelasAVencer(txMes) {
    var total = 0, itens = [];
    txMes.filter(despesaFamiliar).forEach(function (t) {
      var p = /^(\d+)\/(\d+)$/.exec(String(t.parcela || ''));
      if (!p) return;
      var pp = Number(p[1]), tt = Number(p[2]);
      if (!(pp < tt)) return;
      var futuro = (Number(t.valor) || 0) * (tt - pp);
      total += futuro;
      itens.push({ descricao: t.descricao, parcela: t.parcela, futuro: futuro });
    });
    itens.sort(function (a, b) { return b.futuro - a.futuro; });
    return { total: total, itens: itens, alerta: total >= TRAVAS.parcelaMinima };
  }

  /* Assinaturas são CALCULADAS, não tabeladas (spec §6): uma tabela exigiria
     manutenção manual a cada mudança de preço, e ninguém faz isso.

     Recorrente = mesma descrição normalizada em >= 3 dos últimos 4 meses,
     com valor dentro de ±15%.

     "Assinatura nova" usa um critério mais frouxo de propósito — uma cobrança
     que acabou de começar não teria como estar em 3 dos 4 meses. Ela precisa
     aparecer em 2 meses seguidos (a trava anti-ruído: uma compra avulsa
     repetida por acaso não conta) e não existir antes disso. */
  function assinaturas(tx, mesRef, janela) {
    var n = janela || 4;
    var meses = mesesAnteriores(mesRef, n);
    var porChave = {};
    tx.filter(despesaFamiliar).forEach(function (t) {
      if (ehParcelada(t)) return;   // parcela não é assinatura (ver abaixo)
      if (meses.indexOf(ym(t.data)) === -1) return;
      var k = normalizar(t.descricao);
      if (!k) return;
      (porChave[k] = porChave[k] || []).push(t);
    });
    var achadas = [];
    Object.keys(porChave).forEach(function (k) {
      var itens = porChave[k];
      var m = {};
      itens.forEach(function (t) { m[ym(t.data)] = 1; });
      if (Object.keys(m).length < 3) return;
      var vals = itens.map(function (t) { return Number(t.valor) || 0; });
      if (!valoresConstantes(vals)) return;
      achadas.push({ chave: k, descricao: itens[0].descricao, valor: media(vals),
                     meses: Object.keys(m).length });
    });
    return achadas.sort(function (a, b) { return b.valor - a.valor; });
  }

  // Uma COMPRA PARCELADA aparece em meses seguidos por construção — é a
  // mesma compra fatiada, não uma cobrança que se repete. Confundir as duas
  // enche o card de falso positivo, que é o mesmo que desligá-lo.
  function ehParcelada(t) { return /^\d+\/\d+$/.test(String(t.parcela || '')); }

  function assinaturasNovas(tx, mesRef) {
    var recentes = mesesAnteriores(mesRef, TRAVAS.assinaturaOcorrencias);
    var limite = recentes[recentes.length - 1];
    var vistas = {}, antes = {};
    tx.filter(despesaFamiliar).forEach(function (t) {
      if (ehParcelada(t)) return;
      var k = normalizar(t.descricao);
      if (!k) return;
      if (recentes.indexOf(ym(t.data)) !== -1) (vistas[k] = vistas[k] || []).push(t);
      else if (ym(t.data) < limite) antes[k] = 1;
    });
    var novas = [];
    Object.keys(vistas).forEach(function (k) {
      if (antes[k]) return;                                  // já existia: não é nova
      var itens = vistas[k], m = {};
      itens.forEach(function (t) { m[ym(t.data)] = (m[ym(t.data)] || 0) + 1; });
      var meses = Object.keys(m);
      if (meses.length < TRAVAS.assinaturaOcorrencias) return;

      // Assinatura cobra UMA vez por mês. Duas compras no mesmo mês é
      // frequência de restaurante, não de mensalidade.
      if (meses.some(function (mm) { return m[mm] > 1; })) return;

      // E cobra o MESMO valor. Sem isto, "restaurante em dois meses
      // seguidos" vira assinatura — foi o que aconteceu na primeira versão.
      var vals = itens.map(function (t) { return Number(t.valor) || 0; });
      if (!valoresConstantes(vals)) return;

      novas.push({ descricao: itens[0].descricao, valor: media(vals) });
    });
    return novas.sort(function (a, b) { return b.valor - a.valor; });
  }

  /* ------------------------------------------------------------------
     Datas
     ------------------------------------------------------------------ */
  var MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                   'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function ym(data) { return String(data || '').slice(0, 7); }
  function rotuloMes(ym_) {
    if (!ym_) return '';
    var p = ym_.split('-');
    return MES_CURTO[Number(p[1]) - 1] + '/' + p[0].slice(2);
  }

  // Os n meses ANTERIORES a `mesRef`, do mais recente para o mais antigo.
  function mesesAnteriores(mesRef, n) {
    var p = String(mesRef).split('-');
    var ano = Number(p[0]), mes = Number(p[1]);
    var fora = [];
    for (var i = 1; i <= n; i++) {
      var m = mes - i, a = ano;
      while (m <= 0) { m += 12; a -= 1; }
      fora.push(a + '-' + (m < 10 ? '0' : '') + m);
    }
    return fora;
  }

  // Meses que têm lançamento, do mais recente para o mais antigo.
  function mesesComDado(tx) {
    var m = {};
    tx.forEach(function (t) { if (t.data) m[ym(t.data)] = 1; });
    return Object.keys(m).sort().reverse();
  }

  global.M = {
    CLS: CLS, ROTULO_CLS: ROTULO_CLS, COR_CLS: COR_CLS,
    CUSTO_DE_VIDA: CUSTO_DE_VIDA, EMPRESAS: EMPRESAS,
    CLS_INDEFINIDO: CLS_INDEFINIDO, CLS_NAO_CONTA: CLS_NAO_CONTA,
    GRUPOS_DESPESA: GRUPOS_DESPESA,
    GRUPO_RECEITAS: GRUPO_RECEITAS, GRUPO_MOVIMENTACAO: GRUPO_MOVIMENTACAO,
    COR_GRUPO: COR_GRUPO, TIER: TIER,
    rotulo: function (cls) { return ROTULO_CLS[cls] || cls || '—'; },
    cor: function (cls) { return COR_CLS[cls] || '#9aa3b2'; },
    normalizar: normalizar, normalizarSemDobra: normalizarSemDobra,
    regraQueCasa: regraQueCasa,
    podeVirarRegra: podeVirarRegra, PREFIXO_MINIMO_REGRA: PREFIXO_MINIMO_REGRA,
    regraEhGenerica: regraEhGenerica,
    faltaCls: faltaCls, faltaCategoria: faltaCategoria,
    precisaTriagem: precisaTriagem, motivoTriagem: motivoTriagem,
    ehCustoDeVida: ehCustoDeVida, ehEmpresa: ehEmpresa, ehSaida: ehSaida,
    somar: somar, custoDeVida: custoDeVida, incertezaDoMes: incertezaDoMes,
    percentualClassificado: percentualClassificado,
    ym: ym, rotuloMes: rotuloMes,
    mesesAnteriores: mesesAnteriores, mesesComDado: mesesComDado, porMes: porMes,
    TRAVAS: TRAVAS, despesaFamiliar: despesaFamiliar,
    gruposAcimaDoNormal: gruposAcimaDoNormal, parcelasAVencer: parcelasAVencer,
    assinaturas: assinaturas, assinaturasNovas: assinaturasNovas
  };
})(window);
