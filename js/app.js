const KEY_BASE = 'baseline';
const KEY_TRIPS = 'trips';
const KEY_PROMOS = 'promos';
const KEY_UPTRIP = 'uptrip';
const KEY_FRISTEN = 'fristen';
const KEY_INVENTORY = 'uptrip-inventory';
const KEY_VALUECALC = 'value-log';
const KEY_UPGRADES = 'upgrades';
const KEY_MARKETPLACE = 'marketplace';
const KEY_SENATOR_GROUND = 'senator-ground';
const KEY_MILES_LOG = 'miles-log';
const KEY_REDEMPTION_IDEAS = 'redemption-ideas';

let baseline = { p: 0, q: 0, m: 0 };
let trips = [];
let promos = [];
let uptripItems = [];
let fristen = [];
let inventory = [];
let valueLog = [];
let upgrades = [];
let marketplace = [];
let senatorGround = { points: 0, qp: 0 };
let pendingReceivedCards = []; // staged "erhaltene Karte(n)" for the marketplace form, not persisted directly
let milesLog = [];
let redemptionIdeas = [];

const MILES_CATEGORIES = ['Flüge', 'Executive Meilen', 'CO2-Kompensation', 'Kreditkarte', 'Hotel', 'Mietwagen', 'Fahrdienst', 'Shopping', 'Parken', 'Zeitschriften-Abo', 'Reise-Buchungsportale', 'Uptrip', 'Fremdprogramm-Umwandlung', 'Kulanz/Sonstiges'];

const SENATOR_YEAR = 2027;
const SENATOR_QUARTERS = [
  { label: 'Q1 (Jan–Mär)', points: 500, qp: 250 },
  { label: 'Q2 (Apr–Jun)', points: 1000, qp: 500 },
  { label: 'Q3 (Jul–Sep)', points: 1500, qp: 750 },
  { label: 'Q4 (Okt–Dez)', points: 2000, qp: 1000 }
];

const EVOUCHER_YEAR = 2026;
const EVOUCHER_QUARTERS = [
  { label: 'Q1 (Jan–Mär)', qp: 175 },
  { label: 'Q2 (Apr–Jun)', qp: 350 },
  { label: 'Q3 (Jul–Sep)', qp: 525 },
  { label: 'Q4 (Okt–Dez)', qp: 700 }
];

function pointsForSegment(range, cls) {
  const table = {
    continental: { economy: 20, premium: 20, business: 40, first: 40 },
    intercontinental: { economy: 60, premium: 80, business: 200, first: 400 }
  };
  return table[range][cls];
}

function tripPoints(t) {
  const base = pointsForSegment(t.range, t.cls) * t.segments;
  const bonus = Math.round(base * (t.co2 / 100));
  return base + bonus;
}

function segmentPointsWithCo2(range, cls, co2) {
  const base = pointsForSegment(range, cls);
  const bonus = Math.round(base * ((co2 || 0) / 100));
  return base + bonus;
}

function computeTotals() {
  let p = baseline.p, q = baseline.q, m = baseline.m;
  trips.forEach(t => {
    if (t.historical) return; // nachgetragene alte Flüge zählen bewusst nicht in die aktuelle Summe
    const total = tripPoints(t);
    p += total;
    q += total;
  });
  uptripItems.forEach(u => {
    const times = u.redemptionCount || 0;
    p += (u.rewardPoints || 0) * times;
    q += (u.rewardQP || 0) * times;
    m += (u.rewardMeilen || 0) * times;
  });
  milesLog.forEach(mv => { m += mv.amount || 0; });
  return { p, q, m };
}

function senatorYearTotals() {
  const tripSum = trips
    .filter(t => t.date && t.date.startsWith(String(SENATOR_YEAR)))
    .reduce((s, t) => s + tripPoints(t), 0);
  return {
    points: tripSum + (senatorGround.points || 0),
    qp: tripSum + (senatorGround.qp || 0)
  };
}

function labelClass(c) {
  return { economy: 'Economy', premium: 'Premium Eco.', business: 'Business', first: 'First' }[c];
}

function bar(id, val, max) {
  const pct = Math.min(100, (val / max) * 100);
  document.getElementById(id).style.width = pct + '%';
}

function daysUntil(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}


function genId() {
  return 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Karten, die einer Kollektion zugeordnet sind, gelten für andere Kollektionen als "belegt".
function assignedTotalForInv(invId, excludeUptripIdx) {
  let total = 0;
  uptripItems.forEach((u, i) => {
    if (i === excludeUptripIdx) return;
    (u.assignedCards || []).forEach(a => { if (a.invId === invId) total += a.count; });
  });
  return total;
}

function freeCountForInv(inv, excludeUptripIdx) {
  return inv.count - assignedTotalForInv(inv.id, excludeUptripIdx);
}

function uptripHave(u) {
  return (u.assignedCards || []).reduce((s, a) => s + a.count, 0);
}

function uptripOrigHave(u) {
  return (u.assignedCards || []).reduce((s, a) => {
    const inv = inventory.find(i => i.id === a.invId);
    return s + (inv && inv.original ? a.count : 0);
  }, 0);
}

// Kollektionen aus der Zeit vor der Karten-Verknüpfung nutzten ein Freitextfeld
// (cardNames). Hier versuchen wir einmalig, dafür passende Inventar-Karten
// anhand des Namens automatisch zuzuordnen, statt bei 0/needed neu anzufangen.
function migrateLegacyUptripCardNames() {
  let changed = false;
  uptripItems.forEach((u, idx) => {
    if (u.assignedCards) return;
    u.assignedCards = [];
    changed = true;
    if (!u.cardNames) return;
    const names = u.cardNames.split(',').map(s => s.trim()).filter(Boolean);
    const counts = {};
    names.forEach(n => { const k = n.toLowerCase(); counts[k] = (counts[k] || 0) + 1; });
    Object.keys(counts).forEach(lname => {
      let remaining = counts[lname];
      inventory.forEach(inv => {
        if (remaining <= 0) return;
        if (inv.name.toLowerCase() !== lname) return;
        const free = freeCountForInv(inv, idx);
        if (free <= 0) return;
        const take = Math.min(free, remaining);
        const existing = u.assignedCards.find(a => a.invId === inv.id);
        if (existing) existing.count += take; else u.assignedCards.push({ invId: inv.id, count: take });
        remaining -= take;
      });
    });
  });
  return changed;
}

// ---------- render ----------

function render() {
  const totals = computeTotals();
  document.getElementById('stat-p').textContent = totals.p.toLocaleString('de-DE');
  document.getElementById('stat-q').textContent = totals.q.toLocaleString('de-DE');
  document.getElementById('stat-m').textContent = totals.m.toLocaleString('de-DE');

  const baseNoteEl = document.getElementById('base-note-display');
  if (baseline.note) {
    baseNoteEl.textContent = '📝 Basiswert enthält: ' + baseline.note;
    baseNoteEl.style.display = 'block';
  } else {
    baseNoteEl.style.display = 'none';
  }

  document.getElementById('g700-val').textContent = totals.q.toLocaleString('de-DE') + ' / 700 QP';
  bar('g700-bar', totals.q, 700);
  const remaining700 = Math.max(0, 700 - totals.q);
  document.getElementById('g700-note').textContent = remaining700 > 0
    ? `Noch ${remaining700} QP nötig — ca. ${Math.ceil(remaining700/20)} Economy- oder ${Math.ceil(remaining700/40)} Business-Segmente (kontinental)`
    : '✅ Erreicht — eVoucher sollte automatisch freigeschaltet sein';

  document.getElementById('g800-val').textContent = totals.q.toLocaleString('de-DE') + ' / 800 QP';
  bar('g800-bar', totals.q, 800);

  document.getElementById('gsen-val').textContent = totals.p.toLocaleString('de-DE') + ' / 2.000 P · ' + totals.q.toLocaleString('de-DE') + ' / 1.000 QP';
  bar('gsen-bar-p', totals.p, 2000);
  bar('gsen-bar-q', totals.q, 1000);

  renderEvoucherTracker();
  renderSenatorTracker();
  renderTrips();
  renderYearChart();
  renderPromos();
  renderUptrip();
  renderFristen();
  renderInventory();
  renderCalc();
  renderUpgrades();
  renderMarketplace();
  renderMiles();
  renderRedemptionIdeas();
}

function renderEvoucherTracker() {
  const totals = computeTotals();
  const now = new Date();
  const currentYear = now.getFullYear();
  let currentQuarterIdx = null;
  let yearStateText = '';
  if (currentYear < EVOUCHER_YEAR) {
    yearStateText = ` — noch ${EVOUCHER_YEAR} (Tracking startet am 1.1.${EVOUCHER_YEAR})`;
  } else if (currentYear > EVOUCHER_YEAR) {
    yearStateText = ` — Jahr ${EVOUCHER_YEAR} vorbei`;
  } else {
    currentQuarterIdx = Math.floor(now.getMonth() / 3);
  }

  document.getElementById('evoucher-status-line').textContent =
    `Aktueller Stand ${EVOUCHER_YEAR}: ${totals.q.toLocaleString('de-DE')} QP${yearStateText}`;

  document.getElementById('evoucher-quarters').innerHTML = EVOUCHER_QUARTERS.map((q, idx) => {
    const isCurrent = currentQuarterIdx === idx;

    // Anders als beim Senator-Tracker werden hier alle vier Quartale bewertet
    // (nicht nur bereits laufende), da 2026 schon läuft und bereits geplante
    // Flüge fürs restliche Jahr im Trip-Log stehen.
    let statusClass, statusText;
    const shortfall = q.qp - totals.q;
    if (shortfall <= 0) { statusClass = 'ok'; statusText = '✅ im Soll'; }
    else if (shortfall <= q.qp * 0.15) { statusClass = 'mid'; statusText = `⚠️ knapp dahinter (−${shortfall.toLocaleString('de-DE')} QP)`; }
    else { statusClass = 'low'; statusText = `🔴 deutlich hinten (−${shortfall.toLocaleString('de-DE')} QP)`; }

    return `<div class="quarter-row ${isCurrent ? 'current' : ''} ${statusClass}">
      <div>
        <div class="qlabel">${q.label}${isCurrent ? ' 👉' : ''}</div>
        <div class="qtarget">Ziel: ${q.qp.toLocaleString('de-DE')} QP</div>
      </div>
      <div>
        <div class="qstatus">${statusText}</div>
      </div>
    </div>`;
  }).join('');
}

function renderSenatorTracker() {
  const totals = senatorYearTotals();
  const now = new Date();
  const currentYear = now.getFullYear();
  let currentQuarterIdx = null;
  let yearStateText = '';
  if (currentYear < SENATOR_YEAR) {
    yearStateText = ` — noch ${SENATOR_YEAR} (Tracking startet am 1.1.${SENATOR_YEAR})`;
  } else if (currentYear > SENATOR_YEAR) {
    yearStateText = ` — Jahr ${SENATOR_YEAR} vorbei`;
  } else {
    currentQuarterIdx = Math.floor(now.getMonth() / 3);
  }

  document.getElementById('senator-status-line').textContent =
    `Aktueller Stand ${SENATOR_YEAR}: ${totals.points.toLocaleString('de-DE')} Points · ${totals.qp.toLocaleString('de-DE')} QP${yearStateText}`;

  document.getElementById('senator-quarters').innerHTML = SENATOR_QUARTERS.map((q, idx) => {
    const isCurrent = currentQuarterIdx === idx;
    const isDue = currentQuarterIdx !== null && idx <= currentQuarterIdx;

    let statusClass = '';
    let statusText = 'noch nicht dran';
    if (isDue) {
      const shortfall = q.points - totals.points;
      if (shortfall <= 0) { statusClass = 'ok'; statusText = '✅ im Soll'; }
      else if (shortfall <= q.points * 0.15) { statusClass = 'mid'; statusText = `⚠️ knapp dahinter (−${shortfall.toLocaleString('de-DE')} Points)`; }
      else { statusClass = 'low'; statusText = `🔴 deutlich hinten (−${shortfall.toLocaleString('de-DE')} Points)`; }
    }
    const qpOk = totals.qp >= q.qp;

    return `<div class="quarter-row ${isCurrent ? 'current' : ''} ${statusClass}">
      <div>
        <div class="qlabel">${q.label}${isCurrent ? ' 👉' : ''}</div>
        <div class="qtarget">Ziel: ${q.points.toLocaleString('de-DE')} P / ${q.qp.toLocaleString('de-DE')} QP</div>
      </div>
      <div>
        <div class="qstatus">${statusText}</div>
        <div class="qqp">QP: ${totals.qp.toLocaleString('de-DE')} / ${q.qp.toLocaleString('de-DE')} ${isDue ? (qpOk ? '✓' : '⚠️') : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function renderTrips() {
  const list = document.getElementById('trip-list');
  document.getElementById('trip-count').textContent = trips.length;
  if (trips.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Trips erfasst.</div>';
    return;
  }
  const sorted = [...trips].sort((a, b) => new Date(b.date) - new Date(a.date));
  list.innerHTML = sorted.map(t => {
    const total = tripPoints(t);
    const idx = trips.indexOf(t);
    return `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${t.route}</div>
          <div class="meta">${t.date} · ${t.range === 'continental' ? 'Kontinental' : 'Interkont.'} · ${labelClass(t.cls)} · ${t.segments} Segm.${t.co2 > 0 ? ' · CO₂ +' + t.co2 + '%' : ''}</div>
          ${t.historical ? `<div class="meta"><span class="tag mid">🕰️ Historisch — nicht in Gesamtsumme</span></div>` : ''}
          ${t.note ? `<div class="meta">📝 ${t.note}</div>` : ''}
        </div>
        <div class="pts">
          <div class="p" style="${t.historical ? 'opacity:0.5; text-decoration:line-through;' : ''}">+${total} P/QP</div>
        </div>
      </div>
      <button class="del" onclick="deleteTrip(${idx})">entfernen</button>
    </div>`;
  }).join('');
}

function renderYearChart() {
  const el = document.getElementById('year-chart');
  const byYear = {};
  trips.forEach(t => {
    if (!t.date) return;
    const y = t.date.slice(0, 4);
    const pts = tripPoints(t);
    byYear[y] = byYear[y] || { p: 0, q: 0 };
    byYear[y].p += pts;
    byYear[y].q += pts;
  });
  if ((senatorGround.points || 0) > 0 || (senatorGround.qp || 0) > 0) {
    const y = String(SENATOR_YEAR);
    byYear[y] = byYear[y] || { p: 0, q: 0 };
    byYear[y].p += senatorGround.points || 0;
    byYear[y].q += senatorGround.qp || 0;
  }

  const years = Object.keys(byYear).sort();
  if (years.length === 0) {
    el.innerHTML = '<div class="empty">Noch keine Trips erfasst — das Diagramm erscheint, sobald Daten vorhanden sind.</div>';
    return;
  }
  const maxVal = Math.max(1, ...years.map(y => Math.max(byYear[y].p, byYear[y].q)));

  const cols = years.map(y => {
    const pH = Math.max(2, Math.round((byYear[y].p / maxVal) * 140));
    const qH = Math.max(2, Math.round((byYear[y].q / maxVal) * 140));
    return `<div class="year-col">
      <div class="year-bars">
        <div class="year-bar p" style="height:${pH}px;"><span class="year-bar-val">${byYear[y].p.toLocaleString('de-DE')}</span></div>
        <div class="year-bar q" style="height:${qH}px;"><span class="year-bar-val">${byYear[y].q.toLocaleString('de-DE')}</span></div>
      </div>
      <div class="year-label">${y}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="year-chart">${cols}</div>
    <div class="year-legend">
      <span><span class="dot" style="background:var(--gold);"></span>Points</span>
      <span><span class="dot" style="background:var(--navy2);"></span>Qualifying Points</span>
    </div>`;
}

function renderPromos() {
  const list = document.getElementById('promo-list');
  if (promos.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Aktionen eingetragen.</div>';
    return;
  }
  const sorted = [...promos].sort((a, b) => new Date(b.until || 0) - new Date(a.until || 0));
  list.innerHTML = sorted.map(p => {
    const idx = promos.indexOf(p);
    return `<div class="promo">
      <div class="flex-between"><b>${p.title}</b><button class="del" onclick="deletePromo(${idx})">✕</button></div>
      ${p.until ? `<div class="d">gültig bis ${p.until}</div>` : ''}
      <div>${p.note}</div>
    </div>`;
  }).join('');
}

function renderFristen() {
  const list = document.getElementById('fristen-list');
  document.getElementById('fristen-count').textContent = fristen.length;
  if (fristen.length === 0) {
    list.innerHTML = '<div class="empty">Keine Fristen erfasst.</div>';
    return;
  }
  const sorted = [...fristen].sort((a, b) => new Date(a.date) - new Date(b.date));
  list.innerHTML = sorted.map(f => {
    const idx = fristen.indexOf(f);
    const days = daysUntil(f.date);
    let tagClass = 'ok', tagText = `${days} Tage`;
    if (days < 0) { tagClass = 'low'; tagText = 'abgelaufen'; }
    else if (days <= 30) { tagClass = 'low'; tagText = `noch ${days} Tage!`; }
    else if (days <= 90) { tagClass = 'mid'; tagText = `noch ${days} Tage`; }
    return `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${f.title}</div>
          <div class="meta">läuft ab: ${f.date}</div>
          ${f.note ? `<div class="meta">📝 ${f.note}</div>` : ''}
        </div>
        <div class="pts"><span class="tag ${tagClass}">${tagText}</span></div>
      </div>
      <button class="del" onclick="deleteFristen(${idx})">entfernen</button>
    </div>`;
  }).join('');
}

const cardTypeLabel = { airline: 'Airline', city: 'City', aircraft: 'Flugzeugtyp' };

function renderInventory() {
  const list = document.getElementById('inv-list');
  document.getElementById('inv-count').textContent = inventory.length;
  const totalCost = inventory.reduce((sum, i) => sum + (parseFloat(i.cost) || 0), 0);
  document.getElementById('inv-summary').textContent = totalCost > 0
    ? `Gesamt bezahlt für Karten: ${totalCost.toLocaleString('de-DE', {minimumFractionDigits: 2})} €`
    : '';

  const filterType = document.getElementById('inv-filter-type').value;
  const filterOriginal = document.getElementById('inv-filter-original').value;

  const airlineSelect = document.getElementById('inv-filter-airline');
  const filterAirline = airlineSelect.value;
  const airlines = [...new Set(inventory.map(i => i.airline).filter(Boolean))].sort();
  airlineSelect.innerHTML = '<option value="">Alle</option>' + airlines.map(a => `<option value="${a}">${a}</option>`).join('');
  if (airlines.includes(filterAirline)) airlineSelect.value = filterAirline;

  const filtered = inventory
    .map((i, idx) => ({ ...i, idx }))
    .filter(i => !filterType || (filterType === 'none' ? !i.cardType : i.cardType === filterType))
    .filter(i => !filterAirline || i.airline === filterAirline)
    .filter(i => filterOriginal === '' || String(i.original ? 1 : 0) === filterOriginal);

  if (inventory.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Karten erfasst.</div>';
    return;
  }
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">Keine Karten für diesen Filter.</div>';
    return;
  }
  const statusLabel = { neu: 'Neu', duplikat: 'Duplikat', eingeloest: 'Eingelöst' };
  const statusTag = { neu: 'ok', duplikat: 'mid', eingeloest: 'low' };
  list.innerHTML = filtered.map(i => {
    const typeParts = [];
    if (i.cardType) typeParts.push(cardTypeLabel[i.cardType] || i.cardType);
    if (i.cardType === 'aircraft' && i.airline) typeParts.push(i.airline);
    const assigned = i.id ? assignedTotalForInv(i.id) : 0;
    const free = i.count - assigned;
    return `<div class="trip">
    <div class="top">
      <div>
        <div class="route">${i.name} ${i.count > 1 ? `×${i.count}` : ''}</div>
        <div class="meta">${typeParts.length ? typeParts.join(' · ') + ' · ' : ''}${i.original ? 'Original' : 'Nicht original'}</div>
        <div class="meta">${assigned > 0 ? `${free} frei · ${assigned} in Kollektion(en)` : `${free} frei`}</div>
        <div class="meta">${i.cost ? parseFloat(i.cost).toLocaleString('de-DE', {minimumFractionDigits: 2}) + ' € bezahlt' : 'kostenlos erhalten'}</div>
        ${i.note ? `<div class="meta">📝 ${i.note}</div>` : ''}
      </div>
      <div class="pts"><span class="tag ${statusTag[i.status]}">${statusLabel[i.status]}</span></div>
    </div>
    <button class="del" onclick="deleteInventory(${i.idx})">entfernen</button>
  </div>`;
  }).join('');
}

function renderCalc() {
  const list = document.getElementById('calc-list');
  if (valueLog.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Berechnungen gespeichert.</div>';
    return;
  }
  const withRates = valueLog.map((c, idx) => {
    const co2 = c.co2 || 0;
    const totalPoints = c.points + Math.round(c.points * co2 / 100);
    const totalQp = c.qp + Math.round(c.qp * co2 / 100);
    return {
      ...c, idx, totalPoints, totalQp,
      perPoint: totalPoints > 0 ? c.cost / totalPoints : null,
      perQP: totalQp > 0 ? c.cost / totalQp : null
    };
  });
  const sorted = [...withRates].sort((a, b) => (a.perQP ?? Infinity) - (b.perQP ?? Infinity));
  const bestIdx = sorted.length ? sorted[0].idx : null;
  list.innerHTML = sorted.map(c => `<div class="trip">
    <div class="top">
      <div>
        <div class="route">${c.type} ${c.idx === bestIdx ? '🏆' : ''}</div>
        <div class="meta">${c.cost.toLocaleString('de-DE', {minimumFractionDigits: 2})} € · ${c.totalPoints} P · ${c.totalQp} QP${c.co2 > 0 ? ' (inkl. CO₂ +' + c.co2 + '%)' : ''}</div>
        ${c.note ? `<div class="meta">📝 ${c.note}</div>` : ''}
      </div>
      <div class="pts">
        <div class="p">${c.perQP !== null ? c.perQP.toLocaleString('de-DE', {minimumFractionDigits: 2}) + ' €/QP' : '–'}</div>
        <div class="q">${c.perPoint !== null ? c.perPoint.toLocaleString('de-DE', {minimumFractionDigits: 2}) + ' €/P' : ''}</div>
      </div>
    </div>
    <button class="del" onclick="deleteCalc(${c.idx})">entfernen</button>
  </div>`).join('');
}

function renderUpgrades() {
  const list = document.getElementById('upg-list');
  document.getElementById('upg-count').textContent = upgrades.length;
  if (upgrades.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Upgrades erfasst.</div>';
    return;
  }
  const sorted = [...upgrades].sort((a, b) => new Date(b.date) - new Date(a.date));
  list.innerHTML = sorted.map(u => {
    const idx = upgrades.indexOf(u);
    const deltaQP = segmentPointsWithCo2(u.range, u.to, u.co2) - segmentPointsWithCo2(u.range, u.from, u.co2);
    const perQP = deltaQP > 0 ? (u.cost / deltaQP) : null;
    return `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${u.route}</div>
          <div class="meta">${u.date} · ${labelClass(u.from)} → ${labelClass(u.to)} · ${u.range === 'continental' ? 'Kontinental' : 'Interkont.'}${u.co2 > 0 ? ' · CO₂ +' + u.co2 + '%' : ''}</div>
          ${u.note ? `<div class="meta">📝 ${u.note}</div>` : ''}
        </div>
        <div class="pts">
          <div class="p">${u.cost.toLocaleString('de-DE', {minimumFractionDigits: 2})} €</div>
          <div class="q">+${deltaQP} QP${perQP !== null ? ' · ' + perQP.toLocaleString('de-DE', {minimumFractionDigits: 2}) + ' €/QP' : ''}</div>
        </div>
      </div>
      <button class="del" onclick="deleteUpgrade(${idx})">entfernen</button>
    </div>`;
  }).join('');
}

function renderUptrip() {
  const list = document.getElementById('uptrip-list');
  document.getElementById('uptrip-count').textContent = uptripItems.length;

  const totalRedemptions = uptripItems.reduce((s, u) => s + (u.redemptionCount || 0), 0);
  if (totalRedemptions > 0) {
    const sumP = uptripItems.reduce((s, u) => s + (u.rewardPoints || 0) * (u.redemptionCount || 0), 0);
    const sumQ = uptripItems.reduce((s, u) => s + (u.rewardQP || 0) * (u.redemptionCount || 0), 0);
    const sumM = uptripItems.reduce((s, u) => s + (u.rewardMeilen || 0) * (u.redemptionCount || 0), 0);
    document.getElementById('uptrip-summary').textContent =
      `Bisher ${totalRedemptions}× eingelöst — insgesamt +${sumP} Points, +${sumQ} QP, +${sumM} Meilen (bereits im Dashboard enthalten)`;
  } else {
    document.getElementById('uptrip-summary').textContent = '';
  }

  if (uptripItems.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Kollektionen erfasst.</div>';
    return;
  }

  const RING_R = 42;
  const RING_C = 2 * Math.PI * RING_R;

  list.innerHTML = uptripItems.map((u, idx) => {
    const needed = u.needed || 1;
    const have = Math.min(uptripHave(u), needed);
    const complete = have >= needed;
    const offset = RING_C * (1 - have / needed);

    const origNeeded = u.origNeeded || 0;
    const origHave = uptripOrigHave(u);
    const origSatisfied = origHave >= origNeeded;

    const maxRedemptions = u.maxRedemptions || 1;
    const redemptionCount = u.redemptionCount || 0;
    const limitReached = redemptionCount >= maxRedemptions;

    const rewardParts = [];
    if (u.rewardPoints) rewardParts.push(`${u.rewardPoints} P`);
    if (u.rewardQP) rewardParts.push(`${u.rewardQP} QP`);
    if (u.rewardMeilen) rewardParts.push(`${u.rewardMeilen} Meilen`);
    if (u.rewardOther) rewardParts.push(u.rewardOther);
    const rewardText = rewardParts.join(' · ') || '–';

    let actionHtml;
    if (limitReached) {
      actionHtml = `<span class="tag ok">✅ Limit erreicht (${redemptionCount}/${maxRedemptions})</span>`;
    } else if (!complete) {
      actionHtml = `<span class="tag mid">${needed - have} Karte(n) fehlen</span>`;
    } else if (!origSatisfied) {
      actionHtml = `<span class="tag mid">${origNeeded - origHave} Original-Karte(n) fehlen</span>`;
    } else {
      actionHtml = `<button class="btn small" style="background:var(--green); color:white;" onclick="redeemUptrip(${idx})">✅ Jetzt einlösen</button>`;
    }

    const assignedRows = (u.assignedCards || []).map(a => {
      const inv = inventory.find(i => i.id === a.invId);
      const label = inv ? inv.name + (inv.original ? ' · Original' : '') : '(gelöschte Karte)';
      return `<div class="flex-between" style="margin-top:4px;">
        <span>${label}${a.count > 1 ? ' ×' + a.count : ''}</span>
        <button class="del" onclick="unassignCardFromUptrip(${idx}, '${a.invId}')">− entfernen</button>
      </div>`;
    }).join('');

    const availableCards = inventory.filter(i => i.status !== 'eingeloest' && freeCountForInv(i, idx) > 0);
    const assignPicker = !limitReached ? `<div style="margin-top:8px;">
        <select id="assign-select-${idx}" multiple size="${Math.min(6, Math.max(3, availableCards.length))}" style="width:100%;">
          ${availableCards.map(i => `<option value="${i.id}">${i.name} (frei: ${freeCountForInv(i, idx)})</option>`).join('')}
        </select>
        <p class="hint" style="margin:4px 0 0;">Mehrere Karten auswählen: am Handy antippen, am Computer Strg/Cmd gedrückt halten.</p>
        <button class="btn small secondary" style="width:100%; margin-top:6px;" onclick="assignSelectedCards(${idx})">+ Ausgewählte zuordnen</button>
      </div>` : '';

    return `<div class="uptrip-card">
      <div class="uptrip-card-top">
        <div class="ring-wrap">
          <svg viewBox="0 0 100 100">
            <circle class="ring-bg" cx="50" cy="50" r="${RING_R}"></circle>
            <circle class="ring-fg ${complete ? 'complete' : ''}" cx="50" cy="50" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${offset}"></circle>
          </svg>
          <div class="ring-label">${have}/${needed}</div>
        </div>
        <div class="uptrip-card-title">
          <div class="name">${u.name}</div>
          <div class="reward">${rewardText}</div>
        </div>
      </div>
      <div class="uptrip-row">
        <span>🔁 Einlösungen</span><span>${redemptionCount}/${maxRedemptions}</span>
      </div>
      ${origNeeded > 0 ? `<div class="uptrip-row ${origSatisfied ? 'ok' : 'warn'}">
        <span>✈️ Min. ${origNeeded} Original-Karten</span><span>${origHave}/${origNeeded} ${origSatisfied ? '✅' : '⚠️'}</span>
      </div>` : ''}
      <div class="uptrip-row" style="display:block;">
        <div class="flex-between"><span>🔗 Zugeordnete Karten</span></div>
        ${assignedRows || '<div class="meta-line" style="margin-top:2px;">Noch keine Karten zugeordnet.</div>'}
        ${assignPicker}
      </div>
      ${u.note ? `<div class="meta-line">📝 ${u.note}</div>` : ''}
      <div class="actions">
        <div>${actionHtml}</div>
        <div></div>
      </div>
      <div class="flex-between" style="margin-top:8px;">
        <button class="del" onclick="deleteUptrip(${idx})">entfernen</button>
        ${redemptionCount > 0 ? `<button class="del" onclick="undoUptrip(${idx})">letzte Einlösung rückgängig</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderMpGivenSelect() {
  const select = document.getElementById('mp-given-select');
  const previouslySelected = new Set(Array.from(select.selectedOptions).map(o => o.value));

  const available = inventory.filter(i => i.status === 'neu' && i.count > 0);
  select.innerHTML = available.map(i =>
    `<option value="${i.id}" ${previouslySelected.has(i.id) ? 'selected' : ''}>${i.name} (${i.count}x vorhanden)</option>`
  ).join('');

  renderMpQtyRows();
}

function renderMpQtyRows() {
  const select = document.getElementById('mp-given-select');
  const rows = document.getElementById('mp-given-qty-rows');
  const selected = Array.from(select.selectedOptions);

  // Keep any already-entered quantities when the row set changes.
  const existingQty = {};
  rows.querySelectorAll('input[data-inv-id]').forEach(inp => { existingQty[inp.dataset.invId] = inp.value; });

  rows.innerHTML = selected.map(opt => {
    const inv = inventory.find(i => i.id === opt.value);
    const max = inv ? inv.count : 1;
    const val = existingQty[opt.value] || 1;
    return `<div class="qty-row">
      <label>${inv ? inv.name : opt.textContent}</label>
      <input type="number" data-inv-id="${opt.value}" min="1" max="${max}" value="${val}">
    </div>`;
  }).join('');
}

function renderMpReceivedList() {
  const list = document.getElementById('mp-received-list');
  if (pendingReceivedCards.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = pendingReceivedCards.map((c, idx) => `<div class="pending-row">
    <span>${c.name}${c.count > 1 ? ' ×' + c.count : ''}${c.cardType ? ' · ' + (cardTypeLabel[c.cardType] || c.cardType) : ''}</span>
    <button type="button" class="del" onclick="removePendingReceivedCard(${idx})">entfernen</button>
  </div>`).join('');
}

window.removePendingReceivedCard = function(idx) {
  pendingReceivedCards.splice(idx, 1);
  renderMpReceivedList();
};

function renderMarketplace() {
  renderMpGivenSelect();
  const list = document.getElementById('mp-list');
  document.getElementById('mp-count').textContent = marketplace.length;
  const totalCost = marketplace.reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
  document.getElementById('mp-summary').textContent = marketplace.length > 0
    ? `Gesamt ausgegeben für Tausche/Mixer: ${totalCost.toLocaleString('de-DE', {minimumFractionDigits: 2})} €`
    : '';
  if (marketplace.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Tausche erfasst.</div>';
    return;
  }
  const sorted = [...marketplace].sort((a, b) => new Date(b.date) - new Date(a.date));
  list.innerHTML = sorted.map(m => {
    const idx = marketplace.indexOf(m);
    const givenText = formatCardList(m.given);
    const receivedText = formatCardList(m.received);
    return `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${m.type}${m.ratio ? ' · ' + m.ratio : ''}</div>
          <div class="meta">${m.date} · abgegeben: ${givenText} · erhalten: ${receivedText}</div>
          ${m.note ? `<div class="meta">📝 ${m.note}</div>` : ''}
        </div>
        <div class="pts"><div class="p">${parseFloat(m.cost).toLocaleString('de-DE', {minimumFractionDigits: 2})} €</div></div>
      </div>
      <button class="del" onclick="deleteMarketplace(${idx})">entfernen</button>
    </div>`;
  }).join('');
}

function formatCardList(arr) {
  if (!arr || arr.length === 0) return '–';
  return arr.map(c => c.name + (c.count > 1 ? ' ×' + c.count : '')).join(', ');
}

function renderMiles() {
  document.getElementById('miles-count').textContent = milesLog.length;

  // --- Aufschlüsselung nach Kategorie (immer über den gesamten Bestand, ungefiltert) ---
  const breakdownEl = document.getElementById('miles-breakdown');
  if (milesLog.length === 0) {
    breakdownEl.innerHTML = '<div class="empty">Noch keine Meilen-Bewegungen erfasst.</div>';
  } else {
    const byCategory = {};
    milesLog.forEach(mv => {
      byCategory[mv.category] = byCategory[mv.category] || { total: 0, sources: {} };
      byCategory[mv.category].total += mv.amount;
      if (mv.category === 'Fremdprogramm-Umwandlung' && mv.source) {
        byCategory[mv.category].sources[mv.source] = (byCategory[mv.category].sources[mv.source] || 0) + mv.amount;
      }
    });
    // Nach Höhe sortiert (absteigend), damit auf einen Blick sichtbar ist,
    // was am meisten Meilen gebracht hat.
    const sortedCats = MILES_CATEGORIES
      .filter(cat => byCategory[cat])
      .sort((a, b) => byCategory[b].total - byCategory[a].total);
    const topCat = sortedCats.length && byCategory[sortedCats[0]].total > 0 ? sortedCats[0] : null;

    breakdownEl.innerHTML = sortedCats
      .map(cat => {
        const data = byCategory[cat];
        const sortedSources = Object.keys(data.sources).sort((a, b) => data.sources[b] - data.sources[a]);
        const sourceRows = sortedSources.map(src =>
          `<div class="flex-between" style="padding-left:14px; margin-top:3px; font-size:11.5px; color:var(--muted);">
            <span>↳ ${src}</span><span>${data.sources[src].toLocaleString('de-DE')}</span>
          </div>`
        ).join('');
        return `<div class="flex-between" style="margin-top:6px;">
          <span style="font-weight:600; color:var(--navy);">${cat}${cat === topCat ? ' 🏆' : ''}</span>
          <span style="font-weight:700;">${data.total.toLocaleString('de-DE')} Meilen</span>
        </div>${sourceRows}`;
      }).join('');
  }

  // --- Filter-Dropdowns befüllen (Auswahl dabei erhalten) ---
  const catSelect = document.getElementById('mi-filter-category');
  const prevCat = catSelect.value;
  const usedCategories = MILES_CATEGORIES.filter(cat => milesLog.some(mv => mv.category === cat));
  catSelect.innerHTML = '<option value="">Alle</option>' + usedCategories.map(c => `<option value="${c}">${c}</option>`).join('');
  if (usedCategories.includes(prevCat)) catSelect.value = prevCat;

  const yearSelect = document.getElementById('mi-filter-year');
  const prevYear = yearSelect.value;
  const usedYears = [...new Set(milesLog.map(mv => (mv.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  yearSelect.innerHTML = '<option value="">Alle</option>' + usedYears.map(y => `<option value="${y}">${y}</option>`).join('');
  if (usedYears.includes(prevYear)) yearSelect.value = prevYear;

  // --- Chronologische, gefilterte Liste ---
  const filterCat = catSelect.value;
  const filterYear = yearSelect.value;
  const filtered = milesLog
    .map((mv, idx) => ({ ...mv, idx }))
    .filter(mv => !filterCat || mv.category === filterCat)
    .filter(mv => !filterYear || (mv.date || '').startsWith(filterYear));

  const listEl = document.getElementById('miles-list');
  if (milesLog.length === 0) {
    listEl.innerHTML = '<div class="empty">Noch keine Meilen-Bewegungen erfasst.</div>';
    return;
  }
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty">Noch keine Bewegungen für diesen Filter.</div>';
    return;
  }
  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
  listEl.innerHTML = sorted.map(mv => `<div class="trip">
    <div class="top">
      <div>
        <div class="route">${mv.category}${mv.source ? ' · ' + mv.source : ''}</div>
        <div class="meta">${mv.date}</div>
        ${mv.note ? `<div class="meta">📝 ${mv.note}</div>` : ''}
      </div>
      <div class="pts"><div class="p" style="color:${mv.amount >= 0 ? 'var(--green)' : 'var(--red)'};">${mv.amount >= 0 ? '+' : ''}${mv.amount.toLocaleString('de-DE')}</div></div>
    </div>
    <button class="del" onclick="deleteMilesMovement(${mv.idx})">entfernen</button>
  </div>`).join('');
}

function renderRedemptionIdeas() {
  document.getElementById('redemption-count').textContent = redemptionIdeas.length;
  const list = document.getElementById('redemption-list');
  if (redemptionIdeas.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Einlöse-Ideen erfasst.</div>';
    return;
  }
  const sorted = redemptionIdeas.map((r, idx) => ({ ...r, idx })).reverse();
  list.innerHTML = sorted.map(r => `<div class="trip">
    <div class="top">
      <div>
        <div class="route">${r.title}</div>
        <div class="meta">${(r.miles || 0).toLocaleString('de-DE')} Meilen</div>
        ${r.note ? `<div class="meta">📝 ${r.note}</div>` : ''}
        ${r.link ? `<div class="meta"><a href="${r.link}" target="_blank" rel="noopener">🔗 Link öffnen</a></div>` : ''}
      </div>
    </div>
    <button class="del" onclick="deleteRedemptionIdea(${r.idx})">entfernen</button>
  </div>`).join('');
}

// ---------- persistence ----------

async function saveBaseline() { await DB.set(KEY_BASE, baseline); }
async function saveTrips() { await DB.set(KEY_TRIPS, trips); }
async function savePromos() { await DB.set(KEY_PROMOS, promos); }
async function saveUptrip() { await DB.set(KEY_UPTRIP, uptripItems); }
async function saveFristen() { await DB.set(KEY_FRISTEN, fristen); }
async function saveInventory() { await DB.set(KEY_INVENTORY, inventory); }
async function saveValueLog() { await DB.set(KEY_VALUECALC, valueLog); }
async function saveUpgrades() { await DB.set(KEY_UPGRADES, upgrades); }
async function saveMarketplace() { await DB.set(KEY_MARKETPLACE, marketplace); }
async function saveSenatorGround() { await DB.set(KEY_SENATOR_GROUND, senatorGround); }
async function saveMilesLog() { await DB.set(KEY_MILES_LOG, milesLog); }
async function saveRedemptionIdeas() { await DB.set(KEY_REDEMPTION_IDEAS, redemptionIdeas); }

async function loadAll() {
  baseline = await DB.get(KEY_BASE, baseline);
  trips = await DB.get(KEY_TRIPS, []);
  promos = await DB.get(KEY_PROMOS, []);
  uptripItems = await DB.get(KEY_UPTRIP, []);
  fristen = await DB.get(KEY_FRISTEN, []);
  inventory = await DB.get(KEY_INVENTORY, []);
  valueLog = await DB.get(KEY_VALUECALC, []);
  upgrades = await DB.get(KEY_UPGRADES, []);
  marketplace = await DB.get(KEY_MARKETPLACE, []);
  senatorGround = await DB.get(KEY_SENATOR_GROUND, senatorGround);
  milesLog = await DB.get(KEY_MILES_LOG, []);
  redemptionIdeas = await DB.get(KEY_REDEMPTION_IDEAS, []);

  let inventoryMigrated = false;
  inventory.forEach(i => { if (!i.id) { i.id = genId(); inventoryMigrated = true; } });
  if (inventoryMigrated) await saveInventory();

  if (migrateLegacyUptripCardNames()) await saveUptrip();

  document.getElementById('base-p').value = baseline.p;
  document.getElementById('base-q').value = baseline.q;
  document.getElementById('base-m').value = baseline.m;
  document.getElementById('base-note').value = baseline.note || '';
  document.getElementById('senator-ground-points').value = senatorGround.points || 0;
  document.getElementById('senator-ground-qp').value = senatorGround.qp || 0;
  document.getElementById('loading-tag').style.display = 'none';

  render();
}

// ---------- delete / action handlers ----------

window.deleteTrip = async function(idx) { trips.splice(idx, 1); await saveTrips(); render(); };
window.deletePromo = async function(idx) { promos.splice(idx, 1); await savePromos(); render(); };
window.deleteFristen = async function(idx) { fristen.splice(idx, 1); await saveFristen(); render(); };
window.deleteInventory = async function(idx) { inventory.splice(idx, 1); await saveInventory(); render(); };
window.deleteCalc = async function(idx) { valueLog.splice(idx, 1); await saveValueLog(); render(); };
window.deleteUpgrade = async function(idx) { upgrades.splice(idx, 1); await saveUpgrades(); render(); };
window.deleteMarketplace = async function(idx) { marketplace.splice(idx, 1); await saveMarketplace(); render(); };
window.deleteUptrip = async function(idx) { uptripItems.splice(idx, 1); await saveUptrip(); render(); };
window.deleteMilesMovement = async function(idx) { milesLog.splice(idx, 1); await saveMilesLog(); render(); };
window.deleteRedemptionIdea = async function(idx) { redemptionIdeas.splice(idx, 1); await saveRedemptionIdeas(); render(); };

window.assignSelectedCards = async function(idx) {
  const select = document.getElementById(`assign-select-${idx}`);
  if (!select) return;
  const ids = Array.from(select.selectedOptions).map(o => o.value).filter(Boolean);
  if (ids.length === 0) return;
  const u = uptripItems[idx];
  if (!u) return;
  u.assignedCards = u.assignedCards || [];
  ids.forEach(invId => {
    const inv = inventory.find(i => i.id === invId);
    if (!inv || freeCountForInv(inv, idx) <= 0) return;
    const existing = u.assignedCards.find(a => a.invId === invId);
    if (existing) existing.count += 1;
    else u.assignedCards.push({ invId, count: 1 });
  });
  await saveUptrip();
  render();
};

window.unassignCardFromUptrip = async function(idx, invId) {
  const u = uptripItems[idx];
  if (!u || !u.assignedCards) return;
  const existing = u.assignedCards.find(a => a.invId === invId);
  if (!existing) return;
  existing.count -= 1;
  if (existing.count <= 0) u.assignedCards = u.assignedCards.filter(a => a.invId !== invId);
  await saveUptrip();
  render();
};

window.redeemUptrip = async function(idx) {
  const u = uptripItems[idx];
  if (!u) return;
  const maxRedemptions = u.maxRedemptions || 1;
  const redemptionCount = u.redemptionCount || 0;
  if (redemptionCount >= maxRedemptions) return;

  const parts = [];
  if (u.rewardPoints) parts.push(`+${u.rewardPoints} Points`);
  if (u.rewardQP) parts.push(`+${u.rewardQP} Qualifying Points`);
  if (u.rewardMeilen) parts.push(`+${u.rewardMeilen} Meilen`);
  if (u.rewardOther) parts.push(u.rewardOther);
  const assignedNames = (u.assignedCards || []).map(a => {
    const inv = inventory.find(i => i.id === a.invId);
    return inv ? `${inv.name}${a.count > 1 ? ' ×' + a.count : ''}` : null;
  }).filter(Boolean);
  const msg = `"${u.name}" einlösen (${redemptionCount + 1}/${maxRedemptions})?\n\nDu erhältst:\n${parts.join('\n') || '(keine numerische Prämie hinterlegt)'}\n\nDas wird sofort zu deinem Dashboard addiert.${assignedNames.length ? '\nZugeordnete Karten werden aus dem Inventar abgezogen: ' + assignedNames.join(', ') : ''}`;
  if (!confirm(msg)) return;

  (u.assignedCards || []).forEach(a => {
    const inv = inventory.find(i => i.id === a.invId);
    if (inv) {
      inv.count -= a.count;
      if (inv.count <= 0) { inv.status = 'eingeloest'; inv.count = 0; }
    }
  });
  await saveInventory();

  u.redemptionCount = redemptionCount + 1;
  u.redeemedDate = new Date().toISOString().slice(0, 10);
  u.assignedCards = [];

  uptripItems[idx] = u;
  await saveUptrip();
  render();
};

window.undoUptrip = async function(idx) {
  const u = uptripItems[idx];
  if (!u || !(u.redemptionCount > 0)) return;
  if (!confirm(`Letzte Einlösung von "${u.name}" rückgängig machen? Nur die Points/QP/Meilen dieser Einlösung werden aus dem Dashboard wieder abgezogen. Die dafür verbrauchten Karten wurden bereits aus dem Inventar entfernt und werden NICHT automatisch zurückgebucht — das musst du manuell im Karteninventar korrigieren, falls nötig.`)) return;
  u.redemptionCount -= 1;
  uptripItems[idx] = u;
  await saveUptrip();
  render();
};

// ---------- form handlers ----------

document.getElementById('baseline-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  baseline = {
    p: parseInt(document.getElementById('base-p').value) || 0,
    q: parseInt(document.getElementById('base-q').value) || 0,
    m: parseInt(document.getElementById('base-m').value) || 0,
    note: document.getElementById('base-note').value
  };
  await saveBaseline();
  render();
});

document.getElementById('senator-ground-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  senatorGround = {
    points: parseInt(document.getElementById('senator-ground-points').value) || 0,
    qp: parseInt(document.getElementById('senator-ground-qp').value) || 0
  };
  await saveSenatorGround();
  render();
});

document.getElementById('trip-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const trip = {
    date: document.getElementById('t-date').value,
    route: document.getElementById('t-route').value,
    range: document.getElementById('t-range').value,
    cls: document.getElementById('t-class').value,
    segments: parseInt(document.getElementById('t-segments').value) || 1,
    co2: parseInt(document.getElementById('t-co2').value) || 0,
    note: document.getElementById('t-note').value,
    historical: document.getElementById('t-historical').checked
  };
  trips.push(trip);
  await saveTrips();
  e.target.reset();
  document.getElementById('t-segments').value = 2;
  render();
});

document.getElementById('promo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('pr-title').value;
  if (!title) return;
  promos.push({
    title,
    until: document.getElementById('pr-date').value,
    note: document.getElementById('pr-note').value
  });
  await savePromos();
  e.target.reset();
  render();
});

document.getElementById('fristen-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  fristen.push({
    title: document.getElementById('fr-title').value,
    date: document.getElementById('fr-date').value,
    note: document.getElementById('fr-note').value
  });
  await saveFristen();
  e.target.reset();
  render();
});

document.getElementById('inv-type').addEventListener('change', () => {
  const isAircraft = document.getElementById('inv-type').value === 'aircraft';
  document.getElementById('inv-airline-wrap').style.display = isAircraft ? 'block' : 'none';
});

document.getElementById('inv-filter-type').addEventListener('change', renderInventory);
document.getElementById('inv-filter-airline').addEventListener('change', renderInventory);
document.getElementById('inv-filter-original').addEventListener('change', renderInventory);

document.getElementById('inv-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cardType = document.getElementById('inv-type').value;
  inventory.push({
    id: genId(),
    name: document.getElementById('inv-name').value,
    count: parseInt(document.getElementById('inv-qty').value) || 1,
    cardType: cardType || null,
    airline: cardType === 'aircraft' ? document.getElementById('inv-airline').value : '',
    original: document.getElementById('inv-original').value === '1',
    status: document.getElementById('inv-status').value,
    cost: parseFloat(document.getElementById('inv-cost').value) || 0,
    note: document.getElementById('inv-note').value
  });
  await saveInventory();
  e.target.reset();
  document.getElementById('inv-qty').value = 1;
  document.getElementById('inv-airline-wrap').style.display = 'none';
  render();
});

document.getElementById('calc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  valueLog.push({
    type: document.getElementById('c-type').value,
    cost: parseFloat(document.getElementById('c-cost').value) || 0,
    points: parseInt(document.getElementById('c-points').value) || 0,
    qp: parseInt(document.getElementById('c-qp').value) || 0,
    co2: parseInt(document.getElementById('c-co2').value) || 0,
    note: document.getElementById('c-note').value
  });
  await saveValueLog();
  e.target.reset();
  render();
});

document.getElementById('upg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  upgrades.push({
    date: document.getElementById('ug-date').value,
    route: document.getElementById('ug-route').value,
    from: document.getElementById('ug-from').value,
    to: document.getElementById('ug-to').value,
    cost: parseFloat(document.getElementById('ug-cost').value) || 0,
    range: document.getElementById('ug-range').value,
    co2: parseInt(document.getElementById('ug-co2').value) || 0,
    note: document.getElementById('ug-note').value
  });
  await saveUpgrades();
  e.target.reset();
  render();
});

document.getElementById('uptrip-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('up-name').value;
  const needed = parseInt(document.getElementById('up-needed').value) || 1;
  const origNeeded = parseInt(document.getElementById('up-orig-needed').value) || 0;
  const maxRedemptions = parseInt(document.getElementById('up-max-redemptions').value) || 1;
  const rewardPoints = parseInt(document.getElementById('up-reward-p').value) || 0;
  const rewardQP = parseInt(document.getElementById('up-reward-q').value) || 0;
  const rewardMeilen = parseInt(document.getElementById('up-reward-m').value) || 0;
  const rewardOther = document.getElementById('up-reward-other').value;
  const note = document.getElementById('up-note').value;
  const existingIdx = uptripItems.findIndex(u => u.name.toLowerCase() === name.toLowerCase());
  const existing = existingIdx >= 0 ? uptripItems[existingIdx] : null;
  const item = {
    name, needed, origNeeded, maxRedemptions, rewardPoints, rewardQP, rewardMeilen, rewardOther, note,
    assignedCards: existing ? (existing.assignedCards || []) : [],
    cardNames: existing ? existing.cardNames : '',
    redemptionCount: existing ? (existing.redemptionCount || 0) : 0,
    redeemedDate: existing ? existing.redeemedDate : null
  };
  if (existingIdx >= 0) uptripItems[existingIdx] = item;
  else uptripItems.push(item);
  await saveUptrip();
  e.target.reset();
  render();
});

document.getElementById('mp-given-select').addEventListener('change', renderMpQtyRows);

document.getElementById('mp-recv-type').addEventListener('change', () => {
  const isAircraft = document.getElementById('mp-recv-type').value === 'aircraft';
  document.getElementById('mp-recv-airline-wrap').style.display = isAircraft ? 'block' : 'none';
});

document.getElementById('mp-recv-add-btn').addEventListener('click', () => {
  const name = document.getElementById('mp-recv-name').value.trim();
  if (!name) { alert('Bitte einen Kartennamen eingeben.'); return; }
  const cardType = document.getElementById('mp-recv-type').value;
  pendingReceivedCards.push({
    name,
    count: parseInt(document.getElementById('mp-recv-qty').value) || 1,
    cardType: cardType || null,
    airline: cardType === 'aircraft' ? document.getElementById('mp-recv-airline').value : '',
    original: document.getElementById('mp-recv-original').value === '1',
    status: document.getElementById('mp-recv-status').value,
    cost: parseFloat(document.getElementById('mp-recv-cost').value) || 0,
    note: document.getElementById('mp-recv-note').value
  });
  renderMpReceivedList();

  document.getElementById('mp-recv-name').value = '';
  document.getElementById('mp-recv-qty').value = 1;
  document.getElementById('mp-recv-type').value = '';
  document.getElementById('mp-recv-original').value = '1';
  document.getElementById('mp-recv-airline').value = '';
  document.getElementById('mp-recv-airline-wrap').style.display = 'none';
  document.getElementById('mp-recv-status').value = 'neu';
  document.getElementById('mp-recv-cost').value = '';
  document.getElementById('mp-recv-note').value = '';
});

document.getElementById('mp-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Abgegebene Karten: direkt vom gewählten Inventar-Eintrag abziehen.
  const givenRows = Array.from(document.querySelectorAll('#mp-given-qty-rows input[data-inv-id]'));
  const given = [];
  givenRows.forEach(row => {
    const inv = inventory.find(i => i.id === row.dataset.invId);
    if (!inv) return;
    const qty = Math.max(1, Math.min(inv.count, parseInt(row.value) || 1));
    given.push({ invId: inv.id, name: inv.name, count: qty });
    inv.count -= qty;
    if (inv.count <= 0) { inv.status = 'eingeloest'; inv.count = 0; }
  });

  // Erhaltene Karten: bestehenden passenden Eintrag erhöhen, sonst neu anlegen.
  const received = pendingReceivedCards.map(c => ({ ...c }));
  received.forEach(c => {
    const existing = inventory.find(i =>
      i.status !== 'eingeloest' &&
      i.name.toLowerCase() === c.name.toLowerCase() &&
      (i.cardType || null) === (c.cardType || null) &&
      (i.airline || '') === (c.airline || '')
    );
    if (existing) {
      existing.count += c.count;
    } else {
      inventory.push({
        id: genId(),
        name: c.name,
        count: c.count,
        cardType: c.cardType,
        airline: c.airline,
        original: c.original,
        status: c.status,
        cost: c.cost,
        note: c.note || 'aus Tausch/Mixer erhalten'
      });
    }
  });

  await saveInventory();

  marketplace.push({
    date: document.getElementById('mp-date').value,
    type: document.getElementById('mp-type').value,
    given, received,
    ratio: document.getElementById('mp-ratio').value,
    cost: parseFloat(document.getElementById('mp-cost').value) || 0,
    note: document.getElementById('mp-note').value
  });
  await saveMarketplace();

  pendingReceivedCards = [];
  e.target.reset();
  document.getElementById('mp-cost').value = '1.99';
  document.getElementById('mp-given-qty-rows').innerHTML = '';
  render();
});

document.getElementById('mi-category').addEventListener('change', () => {
  const isExternal = document.getElementById('mi-category').value === 'Fremdprogramm-Umwandlung';
  document.getElementById('mi-source-wrap').style.display = isExternal ? 'block' : 'none';
  document.getElementById('mi-source').required = isExternal;
});

document.getElementById('mi-filter-category').addEventListener('change', renderMiles);
document.getElementById('mi-filter-year').addEventListener('change', renderMiles);

document.getElementById('miles-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = document.getElementById('mi-category').value;
  const source = document.getElementById('mi-source').value.trim();
  if (category === 'Fremdprogramm-Umwandlung' && !source) {
    alert('Bitte bei "Fremdprogramm-Umwandlung" die Quelle angeben (z.B. "Payback").');
    return;
  }
  milesLog.push({
    date: document.getElementById('mi-date').value,
    category,
    source: category === 'Fremdprogramm-Umwandlung' ? source : '',
    amount: parseInt(document.getElementById('mi-amount').value) || 0,
    note: document.getElementById('mi-note').value
  });
  await saveMilesLog();
  e.target.reset();
  document.getElementById('mi-source-wrap').style.display = 'none';
  document.getElementById('mi-source').required = false;
  render();
});

document.getElementById('redemption-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  redemptionIdeas.push({
    title: document.getElementById('ri-title').value,
    miles: parseInt(document.getElementById('ri-miles').value) || 0,
    link: document.getElementById('ri-link').value,
    note: document.getElementById('ri-note').value
  });
  await saveRedemptionIdeas();
  e.target.reset();
  render();
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('Wirklich alle Trips, Aktionen, Uptrip-Daten, Fristen, Marktplatz-Tausche, Meilen-Bewegungen, Einlöse-Ideen und Berechnungen löschen? Basiswerte bleiben erhalten.')) return;
  trips = [];
  promos = [];
  uptripItems = [];
  fristen = [];
  inventory = [];
  valueLog = [];
  upgrades = [];
  marketplace = [];
  milesLog = [];
  redemptionIdeas = [];
  await saveTrips();
  await savePromos();
  await saveUptrip();
  await saveFristen();
  await saveInventory();
  await saveValueLog();
  await saveUpgrades();
  await saveMarketplace();
  await saveMilesLog();
  await saveRedemptionIdeas();
  render();
});

// --- Tab navigation ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// --- Service worker registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.error('SW registration failed', err));
  });
}

// loadAll() is triggered by auth.js once a Supabase Auth session exists.
