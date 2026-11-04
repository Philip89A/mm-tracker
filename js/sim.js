/**
 * Simulationsseite (Tab Rechner → Simulation): Was wäre wenn?
 * Rechnet ein Szenario aus geplanten Flügen, Hebeln und Zusätzen auf den aktuellen Stand der
 * gewählten Saison. Das Szenario liegt nur im Speicher; gespeichert wird es erst, wenn man es
 * ausdrücklich ablegt (settings.scenarios) oder als geplante Trips übernimmt.
 * Nutzt die Globals aus app.js (computeAchievedTotals, GOAL_LADDER, trips, settings, …).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = escHtml;
  const fmt = (n) => Math.round(n).toLocaleString('de-DE');
  const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

  let flights = []; // { id, route, range ('auto'|'continental'|'intercontinental'), legRanges, cls, co2, segments, count, mode }
  let upCounts = {};   // Einlösungen je vorhandener Uptrip-Kollektion (Schlüssel: Name in Kleinschreibung)
  let upCustom = [];   // eigene Einträge: { id, name, p, q, count }

  // ---------- Unterseiten im Rechner-Tab ----------
  function setRechnerPage(page) {
    $('tab-rechner').dataset.page = page;
    document.querySelectorAll('#rechner-subnav button').forEach(b => b.classList.toggle('active', b.dataset.rp === page));
    try { localStorage.setItem('mm_rechner_page', page); } catch (e) { /* ohne Speicher egal */ }
    if (page === 'sim') renderSim();
  }
  document.querySelectorAll('#rechner-subnav button').forEach(b => b.addEventListener('click', () => setRechnerPage(b.dataset.rp)));
  try { const p = localStorage.getItem('mm_rechner_page'); if (p) setRechnerPage(p); } catch (e) { /* ignorieren */ }

  // ---------- Rechnen ----------
  const isEu = (a) => a[4] === 'EU' || a[3] === 'ES'; // Kanaren zählen wie im Streckenplaner als Europa
  const legRange = (a, b) => (AIRPORTS[a] && AIRPORTS[b] && isEu(AIRPORTS[a]) && isEu(AIRPORTS[b])) ? 'continental' : 'intercontinental';
  const routeLegs = (route) => {
    const c = parseRoute(route).known;
    const legs = [];
    for (let i = 0; i < c.length - 1; i++) if (c[i] !== c[i + 1]) legs.push([c[i], c[i + 1]]);
    return legs;
  };

  function flightPoints(f) {
    const perRep = f.range === 'auto'
      ? f.legRanges.reduce((s, r) => s + segmentPointsWithCo2(r, f.cls, f.co2), 0)
      : segmentPointsWithCo2(f.range, f.cls, f.co2) * f.segments;
    const p = perRep * f.count;
    return { p, q: f.mode === 'pointsOnly' ? 0 : p };
  }
  const flightSegments = (f) => (f.range === 'auto' ? f.legRanges.length : f.segments) * f.count;

  // Uptrip: Kollektionen aus dem Tab Sammeln (Prämie je Einlösung) plus eigene Einträge im Szenario.
  const upKey = (u) => String(u.name || '').trim().toLowerCase();
  const upRemaining = (u) => Math.max(0, (u.maxRedemptions || 1) - (u.redemptionCount || 0));
  function uptripEffect() {
    let p = 0, q = 0, m = 0, n = 0;
    const others = [];
    uptripItems.forEach(u => {
      const c = Math.min(upCounts[upKey(u)] || 0, upRemaining(u));
      p += (u.rewardPoints || 0) * c; q += (u.rewardQP || 0) * c; m += (u.rewardMeilen || 0) * c; n += c;
      if (c && u.rewardOther) others.push(`${c}× ${u.name}: ${u.rewardOther}`);
    });
    upCustom.forEach(c => { p += c.p * c.count; q += c.q * c.count; n += c.count; });
    return { p, q, m, n, others };
  }

  function simulate() {
    const year = seasonYear();
    const ach = computeAchievedTotals(year);
    const planned = $('sim-planned').checked ? computePlannedDelta(year) : { p: 0, q: 0 };
    const base = { p: ach.p + planned.p, q: ach.q + planned.q };
    const fl = flights.reduce((s, f) => { const x = flightPoints(f); return { p: s.p + x.p, q: s.q + x.q }; }, { p: 0, q: 0 });
    const extra = { p: parseInt($('sim-extra-p').value) || 0, q: parseInt($('sim-extra-q').value) || 0 };
    const ccMiles = parseInt($('sim-cc').value) || 0;
    const cc = Math.floor(ccMiles / 250);
    const up = uptripEffect();
    let p = base.p + fl.p + extra.p + up.p + cc, q = base.q + fl.q + extra.q + up.q + cc;
    // Der 800-QP-Tausch braucht schon 800 QP — diese darf der Kreditkarten-Tausch mit herstellen.
    const swapWanted = $('sim-lever800').checked;
    const swapUsed = leverSwapUsed(year);
    const swapOk = swapWanted && !swapUsed && q >= 800;
    if (swapOk) { p += 125; q += 125; }
    // Meilen-Pool: Uptrip-Prämien kommen dazu, getauschte Meilen gehen ab (beim 800-QP-Tausch maximal 20.000).
    const swapMiles = swapOk ? 20000 : 0;
    const miles = { base: ach.m, up: up.m, out: ccMiles + swapMiles, total: ach.m + up.m - ccMiles - swapMiles };
    return { year, base, fl, extra, up, cc, ccMiles, swapWanted, swapUsed, swapOk, miles, total: { p, q } };
  }

  // ---------- Darstellung ----------
  function renderFlightList() {
    $('sim-flights').innerHTML = flights.length ? flights.map(f => {
      const x = flightPoints(f);
      const desc = f.range === 'auto'
        ? `${esc(f.route)} · ${f.legRanges.length} Segment${f.legRanges.length === 1 ? '' : 'e'}`
        : `${f.route ? esc(f.route) + ' · ' : ''}${f.segments} Segment${f.segments === 1 ? '' : 'e'} ${f.range === 'continental' ? 'kontinental' : 'interkontinental'}`;
      return `<div class="sim-row"><div><b>${f.count > 1 ? f.count + '× ' : ''}${desc}</b>
        <div class="meta" style="font-size:12px; color:var(--muted);">${labelClass(f.cls)}${f.co2 > 0 ? ' · CO₂ +' + f.co2 + '%' : ''}${f.mode === 'pointsOnly' ? ' · Partner (nur Points)' : ''}</div></div>
        <div style="text-align:right; white-space:nowrap;"><b>+${fmt(x.p)} P${x.q ? ' / +' + fmt(x.q) + ' QP' : ''}</b><br>
        <button class="del" onclick="simRemoveFlight('${f.id}')">entfernen</button></div></div>`;
    }).join('') : '<div class="hint" style="margin:4px 0 0;">Noch keine Flüge im Szenario.</div>';
  }

  // ---------- Flugbedarf: wie viele weitere Segmente bis zum Ziel, je Variante ----------
  const DEFAULT_VARIANTS = [
    { id: 'd1', name: 'Nur Economy', range: 'continental', biz: 0, co2: 0 },
    { id: 'd2', name: 'Nur Economy + CO₂-Kompensation', range: 'continental', biz: 0, co2: 80 },
    { id: 'd3', name: '25 % Business, Rest Economy (mit CO₂)', range: 'continental', biz: 25, co2: 80 },
    { id: 'd4', name: '50 % Business, Rest Economy (mit CO₂)', range: 'continental', biz: 50, co2: 80 },
    { id: 'd5', name: 'Nur Business (mit CO₂)', range: 'continental', biz: 100, co2: 80 },
    { id: 'd6', name: 'Interkontinental Economy (mit CO₂)', range: 'intercontinental', biz: 0, co2: 80 },
    { id: 'd7', name: 'Interkontinental Business (mit CO₂)', range: 'intercontinental', biz: 100, co2: 80 }
  ];
  const allVariants = () => [...DEFAULT_VARIANTS, ...(settings.simVariants || [])];
  const variantAvg = (v) => {
    const s = v.biz / 100;
    return (1 - s) * segmentPointsWithCo2(v.range, 'economy', v.co2) + s * segmentPointsWithCo2(v.range, 'business', v.co2);
  };

  function renderNeed() {
    const el = $('sim-need');
    if (!el) return;
    const r = simulate();
    const open = GOAL_LADDER.filter(g => !g.reached(r.total));
    if (!open.length) { el.innerHTML = '<div class="empty">🎉 Mit diesem Szenario sind alle Ziele der Saison erreicht — es sind keine weiteren Flüge nötig.</div>'; renderCustomVariants(); return; }
    const short = (g) => Math.max(g.pTarget ? Math.max(0, g.pTarget - r.total.p) : 0, Math.max(0, g.qTarget - r.total.q));
    const now = new Date();
    const monthsLeft = String(r.year) === String(now.getFullYear()) ? Math.max(0.5, (new Date(now.getFullYear(), 11, 31) - now) / 86400000 / 30.4) : 0;
    const head = open.map((g, i) => `<th>${i === 0 ? '🎯 ' : ''}${esc(g.shortLabel)}<div style="font-weight:400; font-size:11px; color:var(--muted);">noch ${fmt(short(g))} ${g.pTarget && r.total.p / g.pTarget <= r.total.q / g.qTarget ? 'P' : 'QP'}</div></th>`).join('');
    const body = allVariants().map(v => {
      const avg = variantAvg(v);
      const cells = open.map(g => {
        const n = Math.ceil(short(g) / avg);
        return `<td><b>${n}</b><div style="font-size:11px; color:var(--muted);">≈ ${Math.ceil(n / 2)}× H+R${monthsLeft ? `<br>${(n / monthsLeft).toLocaleString("de-DE", { maximumFractionDigits: 1 })}/Mon.` : ""}</div></td>`;
      }).join('');
      return `<tr><td>${esc(v.name)}<div style="font-size:11px; color:var(--muted);">Ø ${avg.toLocaleString('de-DE', { maximumFractionDigits: 1 })} P/QP je Segment</div></td>${cells}</tr>`;
    }).join('');
    el.innerHTML = `<div style="overflow-x:auto;"><table class="sim-res-table sim-need-table"><thead><tr><th>Variante</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="hint" style="margin:6px 0 0;">Segmente = noch zu fliegende Teilstrecken, H+R = Hin- und Rückflug. ${monthsLeft ? `„/Mon.“ rechnet mit den ${monthsLeft.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Monaten bis Jahresende. ` : ''}Die Zahlen gelten für Lufthansa-Group-Flüge (Points = QP).</p>`;
    renderCustomVariants();
  }

  function renderCustomVariants() {
    const list = settings.simVariants || [];
    $('sv-custom').innerHTML = list.map(v => `<div class="sim-row"><div><b>${esc(v.name)}</b><div class="meta" style="font-size:12px; color:var(--muted);">${v.range === 'continental' ? 'Kontinental' : 'Interkontinental'} · ${v.biz} % Business · CO₂ ${v.co2 > 0 ? '+' + v.co2 + ' %' : 'nein'}</div></div>
      <div><button class="del" onclick="simRemoveVariant('${v.id}')">entfernen</button></div></div>`).join('');
  }
  $('sv-add').addEventListener('click', async () => {
    const biz = Math.min(100, Math.max(0, parseInt($('sv-biz').value) || 0));
    const range = $('sv-range').value, co2 = parseInt($('sv-co2').value) || 0;
    const name = $('sv-name').value.trim() || `${biz} % Business${range === 'intercontinental' ? ' (interkont.)' : ''}${co2 ? ' mit CO₂' : ''}`;
    settings.simVariants = [...(settings.simVariants || []), { id: genId(), name, range, biz, co2 }];
    await saveSettings();
    $('sv-name').value = '';
    renderSim();
  });
  window.simRemoveVariant = async (id) => {
    settings.simVariants = (settings.simVariants || []).filter(v => v.id !== id);
    await saveSettings();
    renderSim();
  };

  function renderUptripList() {
    const rewardText = (u) => [u.rewardPoints ? `${u.rewardPoints} P` : '', u.rewardQP ? `${u.rewardQP} QP` : '', u.rewardMeilen ? `${fmt(u.rewardMeilen)} Meilen` : ''].filter(Boolean).join(' · ') || 'keine Prämie hinterlegt';
    const rows = uptripItems.map(u => {
      const key = esc(upKey(u)), rem = upRemaining(u), c = Math.min(upCounts[upKey(u)] || 0, rem);
      const hasPQ = (u.rewardPoints || 0) + (u.rewardQP || 0) + (u.rewardMeilen || 0) > 0 || !!u.rewardOther;
      const needed = u.needed || 1, have = Math.min(u.have || 0, needed);
      const after = (u.have || 0) - needed * c;  // Kartenstand nach den simulierten Einlösungen (negativ = Karten fehlen)
      const status = rem === 0 ? 'Limit erreicht' : `${have}/${needed} Karten · noch ${rem} Einlösung${rem === 1 ? '' : 'en'} möglich${have < needed ? ' (Karten fehlen noch)' : ''}`
        + (c > 0 ? ` · danach ${after >= 0 ? after + ' Karten übrig' : -after + ' Karte(n) noch zu sammeln'}` : '');
      return `<div class="sim-row"><div><b>${esc(u.name)}</b><div class="meta" style="font-size:12px; color:var(--muted);">${esc(rewardText(u))} je Einlösung · ${status}</div></div>
        <div style="white-space:nowrap; text-align:right;">
          <button type="button" class="btn small secondary" data-k="${key}" onclick="simUptrip(this.dataset.k, -1)" ${c <= 0 ? 'disabled' : ''}>−</button>
          <b style="display:inline-block; min-width:22px; text-align:center;">${c}</b>
          <button type="button" class="btn small secondary" data-k="${key}" onclick="simUptrip(this.dataset.k, 1)" ${rem === 0 || !hasPQ || c >= rem ? 'disabled' : ''}>+</button></div></div>`;
    });
    $('sim-uptrip').innerHTML = rows.length ? rows.join('') : '<div class="hint" style="margin:4px 0 0;">Noch keine Kollektionen im Tab Sammeln angelegt — unten kannst du eine eigene Einlösung ansetzen.</div>';
    $('sim-up-custom').innerHTML = upCustom.map(c => `<div class="sim-row"><div><b>${c.count > 1 ? c.count + '× ' : ''}${esc(c.name)}</b></div>
      <div style="white-space:nowrap; text-align:right;"><b>+${fmt(c.p * c.count)} P / +${fmt(c.q * c.count)} QP</b><br><button class="del" onclick="simRemoveUptrip('${c.id}')">entfernen</button></div></div>`).join('');
  }
  window.simUptrip = (key, d) => {
    const u = uptripItems.find(x => upKey(x) === key);
    if (!u) return;
    upCounts[key] = Math.max(0, Math.min(upRemaining(u), (upCounts[key] || 0) + d));
    renderSim();
  };
  window.simRemoveUptrip = (id) => { upCustom = upCustom.filter(c => c.id !== id); renderSim(); };

  function renderResult() {
    const r = simulate();
    const rows = [['Points', r.base.p, r.total.p - r.base.p, r.total.p], ['QP', r.base.q, r.total.q - r.base.q, r.total.q]];
    if (r.miles.up || r.miles.out) rows.push(['Meilen (Pool)', r.miles.base, r.miles.total - r.miles.base, r.miles.total]);
    let html = `<table class="sim-res-table"><thead><tr><th></th><th>Stand ${r.year}${$('sim-planned').checked ? ' (inkl. geplant)' : ''}</th><th>Szenario</th><th>Ergebnis</th></tr></thead><tbody>` +
      rows.map(([l, b, d, t]) => `<tr><td><b>${l}</b></td><td>${fmt(b)}</td><td>${d ? sgn(d) : '–'}</td><td><b>${fmt(t)}</b></td></tr>`).join('') + '</tbody></table>';

    const parts = [];
    if (r.fl.p || r.fl.q) parts.push(`Flüge: +${fmt(r.fl.p)} P / +${fmt(r.fl.q)} QP (${fmt(flights.reduce((s, f) => s + flightSegments(f), 0))} Segmente)`);
    if (r.up.n) parts.push(`Uptrip: +${fmt(r.up.p)} P / +${fmt(r.up.q)} QP${r.up.m ? ' / +' + fmt(r.up.m) + ' Meilen' : ''} (${r.up.n} Einlösung${r.up.n === 1 ? '' : 'en'})`);
    r.up.others.forEach(o => parts.push(`Uptrip-Prämie (nicht in Zahlen): ${esc(o)}`));
    if (r.miles.out) parts.push(`Meilen-Abgang durch Tausch: −${fmt(r.miles.out)}`);
    if (r.cc) parts.push(`Kreditkarten-Tausch (${fmt(r.ccMiles)} Meilen): +${fmt(r.cc)} P / +${fmt(r.cc)} QP`);
    if (r.extra.p || r.extra.q) parts.push(`Zusätze: +${fmt(r.extra.p)} P / +${fmt(r.extra.q)} QP`);
    if (r.swapWanted) parts.push(r.swapUsed ? '800-QP-Tausch: in dieser Saison schon genutzt (steckt im Stand)' : r.swapOk ? '800-QP-Tausch: +125 P / +125 QP' : `800-QP-Tausch: im Szenario erst ${fmt(r.total.q)} QP — erst ab 800 QP möglich`);
    if (parts.length) html += `<div class="hint" style="margin:8px 0 0;">${parts.join('<br>')}</div>`;

    html += GOAL_LADDER.map(g => {
      const before = g.reached(r.base), after = g.reached(r.total);
      const pRem = g.pTarget ? Math.max(0, g.pTarget - r.total.p) : 0, qRem = Math.max(0, g.qTarget - r.total.q);
      const status = after
        ? `✅ erreicht${before ? ' (schon ohne Szenario)' : ' — durch das Szenario'}`
        : `noch ${[pRem ? fmt(pRem) + ' P' : '', qRem ? fmt(qRem) + ' QP' : ''].filter(Boolean).join(' / ')}`;
      const pctBase = g.pct(r.base), pctSim = g.pct(r.total);
      return `<div class="sim-goal">
        <div class="flex-between"><b style="color:var(--navy);">${esc(g.shortLabel)} '${esc(String(g.year()).slice(-2))}</b><span style="font-size:12.5px;">${status}</span></div>
        <div class="bar-bg"><div class="bar-fill q planned" style="width:${pctSim}%"></div><div class="bar-fill q" style="width:${pctBase}%"></div></div>
        <div class="hint" style="margin:3px 0 0;">${esc(g.valueText(r.total))}</div>
      </div>`;
    }).join('');
    $('sim-result').innerHTML = html;
  }

  function syncCcSlider() {
    const year = seasonYear();
    const max = maxRedeemableCcMiles(ccMilesBalance, leverUsedCcMiles(year));
    const s = $('sim-cc');
    s.max = max; s.disabled = max === 0;
    if (+s.value > max) s.value = max;
    const pq = Math.floor((+s.value || 0) / 250);
    $('sim-cc-hint').textContent = max === 0
      ? 'Kein tauschbarer Kreditkarten-Stand hinterlegt (Dashboard → Prognose → „Kreditkarten-Meilen-Stand“).'
      : `Bis ${fmt(max)} Meilen möglich${+s.value > 0 ? ` · gewählt ${fmt(+s.value)} → +${pq} P / +${pq} QP` : ''}`;
    const sw = $('sim-lever800');
    sw.disabled = leverSwapUsed(year);
    if (sw.disabled) sw.checked = false;
  }

  function renderSavedScenarios() {
    const list = settings.scenarios || [];
    $('sim-saved').innerHTML = list.length
      ? list.map(s => `<div class="sim-row"><div><b>${esc(s.name)}</b><div class="meta" style="font-size:12px; color:var(--muted);">${s.flights.length} Flug-Eintr${s.flights.length === 1 ? "ag" : "äge"}${s.lever800 ? ' · 800-QP-Tausch' : ''}${s.ccMiles ? ' · Kreditkarte ' + fmt(s.ccMiles) : ''}</div></div>
          <div style="white-space:nowrap;"><button type="button" class="btn small secondary" onclick="simLoad('${s.id}')">Laden</button> <button class="del" onclick="simDeleteSaved('${s.id}')">löschen</button></div></div>`).join('')
      : '<div class="hint" style="margin:4px 0 0;">Noch keine Szenarien gespeichert.</div>';
  }

  function renderSim() {
    if (!$('card-sim')) return;
    $('sim-year').textContent = seasonYear();
    syncCcSlider();
    renderFlightList();
    renderUptripList();
    renderNeed();
    renderResult();
    renderSavedScenarios();
  }
  window.renderSim = renderSim;

  // ---------- Aktionen ----------
  $('sim-add-btn').addEventListener('click', () => {
    const msg = $('sim-add-msg');
    const route = $('sim-route').value.trim().toUpperCase();
    const range = $('sim-range').value;
    const f = { id: genId(), route, range, legRanges: [], cls: $('sim-class').value, co2: parseInt($('sim-co2').value) || 0,
      segments: Math.max(1, parseInt($('sim-segments').value) || 1), count: Math.max(1, parseInt($('sim-count').value) || 1), mode: $('sim-mode').value };
    if (range === 'auto') {
      const legs = routeLegs(route);
      if (!legs.length) { msg.textContent = 'Für „Automatisch“ bitte eine Strecke mit mindestens zwei bekannten IATA-Codes eingeben (z.B. FRA–OTP) — oder eine Reichweite wählen.'; return; }
      f.legRanges = legs.map(([a, b]) => legRange(a, b));
    }
    flights.push(f);
    msg.textContent = '';
    renderSim();
  });
  $('sim-up-add').addEventListener('click', () => {
    const p = parseInt($('sim-up-p').value) || 0, q = parseInt($('sim-up-q').value) || 0;
    if (!p && !q) return;
    upCustom.push({ id: genId(), name: $('sim-up-name').value.trim() || 'Uptrip-Einlösung', p, q, count: Math.max(1, parseInt($('sim-up-count').value) || 1) });
    ['sim-up-name', 'sim-up-p', 'sim-up-q'].forEach(id => { $(id).value = ''; });
    $('sim-up-count').value = 1;
    renderSim();
  });
  window.simRemoveFlight = (id) => { flights = flights.filter(f => f.id !== id); renderSim(); };

  ['sim-planned', 'sim-lever800', 'sim-extra-p', 'sim-extra-q'].forEach(id => $(id).addEventListener('input', renderSim));
  $('sim-cc').addEventListener('input', renderSim);

  $('sim-adopt-btn').addEventListener('click', async () => {
    const msg = $('sim-adopt-msg');
    const date = $('sim-date').value;
    if (!flights.length) { msg.textContent = 'Das Szenario enthält noch keine Flüge.'; return; }
    if (!date) { msg.textContent = 'Bitte ein Datum wählen, damit die geplanten Trips im richtigen Jahr landen.'; return; }
    const made = [];
    flights.forEach(f => {
      for (let i = 0; i < f.count; i++) {
        if (f.range === 'auto') {
          routeLegs(f.route).forEach(([a, b], k) => made.push({ route: `${a}–${b}`, range: f.legRanges[k], segments: 1, f }));
        } else {
          made.push({ route: f.route || 'Simulation', range: f.range, segments: f.segments, f });
        }
      }
    });
    if (!confirm(`${made.length} geplante${made.length === 1 ? 'r Trip' : ' Trips'} am ${date} anlegen? Sie zählen in Dashboard und Prognose als „geplant“.`)) return;
    made.forEach(m => trips.push({
      id: genId(), date, route: m.route, range: m.range, cls: m.f.cls, segments: m.segments, co2: m.f.co2,
      note: 'Simulation', historical: false, planned: true, upgradeFrom: '', upgradeCost: 0, qpMode: m.f.mode
    }));
    await saveTrips();
    // Die Flüge stecken jetzt in den geplanten Trips; im Szenario würden sie doppelt zählen.
    flights = [];
    msg.textContent = `${made.length} geplante${made.length === 1 ? 'r Trip' : ' Trips'} angelegt (Tab Trips → Trip-Log) und aus dem Szenario entfernt, damit nichts doppelt zählt. Uptrip-Einlösungen werden nicht übernommen — die buchst du im Tab Sammeln.`;
    render();
  });

  $('sim-save-btn').addEventListener('click', async () => {
    const name = $('sim-name').value.trim();
    if (!name) { $('sim-adopt-msg').textContent = 'Bitte einen Namen für das Szenario eingeben.'; return; }
    settings.scenarios = [...(settings.scenarios || []), {
      id: genId(), name, flights: flights.map(f => ({ ...f })), lever800: $('sim-lever800').checked, ccMiles: parseInt($('sim-cc').value) || 0,
      extraP: parseInt($('sim-extra-p').value) || 0, extraQ: parseInt($('sim-extra-q').value) || 0, planned: $('sim-planned').checked,
      upCounts: { ...upCounts }, upCustom: upCustom.map(c => ({ ...c }))
    }];
    await saveSettings();
    $('sim-name').value = '';
    renderSim();
  });

  window.simLoad = (id) => {
    const s = (settings.scenarios || []).find(x => x.id === id);
    if (!s) return;
    flights = s.flights.map(f => ({ ...f, id: genId() }));
    upCounts = { ...(s.upCounts || {}) };
    upCustom = (s.upCustom || []).map(c => ({ ...c, id: genId() }));
    $('sim-lever800').checked = !!s.lever800;
    $('sim-cc').value = s.ccMiles || 0;
    $('sim-extra-p').value = s.extraP || '';
    $('sim-extra-q').value = s.extraQ || '';
    $('sim-planned').checked = s.planned !== false;
    renderSim();
  };
  window.simDeleteSaved = async (id) => {
    settings.scenarios = (settings.scenarios || []).filter(x => x.id !== id);
    await saveSettings();
    renderSim();
  };

  $('sim-date').value = new Date().toISOString().slice(0, 10);
  window.MMSim = { simulate, setRechnerPage };
})();
