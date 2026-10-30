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

  // ---------------------------------------------------------------- Karte
  //
  // Feste Weltprojektion (Plate carrée, 1800 x 900 Einheiten); Zoom/Pan
  // verändern nur das viewBox-Fenster. Länderflächen, Gitter und Bögen werden
  // bei jedem Datenwechsel neu aufgebaut, Pan/Zoom fasst nur viewBox sowie
  // die Punkt-/Beschriftungsgrößen an.

  const MAP_W = 1800, MAP_H = 900;
  const projX = lon => (lon + 180) * (MAP_W / 360);
  const projY = lat => (90 - lat) * (MAP_H / 180);

  let countryPathsHtml = null;   // einmalig gebaut, Länder ändern sich nicht
  let mapState = { cx: MAP_W / 2, cy: MAP_H / 2, w: MAP_W, fit: null, dots: [], needsFit: true };

  function countryPaths() {
    if (countryPathsHtml) return countryPathsHtml;
    const f = v => v.toFixed(1);
    countryPathsHtml = Object.entries(WORLD_COUNTRIES).map(([iso, polys]) =>
      `<path class="rm-c" data-iso="${iso}" d="${polys.map(poly => 'M' + poly.map(([lo, la]) => f(projX(lo)) + ' ' + f(projY(la))).join('L') + 'Z').join('')}"/>`
    ).join('');
    return countryPathsHtml;
  }

  function usedLegs(tripList) {
    const legs = new Map();
    const visits = new Map();
    const unknown = new Set();
    const unparsed = [];
    const countriesFlown = new Set(), countriesPlanned = new Set();
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
      new Set(known).forEach(c => (t.planned ? countriesPlanned : countriesFlown).add(AIRPORTS[c][3]));
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
    countriesPlanned.forEach(c => { if (countriesFlown.has(c)) countriesPlanned.delete(c); });
    return { legs, visits, unknown, unparsed, flownKm, plannedKm, countriesFlown, countriesPlanned };
  }

  function mapSize() {
    const el = document.getElementById('route-map');
    const cw = el.clientWidth, ch = el.clientHeight;
    return cw > 50 && ch > 50 ? { cw, ch } : { cw: 800, ch: 480 };
  }

  function applyView() {
    const svg = document.querySelector('#route-map svg');
    if (!svg) return;
    const { cw, ch } = mapSize();
    const w = mapState.w, h = w * ch / cw, unit = w / cw;   // unit = Karteneinheiten pro Bildschirm-Pixel
    // Mittelpunkt innerhalb der Welt halten
    mapState.cx = Math.max(0, Math.min(MAP_W, mapState.cx));
    mapState.cy = Math.max(0, Math.min(MAP_H, mapState.cy));
    svg.setAttribute('viewBox', `${(mapState.cx - w / 2).toFixed(2)} ${(mapState.cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    // Beschriftungen nach Wichtigkeit (Reihenfolge von mapState.dots) vergeben
    // und ausblenden, wenn sie auf dem Bildschirm eine bereits gesetzte überdecken.
    const placed = [];
    const vx = mapState.cx - w / 2, vy = mapState.cy - h / 2;
    mapState.dots.forEach(d => {
      d.circle.setAttribute('r', (d.rpx * unit).toFixed(2));
      d.circle.setAttribute('stroke-width', (1.5 * unit).toFixed(2));
      if (!d.label) return;
      const px = (d.cx - vx) / unit + d.rpx + 3, py = (d.cy - vy) / unit - d.rpx - 1;   // Textanfang in Bildschirm-Pixeln
      const box = { x0: px, x1: px + 30, y0: py - 12, y1: py + 2 };
      const inView = px > -30 && px < cw && py > 0 && py < ch + 12;
      const clash = placed.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      d.label.style.display = inView && !clash ? '' : 'none';
      if (inView && !clash) placed.push(box);
      d.label.setAttribute('x', (d.cx + (d.rpx + 3) * unit).toFixed(2));
      d.label.setAttribute('y', (d.cy - (d.rpx + 1) * unit).toFixed(2));
      d.label.setAttribute('font-size', (12 * unit).toFixed(2));
      d.label.setAttribute('stroke-width', (3 * unit).toFixed(2));
    });
  }

  function fitToData() {
    const { cw, ch } = mapSize();
    const b = mapState.fit;
    if (!b) { mapState.cx = MAP_W / 2; mapState.cy = MAP_H / 2; mapState.w = MAP_W; }
    else {
      const ratio = cw / ch;
      const bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 1);
      mapState.w = Math.min(MAP_W * 1.1, Math.max(bw * 1.25, bh * 1.35 * ratio, 160));
      mapState.cx = (b.x0 + b.x1) / 2; mapState.cy = (b.y0 + b.y1) / 2;
    }
    mapState.needsFit = false;
    mapState.touched = false;
    applyView();
  }

  function zoomBy(factor, anchorX, anchorY) {
    mapState.touched = true;
    // anchor in Bildschirmanteilen (0..1); ohne Angabe Mitte
    const { cw, ch } = mapSize();
    const ax = anchorX ?? 0.5, ay = anchorY ?? 0.5;
    const w0 = mapState.w, h0 = w0 * ch / cw;
    const wx = mapState.cx - w0 / 2 + ax * w0, wy = mapState.cy - h0 / 2 + ay * h0;
    const w1 = Math.max(60, Math.min(MAP_W * 1.1, w0 / factor)), h1 = w1 * ch / cw;
    mapState.w = w1;
    mapState.cx = wx - ax * w1 + w1 / 2;
    mapState.cy = wy - ay * h1 + h1 / 2;
    applyView();
  }

  function initMapInteraction() {
    const el = document.getElementById('route-map');
    const pointers = new Map();
    let pinchDist = null;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pinchDist = pointers.size === 2 ? Math.hypot(...[...pointers.values()].reduce((a, p, i) => i ? [a[0] - p.x, a[1] - p.y] : [p.x, p.y], [])) : null;
    });
    el.addEventListener('pointermove', e => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      const { cw } = mapSize();
      if (pointers.size === 1) {
        const unit = mapState.w / cw;
        mapState.touched = true;
        mapState.cx -= (cur.x - prev.x) * unit;
        mapState.cy -= (cur.y - prev.y) * unit;
        applyView();
      } else if (pointers.size === 2) {
        pointers.set(e.pointerId, cur);
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist) {
          const rect = el.getBoundingClientRect();
          zoomBy(dist / pinchDist, ((a.x + b.x) / 2 - rect.left) / rect.width, ((a.y + b.y) / 2 - rect.top) / rect.height);
        }
        pinchDist = dist;
        return;
      }
      pointers.set(e.pointerId, cur);
    });
    const end = e => { pointers.delete(e.pointerId); pinchDist = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    }, { passive: false });

    document.getElementById('map-zoom-in').addEventListener('click', () => zoomBy(1.6));
    document.getElementById('map-zoom-out').addEventListener('click', () => zoomBy(1 / 1.6));
    document.getElementById('map-zoom-reset').addEventListener('click', fitToData);
    document.getElementById('map-fullscreen-btn').addEventListener('click', () => {
      const card = document.getElementById('card-map');
      const on = card.classList.toggle('map-fullscreen');
      document.body.style.overflow = on ? 'hidden' : '';
      document.getElementById('map-fullscreen-btn').textContent = on ? '✕ Schließen' : '⤢ Vollbild';
      requestAnimationFrame(fitToData);
    });
    // Größenänderung (Tab-Wechsel, Drehen, Vollbild): Fenster neu anpassen.
    // Hat der Nutzer noch nicht gezoomt/geschoben, wird die Erstansicht mit der
    // echten Containergröße neu berechnet (beim ersten Render ist der Tab oft noch unsichtbar).
    if (window.ResizeObserver) new ResizeObserver(() => { if (mapState.needsFit || !mapState.touched) fitToData(); else applyView(); }).observe(el);
  }

  function countryName(iso) {
    try { return new Intl.DisplayNames(['de'], { type: 'region' }).of(iso) || iso; } catch (e) { return iso; }
  }
  function flag(iso) {
    return String.fromCodePoint(...[...iso].map(c => 127397 + c.charCodeAt(0)));
  }

  function renderRouteMap() {
    const el = document.getElementById('route-map');
    if (!el) return;

    const list = getFilteredTrips();   // gleiche Filter wie der Trip-Log (siehe app.js)
    const statsEl = document.getElementById('route-map-stats');
    const unkEl = document.getElementById('route-map-unknown');
    const chipsEl = document.getElementById('route-map-countries');
    const { legs, visits, unknown, unparsed, flownKm, plannedKm, countriesFlown, countriesPlanned } = usedLegs(list);

    const notes = [];
    if (unknown.size) notes.push(`Unbekannte Flughafencodes: ${[...unknown].map(escHtml).join(', ')}`);
    if (unparsed.length) notes.push(`Ohne erkennbare Strecke (kein IATA-Code in Großbuchstaben): ${[...new Set(unparsed)].slice(0, 6).map(escHtml).join(' · ')}`);
    unkEl.style.display = notes.length ? 'block' : 'none';
    unkEl.innerHTML = notes.map(n => '⚠️ ' + n).join('<br>');

    if (legs.size === 0) {
      el.innerHTML = '<div class="empty" style="margin:20px;">Noch keine darstellbaren Strecken — trage im Trip-Log Strecken wie „FRA–FCO–FRA“ (IATA-Codes) ein.</div>';
      statsEl.textContent = '';
      chipsEl.innerHTML = '';
      mapState.dots = [];
      return;
    }

    const arcs = [...legs.values()].map(leg => {
      const n = Math.max(6, Math.min(60, Math.round(leg.km / 150)));
      return { leg, pts: greatCirclePoints(leg.a, leg.b, n) };
    });

    // Sichtfenster der Daten (in Karteneinheiten) für „zurücksetzen“/Erstansicht
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    arcs.forEach(({ pts }) => pts.forEach(([lo, la]) => {
      x0 = Math.min(x0, projX(lo)); x1 = Math.max(x1, projX(lo));
      y0 = Math.min(y0, projY(la)); y1 = Math.max(y1, projY(la));
    }));
    mapState.fit = { x0, x1, y0, y1 };

    const f = v => v.toFixed(1);
    let grid = '';
    for (let lo = -150; lo <= 180; lo += 30) grid += `<line x1="${f(projX(lo))}" y1="0" x2="${f(projX(lo))}" y2="${MAP_H}"/>`;
    for (let la = -60; la <= 90; la += 30) grid += `<line x1="0" y1="${f(projY(la))}" x2="${MAP_W}" y2="${f(projY(la))}"/>`;

    const lines = arcs.map(({ leg, pts }) => {
      const segs = [[]];
      pts.forEach((p, i) => {
        if (i > 0 && Math.abs(p[0] - pts[i - 1][0]) > 180) segs.push([]);
        segs[segs.length - 1].push(p);
      });
      const d = segs.filter(sg => sg.length > 1).map(sg => 'M' + sg.map(([lo, la]) => f(projX(lo)) + ' ' + f(projY(la))).join('L')).join('');
      const total = leg.flown + leg.planned;
      const w = Math.min(5, 1.6 + 0.9 * Math.log2(1 + total));
      const title = `<title>${escHtml(leg.a.code)} ↔ ${escHtml(leg.b.code)} · ${Math.round(leg.km).toLocaleString('de-DE')} km · ${leg.flown ? Math.round(leg.flown) + '× geflogen' : ''}${leg.flown && leg.planned ? ', ' : ''}${leg.planned ? Math.round(leg.planned) + '× geplant' : ''}</title>`;
      let out = `<path d="${d}" class="rm-halo" style="stroke-width:${(w + 2.2).toFixed(1)}px"/>`;
      if (leg.flown > 0) out += `<path d="${d}" class="rm-leg flown" style="stroke-width:${w.toFixed(1)}px">${title}</path>`;
      if (leg.planned > 0) out += `<path d="${d}" class="rm-leg planned" style="stroke-width:${(leg.flown > 0 ? 1.6 : w).toFixed(1)}px">${leg.flown > 0 ? '' : title}</path>`;
      return out;
    }).join('');

    const ranked = [...visits.entries()].sort((a, b) => b[1] - a[1]);
    const labelled = new Set(ranked.slice(0, 25).map(r => r[0]));
    const dotsHtml = ranked.map(([code, v]) => {
      const a = airportOf(code);
      const micro = !WORLD_COUNTRIES[a.country];   // Land ohne Fläche im 110m-Datensatz
      return `<circle class="rm-dot${micro ? ' micro' : ''}" data-code="${code}" cx="${f(projX(a.lon))}" cy="${f(projY(a.lat))}"><title>${escHtml(code)} · ${escHtml(a.city)} (${escHtml(countryName(a.country))}) · ${Math.round(v)}× besucht</title></circle>` +
        (labelled.has(code) ? `<text class="rm-label" data-code="${code}">${escHtml(code)}</text>` : '');
    }).join('');

    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Streckenkarte" preserveAspectRatio="xMidYMid meet">
      <rect x="-3000" y="-3000" width="${MAP_W + 6000}" height="${MAP_H + 6000}" class="rm-sea"/>
      <g class="rm-grid">${grid}</g>
      <g>${countryPaths()}</g>
      <g fill="none">${lines}</g>
      ${dotsHtml}
    </svg>`;

    const svg = el.querySelector('svg');
    countriesFlown.forEach(iso => { const p = svg.querySelector(`.rm-c[data-iso="${iso}"]`); if (p) p.classList.add('visited'); });
    countriesPlanned.forEach(iso => { const p = svg.querySelector(`.rm-c[data-iso="${iso}"]`); if (p) p.classList.add('planned'); });

    mapState.dots = ranked.map(([code, v]) => {
      const a = airportOf(code);
      const circle = svg.querySelector(`circle[data-code="${code}"]`);
      const micro = !WORLD_COUNTRIES[a.country];
      return {
        circle, label: svg.querySelector(`text[data-code="${code}"]`),
        cx: projX(a.lon), cy: projY(a.lat), rpx: (micro ? 6 : 3.5) + Math.min(5, Math.sqrt(v))
      };
    });
    mapState.needsFit = true;
    fitToData();

    const km = Math.round(flownKm), earth = flownKm / 40075;
    const parts = [`${legs.size} Strecke${legs.size === 1 ? '' : 'n'}`, `${visits.size} Flughäfen`];
    if (countriesFlown.size) parts.push(`${countriesFlown.size === 1 ? '1 Land' : countriesFlown.size + ' Länder'} besucht`);
    if (flownKm > 0) parts.push(`${km.toLocaleString('de-DE')} km geflogen (${earth.toLocaleString('de-DE', { maximumFractionDigits: 1 })}× um die Erde)`);
    if (plannedKm > 0) parts.push(`${Math.round(plannedKm).toLocaleString('de-DE')} km geplant`);
    statsEl.textContent = parts.join(' · ') + ' — Luftlinie (Großkreis) je Teilstrecke, nicht die real geflogene Distanz.';

    const chip = (iso, cls) => `<span class="chip ${cls}">${flag(iso)} ${escHtml(countryName(iso))}</span>`;
    chipsEl.innerHTML =
      [...countriesFlown].sort((a, b) => countryName(a).localeCompare(countryName(b), 'de')).map(i => chip(i, 'visited')).join('') +
      [...countriesPlanned].sort((a, b) => countryName(a).localeCompare(countryName(b), 'de')).map(i => chip(i, 'planned')).join('');
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

  initMapInteraction();
  initPlanner();

  // Teilstrecken eines Trips (Paare aufeinanderfolgender IATA-Codes) mit Gewicht
  // (Segmentzahl / Zahl der Teilstrecken) und Luftlinien-Kilometern.
  function tripLegs(t) {
    const { known } = parseRoute(t.route);
    const pairs = [];
    for (let i = 0; i < known.length - 1; i++) if (known[i] !== known[i + 1]) pairs.push([known[i], known[i + 1]]);
    const weight = pairs.length ? (t.segments || pairs.length) / pairs.length : 0;
    return pairs.map(([from, to]) => ({ from, to, weight, km: distanceKm(airportOf(from), airportOf(to)) }));
  }
  function tripKm(t) {
    return tripLegs(t).reduce((s, l) => s + l.km * l.weight, 0);
  }

  // Für Tests/Debugging und die Statistik (extras.js) erreichbar.
  window.MMMap = { parseRoute, distanceKm, airportOf, computePlannerOptions, searchAirports, tripLegs, tripKm };
})();
