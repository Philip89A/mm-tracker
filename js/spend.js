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

  function compute(year, includePlanned) {
    const cat = { flight: emptyCat(), upgrade: emptyCat(), co2: emptyCat(), other: emptyCat() };
    const free = { n: 0, p: 0, q: 0 };
    let flightsNoPrice = 0;
    const perTrip = [];
    const inYear = (d) => !year || (d || '').startsWith(year);

    trips.forEach(t => {
      if (!t.date || !inYear(t.date)) return;
      if (t.planned && !includePlanned) return;
      if (t.noPoints && !(t.cost > 0 || t.upgradeCost > 0 || t.co2Cost > 0)) return;
      const s = tripSpend(t);
      const own = [];
      // Flug
      if (s.flight.paidByMe) {
        if (s.flight.cost > 0) { const c = cat.flight; c.cost += s.flight.cost; c.p += s.flight.p; c.q += s.flight.q; c.n++; own.push(['Flug', s.flight.cost, s.flight.p, s.flight.q]); }
        else if (s.flight.p > 0) flightsNoPrice++;
      } else if (s.flight.p > 0) { free.n++; free.p += s.flight.p; free.q += s.flight.q; }
      // Upgrade
      if (s.upgrade.p > 0) {
        const c = cat.upgrade;
        if (s.upgrade.cost > 0) { c.cost += s.upgrade.cost; c.p += s.upgrade.p; c.q += s.upgrade.q; c.n++; own.push(['Upgrade', s.upgrade.cost, s.upgrade.p, s.upgrade.q]); }
        else { c.unN++; c.unP += s.upgrade.p; c.unQ += s.upgrade.q; }
      }
      // CO₂-Ausgleich
      if (s.co2.p > 0 || s.co2.cost > 0) {
        const c = cat.co2;
        if (s.co2.cost > 0) { c.cost += s.co2.cost; c.p += s.co2.p; c.q += s.co2.q; c.n++; own.push(['CO₂-Ausgleich', s.co2.cost, s.co2.p, s.co2.q]); }
        else { c.unN++; c.unP += s.co2.p; c.unQ += s.co2.q; }
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
    });
    return { cat, free, flightsNoPrice, perTrip };
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
    notes.push('Upgrade-Ertrag = Zusatz-QP gegenüber der gebuchten Klasse (inkl. CO₂-Bonus darauf), CO₂-Ertrag = Bonus-Points auf den ursprünglich gebuchten Flug. Einträge ohne Preis fließen nicht in €/Punkt ein.');
    html += `<div class="hint" style="margin:8px 0 0;">${notes.join('<br>')}</div>`;

    // Je Trip
    if (r.perTrip.length) {
      const list = [...r.perTrip].sort((a, b) => b.t.date.localeCompare(a.t.date));
      html += `<details style="margin-top:10px;"><summary style="cursor:pointer; font-weight:600; color:var(--navy);">Einzelne Trips mit eigenen Ausgaben (${list.length})</summary>` +
        list.map(({ t, own }) => {
          const sum = own.reduce((s, o) => s + o[1], 0);
          return `<div class="sim-row"><div><b>${esc(t.route)}</b> <span class="meta" style="color:var(--muted);">${esc(t.date)}</span>
            <div class="meta" style="font-size:12px; color:var(--muted);">${own.map(([n, c, p, q]) => `${n} ${eur(c)} → +${fmt(p)} P${q !== p ? ' / +' + fmt(q) + ' QP' : ''}`).join(' · ')}</div></div>
            <div style="text-align:right; white-space:nowrap;"><b>${eur(sum)}</b></div></div>`;
        }).join('') + '</details>';
    }
    body.innerHTML = html;
  }
  window.renderSpend = renderSpend;

  $('sp-year').addEventListener('change', renderSpend);
  $('sp-planned').addEventListener('change', renderSpend);
  $('c-date').value = new Date().toISOString().slice(0, 10);
})();
