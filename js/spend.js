/**
 * Ausgaben-Auswertung (Tab Rechner → Ausgaben): was habe ich selbst bezahlt und was hat es gebracht?
 * Quellen: eigene Ausgaben aus den Trips (Flug, wenn selbst bezahlt; Upgrade; CO₂-Ausgleich) und die
 * Einträge im Wertrechner (Uptrip, Kreditkarte, Sonstiges). Die Aufteilung des Ertrags je Trip steht
 * in tripSpend() (app.js). Einträge ohne Preis werden getrennt ausgewiesen und nicht in €/Punkt
 * eingerechnet, damit die Quoten nicht verfälscht werden.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = escHtml;
  const fmt = (n) => Math.round(n).toLocaleString('de-DE');
  const eur = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const ratio = (cost, v) => (v > 0 ? eur(cost / v) : '–');

  const emptyCat = () => ({ cost: 0, p: 0, q: 0, n: 0, unN: 0, unP: 0, unQ: 0 });

  // Belege zu einer Ausgabe: Nummer(n) und/oder hochgeladene Dateien der passenden Art. Bei zusammen
  // gebuchten Trips (gleiche bookingId) gelten die Belege der ganzen Buchung.
  const KIND_FIELDS = { flight: ['receiptNo'], upgrade: ['upgradeReceiptNo'], co2: ['co2ReceiptNo', 'co2ReceiptNo2'] };
  const bookingMates = (t) => (t.bookingId ? trips.filter(x => x.bookingId === t.bookingId) : [t]);
  const rc = (t, kind) => {
    const mates = bookingMates(t);
    return {
      no: [...new Set(mates.flatMap(m => KIND_FIELDS[kind].map(f => m[f]).filter(Boolean)))].join(' / '),
      files: mates.reduce((s, m) => s + (m.receiptFiles || []).filter(f => f.kind === kind).length, 0)
    };
  };
  const hasReceipt = (r) => !!(r.no || r.files);
  const receiptText = (r) => [r.no, r.files ? `📎${r.files}` : ''].filter(Boolean).join(' ');

  function compute(year, includePlanned) {
    const cat = { flight: emptyCat(), upgrade: emptyCat(), co2: emptyCat(), other: emptyCat() };
    const free = { n: 0, p: 0, q: 0 };
    let flightsNoPrice = 0;
    const perTrip = [], other = [];
    const inYear = (d) => !year || (d || '').startsWith(year);

    // Kosten je Buchung: bei zusammen gebuchten Trips genügt es, den Preis bei einem Trip einzutragen
    const groupCost = {};
    trips.forEach(t => {
      if (!t.bookingId) return;
      const g = (groupCost[t.bookingId] = groupCost[t.bookingId] || { flight: 0, upgrade: 0, co2: 0 });
      if (t.paidBy !== 'other') g.flight += t.cost || 0;
      g.upgrade += t.upgradeCost || 0;
      g.co2 += t.co2Cost || 0;
    });
    const priced = (t, kind, own) => own > 0 || !!(t.bookingId && groupCost[t.bookingId] && groupCost[t.bookingId][kind] > 0);

    trips.forEach(t => {
      if (!t.date || !inYear(t.date)) return;
      if (t.planned && !includePlanned) return;
      if (t.noPoints && !(t.cost > 0 || t.upgradeCost > 0 || t.co2Cost > 0)) return;
      const s = tripSpend(t);
      const own = [];
      const add = (label, kind, x) => {
        const c = cat[kind];
        c.cost += x.cost; c.p += x.p; c.q += x.q; c.n++;
        own.push([label, x.cost, x.p, x.q, rc(t, kind), !!t.bookingId]);
      };
      // Flug
      if (s.flight.paidByMe) {
        if (priced(t, 'flight', s.flight.cost)) add('Flug', 'flight', s.flight);
        else if (s.flight.p > 0) flightsNoPrice++;
      } else if (s.flight.p > 0) { free.n++; free.p += s.flight.p; free.q += s.flight.q; }
      // Upgrade
      if (s.upgrade.p > 0) {
        if (priced(t, 'upgrade', s.upgrade.cost)) add('Upgrade', 'upgrade', s.upgrade);
        else { const c = cat.upgrade; c.unN++; c.unP += s.upgrade.p; c.unQ += s.upgrade.q; }
      }
      // CO₂-Ausgleich
      if (s.co2.p > 0 || s.co2.cost > 0) {
        if (priced(t, 'co2', s.co2.cost)) add('CO₂-Ausgleich', 'co2', s.co2);
        else { const c = cat.co2; c.unN++; c.unP += s.co2.p; c.unQ += s.co2.q; }
      }
      if (own.length) perTrip.push({ t, own });
    });

    // Wertrechner-Einträge: ohne Datum nur im Zeitraum „Alle Jahre“
    valueLog.forEach(v => {
      if (year && !(v.date || '').startsWith(year)) return;
      const co2 = v.co2 || 0;
      const p = (v.points || 0) + Math.round((v.points || 0) * co2 / 100);
      const q = (v.qp || 0) + Math.round((v.qp || 0) * co2 / 100);
      const c = cat.other;
      c.cost += v.cost || 0; c.p += p; c.q += q; c.n++;
      if (v.cost > 0) other.push(v);
    });
    const missing = perTrip.reduce((s, x) => s + x.own.filter(o => o[1] > 0 && !hasReceipt(o[4])).length, 0) + other.filter(v => !v.receiptNo).length;
    return { cat, free, flightsNoPrice, perTrip, other, missing };
  }

  function renderSpend() {
    const body = $('sp-body');
    if (!body) return;
    // Zeitraum-Auswahl aus Trips und Wertrechner-Einträgen
    const ysel = $('sp-year'), prev = ysel.value;
    const years = [...new Set([...trips.map(t => (t.date || '').slice(0, 4)), ...valueLog.map(v => (v.date || '').slice(0, 4))].filter(Boolean))].sort().reverse();
    ysel.innerHTML = '<option value="">Alle Jahre</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (years.includes(prev)) ysel.value = prev;

    const r = compute(ysel.value, !!$('sp-planned').value);
    const rows = [
      ['✈️ Flug (von dir bezahlt)', r.cat.flight], ['⬆️ Upgrade', r.cat.upgrade], ['🌱 CO₂-Ausgleich', r.cat.co2], ['🧾 Wertrechner (Uptrip, Karte, Sonstiges)', r.cat.other]
    ];
    const tot = rows.reduce((s, [, c]) => ({ cost: s.cost + c.cost, p: s.p + c.p, q: s.q + c.q }), { cost: 0, p: 0, q: 0 });
    if (!tot.cost && !r.free.n && !rows.some(([, c]) => c.unN)) {
      body.innerHTML = '<div class="empty">Noch keine eigenen Ausgaben erfasst. Im Trip-Formular gibt es Flugpreis („Wer zahlt?“), Upgrade-Kosten und CO₂-Ausgleich; im Wertrechner unten weitere Ausgaben.</div>';
      return;
    }
    // Beste Quelle nach €/QP (nur Zeilen mit Ausgaben und QP)
    const rated = rows.filter(([, c]) => c.cost > 0 && c.q > 0).sort((a, b) => a[1].cost / a[1].q - b[1].cost / b[1].q);
    const bestLabel = rated.length > 1 ? rated[0][0] : null;

    const kpi = (n, l) => `<div class="stat"><div class="num" style="font-size:17px;">${n}</div><div class="lbl">${l}</div></div>`;
    let html = `<div class="stat-row" style="margin-bottom:10px;">${kpi(eur(tot.cost), 'Eigene Ausgaben')}${kpi(`${fmt(tot.p)} P`, `${fmt(tot.q)} QP dafür`)}${kpi(ratio(tot.cost, tot.q), 'Ø je QP')}</div>`;

    const earn = (c) => (c.p === c.q ? `${fmt(c.p)} P/QP` : `${fmt(c.p)} P<br>${fmt(c.q)} QP`);
    const rate = (c) => (c.p === c.q ? ratio(c.cost, c.p) : `${ratio(c.cost, c.p)}/P<br>${ratio(c.cost, c.q)}/QP`);
    html += `<div style="overflow-x:auto;"><table class="sim-res-table sp-table"><thead><tr><th>Wofür</th><th>Ausgaben</th><th>Ertrag</th><th>€ je P/QP</th></tr></thead><tbody>` +
      rows.map(([label, c]) => {
        if (!c.cost && !c.n && !c.unN) return '';
        const un = c.unN ? `<div class="sp-note">+ ${c.unN} ohne Preis (${fmt(c.unP)} P / ${fmt(c.unQ)} QP nicht gewertet)</div>` : '';
        return `<tr><td>${label}${label === bestLabel ? ' 🏆' : ''}<div class="sp-note">${c.n} ${c.n === 1 ? 'Eintrag' : 'Einträge'} mit Preis</div>${un}</td><td>${eur(c.cost)}</td><td>${earn(c)}</td><td>${rate(c)}</td></tr>`;
      }).join('') +
      `<tr class="sp-total"><td><b>Gesamt</b></td><td><b>${eur(tot.cost)}</b></td><td><b>${earn(tot)}</b></td><td><b>${rate(tot)}</b></td></tr></tbody></table></div>`;

    const notes = [];
    if (r.free.n) notes.push(`💼 ${r.free.n} ${r.free.n === 1 ? 'Flug' : 'Flüge'} vom Arbeitgeber/Dritten bezahlt: gratis +${fmt(r.free.p)} P / +${fmt(r.free.q)} QP.`);
    if (r.flightsNoPrice) notes.push(`${r.flightsNoPrice} ${r.flightsNoPrice === 1 ? 'Flug' : 'Flüge'} ohne Preis und ohne Vermerk „Arbeitgeber/Dritte“ — nicht gewertet. Preis eintragen oder „Wer zahlt den Flug?“ im Trip ändern.`);
    notes.push(r.missing ? `🧾 ${r.missing} ${r.missing === 1 ? 'Ausgabe' : 'Ausgaben'} ohne Beleg (weder Nummer noch Datei).` : '🧾 Zu allen Ausgaben ist ein Beleg hinterlegt.');
    notes.push('Upgrade-Ertrag = Mehr-Points der höheren Klasse gegenüber der gebuchten (ohne CO₂-Bonus), CO₂-Ertrag = Bonus auf die tatsächlich geflogene Klasse (also auch auf die hochgestufte Teilstrecke). Einträge ohne Preis fließen nicht in €/Punkt ein.');
    html += `<div class="hint" style="margin:8px 0 0;">${notes.join('<br>')}</div>`;

    // Je Trip
    if (r.perTrip.length) {
      const list = [...r.perTrip].sort((a, b) => b.t.date.localeCompare(a.t.date));
      html += `<details style="margin-top:10px;"><summary style="cursor:pointer; font-weight:600; color:var(--navy);">Einzelne Trips mit eigenen Ausgaben (${list.length})</summary>` +
        list.map(({ t, own }) => {
          const sum = own.reduce((s, o) => s + o[1], 0);
          return `<div class="sim-row"><div><b>${esc(t.route)}</b> <span class="meta" style="color:var(--muted);">${esc(t.date)}</span>
            <div class="meta" style="font-size:12px; color:var(--muted);">${own.map(([n, c, p, q, rcpt, shared]) => `${n} ${c > 0 || !shared ? eur(c) : 'in gemeinsamer Buchung'} → +${fmt(p)} P${q !== p ? ' / +' + fmt(q) + ' QP' : ''} · ${hasReceipt(rcpt) ? '🧾 ' + esc(receiptText(rcpt)) : 'kein Beleg'}`).join('<br>')}</div></div>
            <div style="text-align:right; white-space:nowrap;"><b>${eur(sum)}</b></div></div>`;
        }).join('') + '</details>';
    }
    html += '<button type="button" class="btn secondary" style="margin-top:12px;" onclick="exportSpendCsv()">⬇️ Ausgaben mit Belegen als CSV exportieren</button>';
    body.innerHTML = html;
  }
  window.renderSpend = renderSpend;

  // Dashboard-Karte: Kurzfassung für das gewählte Saisonjahr mit Sprung zur Detailseite
  function renderSpendCard() {
    const el = $('dash-spend');
    if (!el) return;
    const year = seasonYear();
    $('dash-spend-year').textContent = year;
    const r = compute(year, false);
    const rows = [['✈️ Flug', r.cat.flight], ['⬆️ Upgrade', r.cat.upgrade], ['🌱 CO₂-Ausgleich', r.cat.co2], ['🧾 Weitere', r.cat.other]].filter(([, c]) => c.cost > 0 || c.n);
    const tot = rows.reduce((s, [, c]) => ({ cost: s.cost + c.cost, p: s.p + c.p, q: s.q + c.q }), { cost: 0, p: 0, q: 0 });
    // Noch nicht geflogene (geplante) Trips mit Ausgaben, getrennt ausgewiesen
    const rp = compute(year, true);
    const plannedExtra = ['flight', 'upgrade', 'co2'].reduce((s, k) => ({ cost: s.cost + rp.cat[k].cost - r.cat[k].cost, q: s.q + rp.cat[k].q - r.cat[k].q }), { cost: 0, q: 0 });
    const plannedLine = plannedExtra.cost > 0 ? `<div class="hint" style="margin:8px 0 0;">📅 Dazu geplant (noch nicht geflogen): ${eur(plannedExtra.cost)} für +${fmt(plannedExtra.q)} QP — in der Auswertung unter „Geplante Trips: einrechnen“.</div>` : '';
    if (!rows.length) {
      el.innerHTML = `<div class="empty">Für ${esc(year)} sind noch keine eigenen Ausgaben von geflogenen Trips erfasst. Preise trägst du im Trip-Formular ein (Flug, Upgrade, CO₂-Ausgleich).</div>${plannedLine}
        <button type="button" class="btn small secondary" style="margin-top:8px;" onclick="openSpendPage()">Zur Ausgaben-Auswertung</button>`;
      return;
    }
    const kpi = (n, l) => `<div class="stat"><div class="num" style="font-size:17px;">${n}</div><div class="lbl">${l}</div></div>`;
    el.innerHTML = `<div class="stat-row" style="margin-bottom:8px;">${kpi(eur(tot.cost), 'Eigene Ausgaben')}${kpi(`${fmt(tot.p)} P`, `${fmt(tot.q)} QP dafür`)}${kpi(ratio(tot.cost, tot.q), 'Ø je QP')}</div>` +
      rows.map(([label, c]) => `<div class="sim-row"><span>${label}</span><span><b>${eur(c.cost)}</b> <span class="meta" style="color:var(--muted);">· ${c.q > 0 ? ratio(c.cost, c.q) + '/QP' : '–'}</span></span></div>`).join('') +
      plannedLine +
      `<button type="button" class="btn small secondary" style="margin-top:8px;" onclick="openSpendPage()">Details &amp; Belege ansehen</button>`;
  }
  window.renderSpendCard = renderSpendCard;
  window.openSpendPage = function () {
    document.querySelector('[data-tab="tab-rechner"]').click();
    MMSim.setRechnerPage('value');
    const ysel = $('sp-year'), y = String(seasonYear());
    if ([...ysel.options].some(o => o.value === y)) ysel.value = y;
    renderSpend();
    window.scrollTo(0, 0);
  };

  // CSV für Reisekostenabrechnung o. Ä.: eine Zeile je Ausgabe (Flug, Upgrade, CO₂, Wertrechner)
  window.exportSpendCsv = function () {
    const r = compute($('sp-year').value, !!$('sp-planned').value);
    const header = ['Datum', 'Strecke/Kanal', 'Kategorie', 'Betrag €', 'Beleg-Nr.', 'Belegdateien', 'Points', 'QP', 'Notiz'];
    const rows = [];
    r.perTrip.forEach(({ t, own }) => own.forEach(([n, c, p, q, rcpt]) => rows.push([t.date, t.route, n, c, rcpt.no, rcpt.files || '', p, q, t.note || ''])));
    r.other.forEach(v => {
      const co2 = v.co2 || 0;
      rows.push([v.date || '', v.type, 'Wertrechner', v.cost, v.receiptNo || '', '',
        (v.points || 0) + Math.round((v.points || 0) * co2 / 100), (v.qp || 0) + Math.round((v.qp || 0) * co2 / 100), v.note || '']);
    });
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const lines = [header, ...rows].map(row => row.map(csvEscape).join(';'));
    downloadBlob(String.fromCharCode(0xFEFF) + lines.join('\r\n'), 'text/csv;charset=utf-8;', `ausgaben-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  $('sp-year').addEventListener('change', renderSpend);
  $('sp-planned').addEventListener('change', renderSpend);
  $('c-date').value = new Date().toISOString().slice(0, 10);
})();
