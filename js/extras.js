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
  let pushActive = false; // von renderPushStatus gesetzt: Push ist auf diesem Gerät aktiv
  const flightDetailsDone = (year) => trips.filter(t => !t.planned && (t.date || '').startsWith(String(year))).every(t => tripFlightInfos(t).length > 0);
  const YEAR_TASKS = [
    { id: 'close_prev', m: [1, 3], title: 'Vorjahr abschließen (Jahres-Archiv)', hint: 'Dashboard → Jahres-Archiv, sobald Miles & More den Status fürs neue Jahr gesetzt hat.',
      auto: y => yearArchive.some(a => a.year === String(y - 1)) },
    { id: 'reset_base', m: [1, 3], title: 'Basiswerte aufs neue Jahr setzen und mit dem Konto abgleichen', hint: 'Points/QP starten neu; Karte „Kontoabgleich“ nutzen.' },
    { id: 'season_goal', m: [1, 2], title: 'Zielstatus für dieses Jahr festlegen', hint: 'Zielschalter im Dashboard, ggf. Boden-Punkte eintragen.' },
    { id: 'vouchers_in', m: [1, 3], title: 'Neue Gutscheine und Benefits aus dem Konto eintragen', hint: 'Karte „Gutscheine & Benefits“.' },
    { id: 'flight_details', m: [1, 2], title: 'Flugdetails des Vorjahres nachtragen (Flugzeug, Kennzeichen, Sitz)', hint: 'Trip-Formular → „Flugdetails je Teilstrecke“ oder Mehr → Archivflüge importieren. Speist die Flugzeug- und Sitz-Statistik.',
      auto: y => flightDetailsDone(y - 1) },
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
    { id: 'push_on', always: true, title: 'Push-Erinnerungen für Fristen und Gutscheine auf dem Handy aktivieren', hint: 'Mehr → Benachrichtigungen (auf dem iPhone zuerst zum Home-Bildschirm hinzufügen).', auto: () => pushActive },
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

  // ---------- Sitzregel: Zuordnung der Sitzbuchstaben zu Fenster/Mitte/Gang je Flugzeugtyp ----------

  const seatId = (type) => 'sm-' + type.replace(/[^A-Z0-9]/gi, '_');
  const SEAT_PRESETS = { '3-3': ['AF', 'BE', 'CD'], '2-2': ['AF', '', 'CD'], '2-4-2': ['AK', 'DGH', 'CJ'] };

  function seatRuleBlock(unknownTypes) {
    const custom = Object.entries(settings.seatMaps || {});
    const typeRow = ([type, seats]) => {
      const id = seatId(type);
      const real = type !== '(Typ fehlt)';
      return `<div class="seat-ask-row">
        <div style="font-weight:700; color:var(--navy);">${esc(type)} <span style="font-weight:400; color:var(--muted); font-size:12px;">· Sitze: ${esc([...new Set(seats)].slice(0, 8).join(', '))}</span></div>
        ${real ? `<div class="seat-ask-grid">
          <div><label>Fenster</label><input type="text" id="${id}-window" maxlength="6" placeholder="AF" autocomplete="off"></div>
          <div><label>Mitte</label><input type="text" id="${id}-middle" maxlength="6" placeholder="BE" autocomplete="off"></div>
          <div><label>Gang</label><input type="text" id="${id}-aisle" maxlength="6" placeholder="CD" autocomplete="off"></div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
          <button type="button" class="btn small secondary" onclick="seatPreset('${type}','3-3')">3-3 (A F · B E · C D)</button>
          <button type="button" class="btn small secondary" onclick="seatPreset('${type}','2-2')">2-2 (A F · C D)</button>
          <button type="button" class="btn small" onclick="saveSeatMap('${type}')">Speichern</button>
        </div>` : '<div class="hint" style="margin:2px 0 0;">Flugzeugtyp im Trip ergänzen, dann kann die Sitzart zugeordnet werden.</div>'}
      </div>`;
    };
    let html = '';
    if (unknownTypes.size) {
      html += `<div class="seat-ask"><div style="font-weight:700; color:var(--navy); font-size:13px;">Sitzanordnung klären</div>
        <div class="hint" style="margin:2px 0 6px;">Bei Airbus A319/A320/A321 (3-3-Bestuhlung) gilt: A und F = Fenster, B und E = Mitte, C und D = Gang. Für diese Typen kenne ich die Verteilung der Sitzbuchstaben nicht. Bitte angeben, welche Buchstaben Fenster, Mitte und Gang sind (Mitte bleibt bei 2-2-Anordnung leer).</div>
        ${[...unknownTypes].map(typeRow).join('')}</div>`;
    }
    if (custom.length) {
      html += block('Eigene Sitzzuordnungen', custom.map(([t, l]) => `<div class="mt-cat-row" style="margin-top:4px;"><span><b>${esc(t)}</b>&nbsp; Fenster ${esc(l.window || '–')} · Mitte ${esc(l.middle || '–')} · Gang ${esc(l.aisle || '–')}</span>
        <button class="del" onclick="resetSeatMap('${t}')">entfernen</button></div>`).join(''));
    }
    return html;
  }

  window.seatPreset = function(type, name) {
    const id = seatId(type), [w, m, a] = SEAT_PRESETS[name];
    document.getElementById(id + '-window').value = w;
    document.getElementById(id + '-middle').value = m;
    document.getElementById(id + '-aisle').value = a;
  };
  window.saveSeatMap = async function(type) {
    const id = seatId(type);
    const read = (k) => [...new Set(document.getElementById(`${id}-${k}`).value.toUpperCase().replace(/[^A-Z]/g, ''))].join('');
    const layout = { window: read('window'), middle: read('middle'), aisle: read('aisle') };
    const all = layout.window + layout.middle + layout.aisle;
    if (!all) { alert('Bitte mindestens bei Fenster oder Gang Buchstaben eintragen — oder eine Vorlage wählen.'); return; }
    if (new Set(all).size !== all.length) { alert('Ein Buchstabe darf nur einer Sitzart zugeordnet sein.'); return; }
    settings.seatMaps = { ...(settings.seatMaps || {}), [type]: layout };
    await saveSettings();
    render();
  };
  window.resetSeatMap = async function(type) {
    const m = { ...(settings.seatMaps || {}) };
    delete m[type];
    settings.seatMaps = m;
    await saveSettings();
    render();
  };

  // Hilfen für die Statistik in stats.js
  window.bars = bars;
  window.statBlock = block;
  window.seatRuleBlock = seatRuleBlock;

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
    // Auch ein fehlender Reiseanlass (geschäftlich/privat) wird ergänzt, nie überschrieben.
    return missing.length || (f.reason && !trip.reason) ? { status: 'fill', trip, missing } : { status: 'skip', trip };
  }

  function enrichTrip(t, f) {
    const codes = routeCodes(t);
    const legIdx = (x) => codes.findIndex((c, i) => c === x.from && codes[i + 1] === x.to);
    t.flightInfo = [...tripFlightInfos(t), legInfoFor(f)].sort((a, b) => legIdx(a) - legIdx(b));
    if (!(t.airline || '').trim() && f.airline) t.airline = f.airline;
    if (!t.reason && f.reason) t.reason = f.reason;
  }

  function fillTrip(t, f, missing) {
    const infos = tripFlightInfos(t);
    const leg = infos.find(sameLeg(f));
    missing.forEach(k => { leg[k] = f[k]; });
    if (!leg.date) leg.date = f.date;
    t.flightInfo = infos;
    if (!(t.airline || '').trim() && f.airline) t.airline = f.airline;
    if (!t.reason && f.reason) t.reason = f.reason;
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
          upgradeFrom: '', upgradeCost: 0, qpMode: '', noPoints: true, pointsOverride: 0, cost: 0, reason: f.reason || '',
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
      const wasActive = pushActive;
      pushActive = !!sub;
      if (pushActive !== wasActive) renderYearPlan();
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
