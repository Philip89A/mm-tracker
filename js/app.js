const KEY_BASE = 'baseline';
const KEY_TRIPS = 'trips';
const KEY_PROMOS = 'promos';
const KEY_UPTRIP = 'uptrip';
const KEY_FRISTEN = 'fristen';
const KEY_INVENTORY = 'uptrip-inventory';
const KEY_VALUECALC = 'value-log';
const KEY_UPGRADES = 'upgrades';
const KEY_MARKETPLACE = 'marketplace';

let baseline = { p: 0, q: 0, m: 0 };
let trips = [];
let promos = [];
let uptripItems = [];
let fristen = [];
let inventory = [];
let valueLog = [];
let upgrades = [];
let marketplace = [];

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

function computeTotals() {
  let p = baseline.p, q = baseline.q, m = baseline.m;
  trips.forEach(t => {
    const total = tripPoints(t);
    p += total;
    q += total;
  });
  uptripItems.forEach(u => {
    if (u.redeemed) {
      p += (u.rewardPoints || 0);
      q += (u.rewardQP || 0);
      m += (u.rewardMeilen || 0);
    }
  });
  return { p, q, m };
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

function parseCardList(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean).map(part => {
    const [name, countStr] = part.split(':').map(x => x.trim());
    return { name, count: parseInt(countStr) || 1 };
  });
}

function applyCardDelta(name, delta) {
  // delta negative = remove from inventory, positive = add
  let inv = inventory.find(i => i.name.toLowerCase() === name.toLowerCase() && i.status !== 'eingeloest');
  if (delta < 0) {
    if (inv) {
      inv.count += delta;
      if (inv.count <= 0) { inv.status = 'eingeloest'; inv.count = 0; }
    }
  } else {
    if (inv) {
      inv.count += delta;
    } else {
      inventory.push({ name, count: delta, status: 'neu', cost: 0, note: 'aus Tausch/Mixer erhalten' });
    }
  }
}

// ---------- render ----------

function render() {
  const totals = computeTotals();
  document.getElementById('stat-p').textContent = totals.p.toLocaleString('de-DE');
  document.getElementById('stat-q').textContent = totals.q.toLocaleString('de-DE');
  document.getElementById('stat-m').textContent = totals.m.toLocaleString('de-DE');

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

  renderTrips();
  renderPromos();
  renderUptrip();
  renderFristen();
  renderInventory();
  renderCalc();
  renderUpgrades();
  renderMarketplace();
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
          ${t.note ? `<div class="meta">📝 ${t.note}</div>` : ''}
        </div>
        <div class="pts">
          <div class="p">+${total} P/QP</div>
        </div>
      </div>
      <button class="del" onclick="deleteTrip(${idx})">entfernen</button>
    </div>`;
  }).join('');
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
  const filtered = inventory
    .map((i, idx) => ({ ...i, idx }))
    .filter(i => !filterType || i.cardType === filterType)
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
    return `<div class="trip">
    <div class="top">
      <div>
        <div class="route">${i.name} ${i.count > 1 ? `×${i.count}` : ''}</div>
        <div class="meta">${typeParts.length ? typeParts.join(' · ') + ' · ' : ''}${i.original ? 'Original' : 'Nicht original'}</div>
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
  const withRates = valueLog.map((c, idx) => ({
    ...c, idx,
    perPoint: c.points > 0 ? c.cost / c.points : null,
    perQP: c.qp > 0 ? c.cost / c.qp : null
  }));
  const sorted = [...withRates].sort((a, b) => (a.perQP ?? Infinity) - (b.perQP ?? Infinity));
  const bestIdx = sorted.length ? sorted[0].idx : null;
  list.innerHTML = sorted.map(c => `<div class="trip">
    <div class="top">
      <div>
        <div class="route">${c.type} ${c.idx === bestIdx ? '🏆' : ''}</div>
        <div class="meta">${c.cost.toLocaleString('de-DE', {minimumFractionDigits: 2})} € · ${c.points} P · ${c.qp} QP</div>
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
    const deltaQP = pointsForSegment(u.range, u.to) - pointsForSegment(u.range, u.from);
    const perQP = deltaQP > 0 ? (u.cost / deltaQP) : null;
    return `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${u.route}</div>
          <div class="meta">${u.date} · ${labelClass(u.from)} → ${labelClass(u.to)} · ${u.range === 'continental' ? 'Kontinental' : 'Interkont.'}</div>
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

  const redeemedItems = uptripItems.filter(u => u.redeemed);
  if (redeemedItems.length > 0) {
    const sumP = redeemedItems.reduce((s, u) => s + (u.rewardPoints || 0), 0);
    const sumQ = redeemedItems.reduce((s, u) => s + (u.rewardQP || 0), 0);
    const sumM = redeemedItems.reduce((s, u) => s + (u.rewardMeilen || 0), 0);
    document.getElementById('uptrip-summary').textContent =
      `Bereits eingelöst: ${redeemedItems.length} Kollektion(en) — insgesamt +${sumP} Points, +${sumQ} QP, +${sumM} Meilen (bereits im Dashboard enthalten)`;
  } else {
    document.getElementById('uptrip-summary').textContent = '';
  }

  if (uptripItems.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Kollektionen erfasst.</div>';
    return;
  }
  list.innerHTML = uptripItems.map((u, idx) => {
    const pct = Math.min(100, Math.round((u.have / u.needed) * 100));
    const missing = Math.max(0, u.needed - u.have);
    const origMissing = Math.max(0, (u.origNeeded || 0) - (u.origHave || 0));
    const rewardParts = [];
    if (u.rewardPoints) rewardParts.push(`${u.rewardPoints} P`);
    if (u.rewardQP) rewardParts.push(`${u.rewardQP} QP`);
    if (u.rewardMeilen) rewardParts.push(`${u.rewardMeilen} Meilen`);
    if (u.rewardOther) rewardParts.push(u.rewardOther);
    const rewardText = rewardParts.join(' · ') || '–';

    let statusHtml;
    if (u.redeemed) {
      statusHtml = `<span class="tag ok">✅ eingelöst${u.redeemedDate ? ' ' + u.redeemedDate : ''}</span>`;
    } else if (missing > 0) {
      statusHtml = `<span class="tag mid">${missing} Karte(n) fehlen</span>`;
    } else if (origMissing > 0) {
      statusHtml = `<span class="tag mid">${origMissing} Original-Karte(n) fehlen</span>`;
    } else {
      statusHtml = `<button class="btn small" style="background:var(--green); color:white;" onclick="redeemUptrip(${idx})">✅ Jetzt einlösen</button>`;
    }

    return `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${u.name}</div>
          <div class="meta">${u.have} / ${u.needed} Karten · ${rewardText}</div>
          ${u.origNeeded > 0 ? `<div class="meta">🃏 davon Original: ${u.origHave || 0} / ${u.origNeeded}${(u.origHave || 0) < u.origNeeded ? ' ⚠️' : ' ✅'}</div>` : ''}
          ${u.cardNames ? `<div class="meta">🔗 Karten: ${u.cardNames}</div>` : ''}
          ${u.note ? `<div class="meta">📝 ${u.note}</div>` : ''}
        </div>
        <div class="pts">${statusHtml}</div>
      </div>
      <div class="bar-bg" style="margin-top:8px;"><div class="bar-fill q" style="width:${pct}%"></div></div>
      <div class="flex-between" style="margin-top:6px;">
        <div>
          <button class="del" onclick="deleteUptrip(${idx})">entfernen</button>
          ${u.redeemed ? `<button class="del" style="color:var(--muted); margin-left:10px;" onclick="undoUptrip(${idx})">Einlösung rückgängig</button>` : ''}
        </div>
        ${!u.redeemed ? `<div>
          <button class="btn small secondary" onclick="adjustUptripCard(${idx}, -1)" ${u.have <= 0 ? 'disabled' : ''}>−1 Karte</button>
          <button class="btn small" onclick="adjustUptripCard(${idx}, 1)" ${u.have >= u.needed ? 'disabled' : ''} style="margin-left:6px;">+1 Karte</button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderMarketplace() {
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
    return `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${m.type}${m.ratio ? ' · ' + m.ratio : ''}</div>
          <div class="meta">${m.date} · abgegeben: ${m.given || '–'} · erhalten: ${m.received || '–'}</div>
          ${m.note ? `<div class="meta">📝 ${m.note}</div>` : ''}
        </div>
        <div class="pts"><div class="p">${parseFloat(m.cost).toLocaleString('de-DE', {minimumFractionDigits: 2})} €</div></div>
      </div>
      <button class="del" onclick="deleteMarketplace(${idx})">entfernen</button>
    </div>`;
  }).join('');
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

  document.getElementById('base-p').value = baseline.p;
  document.getElementById('base-q').value = baseline.q;
  document.getElementById('base-m').value = baseline.m;
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

window.adjustUptripCard = async function(idx, delta) {
  const u = uptripItems[idx];
  if (!u || u.redeemed) return;
  u.have = Math.max(0, Math.min(u.needed, u.have + delta));
  uptripItems[idx] = u;
  await saveUptrip();
  render();
};

window.redeemUptrip = async function(idx) {
  const u = uptripItems[idx];
  if (!u || u.redeemed) return;
  const parts = [];
  if (u.rewardPoints) parts.push(`+${u.rewardPoints} Points`);
  if (u.rewardQP) parts.push(`+${u.rewardQP} Qualifying Points`);
  if (u.rewardMeilen) parts.push(`+${u.rewardMeilen} Meilen`);
  if (u.rewardOther) parts.push(u.rewardOther);
  const msg = `"${u.name}" einlösen?\n\nDu erhältst:\n${parts.join('\n') || '(keine numerische Prämie hinterlegt)'}\n\nDas wird sofort zu deinem Dashboard addiert.${u.cardNames ? '\nVerknüpfte Karten werden aus dem Inventar abgezogen: ' + u.cardNames : ''}`;
  if (!confirm(msg)) return;

  u.redeemed = true;
  u.redeemedDate = new Date().toISOString().slice(0, 10);

  if (u.cardNames) {
    const names = u.cardNames.split(',').map(s => s.trim()).filter(Boolean);
    names.forEach(n => {
      const inv = inventory.find(i => i.name.toLowerCase() === n.toLowerCase() && i.count > 0 && i.status !== 'eingeloest');
      if (inv) {
        inv.count -= 1;
        if (inv.count <= 0) { inv.status = 'eingeloest'; inv.count = 0; }
      }
    });
    await saveInventory();
  }

  uptripItems[idx] = u;
  await saveUptrip();
  render();
};

window.undoUptrip = async function(idx) {
  const u = uptripItems[idx];
  if (!u || !u.redeemed) return;
  if (!confirm(`Einlösung von "${u.name}" rückgängig machen? Die Points/QP/Meilen werden aus dem Dashboard wieder abgezogen. Hinweis: bereits abgezogene Inventar-Karten werden dabei NICHT automatisch zurückgebucht — die musst du manuell im Karteninventar korrigieren.`)) return;
  u.redeemed = false;
  u.redeemedDate = null;
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
    m: parseInt(document.getElementById('base-m').value) || 0
  };
  await saveBaseline();
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
    note: document.getElementById('t-note').value
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
document.getElementById('inv-filter-original').addEventListener('change', renderInventory);

document.getElementById('inv-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cardType = document.getElementById('inv-type').value;
  inventory.push({
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
  const have = parseInt(document.getElementById('up-have').value) || 0;
  const origNeeded = parseInt(document.getElementById('up-orig-needed').value) || 0;
  const origHave = parseInt(document.getElementById('up-orig-have').value) || 0;
  const rewardPoints = parseInt(document.getElementById('up-reward-p').value) || 0;
  const rewardQP = parseInt(document.getElementById('up-reward-q').value) || 0;
  const rewardMeilen = parseInt(document.getElementById('up-reward-m').value) || 0;
  const rewardOther = document.getElementById('up-reward-other').value;
  const cardNames = document.getElementById('up-cardnames').value;
  const note = document.getElementById('up-note').value;
  const existingIdx = uptripItems.findIndex(u => u.name.toLowerCase() === name.toLowerCase());
  const existing = existingIdx >= 0 ? uptripItems[existingIdx] : null;
  const item = {
    name, needed, have, origNeeded, origHave, rewardPoints, rewardQP, rewardMeilen, rewardOther, cardNames, note,
    redeemed: existing ? existing.redeemed : false,
    redeemedDate: existing ? existing.redeemedDate : null
  };
  if (existingIdx >= 0) uptripItems[existingIdx] = item;
  else uptripItems.push(item);
  await saveUptrip();
  e.target.reset();
  render();
});

document.getElementById('mp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const given = document.getElementById('mp-given').value;
  const received = document.getElementById('mp-received').value;
  const entry = {
    date: document.getElementById('mp-date').value,
    type: document.getElementById('mp-type').value,
    given, received,
    ratio: document.getElementById('mp-ratio').value,
    cost: parseFloat(document.getElementById('mp-cost').value) || 0,
    note: document.getElementById('mp-note').value
  };

  parseCardList(given).forEach(c => applyCardDelta(c.name, -c.count));
  parseCardList(received).forEach(c => applyCardDelta(c.name, c.count));
  await saveInventory();

  marketplace.push(entry);
  await saveMarketplace();
  e.target.reset();
  document.getElementById('mp-cost').value = '1.99';
  render();
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('Wirklich alle Trips, Aktionen, Uptrip-Daten, Fristen, Marktplatz-Tausche und Berechnungen löschen? Basiswerte bleiben erhalten.')) return;
  trips = [];
  promos = [];
  uptripItems = [];
  fristen = [];
  inventory = [];
  valueLog = [];
  upgrades = [];
  marketplace = [];
  await saveTrips();
  await savePromos();
  await saveUptrip();
  await saveFristen();
  await saveInventory();
  await saveValueLog();
  await saveUpgrades();
  await saveMarketplace();
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

loadAll();
