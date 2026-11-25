/**
 * Statistik im Trips-Tab (Übersicht), angelehnt an Flighty: Flüge, Distanz, Flugzeit, Flughäfen,
 * Airlines, Strecken, Länder, Flugzeuge, Klassen, Sitze und Reiseanlass. Grundlage sind die
 * geflogenen Trips nach den Filtern oben. „Flug“ = eine Teilstrecke; Trips ohne Flugdetails
 * werden aus der Strecke abgeleitet (Flugzeit, Flugzeug und Sitz fehlen dann).
 * Nutzt Globals aus app.js (trips, AIRPORTS, tripFlightInfos, tripSegments, …) und aus extras.js
 * (bars, statBlock, seatRuleBlock).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = escHtml;
  const fmt = (n) => Math.round(n).toLocaleString('de-DE');
  const dec = (n, d = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: d });
  const hm = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
  const minutes = (s) => { const h = /(\d+)\s*h/.exec(s || ''), m = /(\d+)\s*m/.exec(s || ''); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); };
  const flag = (iso) => (iso && iso.length === 2 ? String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '');
  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const CLS_LABEL = { economy: 'Economy', premium: 'Premium Eco.', business: 'Business', first: 'First', unknown: 'ohne Angabe' };
  const LONG_HAUL_KM = 4000; // ab hier zählt ein Flug als Langstrecke

  let chartMode = 'month', airlineBy = 'flights', routeBy = 'flights';
  window.setStatToggle = (kind, v) => {
    if (kind === 'chart') chartMode = v; else if (kind === 'airline') airlineBy = v; else if (kind === 'route') routeBy = v;
    renderStats();
  };

  function km(a, b) {
    const A = AIRPORTS[a], B = AIRPORTS[b];
    if (!A || !B) return 0;
    const r = Math.PI / 180, dLat = (B[0] - A[0]) * r, dLon = (B[1] - A[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(A[0] * r) * Math.cos(B[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  // Teilstrecken eines Trips: aus den Flugdetails, sonst aus der Strecke (Hin+Rück bei doppelter Segmentzahl).
  function tripStatLegs(t) {
    const airline = (t.airline || '').trim();
    const infos = tripFlightInfos(t).filter(f => f.from && f.to);
    if (infos.length) {
      return infos.map(f => ({
        t, f, from: f.from, to: f.to, date: f.date || t.date, airline, flightNo: f.flightNo || '',
        aircraft: String(f.aircraft || '').trim().toUpperCase(), reg: String(f.registration || '').trim().toUpperCase(),
        seat: String(f.seat || '').trim().toUpperCase(), cls: CABIN_TO_CLASS[f.cabin] || (t.noPoints ? '' : (legClassOf(f, t) || t.cls)), dur: minutes(f.duration), w: 1
      }));
    }
    const codes = parseRoute(t.route).known;
    let pairs = [];
    for (let i = 0; i < codes.length - 1; i++) if (codes[i] !== codes[i + 1]) pairs.push([codes[i], codes[i + 1]]);
    if (!pairs.length) return [];
    const n = t.segments || pairs.length;
    if (n === pairs.length * 2 && codes[0] !== codes[codes.length - 1]) pairs = [...pairs, ...pairs.slice().reverse().map(([a, b]) => [b, a])];
    const segs = tripSegments(t), w = pairs.length === n ? 1 : n / pairs.length;
    return pairs.map(([from, to], i) => ({ t, f: null, from, to, date: t.date, airline, flightNo: '', aircraft: '', reg: '', seat: '', cls: segs.length === pairs.length ? segs[i].cls : t.cls, dur: 0, w }));
  }

  // Kleines Säulendiagramm
  function vchart(labels, values) {
    const max = Math.max(1, ...values);
    return `<div class="vchart">${labels.map((l, i) => `<div class="vcol"><div class="vval">${values[i] ? dec(values[i], 0) : ''}</div>
      <div class="vbar" style="height:${values[i] ? Math.max(3, values[i] / max * 100) : 0}%"></div><div class="vlbl">${esc(l)}</div></div>`).join('')}</div>`;
  }
  const seg = (kind, cur, opts) => `<div class="goal-switcher" style="margin:6px 0 0;">${opts.map(([v, l]) =>
    `<button type="button" class="goal-tab${cur === v ? ' active' : ''}" onclick="setStatToggle('${kind}','${v}')">${l}</button>`).join('')}</div>`;
  const kpi = (n, l) => `<div class="stat"><div class="num" style="font-size:18px;">${n}</div><div class="lbl">${l}</div></div>`;
  const section = (title, inner) => `<div class="stat-section"><div class="stat-section-title">${title}</div>${inner}</div>`;
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);

  function renderStats() {
    const el = $('stats-body');
    if (!el) return;
    const flown = getFilteredTrips().filter(t => !t.planned);
    if (!flown.length) { el.innerHTML = '<div class="empty">Keine geflogenen Trips für diesen Filter.</div>'; return; }
    const F = readTripFilters();
    const legs = flown.flatMap(tripStatLegs).filter(l => !hasLegFilter(F) || legMatchesFilters(l.f || { from: l.from, to: l.to }, l.t, F));
    legs.forEach(l => { l.km = km(l.from, l.to); });
    const nFlights = legs.reduce((s, l) => s + l.w, 0);
    const totalKm = legs.reduce((s, l) => s + l.km * l.w, 0);
    const withDur = legs.filter(l => l.dur > 0);
    const totalMin = withDur.reduce((s, l) => s + l.dur, 0);
    const pts = flown.reduce((s, t) => s + tripPoints(t), 0), qp = flown.reduce((s, t) => s + tripQP(t), 0);
    const ctry = (c) => (AIRPORTS[c] ? AIRPORTS[c][3] : '');

    // ---------- Überblick ----------
    const countries = new Set(legs.flatMap(l => [ctry(l.from), ctry(l.to)]).filter(Boolean));
    const airportsSet = new Set(legs.flatMap(l => [l.from, l.to]));
    let html = `<div class="stat-row" style="flex-wrap:wrap;">${kpi(fmt(nFlights), 'Flüge')}${kpi(fmt(totalKm), 'Flug-km')}${kpi(totalMin ? fmt(totalMin / 60) + ' h' : '–', 'Flugzeit')}</div>
      <div class="stat-row" style="flex-wrap:wrap; margin-top:8px;">${kpi(fmt(pts), 'Points')}${kpi(fmt(qp), 'QP')}${kpi(flown.length, 'Trips')}</div>`;

    // ---------- Flüge ----------
    let dom = 0, intl = 0, longHaul = 0;
    legs.forEach(l => { if (ctry(l.from) && ctry(l.from) === ctry(l.to)) dom += l.w; else intl += l.w; if (l.km >= LONG_HAUL_KM) longHaul += l.w; });
    let chart;
    if (chartMode === 'year') {
      const by = new Map(); legs.forEach(l => add(by, (l.date || '').slice(0, 4), l.w));
      const ys = [...by.keys()].filter(Boolean).sort();
      chart = vchart(ys.map(y => "'" + y.slice(2)), ys.map(y => by.get(y)));
    } else if (chartMode === 'weekday') {
      const v = Array(7).fill(0); legs.forEach(l => { if (l.date) v[(new Date(l.date + 'T12:00:00').getDay() + 6) % 7] += l.w; });
      chart = vchart(WEEKDAYS, v);
    } else {
      const v = Array(12).fill(0); legs.forEach(l => { if (l.date) v[+l.date.slice(5, 7) - 1] += l.w; });
      chart = vchart(MONTHS, v);
    }
    html += section('✈️ Flüge', `<div class="stat-big">${fmt(nFlights)}</div>
      <div class="stat-sub">${fmt(dom)} Inland · ${fmt(intl)} international · ${fmt(longHaul)} Langstrecke (ab ${fmt(LONG_HAUL_KM)} km)</div>
      ${seg('chart', chartMode, [['year', 'Jahr'], ['month', 'Monat'], ['weekday', 'Wochentag']])}${chart}`);

    // ---------- Distanz ----------
    const byKm = legs.filter(l => l.km > 0).sort((a, b) => a.km - b.km);
    const legName = (l) => `${esc(l.from)} → ${esc(l.to)}${l.flightNo ? ' · ' + esc(l.flightNo) : ''}${l.date ? ' · ' + esc(l.date) : ''}`;
    const ratioBar = (label, x) => `<div class="ratio-row"><span>${label}</span><div class="bar-bg" style="height:8px;"><div class="bar-fill q" style="width:${Math.min(100, x * 100)}%"></div></div><b>${dec(x, x < 0.1 ? 2 : 1)}×</b></div>`;
    html += section('📏 Distanz', `<div class="stat-big">${fmt(totalKm)} km</div>
      <div class="stat-sub">Ø ${fmt(nFlights ? totalKm / nFlights : 0)} km je Flug · Luftlinie zwischen den Flughäfen</div>
      ${ratioBar('🌍 um die Erde', totalKm / 40075)}${ratioBar('🌕 bis zum Mond', totalKm / 384400)}${ratioBar('☀️ um die Sonne', totalKm / 940000000)}
      ${byKm.length ? `<div class="stat-pair"><div><div class="stat-sub">Kürzester Flug</div><b>${legName(byKm[0])}</b><div class="stat-sub">${fmt(byKm[0].km)} km</div></div>
      <div><div class="stat-sub">Längster Flug</div><b>${legName(byKm[byKm.length - 1])}</b><div class="stat-sub">${fmt(byKm[byKm.length - 1].km)} km</div></div></div>` : ''}`);

    // ---------- Flugzeit ----------
    if (withDur.length) {
      const byDur = [...withDur].sort((a, b) => a.dur - b.dur);
      html += section('⏱️ Flugzeit', `<div class="stat-big">${hm(totalMin)}</div>
        <div class="stat-sub">${dec(totalMin / 1440)} Tage · ${dec(totalMin / 10080)} Wochen · Ø ${hm(totalMin / withDur.length)} je Flug — aus ${withDur.length} von ${fmt(nFlights)} Flügen mit Flugdauer</div>
        <div class="stat-pair"><div><div class="stat-sub">Kürzester Flug</div><b>${legName(byDur[0])}</b><div class="stat-sub">${hm(byDur[0].dur)}</div></div>
        <div><div class="stat-sub">Längster Flug</div><b>${legName(byDur[byDur.length - 1])}</b><div class="stat-sub">${hm(byDur[byDur.length - 1].dur)}</div></div></div>`);
    }

    // ---------- Flughäfen (Umstieg am selben Tag zählt als ein Besuch) ----------
    // Jede Ankunft zählt; ein Abflug nur, wenn am selben Tag keine Ankunft an diesem Flughafen war
    // (dann war es ein Umstieg) — auch über getrennt erfasste Trips hinweg.
    const visits = new Map();
    const arrivedOn = new Set(legs.map(l => `${l.date}|${l.to}`));
    legs.forEach(l => {
      if (!arrivedOn.has(`${l.date}|${l.from}`)) add(visits, l.from, l.w);
      add(visits, l.to, l.w);
    });
    html += section('🛫 Flughäfen', `<div class="stat-big">${airportsSet.size} <span class="stat-unit">Flughäfen</span></div>
      <div class="stat-sub">Besuche; ein Umstieg am selben Tag zählt einmal.</div>
      ${bars(top(visits, 8).map(([k, v]) => ({ label: `${k} · ${AIRPORTS[k] ? AIRPORTS[k][2] : ''}`, value: v, text: fmt(v) })), '')}`);

    // ---------- Airlines ----------
    const al = new Map();
    legs.forEach(l => add(al, l.airline || 'ohne Angabe', airlineBy === 'km' ? l.km * l.w : l.w));
    html += section('🏷️ Airlines', `<div class="stat-big">${[...al.keys()].filter(k => k !== 'ohne Angabe').length} <span class="stat-unit">Airlines</span></div>
      ${seg('airline', airlineBy, [['flights', 'Flüge'], ['km', 'Distanz']])}
      ${bars(top(al, 8).map(([k, v]) => ({ label: k, value: v, text: airlineBy === 'km' ? fmt(v) + ' km' : fmt(v) })), '')}`);

    // ---------- Strecken (mit Richtung) ----------
    const rt = new Map();
    legs.forEach(l => add(rt, `${l.from}–${l.to}`, routeBy === 'km' ? l.km * l.w : l.w));
    html += section('🧭 Strecken', `<div class="stat-big">${rt.size} <span class="stat-unit">Strecken</span></div>
      ${seg('route', routeBy, [['flights', 'Flüge'], ['km', 'Distanz']])}
      ${bars(top(rt, 8).map(([k, v]) => ({ label: k, value: v, text: routeBy === 'km' ? fmt(v) + ' km' : fmt(v) })), '')}`);

    // ---------- Länder ----------
    const cf = new Map();
    legs.forEach(l => new Set([ctry(l.from), ctry(l.to)].filter(Boolean)).forEach(c => add(cf, c, l.w)));
    html += section('🌍 Länder', `<div class="stat-big">${countries.size} <span class="stat-unit">Länder</span></div>
      ${top(cf, 12).map(([c, v]) => `<div class="mt-cat-row" style="padding:4px 0; border-top:1px solid var(--gray-border);"><span>${flag(c)} ${esc(countryLabel(c))}</span><b>${fmt(v)} ${v === 1 ? 'Flug' : 'Flüge'}</b></div>`).join('')}`);

    // ---------- Flugzeuge, Klasse, Sitz, Anlass ----------
    const withAc = legs.filter(l => l.aircraft), types = new Map(), typeMin = new Map(), tails = new Map(), tailType = {};
    withAc.forEach(l => { add(types, l.aircraft, 1); add(typeMin, l.aircraft, l.dur); });
    legs.filter(l => l.reg).forEach(l => { add(tails, l.reg, 1); tailType[l.reg] = l.aircraft; });
    const favType = top(types, 1)[0], favTail = top(tails, 1)[0];

    // Sonderlackierungen: je Flug zum Flugdatum (manueller Eintrag am Flug hat Vorrang)
    const tailLivery = {}, lvFlights = { sure: [], unclear: [], other: [] };
    legs.filter(l => l.reg || (l.f && l.f.livery)).forEach(l => {
      const lv = liveryFor(l.reg, l.date, l.f && l.f.livery);
      if (!lv) return;
      if (lv.status !== 'other') tailLivery[l.reg] = lv.name;
      (lv.status === 'other' ? lvFlights.other : lv.status === 'unclear' ? lvFlights.unclear : lvFlights.sure).push({ l, lv });
    });
    const lvLine = ({ l, lv }, extra) => `<div class="mt-cat-row" style="padding:4px 0; border-top:1px solid var(--gray-border); align-items:flex-start;">
      <span><b>🎨 ${esc(lv.name)}</b><br><span class="stat-sub">${esc(l.reg)}${l.aircraft ? ' · ' + esc(l.aircraft) : ''} · ${esc(l.from)}–${esc(l.to)}${l.flightNo ? ' · ' + esc(l.flightNo) : ''}${extra ? ' · ' + esc(extra) : ''}</span></span>
      <span class="stat-sub" style="text-align:right;" title="${esc(lv.src || '')}">${esc((l.date || '').split('-').reverse().join('.'))}</span></div>`;
    const byDate = (a, b) => (b.l.date || '').localeCompare(a.l.date || '');
    const lvNames = new Set(lvFlights.sure.map(x => x.lv.name));
    const liveryBlock = (lvFlights.sure.length || lvFlights.unclear.length || lvFlights.other.length) ? statBlock(`🎨 Sonderlackierungen · ${lvFlights.sure.length} ${lvFlights.sure.length === 1 ? 'Flug' : 'Flüge'}${lvNames.size ? ' · ' + lvNames.size + ' verschiedene' : ''}`,
      lvFlights.sure.sort(byDate).map(x => lvLine(x, x.lv.status === 'manual' ? 'von dir eingetragen' : x.lv.status === 'likely' ? 'aktuell so lackiert, seit wann nicht belegt' : '')).join('') +
      (lvFlights.unclear.length ? `<div class="stat-sub" style="margin-top:8px;">Unklar, ob zum Flugdatum noch/schon so lackiert — im Flug unter „Lackierung“ bestätigen (Name) oder „Standard“ eintragen:</div>` + lvFlights.unclear.sort(byDate).map(x => lvLine(x, x.lv.src)).join('') : '') +
      (lvFlights.other.length ? `<div class="stat-sub" style="margin-top:8px;">Maschine trägt/trug eine Sonderlackierung, aber nicht bei deinem Flug:</div>` + lvFlights.other.sort(byDate).map(x => lvLine(x, x.lv.when)).join('') : '')) : '';
    const cls = new Map(Object.keys(CLS_LABEL).map(k => [k, 0]));
    legs.forEach(l => add(cls, l.cls || 'unknown', l.w));
    const seats = new Map(), kinds = new Map([['Fenster', 0], ['Mitte', 0], ['Gang', 0]]), unknownTypes = new Map();
    legs.filter(l => l.seat).forEach(l => {
      add(seats, l.seat, 1);
      const k = seatKind({ seat: l.seat, aircraft: l.aircraft });
      if (k) add(kinds, SEAT_KINDS[k], 1);
      else { const ty = l.aircraft || '(Typ fehlt)'; (unknownTypes.get(ty) || unknownTypes.set(ty, []).get(ty)).push(l.seat); }
    });
    const favSeat = top(seats, 1)[0];
    const reasons = new Map([['Geschäftlich', 0], ['Privat', 0], ['ohne Angabe', 0]]);
    legs.forEach(l => add(reasons, l.t.reason === 'business' ? 'Geschäftlich' : l.t.reason === 'personal' ? 'Privat' : 'ohne Angabe', l.w));
    const share = (m) => { const tot = [...m.values()].reduce((a, b) => a + b, 0) || 1; return [...m.entries()].filter(([, v]) => v > 0).map(([k, v]) => ({ label: k, value: v, text: `${fmt(v)} · ${Math.round(v / tot * 100)} %` })); };
    html += section('🛩️ Flugzeuge', `<div class="stat-row" style="flex-wrap:wrap;">${kpi(types.size ? `${types.size} / ${tails.size}` : '–', 'Typen / Maschinen')}${kpi(favType ? esc(favType[0]) : '–', favType ? `meistgeflogener Typ · ${favType[1]} Flüge${typeMin.get(favType[0]) ? ' · ' + fmt(typeMin.get(favType[0]) / 60) + ' h' : ''}` : 'Typ')}${kpi(favTail ? esc(favTail[0]) : '–', favTail ? `häufigste Maschine · ${favTail[1]}×${tailType[favTail[0]] ? ' · ' + esc(tailType[favTail[0]]) : ''}` : 'Kennzeichen')}</div>
      ${statBlock('Flugzeugtypen', bars(top(types, 6).map(([k, v]) => ({ label: k, value: v, text: `${v}×${typeMin.get(k) ? ' · ' + fmt(typeMin.get(k) / 60) + ' h' : ''}` })), ''))}
      ${statBlock('Häufigste Kennzeichen', bars(top(tails, 6).map(([k, v]) => ({ label: `${k}${tailType[k] ? ' · ' + tailType[k] : ''}${tailLivery[k] ? ' · 🎨 ' + tailLivery[k] : ''}`, value: v, text: v + '×' })), ''))}
      ${liveryBlock}`);
    html += section('💺 Klasse & Sitz', `${statBlock('Klasse', bars(share(new Map([...cls].map(([k, v]) => [CLS_LABEL[k], v]))), ''))}
      ${statBlock(`Sitzart${favSeat ? ` · Lieblingsplatz ${esc(favSeat[0])} (${favSeat[1]}×)` : ''}`, bars(share(kinds), ''))}
      ${statBlock('Reiseanlass', bars(share(reasons), ''))}
      ${seatRuleBlock(unknownTypes)}`);

    // ---------- Je Jahr (alle Filter außer dem Jahresfilter) ----------
    const byYear = {};
    getFilteredTrips({ ignoreYear: true }).filter(t => !t.planned && t.date).forEach(t => {
      const y = t.date.slice(0, 4);
      const b = (byYear[y] = byYear[y] || { n: 0, f: 0, km: 0, p: 0, q: 0 });
      const tl = tripStatLegs(t);
      b.n += 1; b.f += tl.reduce((s, l) => s + l.w, 0); b.km += tl.reduce((s, l) => s + km(l.from, l.to) * l.w, 0); b.p += tripPoints(t); b.q += tripQP(t);
    });
    const years = Object.keys(byYear).sort().reverse();
    if (years.length) {
      html += section('📅 Je Jahr', `<div style="overflow-x:auto;"><table class="sim-res-table"><thead><tr><th>Jahr</th><th>Trips</th><th>Flüge</th><th>km</th><th>Points</th><th>QP</th></tr></thead><tbody>
        ${years.map(y => { const b = byYear[y]; return `<tr><td>${y}</td><td>${b.n}</td><td>${fmt(b.f)}</td><td>${fmt(b.km)}</td><td>${fmt(b.p)}</td><td>${fmt(b.q)}</td></tr>`; }).join('')}
        </tbody></table></div>`);
    }
    el.innerHTML = html;
  }
  window.renderStats = renderStats;
})();
