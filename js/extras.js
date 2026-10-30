/*
 * Zusatzfunktionen: Kontoabgleich, Gutscheine & Benefits, Jahresplan (Checkliste),
 * Statistik und Backup/Import. Nutzt die Daten und Hilfsfunktionen aus app.js
 * (trips, vouchers, reconcileLog, yearPlan, levers, settings, computeAchievedTotals,
 * saveXxx, render, ...) und MMMap aus map.js.
 */
(() => {
  const esc = escHtml;
  const fmt = n => Math.round(n).toLocaleString('de-DE');
  const today = () => new Date().toISOString().slice(0, 10);
  const pad = n => String(n).padStart(2, '0');
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));

  // ================================================================ Kontoabgleich

  function appNow() { return computeAchievedTotals(currentProgramYear()); }

  async function runReconcile() {
    const num = id => { const v = document.getElementById(id).value; return v === '' ? NaN : parseInt(v); };
    const p = num('rc-p'), q = num('rc-q'), m = num('rc-m');
    const result = document.getElementById('rc-result');
    if (isNaN(p) || isNaN(q) || isNaN(m)) { result.innerHTML = '<p class="hint">Bitte Points, QP und Meilen laut Konto eintragen.</p>'; return; }
    const app = appNow();
    reconcileLog.push({ id: genId(), date: document.getElementById('rc-date').value || today(), accP: p, accQ: q, accM: m, appP: app.p, appQ: app.q, appM: app.m });
    reconcileLog = reconcileLog.slice(-20);
    await saveReconcile();
    render();
  }

  window.bookReconcileGround = async function() {
    const last = reconcileLog[reconcileLog.length - 1];
    if (!last) return;
    const app = appNow(), cy = currentProgramYear();
    const dP = last.accP - app.p, dQ = last.accQ - app.q;
    if (!confirm(`Differenz (${sign(dP)} Points / ${sign(dQ)} QP) als Boden-Punkte ${cy} verbuchen?`)) return;
    const g = groundFor(cy);
    groundByYear[cy] = { points: g.p + dP, qp: g.q + dQ };
    await saveGround();
    loadGroundInputs();
    render();
  };

  window.bookReconcileMiles = async function() {
    const last = reconcileLog[reconcileLog.length - 1];
    if (!last) return;
    const dM = last.accM - appNow().m;
    if (!confirm(`Meilen-Differenz (${sign(dM)}) als Korrektur im Meilen-Tab verbuchen?`)) return;
    milesLog.push({ id: genId(), date: last.date, category: 'Kulanz/Sonstiges', source: '', amount: dM, note: `Kontoabgleich vom ${last.date}` });
    await saveMilesLog();
    render();
  };

  function renderReconcile() {
    const res = document.getElementById('rc-result');
    const hist = document.getElementById('rc-history');
    if (!res) return;
    const last = reconcileLog[reconcileLog.length - 1];
    if (!last) { res.innerHTML = ''; hist.innerHTML = ''; return; }
    const app = appNow();
    const d = { p: last.accP - app.p, q: last.accQ - app.q, m: last.accM - app.m };
    const row = (label, acc, mine, diff) => `<tr><td>${label}</td><td>${fmt(acc)}</td><td>${fmt(mine)}</td><td style="font-weight:700; color:${diff === 0 ? 'var(--green)' : 'var(--red)'};">${diff === 0 ? '✓' : sign(diff)}</td></tr>`;
    let html = `<div style="overflow-x:auto;"><table><thead><tr><th></th><th>Konto (${esc(last.date)})</th><th>App jetzt</th><th>Differenz</th></tr></thead><tbody>
      ${row('Points', last.accP, app.p, d.p)}${row('QP', last.accQ, app.q, d.q)}${row('Meilen', last.accM, app.m, d.m)}</tbody></table></div>`;
    if (d.p === 0 && d.q === 0 && d.m === 0) {
      html += '<p class="hint" style="color:var(--green); font-weight:600;">✅ App und Konto stimmen überein.</p>';
    } else {
      const hints = [];
      if (d.p < 0 || d.q < 0) hints.push('Die App rechnet <b>mehr</b> als dein Konto: doppelt erfasste Trips, Partnerflüge (keine QP), noch nicht gutgeschriebene Flüge oder zu Unrecht als „geflogen“ markierte Trips prüfen.');
      if (d.p > 0 || d.q > 0) hints.push('Dein Konto hat <b>mehr</b>: vermutlich fehlen Flüge, Hotels, Kulanz- oder Aktionspunkte in der App.');
      if (d.m !== 0) hints.push('Meilen weichen ab: Meilenbuchungen, Kartenumsätze oder Einlösungen sind eventuell nicht erfasst.');
      html += `<p class="hint">${hints.join('<br>')}</p>`;
      if (d.p !== 0 || d.q !== 0) html += `<button type="button" class="btn small secondary" style="margin-right:6px;" onclick="bookReconcileGround()">Als Boden-Punkte ${currentProgramYear()} verbuchen (${sign(d.p)} P / ${sign(d.q)} QP)</button>`;
      if (d.m !== 0) html += `<button type="button" class="btn small secondary" onclick="bookReconcileMiles()">Meilen-Korrektur verbuchen (${sign(d.m)})</button>`;
    }
    res.innerHTML = html;
    hist.innerHTML = reconcileLog.length > 1
      ? '<p class="hint" style="margin:8px 0 2px;">Frühere Abgleiche (Abweichung zum damaligen Zeitpunkt):</p>' +
        reconcileLog.slice(0, -1).slice(-4).reverse().map(r => `<div class="meta-line" style="font-size:11.5px; color:var(--muted);">${esc(r.date)}: Points ${sign(r.accP - r.appP)} · QP ${sign(r.accQ - r.appQ)} · Meilen ${sign(r.accM - r.appM)}</div>`).join('')
      : '';
  }
  window.renderReconcile = renderReconcile;

  function daysSinceLastReconcile() {
    const last = reconcileLog[reconcileLog.length - 1];
    return last ? Math.floor((Date.now() - new Date(last.date)) / 86400000) : Infinity;
  }

  // ================================================================ Gutscheine

  const VOUCHER_TYPES = { evoucher: '🎫 eVoucher', upgrade: '⬆️ Upgrade-Gutschein', lounge: '🛋️ Lounge-Zutritt', other: '🎟️ Sonstiges' };
  let editingVoucherId = null;
  let showUsedVouchers = false;

  function voucherTag(v) {
    if (!v.expires) return '<span class="tag ok">ohne Ablaufdatum</span>';
    const d = daysUntil(v.expires);
    if (d < 0) return '<span class="tag low">abgelaufen</span>';
    if (d <= 30) return `<span class="tag low">noch ${d} Tage!</span>`;
    if (d <= 90) return `<span class="tag mid">noch ${d} Tage</span>`;
    return `<span class="tag ok">noch ${d} Tage</span>`;
  }

  function renderVouchers() {
    const list = document.getElementById('voucher-list');
    if (!list) return;
    const open = vouchers.filter(v => !v.used).sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
    const used = vouchers.filter(v => v.used).sort((a, b) => (b.usedDate || '').localeCompare(a.usedDate || ''));
    document.getElementById('voucher-count').textContent = open.length;

    const hint = document.getElementById('voucher-hint');
    const sy = seasonYear();
    const reached700 = goalAchievedTotals().q >= 700;
    const haveEvoucher = vouchers.some(v => v.type === 'evoucher' && (v.createdAt || '').startsWith(sy));
    hint.style.display = reached700 && !haveEvoucher ? 'block' : 'none';
    hint.textContent = `🎯 700 QP in ${sy} erreicht — falls dein eVoucher bereits freigeschaltet ist, trag ihn hier mit Ablaufdatum ein.`;

    const card = v => {
      const call = `'${v.id}'`;
      return `<div class="trip">
        <div class="top">
          <div>
            <div class="route">${VOUCHER_TYPES[v.type] || VOUCHER_TYPES.other} · ${esc(v.title)}</div>
            ${v.expires ? `<div class="meta">läuft ab: ${esc(v.expires)}</div>` : ''}
            ${v.used ? `<div class="meta">✅ eingelöst am ${esc(v.usedDate || '–')}</div>` : ''}
            ${v.note ? `<div class="meta">📝 ${esc(v.note)}</div>` : ''}
          </div>
          <div class="pts">${v.used ? '<span class="tag ok">eingelöst</span>' : voucherTag(v)}</div>
        </div>
        <div class="flex-between" style="margin-top:6px; gap:6px; flex-wrap:wrap;">
          <button class="del" onclick="deleteVoucher(${call})">entfernen</button>
          <span style="display:flex; gap:6px; flex-wrap:wrap;">
            ${v.used
              ? `<button type="button" class="btn small secondary" onclick="reopenVoucher(${call})">↩️ Wieder öffnen</button>`
              : `${v.expires ? `<button type="button" class="btn small secondary" onclick="voucherIcs(${call})">📅 Kalender</button>` : ''}
                 <button type="button" class="btn small secondary" onclick="startEditVoucher(${call})">✏️</button>
                 <button type="button" class="btn small" style="background:var(--green); color:white;" onclick="markVoucherUsed(${call})">✅ Eingelöst</button>`}
          </span>
        </div>
      </div>`;
    };

    let html = open.length ? open.map(card).join('') : '<div class="empty">Keine offenen Gutscheine.</div>';
    if (used.length) {
      html += `<button type="button" class="btn small secondary" style="width:100%; margin-top:10px;" onclick="toggleUsedVouchers()">${showUsedVouchers ? '▴ Eingelöste ausblenden' : `▾ Eingelöste anzeigen (${used.length})`}</button>`;
      if (showUsedVouchers) html += used.map(card).join('');
    }
    list.innerHTML = html;
  }
  window.renderVouchers = renderVouchers;

  window.toggleUsedVouchers = function() { showUsedVouchers = !showUsedVouchers; renderVouchers(); };
  window.markVoucherUsed = async function(id) {
    const v = vouchers.find(x => x.id === id); if (!v) return;
    v.used = true; v.usedDate = today();
    await saveVouchers(); render();
  };
  window.reopenVoucher = async function(id) {
    const v = vouchers.find(x => x.id === id); if (!v) return;
    v.used = false; v.usedDate = null;
    await saveVouchers(); render();
  };
  window.deleteVoucher = async function(id) {
    vouchers = vouchers.filter(x => x.id !== id);
    await saveVouchers(); render();
  };
  window.voucherIcs = function(id) {
    const v = vouchers.find(x => x.id === id);
    if (v && v.expires) downloadIcs(`Gutschein läuft ab: ${v.title}`, v.expires, v.note, 'Gutschein');
  };
  window.startEditVoucher = function(id) {
    const v = vouchers.find(x => x.id === id); if (!v) return;
    editingVoucherId = id;
    document.getElementById('vo-type').value = v.type;
    document.getElementById('vo-title').value = v.title || '';
    document.getElementById('vo-expires').value = v.expires || '';
    document.getElementById('vo-note').value = v.note || '';
    document.getElementById('voucher-submit-btn').textContent = 'Änderungen speichern';
    document.getElementById('voucher-cancel-btn').style.display = 'block';
    const det = document.getElementById('voucher-details'); det.open = true;
    det.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  window.cancelEditVoucher = function() {
    editingVoucherId = null;
    document.getElementById('voucher-form').reset();
    document.getElementById('voucher-submit-btn').textContent = 'Gutschein speichern';
    document.getElementById('voucher-cancel-btn').style.display = 'none';
  };

  // ================================================================ Jahresplan

  // m = Zeitfenster [Monat von, Monat bis]; always = gilt ganzjährig und erscheint nur,
  // solange auto() nicht erfüllt ist; auto() = erkennt die App den Punkt selbst als erledigt.
  const reconciledIn = (year, month) => reconcileLog.some(r => (r.date || '').startsWith(`${year}-${pad(month)}`));
  const YEAR_TASKS = [
    { id: 'close_prev', m: [1, 3], title: 'Vorjahr abschließen (Jahres-Archiv)', hint: 'Dashboard → Jahres-Archiv, sobald Miles & More den Status fürs neue Jahr gesetzt hat.',
      auto: y => yearArchive.some(a => a.year === String(y - 1)) },
    { id: 'reset_base', m: [1, 3], title: 'Basiswerte aufs neue Jahr setzen und mit dem Konto abgleichen', hint: 'Points/QP starten neu; Karte „Kontoabgleich“ nutzen.' },
    { id: 'season_goal', m: [1, 2], title: 'Zielstatus für dieses Jahr festlegen', hint: 'Zielschalter im Dashboard, ggf. Boden-Punkte eintragen.' },
    { id: 'vouchers_in', m: [1, 3], title: 'Neue Gutscheine und Benefits aus dem Konto eintragen', hint: 'Karte „Gutscheine & Benefits“.' },
    { id: 'status_valid', m: [2, 3], title: 'Statusgültigkeit im Konto prüfen und als Frist eintragen', hint: 'Karte „Fristen & Ablaufdaten“.' },
    { id: 'recon_q1', m: [3, 3], title: 'Kontoabgleich zum Quartalsende (Q1)', auto: y => reconciledIn(y, 3) },
    { id: 'recon_q2', m: [6, 6], title: 'Kontoabgleich zum Quartalsende (Q2)', auto: y => reconciledIn(y, 6) },
    { id: 'tempo_mid', m: [6, 7], title: 'Halbjahres-Check: Tempo-Tracker ansehen — ist das Ziel noch realistisch?', hint: 'Karte „Tempo & Quartale“.' },
    { id: 'recon_q3', m: [9, 9], title: 'Kontoabgleich zum Quartalsende (Q3)', auto: y => reconciledIn(y, 9) },
    { id: 'promos', m: [9, 10], title: 'Jahresend-Aktionen recherchieren', hint: 'Mehr → Aktions-Vorlagen aktualisieren; Boosts für Points/QP gibt es oft im Herbst.' },
    { id: 'decide_run', m: [9, 10], title: 'Entscheiden: Status-Run oder Status-Kauf, falls das Ziel knapp ist', hint: 'Prognose-Karte und Streckenplaner (Rechner-Tab).' },
    { id: 'levers', m: [10, 11], title: 'Hebel einplanen und nutzen: Kreditkarten-Tausch, 800-QP-Tausch', hint: 'Karte „Genutzte Hebel“ in der Prognose.',
      auto: y => levers.some(l => (l.date || '').startsWith(String(y))) },
    { id: 'uptrip', m: [10, 12], title: 'Uptrip-Kollektionen einlösen, bevor das Jahr endet', hint: 'Tab Sammeln.' },
    { id: 'vouchers_exp', m: [11, 12], title: 'Ablaufende Gutscheine prüfen oder einlösen', hint: 'Karte „Gutscheine & Benefits“.',
      auto: () => !vouchers.some(v => !v.used && v.expires && daysUntil(v.expires) >= 0 && daysUntil(v.expires) <= 60) },
    { id: 'last_flights', m: [11, 12], title: 'Letzte Flüge für dieses Jahr buchen; CO₂-Kompensation nachträglich prüfen' },
    { id: 'trips_done', m: [12, 12], title: 'Alle stattgefundenen Flüge im Trip-Log auf „geflogen“ stellen',
      auto: y => !trips.some(t => t.planned && !t.historical && (t.date || '') < today() && (t.date || '').startsWith(String(y))) },
    { id: 'hotels_done', m: [12, 12], title: 'Alle stattgefundenen Hotelaufenthalte live schalten',
      auto: y => !plannedHotels.some(h => h.planned !== false && (h.dateFrom || '') < today() && (h.dateFrom || '').startsWith(String(y))) },
    { id: 'recon_q4', m: [12, 12], title: 'Kontoabgleich zum Jahresende', auto: y => reconciledIn(y, 12) },
    { id: 'recon_30', always: true, title: 'Kontoabgleich ist älter als 30 Tage', hint: 'Karte „Kontoabgleich“.', auto: () => daysSinceLastReconcile() <= 30 },
    { id: 'backup_30', always: true, title: 'Backup ist älter als 30 Tage', hint: 'Mehr → Backup exportieren.',
      auto: () => !!settings.lastBackup && Math.floor((Date.now() - new Date(settings.lastBackup)) / 86400000) <= 30 }
  ];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function taskDone(t, year) {
    if (t.auto && t.auto(year)) return true;
    return !!(yearPlan[year] && yearPlan[year][t.id]);
  }

  function renderYearPlan() {
    const now = document.getElementById('plan-now');
    if (!now) return;
    const year = Number(currentProgramYear()), month = new Date().getMonth() + 1;
    document.getElementById('plan-year').textContent = year;
    const phase = t => t.always ? 'due' : month < t.m[0] ? 'upcoming' : month > t.m[1] ? 'overdue' : 'due';
    const row = (t, showMonth) => {
      const done = taskDone(t, year);
      const control = t.auto && t.auto(year)
        ? '<span title="von der App erkannt" style="font-size:16px;">✅</span>'
        : `<input type="checkbox" style="width:auto; margin-top:2px;" ${done ? 'checked' : ''} onchange="toggleYearTask('${t.id}')">`;
      const when = t.always ? 'laufend' : (t.m[0] === t.m[1] ? MONTHS[t.m[0] - 1] : `${MONTHS[t.m[0] - 1]}–${MONTHS[t.m[1] - 1]}`);
      return `<div style="display:flex; gap:10px; align-items:flex-start; margin-top:8px; ${done ? 'opacity:0.55;' : ''}">
        ${control}
        <div style="flex:1;">
          <div style="font-weight:600; color:var(--navy); font-size:13px;">${esc(t.title)}${showMonth ? ` <span style="font-weight:400; color:var(--muted);">· ${when}</span>` : ''}</div>
          ${t.hint ? `<div style="font-size:11.5px; color:var(--muted);">${esc(t.hint)}</div>` : ''}
        </div>
      </div>`;
    };

    const open = YEAR_TASKS.filter(t => !taskDone(t, year) && phase(t) !== 'upcoming');
    const overdue = open.filter(t => phase(t) === 'overdue'), due = open.filter(t => phase(t) === 'due');
    document.getElementById('plan-count').textContent = open.length;
    let html = '';
    if (due.length) html += `<div style="font-weight:700; color:var(--navy); font-size:12px; text-transform:uppercase; margin-top:4px;">Jetzt dran (${MONTHS[month - 1]})</div>` + due.map(t => row(t, false)).join('');
    if (overdue.length) html += `<div style="font-weight:700; color:var(--red); font-size:12px; text-transform:uppercase; margin-top:14px;">Überfällig</div>` + overdue.map(t => row(t, true)).join('') + `<button type="button" class="btn small secondary" style="margin-top:12px;" onclick="markPastTasksDone()">Alles Überfällige als erledigt abhaken</button>`;
    now.innerHTML = html || '<div class="empty">✅ Für diesen Monat ist alles erledigt.</div>';

    // Alle Monate (nach Startmonat gruppiert, „laufend“ am Ende)
    let all = '';
    for (let m = 1; m <= 12; m++) {
      const ts = YEAR_TASKS.filter(t => !t.always && t.m[0] === m);
      if (!ts.length) continue;
      all += `<div style="font-weight:700; color:var(--navy); font-size:12px; margin-top:12px;${m === month ? ' text-decoration:underline;' : ''}">${MONTHS[m - 1]}</div>` + ts.map(t => row(t, false)).join('');
    }
    all += `<div style="font-weight:700; color:var(--navy); font-size:12px; margin-top:12px;">Laufend</div>` + YEAR_TASKS.filter(t => t.always).map(t => row(t, false)).join('');
    document.getElementById('plan-all').innerHTML = all;
  }
  window.renderYearPlan = renderYearPlan;

  // Praktisch beim ersten Einrichten mitten im Jahr: alles, dessen Zeitfenster
  // schon vorbei ist, auf einmal abhaken (nur manuelle Punkte; Automatik bleibt).
  window.markPastTasksDone = async function() {
    const y = currentProgramYear(), month = new Date().getMonth() + 1;
    yearPlan[y] = yearPlan[y] || {};
    YEAR_TASKS.filter(t => !t.always && month > t.m[1] && !(t.auto && t.auto(Number(y)))).forEach(t => { yearPlan[y][t.id] = true; });
    await saveYearPlan();
    render();
  };

  window.toggleYearTask = async function(id) {
    const y = currentProgramYear();
    yearPlan[y] = yearPlan[y] || {};
    yearPlan[y][id] = !yearPlan[y][id];
    await saveYearPlan();
    render();
  };

  // ================================================================ Statistik

  function bars(entries, unit) {
    const max = Math.max(1, ...entries.map(e => e.value));
    return entries.map(e => `<div style="margin-top:6px;">
      <div class="flex-between" style="font-size:12px;"><span>${esc(e.label)}</span><span style="font-weight:700;">${e.text ?? fmt(e.value) + (unit ? ' ' + unit : '')}</span></div>
      <div class="bar-bg" style="height:6px;"><div class="bar-fill q" style="width:${Math.max(3, e.value / max * 100)}%"></div></div>
    </div>`).join('');
  }
  const block = (title, inner) => inner ? `<div style="margin-top:16px;"><div style="font-weight:700; color:var(--navy); font-size:13px;">${title}</div>${inner}</div>` : '';

  function renderStats() {
    const el = document.getElementById('stats-body');
    if (!el || !window.MMMap) return;
    const flown = getFilteredTrips().filter(t => !t.planned);
    if (!flown.length) { el.innerHTML = '<div class="empty">Keine geflogenen Trips für diesen Filter.</div>'; return; }

    let segs = 0, km = 0, pts = 0, qp = 0, cost = 0, costQp = 0, costQpTrips = 0;
    const routes = new Map(), airports = new Map(), airlines = new Map(), classes = {}, countries = new Set();
    let longest = null;
    flown.forEach(t => {
      segs += t.segments || 0; pts += tripPoints(t); qp += tripQP(t);
      if (t.cost > 0) { cost += t.cost; if (tripQP(t) > 0) { costQp += t.cost; costQpTrips += tripQP(t); } }
      classes[t.cls] = (classes[t.cls] || 0) + (t.segments || 0);
      const al = (t.airline || '').trim() || 'ohne Angabe';
      airlines.set(al, (airlines.get(al) || 0) + (t.segments || 0));
      MMMap.tripLegs(t).forEach(l => {
        km += l.km * l.weight;
        const key = [l.from, l.to].sort().join(' – ');
        routes.set(key, (routes.get(key) || 0) + l.weight);
        [l.from, l.to].forEach(c => { airports.set(c, (airports.get(c) || 0) + l.weight / 2); countries.add(AIRPORTS[c][3]); });
        if (!longest || l.km > longest.km) longest = { label: `${l.from} – ${l.to}`, km: l.km };
      });
    });
    const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

    const kpi = (n, l) => `<div class="stat"><div class="num" style="font-size:18px;">${n}</div><div class="lbl">${l}</div></div>`;
    let html = `<div class="stat-row" style="flex-wrap:wrap;">${kpi(flown.length, 'Trips')}${kpi(fmt(segs), 'Segmente')}${kpi(fmt(km), 'Flug-km')}</div>
      <div class="stat-row" style="flex-wrap:wrap; margin-top:8px;">${kpi(fmt(pts), 'Points')}${kpi(fmt(qp), 'QP')}${kpi(countries.size, 'Länder')}</div>`;

    const facts = [];
    if (segs) facts.push(`Ø ${fmt(pts / segs)} Points und ${fmt(km / segs)} km je Segment`);
    if (longest) facts.push(`Längste Teilstrecke: ${longest.label} (${fmt(longest.km)} km)`);
    if (cost > 0) facts.push(`Ausgaben: ${cost.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${costQpTrips > 0 ? ` · Ø ${(costQp / costQpTrips).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/QP` : ''}`);
    if (facts.length) html += `<p class="hint" style="margin:10px 0 0;">${facts.join('<br>')}</p>`;

    html += block('Top-Strecken', bars(top(routes, 5).map(([k, v]) => ({ label: k, value: v, text: Math.round(v) + '×' })), ''));
    html += block('Top-Flughäfen', bars(top(airports, 5).map(([k, v]) => ({ label: `${k} · ${AIRPORTS[k][2]}`, value: v, text: Math.round(v) + '×' })), ''));
    html += block('Airlines (Segmente)', bars(top(airlines, 5).map(([k, v]) => ({ label: k, value: v, text: fmt(v) })), ''));

    const clsLabel = { economy: 'Economy', premium: 'Premium Eco.', business: 'Business', first: 'First' };
    const clsColor = { economy: '#adb5bd', premium: '#74c0fc', business: '#1f4e8c', first: '#c9a227' };
    const totalSeg = Object.values(classes).reduce((a, b) => a + b, 0) || 1;
    html += block('Klassen (Anteil der Segmente)',
      `<div style="display:flex; height:12px; border-radius:6px; overflow:hidden; margin-top:6px;">${Object.keys(clsLabel).filter(c => classes[c]).map(c => `<div style="width:${classes[c] / totalSeg * 100}%; background:${clsColor[c]};" title="${clsLabel[c]}"></div>`).join('')}</div>
       <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:6px; font-size:11.5px; color:var(--muted);">${Object.keys(clsLabel).filter(c => classes[c]).map(c => `<span><span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${clsColor[c]}; margin-right:4px;"></span>${clsLabel[c]} ${Math.round(classes[c] / totalSeg * 100)} %</span>`).join('')}</div>`);

    // Flugzeuge & Sitze: nur Teilstrecken, für die Details hinterlegt sind
    const legInfos = flown.flatMap(tripFlightInfos);
    const tally = (key, norm = x => x) => {
      const m = new Map();
      legInfos.forEach(f => { const v = norm((f[key] || '').trim()); if (v) m.set(v, (m.get(v) || 0) + 1); });
      return m;
    };
    if (legInfos.length) {
      const types = tally('aircraft'), tails = tally('registration'), seats = tally('seat');
      const letters = tally('seat', s => (s.match(/[A-Z]$/) || [''])[0]);
      const rep = new Map([...tails].filter(([, n]) => n > 1));
      const asBars = (m, n) => bars(top(m, n).map(([k, v]) => ({ label: k, value: v, text: v + '×' })), '');
      html += `<p class="hint" style="margin:16px 0 0;"><b>Flugzeuge &amp; Sitze</b> — Basis: ${legInfos.length} Teilstrecken mit hinterlegten Flugdetails.</p>`;
      html += block('Flugzeugtypen', asBars(types, 6));
      html += block('Kennzeichen (am häufigsten)', rep.size ? asBars(rep, 5) : (tails.size ? '<div class="hint" style="margin:4px 0 0;">Noch kein Flugzeug mehrfach geflogen.</div>' : ''));
      html += block('Sitzplätze (am häufigsten)', asBars(seats, 5));
      html += block('Sitzbuchstaben', asBars(letters, 6));
    }

    // Je Jahr: alle geflogenen Trips, unabhängig vom Jahresfilter
    const byYear = {};
    trips.filter(t => !t.planned && t.date).forEach(t => {
      const y = t.date.slice(0, 4);
      const b = (byYear[y] = byYear[y] || { n: 0, seg: 0, km: 0, p: 0, q: 0, c: 0 });
      b.n += 1; b.seg += t.segments || 0; b.km += MMMap.tripKm(t); b.p += tripPoints(t); b.q += tripQP(t); b.c += t.cost || 0;
    });
    const years = Object.keys(byYear).sort().reverse();
    if (years.length) {
      const best = years.reduce((a, b) => byYear[b].p > byYear[a].p ? b : a);
      html += block('Je Jahr', `<div style="overflow-x:auto;"><table><thead><tr><th>Jahr</th><th>Trips</th><th>Segm.</th><th>km</th><th>Points</th><th>QP</th>${years.some(y => byYear[y].c > 0) ? '<th>€</th>' : ''}</tr></thead><tbody>
        ${years.map(y => { const b = byYear[y]; return `<tr${y === best ? ' style="font-weight:700;"' : ''}><td>${y}${y === best && years.length > 1 ? ' 🏆' : ''}</td><td>${b.n}</td><td>${fmt(b.seg)}</td><td>${fmt(b.km)}</td><td>${fmt(b.p)}</td><td>${fmt(b.q)}</td>${years.some(z => byYear[z].c > 0) ? `<td>${b.c ? fmt(b.c) : '–'}</td>` : ''}</tr>`; }).join('')}
        </tbody></table></div>`);
    }
    el.innerHTML = html;
  }
  window.renderStats = renderStats;

  // ================================================================ Backup

  function renderBackupStatus() {
    const el = document.getElementById('backup-status');
    if (!el) return;
    if (!settings.lastBackup) { el.textContent = 'Noch kein Backup exportiert.'; return; }
    const d = Math.floor((Date.now() - new Date(settings.lastBackup)) / 86400000);
    el.textContent = `Letztes Backup: ${settings.lastBackup} (vor ${d} Tag${d === 1 ? '' : 'en'})${d > 30 ? ' — Zeit für ein neues.' : ''}`;
  }
  window.renderBackupStatus = renderBackupStatus;

  async function exportBackup() {
    const msg = document.getElementById('backup-msg');
    msg.textContent = 'Sammle Daten …';
    const data = {};
    for (const key of ALL_DATA_KEYS) {
      const v = await DB.get(key, null);
      if (v !== null) data[key] = v;
    }
    const date = today();
    downloadBlob(JSON.stringify({ app: 'mm-tracker', version: 1, exportedAt: new Date().toISOString(), data }, null, 1), 'application/json', `mm-tracker-backup-${date}.json`);
    settings.lastBackup = date;
    await saveSettings();
    msg.textContent = `Backup mit ${Object.keys(data).length} Datenbereichen exportiert.`;
    render();
  }

  async function importBackup(file) {
    const msg = document.getElementById('backup-msg');
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || payload.app !== 'mm-tracker' || typeof payload.data !== 'object') throw new Error('Das ist keine Backup-Datei dieses Trackers.');
      const keys = Object.keys(payload.data).filter(k => ALL_DATA_KEYS.includes(k));
      if (!keys.length) throw new Error('Die Datei enthält keine bekannten Datenbereiche.');
      const summary = keys.map(k => Array.isArray(payload.data[k]) ? `${k}: ${payload.data[k].length}` : k).join(', ');
      if (!confirm(`Backup vom ${(payload.exportedAt || '').slice(0, 10) || 'unbekanntem Datum'} importieren?\n\nDabei werden diese Datenbereiche überschrieben:\n${summary}\n\nBereiche, die nicht in der Datei stehen, bleiben unverändert.`)) { msg.textContent = 'Import abgebrochen.'; return; }
      msg.textContent = 'Importiere …';
      for (const k of keys) await DB.set(k, payload.data[k]);
      await loadAll();
      msg.textContent = `Import abgeschlossen: ${keys.length} Datenbereiche wiederhergestellt.`;
    } catch (e) {
      msg.textContent = 'Import fehlgeschlagen: ' + e.message;
    }
  }

  // ================================================================ Archivflüge importieren

  // Flighty-Passport-Export (Datei bleibt außerhalb des Repos, siehe Import-Karte).
  // Übernimmt nur die verfügbaren Flugdaten; Punkte werden bewusst nicht berechnet (noPoints).
  const IMPORT_CLASS = { E: 'economy', B: 'business', F: 'first', W: 'premium', P: 'premium' };

  const routeCodes = (t) => String(t.route || '').split(/[\s\-–—→>\/,;]+/).filter(c => /^[A-Z]{3}$/.test(c));
  const legInfoFor = (f) => ({ flightNo: f.flightNo, from: f.from, to: f.to, date: f.date, duration: f.duration, aircraft: f.aircraft, registration: f.registration, cabin: f.cabin || '', seat: f.seat || '' });

  // Sucht den Trip, zu dem ein Flug gehört (gleiche Teilstrecke, höchstens 14 Tage Abstand).
  // 'enrich': Trip ist da, aber die Teilstrecke hat noch keine Flugdetails -> Details ergänzen.
  // 'fill': Teilstrecke hat Details, aber einzelne Felder sind leer -> nur die leeren Felder füllen.
  // 'skip': nichts zu ergänzen. 'fresh': Flug ist noch nicht im Tool.
  const LEG_FIELDS = ['flightNo', 'duration', 'aircraft', 'registration', 'cabin', 'seat'];
  const sameLeg = (f) => (x) => x.from === f.from && x.to === f.to && (!x.date || x.date === f.date);

  function matchImportedFlight(f) {
    const day = new Date(f.date).getTime();
    const cands = trips.filter(t => {
      if (Math.abs(new Date(t.date).getTime() - day) > 14 * 86400000) return false;
      const c = routeCodes(t);
      return c.some((code, i) => code === f.from && c[i + 1] === f.to);
    }).sort((a, b) => Math.abs(new Date(a.date) - day) - Math.abs(new Date(b.date) - day));
    if (!cands.length) return { status: 'fresh' };
    const open = cands.find(t => !tripFlightInfos(t).some(sameLeg(f)));
    if (open) return { status: 'enrich', trip: open };
    const trip = cands.find(t => tripFlightInfos(t).some(sameLeg(f)));
    const leg = tripFlightInfos(trip).find(sameLeg(f));
    const missing = LEG_FIELDS.filter(k => !String(leg[k] || '').trim() && String(f[k] || '').trim());
    return missing.length ? { status: 'fill', trip, missing } : { status: 'skip', trip };
  }

  function enrichTrip(t, f) {
    const codes = routeCodes(t);
    const legIdx = (x) => codes.findIndex((c, i) => c === x.from && codes[i + 1] === x.to);
    t.flightInfo = [...tripFlightInfos(t), legInfoFor(f)].sort((a, b) => legIdx(a) - legIdx(b));
    if (!(t.airline || '').trim() && f.airline) t.airline = f.airline;
  }

  function fillTrip(t, f, missing) {
    const infos = tripFlightInfos(t);
    const leg = infos.find(sameLeg(f));
    missing.forEach(k => { leg[k] = f[k]; });
    if (!leg.date) leg.date = f.date;
    t.flightInfo = infos;
    if (!(t.airline || '').trim() && f.airline) t.airline = f.airline;
  }

  // Reichweite nur als Anzeige-Label der Archivflüge: Europa (inkl. Kanaren) <-> Europa = kontinental.
  function importRange(f) {
    const a = AIRPORTS[f.from], b = AIRPORTS[f.to];
    if (!a || !b) return 'continental';
    const eu = (x) => x[4] === 'EU' || x[3] === 'ES';
    return eu(a) && eu(b) ? 'continental' : 'intercontinental';
  }

  async function importFlights(file) {
    const msg = document.getElementById('flights-import-msg');
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || payload.app !== 'mm-tracker-flights' || !Array.isArray(payload.flights)) throw new Error('Das ist keine Flug-Import-Datei dieses Trackers.');
      const fresh = [], enrich = [], fill = [], skipped = [];
      payload.flights.forEach(f => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '') || !/^[A-Z]{3}$/.test(f.from || '') || !/^[A-Z]{3}$/.test(f.to || '')) return;
        const m = matchImportedFlight(f);
        if (m.status === 'fresh') fresh.push(f);
        else if (m.status === 'enrich') enrich.push({ f, trip: m.trip });
        else if (m.status === 'fill') fill.push({ f, trip: m.trip, missing: m.missing });
        else skipped.push(f);
      });
      if (!fresh.length && !enrich.length && !fill.length) { msg.textContent = `Nichts zu tun: alle ${skipped.length} Flüge sind bereits mit Details im Tool.`; return; }
      const fmt = f => `${f.date} ${f.flightNo} ${f.from}–${f.to}`;
      const parts = [];
      if (enrich.length) parts.push(`${enrich.length} Flüge sind schon als Trip im Tool — nur Flugdetails (Flugnummer, Flugzeug, Kennzeichen, Sitz) werden ergänzt, Punkte und Klasse bleiben unverändert:\n${enrich.map(e => fmt(e.f)).join('\n')}`);
      if (fill.length) parts.push(`${fill.length} Flüge haben schon Details, dort werden nur leere Felder aufgefüllt (nichts wird überschrieben):\n${fill.map(e => fmt(e.f)).join('\n')}`);
      if (fresh.length) parts.push(`${fresh.length} Flüge sind neu und werden als „nur Flugdaten“ (ohne Punkte) angelegt:\n${fresh.map(fmt).join('\n')}`);
      if (skipped.length) parts.push(`${skipped.length} Flüge sind vollständig vorhanden und werden übersprungen.`);
      if (!confirm(parts.join('\n\n'))) { msg.textContent = 'Import abgebrochen.'; return; }
      enrich.forEach(e => enrichTrip(e.trip, e.f));
      fill.forEach(e => fillTrip(e.trip, e.f, e.missing));
      fresh.forEach(f => {
        trips.push({
          id: genId(), date: f.date, route: `${f.from}–${f.to}`, range: importRange(f), cls: IMPORT_CLASS[f.cabin] || 'economy',
          segments: 1, co2: 0, note: 'Archivflug (Flighty-Import)', historical: false, planned: false, airline: f.airline || '',
          upgradeFrom: '', upgradeCost: 0, qpMode: '', noPoints: true, pointsOverride: 0, cost: 0,
          flightInfo: [legInfoFor(f)]
        });
      });
      await saveTrips();
      render();
      msg.textContent = `${enrich.length + fill.length} Trips um Flugdetails ergänzt, ${fresh.length} neu angelegt, ${skipped.length} übersprungen.`;
    } catch (e) {
      msg.textContent = 'Import fehlgeschlagen: ' + e.message;
    }
  }

  // ================================================================ Push-Benachrichtigungen

  const PUSH_SUPPORTED = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function currentPushSub() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function renderPushStatus() {
    const st = document.getElementById('push-status');
    if (!st) return;
    const en = document.getElementById('push-enable-btn'), ts = document.getElementById('push-test-btn'), di = document.getElementById('push-disable-btn');
    const show = (on) => { en.style.display = on ? 'none' : ''; ts.style.display = on ? '' : 'none'; di.style.display = on ? '' : 'none'; };
    if (!PUSH_SUPPORTED) {
      show(false); en.disabled = true;
      st.textContent = 'Dieses Gerät/dieser Browser unterstützt keine Push-Nachrichten. Auf dem iPhone die App erst zum Home-Bildschirm hinzufügen und von dort öffnen.';
      return;
    }
    if (Notification.permission === 'denied') {
      show(false); en.disabled = true;
      st.textContent = 'Benachrichtigungen sind für diese App blockiert. Das lässt sich nur in den Geräte- bzw. Browser-Einstellungen wieder erlauben.';
      return;
    }
    en.disabled = false;
    try {
      const sub = await currentPushSub();
      show(!!sub);
      st.textContent = sub ? '✅ Auf diesem Gerät aktiv.' : 'Auf diesem Gerät nicht aktiviert.';
    } catch (e) {
      show(false);
      st.textContent = 'Status konnte nicht ermittelt werden.';
    }
  }

  async function enablePush() {
    const msg = document.getElementById('push-msg');
    try {
      msg.textContent = 'Aktiviere …';
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { msg.textContent = 'Ohne Erlaubnis keine Benachrichtigungen.'; renderPushStatus(); return; }
      const { publicKey } = await callEdge('deadline-push', { action: 'public-key' });
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await callEdge('deadline-push', { action: 'subscribe', subscription: sub.toJSON() });
      msg.textContent = 'Aktiviert. Mit „Testnachricht senden“ kannst du es prüfen.';
    } catch (e) {
      msg.textContent = 'Aktivieren fehlgeschlagen: ' + e.message;
    }
    renderPushStatus();
  }

  async function disablePush() {
    const msg = document.getElementById('push-msg');
    try {
      const sub = await currentPushSub();
      if (sub) {
        await callEdge('deadline-push', { action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      msg.textContent = 'Auf diesem Gerät deaktiviert.';
    } catch (e) {
      msg.textContent = 'Deaktivieren fehlgeschlagen: ' + e.message;
    }
    renderPushStatus();
  }

  async function testPush() {
    const msg = document.getElementById('push-msg');
    try {
      const r = await callEdge('deadline-push', { action: 'test' });
      msg.textContent = r.sent ? `Testnachricht an ${r.sent} von ${r.devices} Gerät(en) gesendet.` : 'Senden war nicht erfolgreich — bitte deaktivieren und neu aktivieren.';
    } catch (e) {
      msg.textContent = 'Test fehlgeschlagen: ' + e.message;
    }
  }

  // ================================================================ Verdrahtung

  document.getElementById('push-enable-btn').addEventListener('click', enablePush);
  document.getElementById('push-disable-btn').addEventListener('click', disablePush);
  document.getElementById('push-test-btn').addEventListener('click', testPush);
  renderPushStatus();

  document.getElementById('flights-import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) await importFlights(f);
    e.target.value = '';
  });

  document.getElementById('rc-btn').addEventListener('click', runReconcile);
  document.getElementById('rc-date').value = today();
  document.getElementById('backup-export-btn').addEventListener('click', exportBackup);
  document.getElementById('backup-import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) await importBackup(f);
    e.target.value = '';
  });

  document.getElementById('voucher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('vo-type').value;
    const title = document.getElementById('vo-title').value.trim() || VOUCHER_TYPES[type].replace(/^\S+\s/, '');
    const entry = { type, title, expires: document.getElementById('vo-expires').value, note: document.getElementById('vo-note').value };
    if (editingVoucherId) {
      const v = vouchers.find(x => x.id === editingVoucherId);
      if (v) Object.assign(v, entry);
    } else {
      vouchers.push({ id: genId(), used: false, usedDate: null, createdAt: today(), ...entry });
    }
    await saveVouchers();
    cancelEditVoucher();
    document.getElementById('voucher-details').open = false;
    render();
  });

  // Für Tests aus der Konsole.
  window.MMExtras = { YEAR_TASKS, taskDone, renderBackupStatus, exportBackup, importBackup, importFlights };
})();
