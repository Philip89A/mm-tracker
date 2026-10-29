/*
 * Streckenkarte (alle Trips auf der Weltkarte) und Streckenplaner (Routen über
 * Konzern-Drehkreuze mit erwarteten Points/QP). Komplett offline: Flughafen-
 * koordinaten (js/data/airports.js) und Weltumriss (js/data/world.js) liegen
 * lokal, es wird kein Kartendienst und keine Fahrplan-API angesprochen.
 *
 * Nutzt aus app.js: trips, saveTrips, render, genId, labelClass,
 * segmentPointsWithCo2, tripPoints.
 */
(() => {
  const EARTH_KM = 6371;
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function airportOf(code) {
    const a = AIRPORTS[code];
    return a ? { code, lat: a[0], lon: a[1], city: a[2], country: a[3], continent: a[4] } : null;
  }

  function distanceKm(a, b) {
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function greatCirclePoints(a, b, n) {
    const p1 = toRad(a.lat), l1 = toRad(a.lon), p2 = toRad(b.lat), l2 = toRad(b.lon);
    const d = 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2)));
    if (d < 1e-6) return [[a.lon, a.lat]];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      const z = A * Math.sin(p1) + B * Math.sin(p2);
      pts.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
    }
    return pts;
  }

  // "FRA–FCO–FRA", "FRA-ZRH-SIN", "MUC → JFK" → IATA-Codes. Nur Tokens, die
  // exakt aus drei GROSSbuchstaben bestehen, zählen (so wird aus "über MUC"
  // nicht fälschlich BER/VIA gelesen).
  function parseRoute(route) {
    const tokens = String(route || '').split(/[\s\-–—→>\/,;]+/).filter(t => /^[A-Z]{3}$/.test(t));
    return { known: tokens.filter(t => AIRPORTS[t]), unknown: tokens.filter(t => !AIRPORTS[t]) };
  }

  // ---------------------------------------------------------------- Karte

  function usedLegs(tripList) {
    const legs = new Map();
    const visits = new Map();
    const unknown = new Set();
    const unparsed = [];
    let flownKm = 0, plannedKm = 0;

    tripList.forEach(t => {
      const { known, unknown: unk } = parseRoute(t.route);
      unk.forEach(u => unknown.add(u));
      const pairs = [];
      for (let i = 0; i < known.length - 1; i++) if (known[i] !== known[i + 1]) pairs.push([known[i], known[i + 1]]);
      if (pairs.length === 0) { unparsed.push(t.route || '(leer)'); return; }
      // Weicht die Segmentzahl von der Zahl der Teilstrecken ab (z.B. zweimal
      // dieselbe Strecke geflogen), wird entsprechend gewichtet.
      const weight = (t.segments || pairs.length) / pairs.length;
      pairs.forEach(([from, to]) => {
        const a = airportOf(from), b = airportOf(to);
        const key = [from, to].sort().join('-');
        const km = distanceKm(a, b);
        const leg = legs.get(key) || { a: airportOf(key.split('-')[0]), b: airportOf(key.split('-')[1]), flown: 0, planned: 0, km };
        if (t.planned) { leg.planned += weight; plannedKm += km * weight; } else { leg.flown += weight; flownKm += km * weight; }
        legs.set(key, leg);
        [from, to].forEach(c => visits.set(c, (visits.get(c) || 0) + weight / 2));
      });
    });
    return { legs, visits, unknown, unparsed, flownKm, plannedKm };
  }

  function fitView(points) {
    let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
    points.forEach(([lon, lat]) => {
      lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
      latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
    });
    let lonSpan = Math.max(30, (lonMax - lonMin) * 1.16), latSpan = Math.max(18, (latMax - latMin) * 1.3);
    const ratio = 1.9;
    if (lonSpan / latSpan > ratio) latSpan = lonSpan / ratio; else lonSpan = latSpan * ratio;
    lonSpan = Math.min(360, lonSpan); latSpan = Math.min(170, latSpan);
    let x0 = (lonMin + lonMax) / 2 - lonSpan / 2, y1 = (latMin + latMax) / 2 + latSpan / 2;
    x0 = Math.max(-180, Math.min(180 - lonSpan, x0));
    y1 = Math.max(-85 + latSpan, Math.min(85, y1));
    return { x0, y1, lonSpan, latSpan };
  }

  function renderRouteMap() {
    const el = document.getElementById('route-map');
    if (!el) return;

    const yearSel = document.getElementById('map-filter-year');
    const statusSel = document.getElementById('map-filter-status');
    const prevYear = yearSel.value;
    const years = [...new Set(trips.map(t => (t.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    yearSel.innerHTML = '<option value="">Alle</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (years.includes(prevYear)) yearSel.value = prevYear;

    const list = trips
      .filter(t => !yearSel.value || (t.date || '').startsWith(yearSel.value))
      .filter(t => !statusSel.value || (statusSel.value === 'planned' ? t.planned : !t.planned));

    const statsEl = document.getElementById('route-map-stats');
    const unkEl = document.getElementById('route-map-unknown');
    const { legs, visits, unknown, unparsed, flownKm, plannedKm } = usedLegs(list);

    const notes = [];
    if (unknown.size) notes.push(`Unbekannte Flughafencodes: ${[...unknown].map(esc).join(', ')}`);
    if (unparsed.length) notes.push(`Ohne erkennbare Strecke (kein IATA-Code in Großbuchstaben): ${[...new Set(unparsed)].slice(0, 6).map(esc).join(' · ')}`);
    unkEl.style.display = notes.length ? 'block' : 'none';
    unkEl.innerHTML = notes.map(n => '⚠️ ' + n).join('<br>');

    if (legs.size === 0) {
      el.innerHTML = '<div class="empty">Noch keine darstellbaren Strecken — trage im Trip-Log Strecken wie „FRA–FCO–FRA“ (IATA-Codes) ein.</div>';
      statsEl.textContent = '';
      return;
    }

    // Großkreis-Bögen vorab berechnen, damit die Ansicht auch ihre Ausbuchtung umfasst.
    const arcs = [...legs.values()].map(leg => {
      const n = Math.max(6, Math.min(60, Math.round(leg.km / 150)));
      return { leg, pts: greatCirclePoints(leg.a, leg.b, n) };
    });
    const allPts = arcs.flatMap(a => a.pts);
    const view = fitView(allPts);
    const W = 1000, s = W / view.lonSpan, H = Math.round(view.latSpan * s);
    const X = lon => ((lon - view.x0) * s);
    const Y = lat => ((view.y1 - lat) * s);
    const f = v => v.toFixed(1);

    const land = WORLD_LAND.map(poly => 'M' + poly.map(([lo, la]) => f(X(lo)) + ' ' + f(Y(la))).join('L') + 'Z').join('');

    let grid = '';
    for (let lo = Math.ceil(view.x0 / 30) * 30; lo <= view.x0 + view.lonSpan; lo += 30) grid += `<line x1="${f(X(lo))}" y1="0" x2="${f(X(lo))}" y2="${H}"/>`;
    for (let la = Math.ceil((view.y1 - view.latSpan) / 30) * 30; la <= view.y1; la += 30) grid += `<line x1="0" y1="${f(Y(la))}" x2="${W}" y2="${f(Y(la))}"/>`;

    const lines = arcs.map(({ leg, pts }) => {
      const segs = [[]];
      pts.forEach((p, i) => {
        if (i > 0 && Math.abs(p[0] - pts[i - 1][0]) > 180) segs.push([]);
        segs[segs.length - 1].push(p);
      });
      const d = segs.filter(sg => sg.length > 1).map(sg => 'M' + sg.map(([lo, la]) => f(X(lo)) + ' ' + f(Y(la))).join('L')).join('');
      const total = leg.flown + leg.planned;
      const w = Math.min(5, 1.2 + 0.9 * Math.log2(1 + total));
      const title = `<title>${esc(leg.a.code)} ↔ ${esc(leg.b.code)} · ${Math.round(leg.km).toLocaleString('de-DE')} km · ${leg.flown ? Math.round(leg.flown) + '× geflogen' : ''}${leg.flown && leg.planned ? ', ' : ''}${leg.planned ? Math.round(leg.planned) + '× geplant' : ''}</title>`;
      let out = '';
      if (leg.flown > 0) out += `<path d="${d}" class="rm-leg flown" style="stroke-width:${w.toFixed(1)}">${title}</path>`;
      if (leg.planned > 0) out += `<path d="${d}" class="rm-leg planned" style="stroke-width:${(leg.flown > 0 ? 1.4 : w).toFixed(1)}">${leg.flown > 0 ? '' : title}</path>`;
      return out;
    }).join('');

    const ranked = [...visits.entries()].sort((a, b) => b[1] - a[1]);
    const labelled = new Set(ranked.slice(0, 25).map(r => r[0]));
    const dots = ranked.map(([code, v]) => {
      const a = airportOf(code);
      const r = 3 + Math.min(6, Math.sqrt(v));
      return `<circle cx="${f(X(a.lon))}" cy="${f(Y(a.lat))}" r="${r.toFixed(1)}" class="rm-dot"><title>${esc(code)} · ${esc(a.city)} · ${Math.round(v)}× besucht</title></circle>` +
        (labelled.has(code) ? `<text x="${f(X(a.lon) + r + 2)}" y="${f(Y(a.lat) - r)}" class="rm-label">${esc(code)}</text>` : '');
    }).join('');

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Streckenkarte">
      <rect width="${W}" height="${H}" class="rm-sea"/>
      <g class="rm-grid">${grid}</g>
      <path d="${land}" class="rm-land"/>
      <g fill="none">${lines}</g>
      ${dots}
    </svg>`;

    const km = Math.round(flownKm), earth = flownKm / 40075;
    const parts = [`${legs.size} Strecke${legs.size === 1 ? '' : 'n'}`, `${visits.size} Flughäfen`];
    if (flownKm > 0) parts.push(`${km.toLocaleString('de-DE')} km geflogen (${earth.toLocaleString('de-DE', { maximumFractionDigits: 1 })}× um die Erde)`);
    if (plannedKm > 0) parts.push(`${Math.round(plannedKm).toLocaleString('de-DE')} km geplant`);
    statsEl.textContent = parts.join(' · ') + ' — Luftlinie (Großkreis) je Teilstrecke, nicht die real geflogene Distanz.';
  }
  window.renderRouteMap = renderRouteMap;

  // ---------------------------------------------------------- Streckenplaner

  // Drehkreuze der Lufthansa Group (plus wichtige Zweitdrehkreuze) — es wird
  // NICHT geprüft, ob die jeweilige Teilstrecke tatsächlich beflogen wird.
  // longHaul: Hauptdrehkreuze mit nennenswertem Langstreckenangebot. Die
  // Zweitdrehkreuze werden nur als Umstieg für rein europäische Teilstrecken
  // vorgeschlagen — für Interkontinental-Teilstrecken wären sie geraten.
  const PLANNER_HUBS = [
    { code: 'FRA', airline: 'Lufthansa', longHaul: true }, { code: 'MUC', airline: 'Lufthansa', longHaul: true },
    { code: 'ZRH', airline: 'SWISS', longHaul: true }, { code: 'VIE', airline: 'Austrian', longHaul: true },
    { code: 'BRU', airline: 'Brussels Airlines', longHaul: true }, { code: 'FCO', airline: 'ITA Airways', longHaul: true },
    { code: 'WAW', airline: 'LOT', longHaul: false }, { code: 'GVA', airline: 'SWISS', longHaul: false },
    { code: 'DUS', airline: 'Lufthansa/Eurowings', longHaul: false }, { code: 'BER', airline: 'Lufthansa/Eurowings', longHaul: false }
  ];
  const CLASSES = ['economy', 'premium', 'business', 'first'];
  let plannerOptions = [];

  function legRange(a, b) {
    return (a.continent === 'EU' && b.continent === 'EU') ? 'continental' : 'intercontinental';
  }

  function buildLegs(codes, roundTrip) {
    const factor = roundTrip ? 2 : 1;
    return codes.slice(0, -1).map((c, i) => {
      const a = airportOf(c), b = airportOf(codes[i + 1]);
      return { from: a, to: b, range: legRange(a, b), km: distanceKm(a, b), factor };
    });
  }

  function pointsFor(legs, cls, co2) {
    return legs.reduce((s, l) => s + segmentPointsWithCo2(l.range, cls, co2) * l.factor, 0);
  }

  function computePlannerOptions(from, to, cls, co2, roundTrip) {
    const direct = buildLegs([from, to], roundTrip);
    const dAB = direct[0].km;
    const opts = [{ via: null, legs: direct, detour: 1 }];
    if (dAB >= 300) {
      PLANNER_HUBS.forEach(({ code: hub, airline, longHaul }) => {
        if (hub === from || hub === to) return;
        const legs = buildLegs([from, hub, to], roundTrip);
        if (legs[0].km < 150 || legs[1].km < 150) return;
        if (!longHaul && legs.some(l => l.range === 'intercontinental')) return;
        const detour = (legs[0].km + legs[1].km) / dAB;
        if (detour <= 1.5) opts.push({ via: hub, airline, legs, detour });
      });
    }
    opts.forEach(o => {
      o.segments = o.legs.reduce((s, l) => s + l.factor, 0);
      o.totalKm = o.legs.reduce((s, l) => s + l.km * l.factor, 0);
      o.byClass = Object.fromEntries(CLASSES.map(c => [c, pointsFor(o.legs, c, co2)]));
      o.points = o.byClass[cls];
    });
    // Direktflug zuerst, danach nach Punkten (absteigend), bei Gleichstand der kleinere Umweg.
    const [directOpt, ...rest] = opts;
    rest.sort((a, b) => (b.points - a.points) || (a.detour - b.detour));
    return [directOpt, ...rest].slice(0, 7);
  }

  function resolveAirportInput(v) {
    const code = String(v || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) && AIRPORTS[code] ? code : null;
  }

  function searchAirports(q) {
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const exact = [], start = [], contain = [];
    for (const [code, a] of Object.entries(AIRPORTS)) {
      const city = a[2].toLowerCase();
      if (code.toLowerCase() === q) exact.push(code);
      else if (code.toLowerCase().startsWith(q) || city.startsWith(q)) start.push(code);
      else if (city.includes(q)) contain.push(code);
    }
    return [...exact, ...start, ...contain].slice(0, 6);
  }

  function gfLink(a, b, date) {
    return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(`Flights from ${a} to ${b}${date ? ' on ' + date : ''}`);
  }

  function renderSuggestions(inputId, sugId) {
    const input = document.getElementById(inputId), box = document.getElementById(sugId);
    const v = input.value.trim();
    if (!v || resolveAirportInput(v)) { box.innerHTML = ''; return; }
    box.innerHTML = searchAirports(v).map(c =>
      `<button type="button" class="sug-btn" data-target="${inputId}" data-code="${c}">${c} · ${esc(AIRPORTS[c][2])} (${esc(AIRPORTS[c][3])})</button>`
    ).join('');
  }

  function renderPlanner() {
    const out = document.getElementById('pl-results');
    if (!out) return;
    const from = resolveAirportInput(document.getElementById('pl-from').value);
    const to = resolveAirportInput(document.getElementById('pl-to').value);
    if (!from || !to) {
      plannerOptions = [];
      out.innerHTML = '<div class="empty">Start und Ziel eingeben (IATA-Code wie FRA oder Stadtname).</div>';
      return;
    }
    if (from === to) { plannerOptions = []; out.innerHTML = '<div class="empty">Start und Ziel sind identisch.</div>'; return; }

    const cls = document.getElementById('pl-class').value;
    const co2 = parseInt(document.getElementById('pl-co2').value) || 0;
    const roundTrip = document.getElementById('pl-roundtrip').checked;
    const date = document.getElementById('pl-date').value;
    plannerOptions = computePlannerOptions(from, to, cls, co2, roundTrip);

    // Nur die eine beste Umsteigeroute markieren, und nur wenn sie mehr bringt als der Direktflug.
    const bestVia = plannerOptions.slice(1).reduce((b, o) => (!b || o.points > b.points) ? o : b, null);
    const starred = bestVia && bestVia.points > plannerOptions[0].points ? bestVia : null;
    const short = plannerOptions.length === 1 && plannerOptions[0].legs[0].km < 300;
    const classShort = { economy: 'Eco', premium: 'Prem', business: 'Bus', first: 'First' };
    out.innerHTML = (short ? '<p class="hint">Unter 300 km lohnt sich ein Umweg über ein Drehkreuz nicht — nur die Direktverbindung wird gezeigt.</p>' : '') +
      plannerOptions.map((o, i) => {
        const path = [from, ...(o.via ? [o.via] : []), to].join(' → ');
        const legLines = o.legs.map(l => `${l.from.code}→${l.to.code}: ${l.range === 'continental' ? 'kontinental' : 'interkontinental'}, ${Math.round(l.km).toLocaleString('de-DE')} km`).join(' · ');
        const links = o.legs.map(l => `<a href="${gfLink(l.from.code, l.to.code, date)}" target="_blank" rel="noopener">${l.from.code}→${l.to.code} ↗</a>`).join(' · ');
        const detour = o.via ? ` · Umweg +${Math.round((o.detour - 1) * 100)} %` : ' · direkt';
        const star = o === starred ? ' <span class="tag ok">⭐ meiste Punkte</span>' : '';
        return `<div class="trip">
          <div class="top">
            <div>
              <div class="route">${esc(path)}${star}</div>
              <div class="meta">${o.segments} Segment${o.segments === 1 ? '' : 'e'}${roundTrip ? ' (Hin+Rück)' : ''}${o.via ? ' · via ' + esc(o.airline) : ''}${detour}</div>
              <div class="meta">${legLines}</div>
              <div class="meta">${CLASSES.map(c => `${classShort[c]} ${o.byClass[c]}`).join(' · ')} P/QP</div>
              <div class="meta">Verfügbarkeit prüfen: ${links}</div>
            </div>
            <div class="pts"><div class="p">+${o.points} P/QP</div><div class="q">${Math.round(o.totalKm).toLocaleString('de-DE')} km</div></div>
          </div>
          <div style="margin-top:6px;"><button type="button" class="btn small secondary" data-adopt="${i}">📅 Als geplante Trips übernehmen</button></div>
        </div>`;
      }).join('');
  }

  async function adoptOption(idx) {
    const o = plannerOptions[idx];
    const msg = document.getElementById('pl-msg');
    if (!o) return;
    const date = document.getElementById('pl-date').value;
    if (!date) { msg.textContent = 'Bitte zuerst ein Datum wählen, damit die geplanten Trips ins richtige Jahr fallen.'; return; }
    const cls = document.getElementById('pl-class').value;
    const co2 = parseInt(document.getElementById('pl-co2').value) || 0;
    const roundTrip = document.getElementById('pl-roundtrip').checked;
    // Das Trip-Modell kennt pro Eintrag nur eine Reichweite und Klasse — daher
    // wird jede Teilstrecke ein eigener geplanter Trip.
    o.legs.forEach(l => {
      trips.push({
        id: genId(), date,
        route: roundTrip ? `${l.from.code}–${l.to.code}–${l.from.code}` : `${l.from.code}–${l.to.code}`,
        range: l.range, cls, segments: roundTrip ? 2 : 1, co2,
        note: 'Streckenplaner' + (o.via ? ` (via ${o.via})` : ''),
        historical: false, planned: true, upgradeFrom: '', upgradeCost: 0
      });
    });
    await saveTrips();
    msg.textContent = `${o.legs.length} geplante${o.legs.length === 1 ? 'r Trip' : ' Trips'} angelegt (Tab Trips). Sobald der Flug stattgefunden hat, im Trip-Log „Geplant“ abwählen.`;
    render();
  }

  function initPlanner() {
    if (!document.getElementById('pl-from')) return;
    ['pl-from', 'pl-to'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => { renderSuggestions(id, id + '-sug'); renderPlanner(); });
    });
    ['pl-class', 'pl-co2', 'pl-roundtrip', 'pl-date'].forEach(id => document.getElementById(id).addEventListener('change', renderPlanner));
    document.getElementById('card-planner').addEventListener('click', (e) => {
      const sug = e.target.closest('.sug-btn');
      if (sug) {
        document.getElementById(sug.dataset.target).value = sug.dataset.code;
        renderSuggestions(sug.dataset.target, sug.dataset.target + '-sug');
        renderPlanner();
        return;
      }
      const adopt = e.target.closest('[data-adopt]');
      if (adopt) adoptOption(parseInt(adopt.dataset.adopt));
    });
    renderPlanner();
  }

  document.getElementById('map-filter-year').addEventListener('change', renderRouteMap);
  document.getElementById('map-filter-status').addEventListener('change', renderRouteMap);
  initPlanner();

  // Für Tests/Debugging aus der Konsole erreichbar.
  window.MMMap = { parseRoute, distanceKm, airportOf, computePlannerOptions, searchAirports };
})();
