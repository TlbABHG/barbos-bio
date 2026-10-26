/* Barbos Analytic · suivi de bankroll
   Logique partagée entre la page publique (/bankroll/) et l'admin (/bankroll/admin/).
   Tout le texte venant des paris passe par textContent, jamais par innerHTML. */
(function () {
  'use strict';

  var RESULTS = {
    pending: { label: 'En attente', icon: '•' },
    won: { label: 'Gagné', icon: '✓' },
    lost: { label: 'Perdu', icon: '✕' },
    void: { label: 'Remboursé', icon: '↺' }
  };
  var MINUS = '−', NBSP = ' ';
  var nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nfMax2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  var dfDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  var dfMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

  /* ---------- Données ---------- */

  function num(v) { return typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')) || 0; }
  function round2(v) { return Math.round(v * 100) / 100; }

  function normalize(data) {
    data = data && typeof data === 'object' ? data : {};
    var settings = data.settings || {};
    return {
      settings: {
        startBankroll: settings.startBankroll == null ? 100 : num(settings.startBankroll),
        unit: settings.unit || '€',
        updatedAt: settings.updatedAt || null
      },
      bets: (Array.isArray(data.bets) ? data.bets : []).filter(function (b) {
        return b && /^\d{4}-\d{2}-\d{2}$/.test(b.date);
      })
    };
  }

  function profit(bet) {
    if (bet.result === 'won') return round2(num(bet.stake) * (num(bet.odds) - 1));
    if (bet.result === 'lost') return -num(bet.stake);
    return 0;
  }

  // Le ROI, la réussite et la cote moyenne ne comptent que les paris gagnés ou perdus.
  function stats(bets) {
    var s = { count: bets.length, won: 0, lost: 0, void: 0, pending: 0, staked: 0, profit: 0 };
    var oddsSum = 0;
    bets.forEach(function (b) {
      if (b.result === 'won') s.won++;
      else if (b.result === 'lost') s.lost++;
      else { if (b.result === 'void') s.void++; else s.pending++; return; }
      s.staked += num(b.stake);
      s.profit += profit(b);
      oddsSum += num(b.odds);
    });
    var decided = s.won + s.lost;
    s.staked = round2(s.staked);
    s.profit = round2(s.profit);
    s.roi = s.staked > 0 ? s.profit / s.staked * 100 : null;
    s.hitRate = decided ? s.won / decided * 100 : null;
    s.avgOdds = decided ? oddsSum / decided : null;
    return s;
  }

  // Ordre chronologique ; à date égale, l'ordre d'ajout.
  function chrono(bets) {
    return bets.map(function (b, i) { return { b: b, i: i }; })
      .sort(function (x, y) { return x.b.date < y.b.date ? -1 : x.b.date > y.b.date ? 1 : x.i - y.i; })
      .map(function (x) { return x.b; });
  }

  function tournamentOf(bet) { return (bet.tournament || '').trim() || 'Sans tournoi'; }
  function monthOf(bet) { return bet.date.slice(0, 7); }

  function groupBy(bets, keyOf) {
    var groups = new Map();
    chrono(bets).forEach(function (b) {
      var k = keyOf(b);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(b);
    });
    return groups;
  }

  /* ---------- Format ---------- */

  function sign(v) { return v > 0.004 ? '+' : v < -0.004 ? MINUS : ''; }
  function signed(v, unit) { return sign(v) + nf2.format(Math.abs(v)) + (unit ? NBSP + unit : ''); }
  function money(v, unit) { return (v < 0 ? MINUS : '') + nfMax2.format(Math.abs(v)) + NBSP + unit; }
  function percent(v, withSign) {
    if (v == null) return '—';
    return (withSign ? sign(v) : '') + nf1.format(Math.abs(v)) + NBSP + '%';
  }
  function odds(v) { return nf2.format(num(v)); }
  function tone(v) { return v == null ? '' : v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : ''; }

  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2] || 1); }
  function dateLabel(s) { return dfDay.format(parseDate(s)); }
  function monthLabel(key) {
    var t = dfMonth.format(parseDate(key + '-01'));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function rangeLabel(first, last) {
    return first === last ? dateLabel(first) : dateLabel(first) + ' – ' + dateLabel(last);
  }
  function plural(n, word) { return n + ' ' + word + (n > 1 ? 's' : ''); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- DOM ---------- */

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    setAttrs(n, attrs);
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    setAttrs(n, attrs);
    return n;
  }
  function setAttrs(n, attrs) {
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
  }
  function fill(node, children) {
    node.replaceChildren.apply(node, children.filter(function (c) { return c != null && c !== false; }));
  }

  function pill(result) {
    var r = RESULTS[result] || RESULTS.pending;
    return el('span', { class: 'pill pill-' + (RESULTS[result] ? result : 'pending') }, [
      el('i', { 'aria-hidden': 'true', text: r.icon }), r.label
    ]);
  }

  function hero(label, s, unit, sub) {
    return el('section', { class: 'card hero' }, [
      el('div', { class: 'hero-label', text: label }),
      el('div', { class: 'hero-value ' + tone(s.profit), text: signed(s.profit, unit) }),
      sub ? el('div', { class: 'hero-sub', text: sub }) : null
    ]);
  }

  // extra : tuiles ajoutées en tête, au format [libellé, valeur, classe, note].
  function statTiles(s, unit, extra) {
    var tiles = (extra || []).concat([
      ['ROI', percent(s.roi, true), tone(s.roi)],
      ['Réussite', percent(s.hitRate)],
      ['Gagnés · Perdus', s.won + ' · ' + s.lost, null, s.void ? plural(s.void, 'remboursé') : null],
      ['Cote moyenne', s.avgOdds == null ? '—' : odds(s.avgOdds)],
      ['Total misé', money(s.staked, unit)]
    ]);
    return el('div', { class: 'stats' }, tiles.map(function (t) {
      return el('div', { class: 'stat' }, [
        el('span', { text: t[0] }),
        el('b', { class: t[2] || null, text: t[1] }),
        t[3] ? el('small', { text: t[3] }) : null
      ]);
    }));
  }

  function betRow(bet, unit, opts) {
    var p = profit(bet);
    var meta = [dateLabel(bet.date)];
    if (opts.showTournament !== false) meta.push(tournamentOf(bet));
    meta.push('mise' + NBSP + money(num(bet.stake), unit));
    return el('li', { class: 'bet' }, [
      el('div', { class: 'bet-main' }, [
        el('div', { class: 'bet-top' }, [el('span', { class: 'bet-match', text: bet.match || '—' }), pill(bet.result)]),
        el('div', { class: 'bet-pick' }, [bet.pick || '', el('span', { class: 'bet-odds', text: ' @ ' + odds(bet.odds) })]),
        el('div', { class: 'bet-meta', text: meta.join(' · ') })
      ]),
      el('div', {
        class: 'bet-profit ' + (bet.result === 'pending' ? 'muted' : tone(p)),
        text: bet.result === 'pending' ? 'en cours' : signed(p, unit)
      }),
      opts.actions ? opts.actions(bet) : null
    ]);
  }

  // Liste du plus récent au plus ancien, affichée par pages.
  function betList(bets, unit, opts) {
    opts = opts || {};
    var list = chrono(bets).reverse(), limit = opts.limit || 25, shown = 0;
    if (!list.length) return el('p', { class: 'empty', text: opts.emptyText || 'Aucun pari pour l’instant.' });
    var ul = el('ul', { class: 'bets' });
    var more = el('button', { class: 'more', type: 'button', onclick: page });
    function page() {
      list.slice(shown, shown + limit).forEach(function (b) { ul.appendChild(betRow(b, unit, opts)); });
      shown = Math.min(list.length, shown + limit);
      var left = list.length - shown;
      more.textContent = 'Afficher ' + plural(Math.min(left, limit), 'pari') + ' de plus';
      more.hidden = left <= 0;
    }
    page();
    return el('div', { class: 'bet-list' }, [ul, more]);
  }

  function groupList(groups, opts) {
    var rows = Array.from(groups.entries()).map(function (e) {
      return { key: e[0], bets: e[1], first: e[1][0].date, last: e[1][e[1].length - 1].date };
    });
    rows.sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
    return el('ul', { class: 'groups' }, rows.map(function (r) {
      var s = stats(r.bets);
      var meta = plural(s.count, 'pari') + ' · ' + plural(s.won, 'gagné') + ' · ' + plural(s.lost, 'perdu');
      if (s.pending) meta += ' · ' + s.pending + ' en cours';
      return el('li', null, [
        el('a', { class: 'group', href: opts.href(r.key) }, [
          el('div', { class: 'group-main' }, [
            el('span', { class: 'group-name', text: opts.label(r.key) }),
            opts.range ? el('span', { class: 'group-meta', text: rangeLabel(r.first, r.last) }) : null,
            el('span', { class: 'group-meta', text: meta })
          ]),
          el('div', { class: 'group-side' }, [
            el('span', { class: 'group-profit ' + tone(s.profit), text: signed(s.profit, opts.unit) }),
            el('span', { class: 'group-roi', text: 'ROI ' + percent(s.roi, true) })
          ])
        ])
      ]);
    }));
  }

  /* ---------- Graphique : profit cumulé ---------- */

  function niceTicks(min, max, count) {
    if (max - min < 1e-9) { min -= 1; max += 1; }
    var raw = (max - min) / count, step = Math.pow(10, Math.floor(Math.log10(raw))), err = raw / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [];
    for (var v = Math.floor(min / step); v <= Math.ceil(max / step); v++) out.push(round2(v * step));
    return out;
  }

  function profitChart(bets, unit) {
    var settled = chrono(bets).filter(function (b) { return b.result === 'won' || b.result === 'lost'; });
    var wrap = el('div', { class: 'chart' });
    if (settled.length < 2) {
      wrap.appendChild(el('p', { class: 'empty', text: 'La courbe apparaîtra après les premiers résultats.' }));
      return wrap;
    }
    var pts = [{ cum: 0, bet: null }], total = 0;
    settled.forEach(function (b) { total = round2(total + profit(b)); pts.push({ cum: total, bet: b }); });
    var holder = el('div', { class: 'chart-svg' });
    var tip = el('div', { class: 'chart-tip', 'aria-hidden': 'true' });
    wrap.appendChild(holder);
    wrap.appendChild(tip);

    var H = 220, lastW = 0;
    function draw() {
      var W = holder.clientWidth;
      if (!W || W === lastW) return;
      lastW = W;
      var n = pts.length - 1, endText = signed(total, unit);
      var pad = { t: 14, r: Math.max(56, endText.length * 7 + 16), b: 26, l: 42 };
      var vals = pts.map(function (p) { return p.cum; });
      var ticks = niceTicks(Math.min(0, Math.min.apply(null, vals)), Math.max(0, Math.max.apply(null, vals)), 4);
      var lo = ticks[0], hi = ticks[ticks.length - 1];
      var pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
      var tickFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: ticks[1] - ticks[0] < 1 ? 1 : 0 });
      function x(i) { return pad.l + pw * i / n; }
      function y(v) { return pad.t + ph * (1 - (v - lo) / (hi - lo)); }
      function text(attrs, content) { var t = svg('text', attrs); t.textContent = content; return t; }

      var root = svg('svg', {
        viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: '0',
        'aria-label': 'Profit cumulé : ' + endText + ' après ' + plural(n, 'pari') + ' terminés. Flèches gauche et droite pour parcourir.'
      });
      var grid = svg('g', { class: 'grid' });
      ticks.forEach(function (t) {
        grid.appendChild(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: t === 0 ? 'zero' : null }));
        grid.appendChild(text({ x: pad.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, sign(t) + tickFmt.format(Math.abs(t))));
      });
      root.appendChild(grid);

      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.cum).toFixed(1); }).join('');
      root.appendChild(svg('path', { class: 'area', d: d + 'L' + x(n).toFixed(1) + ',' + y(0).toFixed(1) + 'L' + pad.l + ',' + y(0).toFixed(1) + 'Z' }));
      root.appendChild(svg('path', { class: 'line', d: d }));

      root.appendChild(text({ x: pad.l, y: H - 6 }, dateLabel(pts[1].bet.date)));
      if (pts[n].bet.date !== pts[1].bet.date) {
        root.appendChild(text({ x: W - pad.r, y: H - 6, 'text-anchor': 'end' }, dateLabel(pts[n].bet.date)));
      }
      root.appendChild(svg('circle', { class: 'dot', cx: x(n), cy: y(total), r: 4 }));
      root.appendChild(text({ class: 'end-label', x: x(n) + 10, y: y(total) + 4 }, endText));

      var cross = svg('line', { class: 'cross', y1: pad.t, y2: H - pad.b, visibility: 'hidden' });
      var focus = svg('circle', { class: 'dot', r: 5, visibility: 'hidden' });
      var hit = svg('rect', { class: 'hit', x: 0, y: 0, width: W, height: H });
      root.appendChild(cross);
      root.appendChild(focus);
      root.appendChild(hit);

      var cur = -1;
      function show(i) {
        cur = i;
        var p = pts[i], cx = x(i), cy = y(p.cum);
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
        focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.setAttribute('visibility', 'visible');
        fill(tip, [
          el('strong', { class: tone(p.cum), text: signed(p.cum, unit) }),
          el('span', { class: 't-label', text: p.bet ? 'Profit cumulé · pari n°' + i : 'Départ' }),
          p.bet ? el('span', { text: dateLabel(p.bet.date) + ' · ' + (p.bet.match || '') }) : null,
          p.bet ? el('span', { class: 't-label', text: (p.bet.pick || '') + ' @ ' + odds(p.bet.odds) }) : null,
          p.bet ? el('span', { class: 't-res' }, [pill(p.bet.result), el('b', { class: tone(profit(p.bet)), text: signed(profit(p.bet), unit) })]) : null
        ]);
        tip.classList.add('on');
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = Math.max(0, Math.min(W - tw, cx - tw / 2));
        var top = cy - th - 14 >= 0 ? cy - th - 14 : Math.min(H - th, cy + 14);
        tip.style.transform = 'translate(' + left + 'px,' + top + 'px)';
      }
      function hide() {
        cur = -1;
        tip.classList.remove('on');
        cross.setAttribute('visibility', 'hidden');
        focus.setAttribute('visibility', 'hidden');
      }
      function at(e) {
        var r = root.getBoundingClientRect();
        return Math.max(0, Math.min(n, Math.round((e.clientX - r.left - pad.l) / pw * n)));
      }
      hit.addEventListener('pointermove', function (e) { show(at(e)); });
      hit.addEventListener('pointerdown', function (e) { show(at(e)); });
      hit.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
      root.addEventListener('focus', function () { show(n); });
      root.addEventListener('blur', hide);
      root.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          show(Math.max(0, Math.min(n, (cur < 0 ? n : cur) + (e.key === 'ArrowRight' ? 1 : -1))));
        } else if (e.key === 'Escape') hide();
      });
      holder.replaceChildren(root);
      hide();
    }
    if (window.ResizeObserver) new ResizeObserver(draw).observe(holder);
    else window.addEventListener('resize', draw);
    requestAnimationFrame(draw);
    return wrap;
  }

  window.Bankroll = {
    RESULTS: RESULTS,
    normalize: normalize, profit: profit, stats: stats, chrono: chrono, round2: round2,
    tournamentOf: tournamentOf, monthOf: monthOf,
    byTournament: function (bets) { return groupBy(bets, tournamentOf); },
    byMonth: function (bets) { return groupBy(bets, monthOf); },
    signed: signed, money: money, percent: percent, odds: odds, tone: tone, plural: plural,
    dateLabel: dateLabel, monthLabel: monthLabel, rangeLabel: rangeLabel, today: today,
    el: el, fill: fill, pill: pill, hero: hero, statTiles: statTiles,
    betList: betList, groupList: groupList, profitChart: profitChart
  };
})();
