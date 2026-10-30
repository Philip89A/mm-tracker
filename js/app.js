const KEY_BASE = 'baseline';
const KEY_TRIPS = 'trips';
const KEY_PROMOS = 'promos';
const KEY_UPTRIP = 'uptrip';
const KEY_FRISTEN = 'fristen';
const KEY_INVENTORY = 'uptrip-inventory';
const KEY_VALUECALC = 'value-log';
const KEY_UPGRADES = 'upgrades';
const KEY_MARKETPLACE = 'marketplace';
const KEY_SENATOR_GROUND = 'senator-ground'; // nur noch zur einmaligen Migration
const KEY_GROUND = 'ground-by-year';
const KEY_SETTINGS = 'settings';
const KEY_LEVERS = 'levers';
const KEY_RECONCILE = 'reconcile-log';
const KEY_VOUCHERS = 'vouchers';
const KEY_YEARPLAN = 'yearplan';
const KEY_MILES_LOG = 'miles-log';
const KEY_REDEMPTION_IDEAS = 'redemption-ideas';
const KEY_PLANNED_HOTELS = 'planned-hotels';
const KEY_YEAR_ARCHIVE = 'year-archive';
const KEY_CC_MILES_BALANCE = 'cc-miles-balance';

// Alle gespeicherten Datenbereiche (für Backup/Import); enthält auch die nicht mehr
// angezeigten Altbereiche Inventar/Marktplatz, damit sie im Backup nicht verloren gehen.
const ALL_DATA_KEYS = [KEY_BASE, KEY_TRIPS, KEY_PROMOS, KEY_UPTRIP, KEY_FRISTEN, KEY_INVENTORY, KEY_VALUECALC, KEY_UPGRADES, KEY_MARKETPLACE, KEY_SENATOR_GROUND, KEY_MILES_LOG, KEY_REDEMPTION_IDEAS, KEY_PLANNED_HOTELS, KEY_YEAR_ARCHIVE, KEY_CC_MILES_BALANCE, KEY_GROUND, KEY_SETTINGS, KEY_LEVERS, KEY_RECONCILE, KEY_VOUCHERS, KEY_YEARPLAN];

let baseline = { p: 0, q: 0, m: 0 };
let trips = [];
let promos = [];
let uptripItems = [];
let fristen = [];
let inventory = [];
let valueLog = [];
let upgrades = [];
let marketplace = [];
let senatorGround = { points: 0, qp: 0 }; // veraltet, nur für die Migration
let groundByYear = {}; // { '2027': { points, qp } } — Zusatzpunkte je Saisonjahr
let settings = { seasonYear: null, dashOrder: [], dashHidden: [] };
let reconcileLog = []; // Kontoabgleiche: { id, date, accP, accQ, accM, appP, appQ, appM }
let vouchers = []; // Gutscheine/Benefits: { id, type, title, expires, note, used, usedDate, createdAt }
let yearPlan = {}; // { '2026': { taskId: true } } — manuell abgehakte Jahresplan-Aufgaben
let levers = []; // tatsächlich genutzte Umtausche: { id, type: 'cc'|'swap800', date, miles, points, qp }
let milesLog = [];
let redemptionIdeas = [];
let plannedHotels = [];
let yearArchive = []; // { year, closedAt, points, qp, meilenAtClose, goalsReached }
let ccMilesBalance = 0; // manuell gepflegter Kreditkarten-Meilen-Stand

const MILES_CATEGORIES = ['Flüge', 'Flughafen', 'Executive Meilen', 'CO2-Kompensation', 'Kreditkarte', 'Hotel', 'Mietwagen', 'Fahrdienst', 'Shopping', 'Parken', 'Zeitschriften-Abo', 'Reise-Buchungsportale', 'Uptrip', 'Fremdprogramm-Umwandlung', 'Statuspunkte-Tausch', 'Kulanz/Sonstiges'];

// Feste Farbe je Kategorie, damit sie in Aufschlüsselung/Liste auf einen
// Blick optisch unterscheidbar sind — unabhängig von Sortierung/Filterung.
const CATEGORY_COLORS = {
  'Flüge': '#4C6EF5',
  'Flughafen': '#12B886',
  'Executive Meilen': '#F59F00',
  'CO2-Kompensation': '#40C057',
  'Kreditkarte': '#E64980',
  'Hotel': '#7950F2',
  'Mietwagen': '#FA5252',
  'Fahrdienst': '#228BE6',
  'Shopping': '#FD7E14',
  'Parken': '#495057',
  'Zeitschriften-Abo': '#82C91E',
  'Reise-Buchungsportale': '#15AABF',
  'Uptrip': '#BE4BDB',
  'Fremdprogramm-Umwandlung': '#FAB005',
  'Statuspunkte-Tausch': '#C92A2A',
  'Kulanz/Sonstiges': '#868E96'
};
function categoryColor(cat) { return CATEGORY_COLORS[cat] || '#868E96'; }
const AIRPORT_SUBTYPES = ['Aktionsmeilen', 'Shopping'];

// Kuratierte Liste bekannter/wiederkehrender Miles & More (Lufthansa Group)
// Aktionen — kein Live-Internetzugriff (die App ist eine statische GitHub-Pages-
// Seite ohne Backend, ein Browser-Fetch würde an CORS scheitern). Diese Liste
// wird von Hand aktualisiert (auf Zuruf oder wenn im Chat neu recherchiert),
// Stand dieser Version: August 2026.
const PROMO_TEMPLATES = [
  {
    title: 'Discover Airlines – Doppelte Meilen (Winter)',
    until: '2026-09-30',
    note: 'Bis 30.09.2026 registrieren, gilt für Flüge 25.10.2026–27.03.2027, alle Klassen. Nur Meilen (keine Statuspunkte). Quelle: travel-dealz.de'
  },
  {
    title: 'Frequent Traveller Status kaufen',
    until: '2026-09-30',
    note: '650€ oder 80.000 Meilen, um FT-Status zu sichern/verlängern, falls Senator nicht rechtzeitig erreicht wird. Quelle: pointsmag.com'
  },
  {
    title: 'Jahresend-Statuspunkte-Boost (jährlich wiederkehrend)',
    until: '',
    note: 'In Vorjahren: bis zu +20 bis +100 Points/QP auf ausgewählte Lufthansa-Group-Flüge (kontinental Business, interkontinental Economy–First), Okt–Dez, keine Anmeldung nötig. Genauen Zeitraum für dieses Jahr auf miles-and-more.com prüfen, sobald angekündigt.'
  },
  {
    title: 'Bundle&Go Meilenkauf-Bonus',
    until: '',
    note: 'Bis zu 50% Bonus beim Meilenkauf (ab ca. 1,17 ct/Meile) — Zeitraum wechselt regelmäßig, aktuellen Stand auf miles-and-more.com prüfen.'
  }
];

// "Was-wäre-wenn"-Zustand für die Prognose-Rechner-Karte (renderFlightsNeeded)
// — bewusst nur In-Memory, nicht persistiert: eine Simulation ist keine
// tatsächliche Buchung. Wird ein Hebel wirklich genutzt, gehört er als
// normale Meilen-Bewegung ins Meilen-Tab, nicht hierher.
let calcRange = 'continental';
let calcClass = 'economy';
let calcCo2 = 80;
let calcLever800 = false;
let calcCcMiles = 0;

// Der Kreditkarten-Meilentausch geht nur in 5.000er-Schritten, gedeckelt auf
// 25.000 Meilen/Jahr — und natürlich nie mehr, als tatsächlich auf dem
// Kartenkonto vorhanden ist.
function maxRedeemableCcMiles(balance, usedThisYear = 0) {
  const capped = Math.min(balance || 0, Math.max(0, 25000 - usedThisYear));
  return Math.floor(capped / 5000) * 5000;
}

// Bereits tatsächlich genutzte Hebel (siehe Karte "Genutzte Hebel").
function leverUsedCcMiles(year) {
  return levers.filter(l => l.type === 'cc' && (l.date || '').startsWith(year)).reduce((s, l) => s + (l.miles || 0), 0);
}
function leverSwapUsed(year) {
  return levers.some(l => l.type === 'swap800' && (l.date || '').startsWith(year));
}

// Leiter der Jahresziele: Frequent Traveller -> 700 QP -> 800 QP -> Senator
// (in dieser Reihenfolge, da FT mit 325 QP niedriger liegt als die beiden
// Extra-Benefit-Schwellen). Der Fokus springt automatisch zum nächsten noch
// nicht erreichten Ziel, kann aber manuell überschrieben werden (nur
// UI-Zustand, nicht persistiert).
const GOAL_LADDER = [
  {
    key: 'ft', shortLabel: 'Frequent Traveller', name: '🥈 Frequent Traveller Status',
    year: () => seasonYear(),
    pTarget: 650, qTarget: 325,
    reached: (t) => t.p >= 650 && t.q >= 325,
    valueText: (t) => t.p.toLocaleString('de-DE') + ' / 650 P · ' + t.q.toLocaleString('de-DE') + ' / 325 QP',
    // Gleiches ~2:1-Verhältnis wie bei Senator (650 P vs. 325 QP) — bei fast
    // ausschließlichem Lufthansa-Group-Sammeln (P und QP wachsen 1:1) ist
    // daher auch hier meist Points die tatsächliche Engstelle, nicht QP.
    pct: (t) => Math.min(100, Math.min((t.p / 650) * 100, (t.q / 325) * 100)),
    note: (t) => {
      const pRem = Math.max(0, 650 - t.p);
      const qRem = Math.max(0, 325 - t.q);
      if (pRem === 0 && qRem === 0) return '✅ Erreicht';
      const bottleneck = pRem >= qRem ? 'Points' : 'Qualifying Points';
      return `Engpass aktuell: ${bottleneck} (noch ${pRem.toLocaleString('de-DE')} P / ${qRem.toLocaleString('de-DE')} QP offen) — Einstiegsstufe vor Senator.`;
    }
  },
  {
    key: '700', shortLabel: '700 QP', name: '🎯 Extra Benefit: 1 eVoucher',
    year: () => seasonYear(),
    qTarget: 700, // kein pTarget: reines QP-Ziel, kein Points-Bestandteil
    reached: (t) => t.q >= 700,
    valueText: (t) => t.q.toLocaleString('de-DE') + ' / 700 QP',
    pct: (t) => Math.min(100, (t.q / 700) * 100),
    note: (t) => {
      const rem = Math.max(0, 700 - t.q);
      return rem > 0
        ? `Noch ${rem} QP nötig — ca. ${Math.ceil(rem/20)} Economy- oder ${Math.ceil(rem/40)} Business-Segmente (kontinental)`
        : '✅ Erreicht — eVoucher sollte automatisch freigeschaltet sein';
    }
  },
  {
    key: '800', shortLabel: '800 QP', name: '🎯 Extra Benefit: Meilentausch-Option',
    year: () => seasonYear(),
    qTarget: 800,
    reached: (t) => t.q >= 800,
    valueText: (t) => t.q.toLocaleString('de-DE') + ' / 800 QP',
    pct: (t) => Math.min(100, (t.q / 800) * 100),
    note: () => 'Ab hier: bis zu 20.000 Meilen → 125 Points + 125 QP tauschbar'
  },
  {
    key: 'senator', shortLabel: 'Senator', name: '🏆 Senator',
    year: () => seasonYear(),
    pTarget: 2000, qTarget: 1000,
    reached: (t) => t.p >= 2000 && t.q >= 1000,
    valueText: (t) => t.p.toLocaleString('de-DE') + ' / 2.000 P · ' + t.q.toLocaleString('de-DE') + ' / 1.000 QP',
    // Bei fast ausschließlichem Lufthansa-Group-Sammeln wachsen P und QP aus
    // Flügen 1:1 — das 2.000-Points-Ziel ist dann de facto das doppelte des
    // 1.000-QP-Ziels, Points also meist die tatsächliche Engstelle, nicht QP.
    // Der Balken bildet daher den jeweils weiter entfernten (bindenden) Wert ab.
    pct: (t) => Math.min(100, Math.min((t.p / 2000) * 100, (t.q / 1000) * 100)),
    note: (t) => {
      const pRem = Math.max(0, 2000 - t.p);
      const qRem = Math.max(0, 1000 - t.q);
      if (pRem === 0 && qRem === 0) return '✅ Erreicht';
      const bottleneck = pRem >= qRem ? 'Points' : 'Qualifying Points';
      return `Engpass aktuell: ${bottleneck} (noch ${pRem.toLocaleString('de-DE')} P / ${qRem.toLocaleString('de-DE')} QP offen) — bei fast ausschließlichem Lufthansa-Group-Sammeln ist meist Points die eigentliche Hürde, da 2.000 P das doppelte Ziel von 1.000 QP sind.`;
    }
  }
];
let focusedGoal = null; // null = automatisch das nächste offene Ziel

function pointsForSegment(range, cls) {
  const table = {
    continental: { economy: 20, premium: 20, business: 40, first: 40 },
    intercontinental: { economy: 60, premium: 80, business: 200, first: 400 }
  };
  // Falls range/cls mal nicht zur Tabelle passen (z.B. Alt-/Fehldaten), lieber
  // 0 zurückgeben als abstürzen — ein einzelner kaputter Trip darf nie die
  // komplette Seite (inkl. aller Bereiche danach) lahmlegen.
  return (table[range] && table[range][cls]) || 0;
}

// Points eines Trips. Ein manueller Wert (pointsOverride, z.B. für Partner-
// Airlines, deren Points nicht aus der Lufthansa-Group-Tabelle stammen, oder
// für Kulanz/Korrekturen) hat Vorrang vor der Tabelle.
function tripPoints(t) {
  if (t.pointsOverride > 0) return t.pointsOverride;
  const base = pointsForSegment(t.range, t.cls) * t.segments;
  const bonus = Math.round(base * (t.co2 / 100));
  return base + bonus;
}

// QP eines Trips: bei Lufthansa-Group-Flügen identisch zu den Points, bei
// Partner-Airlines (qpMode 'pointsOnly') gibt es nur Points, keine QP.
function tripQP(t) {
  return t.qpMode === 'pointsOnly' ? 0 : tripPoints(t);
}

// Airlines, bei denen die Sammelart sicher feststeht (Auswahl im Trip-Formular
// setzt sie vor). Alles andere (z.B. Eurowings) bleibt eine bewusste Eingabe.
const QP_AIRLINES_FULL = ['lufthansa', 'swiss', 'austrian airlines', 'brussels airlines', 'discover airlines', 'lot polish airlines', 'ita airways', 'air dolomiti', 'croatia airlines', 'luxair'];
const QP_AIRLINES_PARTNER = ['air canada', 'united', 'singapore airlines', 'ana', 'thai airways', 'turkish airlines', 'sas'];

// Zusatz-QP, die ein bezahltes Upgrade gegenüber der ursprünglich gebuchten
// Klasse bringt. Die Punkte selbst stecken schon zu 100% in tripPoints() (Klasse
// nach dem Upgrade) — dieser Wert dient nur der €/QP-Auswertung des Aufpreises
// und wird NIRGENDS auf die Summen aufgeschlagen.
function tripUpgradeDeltaQP(t) {
  if (!t.upgradeFrom || t.upgradeFrom === t.cls) return 0;
  const delta = segmentPointsWithCo2(t.range, t.cls, t.co2) - segmentPointsWithCo2(t.range, t.upgradeFrom, t.co2);
  return Math.max(0, delta) * (t.segments || 1);
}

function segmentPointsWithCo2(range, cls, co2) {
  const base = pointsForSegment(range, cls);
  const bonus = Math.round(base * ((co2 || 0) / 100));
  return base + bonus;
}

// Points/QP werden pro Kalenderjahr (= Miles&More-Programmjahr in diesem Modell)
// zurückgesetzt — nur Meilen sind eine dauerhafte, jahresübergreifende
// Währung. Daher zählen für "das laufende Jahr" nur Flüge/Hotels, die auch
// tatsächlich in diesem Jahr datiert sind; ein für 2027 eingetragener Trip/
// Hotelaufenthalt darf 2026 nicht beeinflussen (und umgekehrt).
function currentProgramYear() {
  return String(new Date().getFullYear());
}

// Wie viele der Einlösungen einer Uptrip-Kollektion in einem bestimmten Jahr
// stattfanden — Grundlage für den Points/QP-Jahres-Cut (Meilen bleiben
// unabhängig davon vollständig zählbar, siehe redemptionCount ungefiltert).
function uptripRedemptionsInYear(u, year) {
  return (u.redemptionDates || []).filter(d => d && d.startsWith(year)).length;
}

// ---------- Saison (Zieljahr) ----------
// Das Dashboard rechnet für ein wählbares Saisonjahr (Standard: laufendes Jahr).
// Alle Ziele (Frequent Traveller, 700/800 QP, Senator) beziehen sich auf genau
// dieses Jahr. Points/QP zählen nur mit Datum in diesem Jahr, Meilen bleiben
// jahresübergreifend.
function seasonYear() {
  return String((settings && settings.seasonYear) || currentProgramYear());
}

function groundFor(year) {
  const g = groundByYear[year] || {};
  return { p: g.points || 0, q: g.qp || 0 };
}

// Der manuelle Basiswert ist ein Konto-Snapshot für das LAUFENDE Jahr; für
// andere Saisonjahre gibt es keinen.
function baselineFor(year) {
  return year === currentProgramYear() ? { p: baseline.p || 0, q: baseline.q || 0 } : { p: 0, q: 0 };
}

// Erzielter Stand: Geplantes (Trips/Hotels) zählt hier noch NICHT.
function computeAchievedTotals(year = seasonYear()) {
  const b = baselineFor(year), g = groundFor(year);
  let p = b.p + g.p, q = b.q + g.q, m = baseline.m;
  const plannedTripIds = new Set(trips.filter(t => t.planned && !t.historical).map(t => t.id));
  trips.forEach(t => {
    if (t.historical || t.planned) return;
    if (!t.date || !t.date.startsWith(year)) return; // sauberer Jahres-Cut für Points/QP
    p += tripPoints(t);
    q += tripQP(t);
  });
  uptripItems.forEach(u => {
    const timesThisYear = uptripRedemptionsInYear(u, year);
    p += (u.rewardPoints || 0) * timesThisYear;
    q += (u.rewardQP || 0) * timesThisYear;
    m += (u.rewardMeilen || 0) * (u.redemptionCount || 0); // Meilen bleiben jahresübergreifend zählbar
  });
  levers.forEach(l => {
    if (l.date && l.date.startsWith(year)) { p += l.points || 0; q += l.qp || 0; }
  });
  // Als "erledigt" markierte Hotelaufenthalte (h.planned === false) zählen
  // als erzielt statt als geplant — siehe markPlannedHotelDone().
  plannedHotels.forEach(h => {
    if (h.planned === false && h.dateFrom && h.dateFrom.startsWith(year)) {
      p += h.points || 0;
      q += h.qp || 0;
    }
  });
  // Meilen, die automatisch aus einem noch "geplanten" Trip stammen (Feld
  // "Erhaltene Meilen" im Trip-Formular), zählen konsequenterweise ebenfalls
  // erst als geplant, nicht als bereits erzielt — siehe computePlannedDelta().
  milesLog.forEach(mv => {
    if (mv.sourceTripId && plannedTripIds.has(mv.sourceTripId)) return;
    m += mv.amount || 0;
  });
  return { p, q, m };
}

// Alles, was schon geplant, aber noch nicht erzielt ist: geplante Flüge
// (inkl. ihrer automatisch verknüpften Meilen) UND geplante Hotelaufenthalte
// mit hinterlegten Points/QP (z.B. Marriott).
function computePlannedDelta(year = seasonYear()) {
  let p = 0, q = 0, m = 0, tripCount = 0, hotelCount = 0;
  const plannedTripIds = new Set();
  trips.forEach(t => {
    if (t.planned && !t.historical && t.date && t.date.startsWith(year)) {
      p += tripPoints(t);
      q += tripQP(t);
      tripCount += 1;
      plannedTripIds.add(t.id);
    }
  });
  milesLog.forEach(mv => {
    if (mv.sourceTripId && plannedTripIds.has(mv.sourceTripId)) m += mv.amount || 0;
  });
  plannedHotels.forEach(h => {
    if (h.planned === false) return; // bereits als erledigt markiert -> zählt jetzt bei computeAchievedTotals()
    if (h.dateFrom && h.dateFrom.startsWith(year) && ((h.points || 0) > 0 || (h.qp || 0) > 0)) {
      p += h.points || 0;
      q += h.qp || 0;
      hotelCount += 1;
    }
  });
  return { p, q, m, tripCount, hotelCount };
}

// Alle Ziele hängen am Saisonjahr; der key-Parameter bleibt für die Aufrufer.
function goalAchievedTotals() {
  return computeAchievedTotals();
}

function goalProjectedTotals() {
  const a = computeAchievedTotals();
  const d = computePlannedDelta();
  return { p: a.p + d.p, q: a.q + d.q, m: a.m + d.m };
}

function labelClass(c) {
  return { economy: 'Economy', premium: 'Premium Eco.', business: 'Business', first: 'First' }[c];
}

function bar(id, val, max) {
  const pct = Math.min(100, (val / max) * 100);
  document.getElementById(id).style.width = pct + '%';
}

function autoFocusGoal() {
  const next = GOAL_LADDER.find(g => !g.reached(goalAchievedTotals(g.key)));
  return next ? next.key : GOAL_LADDER[GOAL_LADDER.length - 1].key;
}

function renderGoalSwitcher() {
  const activeKey = focusedGoal || autoFocusGoal();
  const focusGoal = GOAL_LADDER.find(g => g.key === activeKey) || GOAL_LADDER[0];
  const focusTotals = goalAchievedTotals(activeKey);
  const focusProjected = goalProjectedTotals(activeKey);

  document.getElementById('goal-switcher').innerHTML = GOAL_LADDER.map(g => {
    const t = goalAchievedTotals(g.key);
    const classes = ['goal-tab'];
    if (g.key === activeKey) classes.push('active');
    if (g.reached(t)) classes.push('reached');
    return `<button type="button" class="${classes.join(' ')}" onclick="setFocusedGoal('${g.key}')">${g.reached(t) ? '✅ ' : ''}${g.shortLabel} '${g.year().slice(-2)}</button>`;
  }).join('');

  // Der helle "planned"-Balken zeigt zusätzlich, wo bereits geplante (aber
  // noch nicht erzielte) Flüge/Hotelaufenthalte einen hinbringen würden.
  const barClass = 'q';
  const focusPlannedPct = focusGoal.pct(focusProjected);
  const focusPct = focusGoal.pct(focusTotals);
  document.getElementById('goal-focus-area').innerHTML = `<div class="goal-focus">
    <div class="goal-head"><span class="name">${focusGoal.name} <span style="opacity:0.7; font-weight:400;">(Jahr ${focusGoal.year()})</span></span><span class="val">${focusGoal.valueText(focusTotals)}</span></div>
    <div class="bar-bg">
      ${focusPlannedPct > focusPct ? `<div class="bar-fill ${barClass} planned" style="width:${focusPlannedPct}%"></div>` : ''}
      <div class="bar-fill ${barClass}" style="width:${focusPct}%"></div>
    </div>
    <div class="goal-note">${focusGoal.note(focusTotals)}</div>
    ${focusPlannedPct > focusPct ? `<div class="goal-note" style="opacity:0.85;">📅 inkl. geplant: ${focusGoal.valueText(focusProjected)}</div>` : ''}
  </div>`;

  const others = GOAL_LADDER.filter(g => g.key !== activeKey);
  document.getElementById('goal-compact-area').innerHTML = others.map(g => {
    const t = goalAchievedTotals(g.key);
    const proj = goalProjectedTotals(g.key);
    const pct = g.pct(t);
    const plannedPct = g.pct(proj);
    return `
    <div class="goal-compact-row" onclick="setFocusedGoal('${g.key}')">
      <span class="name">${g.reached(t) ? '✅' : ''} ${g.shortLabel} '${g.year().slice(-2)}</span>
      <div class="bar-bg">
        ${plannedPct > pct ? `<div class="bar-fill q planned" style="width:${plannedPct}%"></div>` : ''}
        <div class="bar-fill q" style="width:${pct}%"></div>
      </div>
      <span class="val">${g.valueText(t)}</span>
    </div>`;
  }).join('');
}

window.setFocusedGoal = function(key) {
  focusedGoal = key;
  render();
};

function daysUntil(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}


function genId() {
  return 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ---------- render ----------

function render() {
  const totals = computeAchievedTotals();
  document.getElementById('stat-p').textContent = totals.p.toLocaleString('de-DE');
  document.getElementById('stat-q').textContent = totals.q.toLocaleString('de-DE');
  document.getElementById('stat-m').textContent = totals.m.toLocaleString('de-DE');

  const plannedEl = document.getElementById('planned-delta-display');
  const planned = computePlannedDelta();
  if (planned.tripCount > 0 || planned.hotelCount > 0) {
    const sourceParts = [];
    if (planned.tripCount > 0) sourceParts.push(`${planned.tripCount} geplante${planned.tripCount === 1 ? 'r' : ''} Flug${planned.tripCount === 1 ? '' : 'e'}`);
    if (planned.hotelCount > 0) sourceParts.push(`${planned.hotelCount} geplante${planned.hotelCount === 1 ? 'r' : ''} Hotelaufenthalt${planned.hotelCount === 1 ? '' : 'e'}`);
    const milesPart = planned.m > 0 ? ` / +${planned.m.toLocaleString('de-DE')} Meilen` : '';
    plannedEl.textContent = `📅 zzgl. +${planned.p.toLocaleString('de-DE')} P / +${planned.q.toLocaleString('de-DE')} QP${milesPart} geplantes Budget aus ${sourceParts.join(' + ')} (noch nicht erzielt)`;
    plannedEl.style.display = 'block';
  } else {
    plannedEl.style.display = 'none';
  }

  const baseNoteEl = document.getElementById('base-note-display');
  if (baseline.note) {
    baseNoteEl.textContent = '📝 Basiswert enthält: ' + baseline.note;
    baseNoteEl.style.display = 'block';
  } else {
    baseNoteEl.style.display = 'none';
  }

  renderGoalSwitcher();
  applyDashboardLayout();

  // Jeder Bereich läuft isoliert: ein Fehler in einem Abschnitt (z.B. durch
  // einen einzelnen fehlerhaften Datensatz) darf nie mehr verhindern, dass
  // die übrigen Bereiche (u.a. Meilen, ganz am Ende) trotzdem aktualisiert
  // werden.
  [
    renderSeasonSwitch,
    renderTracker,
    renderDashCustomize,
    renderTrips,
    renderYearChart,
    (typeof renderRouteMap === 'function' ? renderRouteMap : function renderRouteMap() {}),
    renderFlightsNeeded,
    renderLevers,
    (typeof renderReconcile === 'function' ? renderReconcile : function renderReconcile() {}),
    (typeof renderVouchers === 'function' ? renderVouchers : function renderVouchers() {}),
    (typeof renderYearPlan === 'function' ? renderYearPlan : function renderYearPlan() {}),
    (typeof renderStats === 'function' ? renderStats : function renderStats() {}),
    (typeof renderBackupStatus === 'function' ? renderBackupStatus : function renderBackupStatus() {}),
    renderPromoTemplates,
    renderPromos,
    renderUptrip,
    renderFristen,
    renderCalc,
    renderUpgrades,
    renderMiles,
    renderRedemptionIdeas,
    renderPlannedHotels,
    renderYearArchive
  ].forEach(fn => {
    try { fn(); } catch (e) { console.error('Render-Fehler in ' + fn.name + ':', e); }
  });
}

// ---------- Saison-Umschalter, Tempo-Tracker, Dashboard-Layout ----------

function seasonYearOptions() {
  const cy = Number(currentProgramYear());
  const ys = new Set([cy - 1, cy, cy + 1, Number(seasonYear())]);
  trips.forEach(t => { const y = parseInt((t.date || '').slice(0, 4)); if (y) ys.add(y); });
  plannedHotels.forEach(h => { const y = parseInt((h.dateFrom || '').slice(0, 4)); if (y) ys.add(y); });
  yearArchive.forEach(a => { const y = parseInt(a.year); if (y) ys.add(y); });
  return [...ys].filter(y => y >= 2000 && y <= cy + 5).sort();
}

function renderSeasonSwitch() {
  const sy = seasonYear(), cy = currentProgramYear();
  document.getElementById('season-switch').innerHTML = seasonYearOptions().map(y =>
    `<button type="button" class="goal-tab${String(y) === sy ? ' active' : ''}" onclick="setSeasonYear(${y})">${y}${String(y) === cy ? ' · jetzt' : ''}</button>`
  ).join('');
  const hint = document.getElementById('season-hint');
  if (sy === cy) hint.textContent = '';
  else if (sy > cy) hint.textContent = `Vorschau ${sy}: Es zählen Trips, Hotels und Uptrip-Einlösungen mit Datum ${sy} plus deine Boden-Punkte. Die Basiswerte gelten nur fürs laufende Jahr.`;
  else hint.textContent = `Rückblick ${sy}: Es zählen Trips, Hotels und Uptrip-Einlösungen mit Datum ${sy} plus Boden-Punkte. Die Basiswerte gehören zum laufenden Jahr.`;
}

window.setSeasonYear = async function(y) {
  // Das laufende Jahr wird als "automatisch" gespeichert, damit die Saison
  // zum Jahreswechsel von selbst mitwandert.
  settings.seasonYear = String(y) === currentProgramYear() ? null : String(y);
  await saveSettings();
  focusedGoal = null;
  loadGroundInputs();
  render();
};

function loadGroundInputs() {
  const g = groundFor(seasonYear());
  document.getElementById('ground-points').value = g.p;
  document.getElementById('ground-qp').value = g.q;
  document.getElementById('ground-label').textContent = `Boden-Punkte ${seasonYear()}`;
}

function renderTracker() {
  const sy = seasonYear(), cy = currentProgramYear();
  const activeKey = focusedGoal || autoFocusGoal();
  const g = GOAL_LADDER.find(x => x.key === activeKey) || GOAL_LADDER[0];
  const ach = goalAchievedTotals(g.key), proj = goalProjectedTotals(g.key);
  const fmt = n => Math.round(n).toLocaleString('de-DE');
  document.getElementById('tracker-title').textContent = `⏱️ Tempo & Quartale ${sy} · ${g.shortLabel}`;

  // Bindende Währung: bei Zielen mit Points-Anteil die mit dem größeren
  // Rückstand (bei reinem Lufthansa-Group-Sammeln meist Points).
  const remP = g.pTarget ? Math.max(0, g.pTarget - ach.p) : 0;
  const remQ = Math.max(0, g.qTarget - ach.q);
  const bindP = !!g.pTarget && remP >= remQ;
  const target = bindP ? g.pTarget : g.qTarget;
  const ist = bindP ? ach.p : ach.q;
  const unit = bindP ? 'Points' : 'QP';
  const rem = Math.max(0, target - ist);
  const projRem = Math.max(0, target - (bindP ? proj.p : proj.q));

  const lines = [`Stand ${sy}: ${fmt(ach.p)} Points · ${fmt(ach.q)} QP — Ziel ${g.shortLabel}: ${g.pTarget ? fmt(g.pTarget) + ' P / ' : ''}${fmt(g.qTarget)} QP`];
  if (sy === cy) {
    const now = new Date(), y = now.getFullYear();
    const daysTotal = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
    const day = Math.floor((now - new Date(y, 0, 0)) / 86400000);
    const soll = target * day / daysTotal, diff = ist - soll, daysLeft = daysTotal - day;
    lines.push(`Soll heute (Tag ${day}/${daysTotal}): ${fmt(soll)} ${unit} · Ist: ${fmt(ist)} → <b>${fmt(Math.abs(diff))} ${unit} ${diff >= 0 ? 'vor' : 'hinter'} dem Plan</b>`);
    if (rem === 0) lines.push('✅ Ziel für dieses Jahr erreicht.');
    else if (daysLeft > 0) {
      const perSeg = segmentPointsWithCo2(calcRange, calcClass, calcCo2);
      const weeks = Math.max(daysLeft / 7, 1), months = Math.max(daysLeft / 30.4, 0.25);
      const profile = `${calcRange === 'continental' ? 'kontinental' : 'interkontinental'} ${labelClass(calcClass)}`;
      lines.push(`Noch ${daysLeft} Tage: offen ${fmt(rem)} ${unit} → ca. ${fmt(rem / weeks)} pro Woche, ≈ ${(rem / perSeg / months).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Segmente pro Monat (${profile}, Einstellung in der Prognose-Karte).`);
      if (projRem < rem) lines.push(`Mit bereits Geplantem noch offen: ${fmt(projRem)} ${unit}${projRem === 0 ? ' — Ziel damit erreichbar ✅' : ''}.`);
    } else lines.push(`Das Jahr ist zu Ende — offen geblieben: ${fmt(rem)} ${unit}.`);
  } else if (sy > cy) lines.push(`Vorschau: ${sy} hat noch nicht begonnen.`);
  else lines.push(`Rückblick: ${sy} ist abgeschlossen.`);
  document.getElementById('tracker-status').innerHTML = lines.map(l => `<div style="margin-top:3px;">${l}</div>`).join('');

  const curQ = sy === cy ? Math.floor(new Date().getMonth() / 3) : null;
  const qLabels = ['Q1 (Jan–Mär)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Okt–Dez)'];
  document.getElementById('tracker-quarters').innerHTML = qLabels.map((label, idx) => {
    const frac = (idx + 1) / 4;
    const dueNow = sy < cy || (curQ !== null && idx <= curQ);   // begonnene Quartale: nur Erzieltes
    const t = dueNow ? ach : proj;
    const tp = g.pTarget ? g.pTarget * frac : 0, tq = g.qTarget * frac;
    const pSev = tp > 0 ? (tp - t.p) / tp : -Infinity, qSev = (tq - t.q) / tq;
    const worseIsP = tp > 0 && pSev >= qSev;
    const shortfall = worseIsP ? tp - t.p : tq - t.q;
    const shortTarget = worseIsP ? tp : tq, shortUnit = worseIsP ? 'Points' : 'QP';
    let cls, text;
    if (shortfall <= 0) { cls = 'ok'; text = '✅ im Soll'; }
    else if (shortfall <= shortTarget * 0.15) { cls = 'mid'; text = `⚠️ knapp dahinter (−${fmt(shortfall)} ${shortUnit})`; }
    else { cls = 'low'; text = `🔴 deutlich hinten (−${fmt(shortfall)} ${shortUnit})`; }
    if (!dueNow) text += ' · mit Geplantem';
    return `<div class="quarter-row ${curQ === idx ? 'current' : ''} ${cls}">
      <div>
        <div class="qlabel">${label}${curQ === idx ? ' 👉' : ''}</div>
        <div class="qtarget">Ziel: ${tp ? fmt(tp) + ' P / ' : ''}${fmt(tq)} QP</div>
      </div>
      <div>
        <div class="qstatus">${text}</div>
        ${tp ? `<div class="qqp">Points: ${fmt(t.p)} / ${fmt(tp)} ${t.p >= tp ? '✓' : '⚠️'}</div>` : ''}
        <div class="qqp">QP: ${fmt(t.q)} / ${fmt(tq)} ${t.q >= tq ? '✓' : '⚠️'}</div>
      </div>
    </div>`;
  }).join('');
}

// Dashboard-Karten ein-/ausblenden und umsortieren (Hero-Karte bleibt immer oben).
const DASH_CARDS = [
  { id: 'plan', label: 'Jahresplan (Checkliste)' },
  { id: 'tracker', label: 'Tempo & Quartale' },
  { id: 'prognose', label: 'Prognose: Noch benötigte Flüge & Hebel' },
  { id: 'konto', label: 'Kontoabgleich' },
  { id: 'gutscheine', label: 'Gutscheine & Benefits' },
  { id: 'fristen', label: 'Fristen & Ablaufdaten' },
  { id: 'basis', label: 'Basiswerte & Boden-Punkte' },
  { id: 'archiv', label: 'Jahres-Archiv' }
];

function dashOrder() {
  const saved = (settings.dashOrder || []).filter(id => DASH_CARDS.some(c => c.id === id));
  return [...saved, ...DASH_CARDS.map(c => c.id).filter(id => !saved.includes(id))];
}

function applyDashboardLayout() {
  const sec = document.getElementById('tab-dashboard');
  const order = dashOrder();
  const current = [...sec.querySelectorAll(':scope > .card[data-card]')].map(el => el.dataset.card).filter(id => id !== 'hero');
  // Nur umhängen, wenn sich die Reihenfolge wirklich ändert (sonst verliert ein fokussiertes Formularfeld den Fokus).
  if (current.join() !== order.join()) order.forEach(id => { const el = sec.querySelector(`:scope > [data-card="${id}"]`); if (el) sec.appendChild(el); });
  order.forEach(id => {
    const el = sec.querySelector(`:scope > [data-card="${id}"]`);
    if (el) el.style.display = (settings.dashHidden || []).includes(id) ? 'none' : '';
  });
}

function renderDashCustomize() {
  const el = document.getElementById('dash-customize');
  if (el.style.display === 'none') return;
  const order = dashOrder(), hidden = settings.dashHidden || [];
  el.innerHTML = `<div style="font-weight:600; color:var(--navy);">Karten ein-/ausblenden und verschieben</div>` +
    order.map((id, i) => {
      const c = DASH_CARDS.find(x => x.id === id);
      return `<div class="flex-between" style="margin-top:8px; gap:8px;">
        <label style="margin:0; display:flex; align-items:center; gap:8px; font-weight:600; color:var(--text);">
          <input type="checkbox" style="width:auto;" ${hidden.includes(id) ? '' : 'checked'} onchange="toggleDashCard('${id}')"> ${c.label}
        </label>
        <span style="white-space:nowrap;">
          <button type="button" class="btn small secondary" ${i === 0 ? 'disabled' : ''} onclick="moveDashCard('${id}', -1)">↑</button>
          <button type="button" class="btn small secondary" ${i === order.length - 1 ? 'disabled' : ''} onclick="moveDashCard('${id}', 1)">↓</button>
        </span>
      </div>`;
    }).join('') +
    `<button type="button" class="btn small secondary" style="margin-top:10px;" onclick="resetDashLayout()">Zurücksetzen</button>`;
}

window.toggleDashCustomize = function() {
  const el = document.getElementById('dash-customize');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  renderDashCustomize();
};
window.toggleDashCard = async function(id) {
  const hidden = new Set(settings.dashHidden || []);
  if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
  settings.dashHidden = [...hidden];
  await saveSettings();
  render();
};
window.moveDashCard = async function(id, dir) {
  const order = dashOrder(), i = order.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  settings.dashOrder = order;
  await saveSettings();
  render();
};
window.resetDashLayout = async function() {
  settings.dashOrder = [];
  settings.dashHidden = [];
  await saveSettings();
  render();
};

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "FRA–FCO–FRA", "FRA-ZRH-SIN", "MUC → JFK" -> IATA-Codes. Nur Tokens, die exakt
// aus drei GROSSbuchstaben bestehen, zählen (so wird aus "über MUC" nicht
// fälschlich BER/VIA gelesen).
function parseRoute(route) {
  const tokens = String(route || '').split(/[\s\-–—→>\/,;]+/).filter(t => /^[A-Z]{3}$/.test(t));
  return { known: tokens.filter(t => AIRPORTS[t]), unknown: tokens.filter(t => !AIRPORTS[t]) };
}

function tripAirportCodes(t) { return parseRoute(t.route).known; }

// Filter-Leiste über der Karte (tf-*): gilt gemeinsam für Karte und Trip-Log.
function populateTripFilters() {
  const fill = (id, html) => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = html;
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  };
  const years = [...new Set(trips.map(t => (t.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  fill('tf-year', '<option value="">Alle</option>' + years.map(y => `<option value="${y}">${y}</option>`).join(''));
  const airlines = [...new Set(trips.map(t => (t.airline || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  fill('tf-airline', '<option value="">Alle</option>' + airlines.map(a => `<option value="${escHtml(a)}">${escHtml(a)}</option>`).join('') +
    (trips.some(t => !(t.airline || '').trim()) ? '<option value="__none">(ohne Angabe)</option>' : ''));
  const airports = [...new Set(trips.flatMap(tripAirportCodes))].sort();
  fill('tf-airport', '<option value="">Alle</option>' + airports.map(c => `<option value="${c}">${c} · ${escHtml(AIRPORTS[c][2])}</option>`).join(''));
}

function getFilteredTrips() {
  const y = document.getElementById('tf-year').value;
  const st = document.getElementById('tf-status').value;
  const al = document.getElementById('tf-airline').value;
  const ap = document.getElementById('tf-airport').value;
  return trips.filter(t =>
    (!y || (t.date || '').startsWith(y)) &&
    (!st || (st === 'planned' ? !!t.planned : !t.planned)) &&
    (!al || (al === '__none' ? !(t.airline || '').trim() : (t.airline || '').trim() === al)) &&
    (!ap || tripAirportCodes(t).includes(ap))
  );
}

function renderTrips() {
  const list = document.getElementById('trip-list');
  document.getElementById('trip-count').textContent = trips.length;
  populateTripFilters();

  const upgSummaryEl = document.getElementById('trip-upgrade-summary');
  const noteEl = document.getElementById('trip-filter-note');
  upgSummaryEl.style.display = 'none';
  noteEl.textContent = '';
  const costEl = document.getElementById('trip-cost-summary');
  costEl.style.display = 'none';

  if (trips.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Trips erfasst.</div>';
    return;
  }
  const filtered = getFilteredTrips();
  if (filtered.length !== trips.length) noteEl.textContent = `${filtered.length} von ${trips.length} Trips (Filter über der Karte).`;
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">Keine Trips für diesen Filter.</div>';
    return;
  }

  const filterYear = document.getElementById('tf-year').value;
  const paid = filtered.filter(t => t.cost > 0 && !t.planned);
  if (paid.length > 0) {
    const cost = paid.reduce((s, t) => s + t.cost, 0), qp = paid.reduce((s, t) => s + tripQP(t), 0), costQp = paid.filter(t => tripQP(t) > 0).reduce((s, t) => s + t.cost, 0);
    costEl.textContent = `💶 Ausgaben${filterYear ? ' ' + filterYear : ''}: ${cost.toLocaleString('de-DE', {minimumFractionDigits: 2})} € für ${paid.length} bezahlte ${paid.length === 1 ? 'Flug' : 'Flüge'}${qp > 0 ? ` (Ø ${(costQp / qp).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €/QP, nur Flüge mit QP)` : ''} — nur Trips mit eingetragenem Preis, ohne geplante.`;
    costEl.style.display = 'block';
  }
  const upgraded = filtered.filter(t => t.upgradeCost > 0 && tripUpgradeDeltaQP(t) > 0);
  if (upgraded.length > 0) {
    const cost = upgraded.reduce((s, t) => s + t.upgradeCost, 0);
    const dq = upgraded.reduce((s, t) => s + tripUpgradeDeltaQP(t), 0);
    upgSummaryEl.textContent = `⬆️ Upgrades${filterYear ? ' ' + filterYear : ''}: ${upgraded.length} Flug${upgraded.length === 1 ? '' : 'e'}, ${cost.toLocaleString('de-DE', {minimumFractionDigits: 2})} € Aufpreis für +${dq} QP (Ø ${(cost / dq).toLocaleString('de-DE', {minimumFractionDigits: 2})} €/QP) — die Punkte stecken bereits in den Flügen unten.`;
    upgSummaryEl.style.display = 'block';
  }

  // Sortierung; Jahr/Airline/Flughafen gruppieren zusätzlich mit Zwischenüberschrift.
  const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);
  const sortKey = document.getElementById('trip-sort').value;
  const groupers = {
    year: { key: t => (t.date || '').slice(0, 4) || '–', cmp: (a, b) => b.localeCompare(a), label: k => k },
    airline: { key: t => (t.airline || '').trim() || '– ohne Angabe', cmp: (a, b) => (a.startsWith('–') - b.startsWith('–')) || a.localeCompare(b, 'de'), label: k => k },
    airport: { key: t => tripAirportCodes(t)[0] || '–', cmp: (a, b) => (a === '–') - (b === '–') || a.localeCompare(b), label: k => AIRPORTS[k] ? `${k} · ${AIRPORTS[k][2]}` : 'ohne erkennbaren Flughafen' }
  };
  const grouper = groupers[sortKey];
  let sorted;
  if (grouper) sorted = [...filtered].sort((a, b) => grouper.cmp(grouper.key(a), grouper.key(b)) || byDateDesc(a, b));
  else if (sortKey === 'date_asc') sorted = [...filtered].sort((a, b) => -byDateDesc(a, b));
  else if (sortKey === 'points') sorted = [...filtered].sort((a, b) => tripPoints(b) - tripPoints(a) || byDateDesc(a, b));
  else sorted = [...filtered].sort(byDateDesc);

  const groupStats = {};
  if (grouper) sorted.forEach(t => {
    const g = (groupStats[grouper.key(t)] = groupStats[grouper.key(t)] || { n: 0, pts: 0, qp: 0 });
    g.n += 1; if (!t.historical) { g.pts += tripPoints(t); g.qp += tripQP(t); }
  });

  let lastGroup = null;
  list.innerHTML = sorted.map(t => {
    const total = tripPoints(t);
    const idx = trips.indexOf(t);
    let head = '';
    if (grouper) {
      const gk = grouper.key(t);
      if (gk !== lastGroup) {
        lastGroup = gk;
        const gs = groupStats[gk];
        head = `<div class="group-head"><span>${escHtml(grouper.label(gk))}</span><span>${gs.n} Trip${gs.n === 1 ? '' : 's'} · +${gs.pts} P${gs.qp !== gs.pts ? ' · +' + gs.qp + ' QP' : '/QP'}</span></div>`;
      }
    }
    return head + `<div class="trip">
      <div class="top">
        <div>
          <div class="route">${escHtml(t.route)}</div>
          <div class="meta">${t.date} · ${t.range === 'continental' ? 'Kontinental' : 'Interkont.'} · ${labelClass(t.cls)} · ${t.segments} Segm.${t.co2 > 0 ? ' · CO₂ +' + t.co2 + '%' : ''}${t.airline ? ' · ' + escHtml(t.airline) : ''}${t.qpMode === 'pointsOnly' ? ' · Partner' : ''}</div>
          ${t.cost > 0 ? `<div class="meta">💶 ${t.cost.toLocaleString('de-DE', {minimumFractionDigits: 2})} €${tripQP(t) > 0 ? ' · ' + (t.cost / tripQP(t)).toLocaleString('de-DE', {minimumFractionDigits: 2}) + ' €/QP' : (tripPoints(t) > 0 ? ' · ' + (t.cost / tripPoints(t)).toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €/Point (keine QP)' : '')}</div>` : ''}
          ${t.historical ? `<div class="meta"><span class="tag mid">🕰️ Historisch — nicht in Gesamtsumme</span></div>` : ''}
          ${t.planned ? `<div class="meta"><span class="tag ok">📅 Geplant</span></div>` : ''}
          ${tripUpgradeDeltaQP(t) > 0 ? `<div class="meta">⬆️ Upgrade von ${labelClass(t.upgradeFrom)}${t.upgradeCost > 0 ? ': ' + t.upgradeCost.toLocaleString('de-DE', {minimumFractionDigits: 2}) + ' € für +' + tripUpgradeDeltaQP(t) + ' QP (' + (t.upgradeCost / tripUpgradeDeltaQP(t)).toLocaleString('de-DE', {minimumFractionDigits: 2}) + ' €/QP)' : ''}</div>` : ''}
          ${t.note ? `<div class="meta">📝 ${escHtml(t.note)}</div>` : ''}
        </div>
        <div class="pts">
          <div class="p" style="${t.historical ? 'opacity:0.5; text-decoration:line-through;' : (t.planned ? 'opacity:0.6;' : '')}">+${total} P${tripQP(t) !== total ? ' · +' + tripQP(t) + ' QP' : '/QP'}</div>
        </div>
      </div>
      <div class="flex-between" style="margin-top:6px;">
        <button class="del" onclick="deleteTrip(${idx})">entfernen</button>
        <button type="button" class="btn small secondary" onclick="startEditTrip(${idx})">✏️ Bearbeiten</button>
      </div>
    </div>`;
  }).join('');
}

function renderYearChart() {
  const el = document.getElementById('year-chart');
  const byYear = {};
  trips.forEach(t => {
    if (!t.date) return;
    const y = t.date.slice(0, 4);
    byYear[y] = byYear[y] || { p: 0, q: 0 };
    byYear[y].p += tripPoints(t);
    byYear[y].q += tripQP(t);
  });
  Object.entries(groundByYear).forEach(([y, g]) => {
    if (!(g.points > 0) && !(g.qp > 0)) return;
    byYear[y] = byYear[y] || { p: 0, q: 0 };
    byYear[y].p += g.points || 0;
    byYear[y].q += g.qp || 0;
  });

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

// Zeigt, wie viele zusätzliche Flug-Segmente (kontinental, 4 Profile) bis
// zum jeweils nächsten noch offenen Ziel nötig sind — Basis ist der Stand
// INKLUSIVE bereits geplanter Flüge/Hotelaufenthalte, da diese ja schon
// "eingeplant" sind und nicht nochmal draufgerechnet werden sollen.
function renderLevers() {
  const listEl = document.getElementById('levers-list');
  if (!listEl) return;
  const sy = seasonYear();
  document.getElementById('levers-year').textContent = sy;
  const mine = levers.filter(l => (l.date || '').startsWith(sy)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  listEl.innerHTML = mine.length ? mine.map(l => `<div class="flex-between" style="margin-top:6px; font-size:13px;">
      <span>${l.type === 'cc' ? '💳 Kreditkarten-Tausch' : '🔄 800-QP-Meilentausch'} · ${l.date} · ${(l.miles || 0).toLocaleString('de-DE')} Meilen → <b>+${l.points} P / +${l.qp} QP</b></span>
      <button class="del" onclick="deleteLever('${l.id}')">entfernen</button>
    </div>`).join('') : '<div class="meta-line" style="margin-top:4px; color:var(--muted); font-size:12px;">Noch kein Hebel in dieser Saison genutzt.</div>';
  const usedCc = leverUsedCcMiles(sy), ach = computeAchievedTotals(sy);
  const swapText = leverSwapUsed(sy) ? 'genutzt ✅' : (ach.q >= 800 ? 'freigeschaltet, noch offen' : `noch nicht freigeschaltet (${ach.q} von 800 QP)`);
  document.getElementById('levers-quota').textContent = `Kreditkarten-Tausch: ${usedCc.toLocaleString('de-DE')} von 25.000 Meilen genutzt (${(25000 - usedCc).toLocaleString('de-DE')} frei) · 800-QP-Tausch: ${swapText}`;
  const sw = document.getElementById('calc-lever-800');
  if (sw) { sw.disabled = leverSwapUsed(sy); if (sw.disabled) { sw.checked = false; calcLever800 = false; } }
}

window.deleteLever = async function(id) {
  if (!confirm('Diesen Hebel entfernen? Die dazugehörige Meilen-Buchung wird ebenfalls gelöscht und die Points/QP wieder abgezogen.')) return;
  levers = levers.filter(l => l.id !== id);
  milesLog = milesLog.filter(mv => mv.sourceLeverId !== id);
  await saveLevers(); await saveMilesLog();
  render();
};

document.getElementById('lever-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('lv-msg');
  const type = document.getElementById('lv-type').value;
  const date = document.getElementById('lv-date').value;
  const miles = parseInt(document.getElementById('lv-miles').value) || 0;
  const year = date.slice(0, 4);
  if (!date || miles <= 0) { msg.textContent = 'Bitte Datum und Meilen angeben.'; return; }
  let entry;
  if (type === 'cc') {
    const free = 25000 - leverUsedCcMiles(year);
    if (miles % 5000 !== 0) { msg.textContent = 'Der Kreditkarten-Tausch geht nur in 5.000er-Schritten.'; return; }
    if (miles > free) { msg.textContent = `Für ${year} sind nur noch ${free.toLocaleString('de-DE')} Meilen frei (Deckel 25.000/Jahr).`; return; }
    entry = { type, date, miles, points: miles / 250, qp: miles / 250 };
  } else {
    if (leverSwapUsed(year)) { msg.textContent = `Der 800-QP-Meilentausch ist für ${year} schon eingetragen.`; return; }
    const q = computeAchievedTotals(year).q;
    if (q < 800) { msg.textContent = `Für ${year} sind erst ${q} QP erzielt — der Tausch wird ab 800 QP freigeschaltet.`; return; }
    if (miles > 20000) { msg.textContent = 'Es können höchstens 20.000 Meilen getauscht werden.'; return; }
    entry = { type, date, miles, points: 125, qp: 125 };
  }
  entry.id = genId();
  levers.push(entry);
  milesLog.push({
    id: genId(), date, category: 'Statuspunkte-Tausch', source: '', amount: -miles,
    note: `Hebel: ${type === 'cc' ? 'Kreditkarten-Tausch' : '800-QP-Meilentausch'} (+${entry.points} P/+${entry.qp} QP)`, sourceLeverId: entry.id
  });
  await saveLevers(); await saveMilesLog();
  msg.textContent = `Verbucht: +${entry.points} Points / +${entry.qp} QP, ${miles.toLocaleString('de-DE')} Meilen als Abgang im Meilen-Tab. Kartenstand ggf. oben aktualisieren.`;
  document.getElementById('lv-miles').value = '';
  render();
});

document.getElementById('lv-type').addEventListener('change', () => {
  const swap = document.getElementById('lv-type').value === 'swap800';
  document.getElementById('lv-miles').value = swap ? 20000 : 5000;
  document.getElementById('lv-miles-label').textContent = swap ? 'Getauschte Meilen (max. 20.000, ergibt +125 P / +125 QP)' : 'Getauschte Kreditkarten-Meilen (5.000er-Schritte, 250 Meilen = 1 P + 1 QP)';
});
document.getElementById('lv-date').value = new Date().toISOString().slice(0, 10);

function renderFlightsNeeded() {
  const el = document.getElementById('flights-needed-list');
  if (!el) return;

  // Slider-Obergrenze am tatsächlich verfügbaren Kreditkarten-Meilen-Stand
  // ausrichten (min. mit dem 25.000er-Jahresdeckel) — mehr als vorhanden
  // oder erlaubt lässt sich gar nicht erst einstellen.
  const usedCc = leverUsedCcMiles(seasonYear()), swapUsed = leverSwapUsed(seasonYear());
  const maxCc = maxRedeemableCcMiles(ccMilesBalance, usedCc);
  const sliderEl = document.getElementById('calc-cc-miles');
  if (sliderEl) {
    sliderEl.max = maxCc;
    if (calcCcMiles > maxCc) { calcCcMiles = maxCc; sliderEl.value = maxCc; }
  }
  const balanceHintEl = document.getElementById('cc-miles-balance-hint');
  if (balanceHintEl) {
    const maxPQ = maxCc / 250;
    balanceHintEl.textContent = ccMilesBalance > 0
      ? `Stand: ${ccMilesBalance.toLocaleString('de-DE')} Meilen — max. tauschbar: ${maxCc.toLocaleString('de-DE')} Meilen (5.000er-Schritte, 25.000/Jahr gedeckelt) → max. +${maxPQ} Points / +${maxPQ} QP`
      : 'Noch kein Stand hinterlegt.';
  }

  const ccPQ = Math.floor(calcCcMiles / 250);
  const ccHintEl = document.getElementById('calc-cc-miles-hint');
  if (ccHintEl) ccHintEl.textContent = calcCcMiles > 0 ? `→ +${ccPQ} Points / +${ccPQ} QP` : 'kein Umtausch simuliert';

  // Alle Ziele rechnen mit dem Stand des gewählten Saisonjahres (siehe
  // goalProjectedTotals). Die beiden Hebel unten (Kreditkarten-Tausch,
  // 800-QP-Swap) werden hier rein rechnerisch angewendet, ohne echte Daten
  // zu verändern.
  const remainingGoals = GOAL_LADDER.filter(g => !g.reached(goalProjectedTotals(g.key)));

  if (remainingGoals.length === 0) {
    el.innerHTML = '<div class="empty">🎉 Alle Ziele bereits inkl. geplanter Flüge/Aufenthalte erreicht!</div>';
    return;
  }

  const perSegment = segmentPointsWithCo2(calcRange, calcClass, calcCo2);
  const profileLabel = `${calcRange === 'continental' ? 'Kontinental' : 'Interkontinental'} ${labelClass(calcClass)}${calcCo2 > 0 ? ' · CO₂ +' + calcCo2 + '%' : ''}`;

  el.innerHTML = remainingGoals.map(g => {
    const projected = goalProjectedTotals(g.key);

    // Hebel-Reihenfolge: erst der lineare Kreditkarten-Tausch, danach die
    // Freischaltungsprüfung für den 800-QP-Meilentausch (der braucht ja
    // selbst schon 800 QP, die der Kreditkarten-Tausch mit herstellen kann).
    let p = projected.p + ccPQ;
    let q = projected.q + ccPQ;
    const lever800Eligible = q >= 800;
    if (calcLever800 && !swapUsed && lever800Eligible) { p += 125; q += 125; }

    // Bei Zielen mit eigenem Points-Anteil (pTarget, z.B. Frequent Traveller,
    // Senator) sind Points UND QP beide bindend — da Lufthansa-Group-Flüge P
    // und QP 1:1 draufrechnen, ist meist Points (das größere Ziel) die
    // tatsächliche Engstelle. Also den jeweils größeren Rückstand als Basis
    // für die Segment-Berechnung nehmen.
    let shortfall, shortfallLabel;
    if (g.pTarget) {
      const pRem = Math.max(0, g.pTarget - p);
      const qRem = Math.max(0, g.qTarget - q);
      shortfall = Math.max(pRem, qRem);
      shortfallLabel = `${shortfall.toLocaleString('de-DE')} ${pRem >= qRem ? 'Points' : 'QP'}`;
    } else {
      shortfall = Math.max(0, g.qTarget - q);
      shortfallLabel = `${shortfall.toLocaleString('de-DE')} QP`;
    }
    const segments = shortfall > 0 ? Math.ceil(shortfall / perSegment) : 0;

    const leverNotes = [];
    if (ccPQ > 0) leverNotes.push(`+${ccPQ} P/QP Kreditkarten-Tausch`);
    if (calcLever800) leverNotes.push(swapUsed ? '800-QP-Meilentausch: in dieser Saison bereits genutzt (steckt schon im Stand)' : lever800Eligible ? '+125 P/QP 800-QP-Meilentausch' : '800-QP-Meilentausch: noch nicht freigeschaltet (<800 QP)');

    return `<div class="miles-cat-row">
      <div style="font-weight:600; color:var(--navy);">${g.shortLabel} <span style="font-weight:400; color:var(--muted);">(Jahr ${g.year()})</span> — noch ${shortfallLabel}</div>
      ${leverNotes.length ? `<div style="font-size:11px; color:var(--muted); margin-top:2px;">${leverNotes.join(' · ')}</div>` : ''}
      <div class="flex-between" style="margin-top:4px; font-size:12.5px;">
        <span>${profileLabel}</span><span style="font-weight:700;">${shortfall > 0 ? segments + ' Segm.' : '✅ erreicht'}</span>
      </div>
    </div>`;
  }).join('');
}

function renderPromoTemplates() {
  const el = document.getElementById('promo-template-list');
  if (!el) return;
  el.innerHTML = PROMO_TEMPLATES.map((tpl, idx) => `<div class="promo">
      <div class="flex-between"><b>${tpl.title}</b><button type="button" class="btn small secondary" onclick="usePromoTemplate(${idx})">+ übernehmen</button></div>
      ${tpl.until ? `<div class="d">gültig bis ${tpl.until}</div>` : '<div class="d">kein festes Ablaufdatum — Termin selbst prüfen</div>'}
      <div>${tpl.note}</div>
    </div>`).join('');
}

window.usePromoTemplate = async function(idx) {
  const tpl = PROMO_TEMPLATES[idx];
  if (!tpl) return;
  promos.push({ title: tpl.title, until: tpl.until, note: tpl.note });
  await savePromos();
  render();
};

let showPastPromos = false;

function renderPromos() {
  const list = document.getElementById('promo-list');
  if (promos.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Aktionen eingetragen.</div>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const withIdx = promos.map((p, idx) => ({ ...p, idx }));
  const current = withIdx.filter(p => !p.until || p.until >= today);
  const past = withIdx.filter(p => p.until && p.until < today);

  const renderCard = (p) => `<div class="promo">
      <div class="flex-between"><b>${p.title}</b><button class="del" onclick="deletePromo(${p.idx})">✕</button></div>
      ${p.until ? `<div class="d">gültig bis ${p.until}</div>` : ''}
      <div>${p.note}</div>
    </div>`;

  const currentSorted = [...current].sort((a, b) => new Date(a.until || '9999-12-31') - new Date(b.until || '9999-12-31'));
  let html = currentSorted.length
    ? currentSorted.map(renderCard).join('')
    : '<div class="empty">Keine aktuellen Aktionen — vergangene siehe unten.</div>';

  if (past.length > 0) {
    html += `<button type="button" class="btn small secondary" style="width:100%; margin-top:10px;" onclick="togglePastPromos()">
      ${showPastPromos ? '▴ Vergangene Aktionen ausblenden' : `▾ Vergangene Aktionen anzeigen (${past.length})`}
    </button>`;
    if (showPastPromos) {
      const pastSorted = [...past].sort((a, b) => new Date(b.until) - new Date(a.until));
      html += `<div style="margin-top:6px;">${pastSorted.map(renderCard).join('')}</div>`;
    }
  }

  list.innerHTML = html;
}

window.togglePastPromos = function() {
  showPastPromos = !showPastPromos;
  renderPromos();
};

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
      <div class="flex-between" style="margin-top:6px;">
        <button class="del" onclick="deleteFristen(${idx})">entfernen</button>
        <button type="button" class="btn small secondary" onclick="downloadFristIcs(${idx})">📅 Zu Kalender hinzufügen</button>
      </div>
    </div>`;
  }).join('');
}

function icsEscape(s) {
  return String(s || '').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
}

window.downloadFristIcs = function(idx) {
  const f = fristen[idx];
  if (!f || !f.date) return;
  downloadIcs(f.title, f.date, f.note, 'Frist');
};

// Ganztägiger Kalendereintrag als .ics-Download (Fristen, Gutscheine, ...).
function downloadIcs(title, dateStr, note, fallbackName) {
  const f = { title, date: dateStr, note };
  const dt = f.date.replace(/-/g, '');
  const uid = 'mm-' + dt + '-' + Math.random().toString(36).slice(2, 10) + '@mm-tracker';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Miles & More Tracker//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + stamp,
    'DTSTART;VALUE=DATE:' + dt,
    'DTEND;VALUE=DATE:' + dt,
    'SUMMARY:' + icsEscape(f.title),
    f.note ? 'DESCRIPTION:' + icsEscape(f.note) : null,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);
  downloadBlob(lines.join('\r\n'), 'text/calendar;charset=utf-8;', (f.title || fallbackName || 'Termin').replace(/[^a-z0-9]+/gi, '_') + '.ics');
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

// Nur noch Archiv-Ansicht für Alt-Einträge aus der Zeit vor dem Upgrade-Feld
// im Trip; die Karte erscheint nur, wenn es solche Einträge gibt.
function renderUpgrades() {
  const list = document.getElementById('upg-list');
  document.getElementById('upg-archive-card').style.display = upgrades.length ? 'block' : 'none';
  document.getElementById('upg-count').textContent = upgrades.length;
  if (upgrades.length === 0) {
    list.innerHTML = '';
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
    const year = currentProgramYear();
    // Points/QP im Dashboard sind jahresgebunden — hier daher nur die
    // Einlösungen aus dem laufenden Jahr zeigen, damit die Zahl zur
    // tatsächlichen Dashboard-Summe passt. Meilen bleiben all-time, da sie
    // sich nie zurücksetzen.
    const sumP = uptripItems.reduce((s, u) => s + (u.rewardPoints || 0) * uptripRedemptionsInYear(u, year), 0);
    const sumQ = uptripItems.reduce((s, u) => s + (u.rewardQP || 0) * uptripRedemptionsInYear(u, year), 0);
    const sumM = uptripItems.reduce((s, u) => s + (u.rewardMeilen || 0) * (u.redemptionCount || 0), 0);
    document.getElementById('uptrip-summary').textContent =
      `Bisher ${totalRedemptions}× eingelöst — davon ${year}: +${sumP} Points, +${sumQ} QP · insgesamt +${sumM} Meilen (bereits im Dashboard enthalten)`;
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
    const have = Math.min(u.have || 0, needed);
    const complete = have >= needed;
    const offset = RING_C * (1 - have / needed);

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
    } else {
      actionHtml = `<button class="btn small" style="background:var(--green); color:white;" onclick="redeemUptrip(${idx})">✅ Jetzt einlösen</button>`;
    }

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
      ${!limitReached ? `<div class="flex-between" style="margin-top:10px; gap:8px;">
        <button type="button" class="btn small secondary" style="flex:1;" onclick="adjustUptripHave(${idx}, -1)" ${have <= 0 ? 'disabled' : ''}>− Karte</button>
        <button type="button" class="btn small secondary" style="flex:1;" onclick="adjustUptripHave(${idx}, 1)" ${complete ? 'disabled' : ''}>+ Karte</button>
      </div>` : ''}
      <div class="uptrip-row">
        <span>🔁 Einlösungen</span><span>${redemptionCount}/${maxRedemptions}</span>
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

function downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

window.exportTripsCsv = function() {
  const header = ['Datum', 'Strecke', 'Airline', 'Reichweite', 'Klasse', 'Segmente', 'CO2-Bonus %', 'Points', 'QP', 'Preis €', 'Sammelart', 'Upgrade von', 'Upgrade-Kosten €', 'Zusatz-QP durch Upgrade', 'Historisch', 'Geplant', 'Notiz'];
  const sorted = [...trips].sort((a, b) => new Date(a.date) - new Date(b.date));
  const rows = sorted.map(t => [
    t.date,
    t.route,
    t.airline || '',
    t.range === 'continental' ? 'Kontinental' : 'Interkontinental',
    labelClass(t.cls),
    t.segments,
    t.co2,
    tripPoints(t),
    tripQP(t),
    t.cost || '',
    t.qpMode === 'pointsOnly' ? 'Partner (nur Points)' : 'Lufthansa Group',
    t.upgradeFrom ? labelClass(t.upgradeFrom) : '',
    t.upgradeCost || '',
    tripUpgradeDeltaQP(t) || '',
    t.historical ? 'Ja' : 'Nein',
    t.planned ? 'Ja' : 'Nein',
    t.note || ''
  ]);
  // Semikolon als Trenner + UTF-8-BOM, damit Excel (deutsche Ländereinstellung)
  // die Datei direkt richtig spaltenweise und mit Umlauten öffnet.
  const lines = [header, ...rows].map(r => r.map(csvEscape).join(';'));
  const BOM = String.fromCharCode(0xFEFF);
  const csv = BOM + lines.join('\r\n');
  downloadBlob(csv, 'text/csv;charset=utf-8;', `trip-log-${new Date().toISOString().slice(0, 10)}.csv`);
};

function renderMilesTrend(list) {
  const el = document.getElementById('miles-trend-chart');
  const titleEl = document.getElementById('miles-trend-title');
  const byMonth = {};
  list.forEach(mv => {
    if (!mv.date) return;
    const key = mv.date.slice(0, 7); // "YYYY-MM"
    byMonth[key] = (byMonth[key] || 0) + mv.amount;
  });
  const months = Object.keys(byMonth).sort();
  if (months.length === 0) {
    el.innerHTML = list.length ? '' : '<div class="empty">Keine Bewegungen für diesen Filter.</div>';
    titleEl.style.display = 'none';
    return;
  }
  titleEl.style.display = 'block';
  const maxAbs = Math.max(1, ...months.map(m => Math.abs(byMonth[m])));

  el.innerHTML = `<div class="trend-chart">${months.map(m => {
    const val = byMonth[m];
    const h = Math.max(2, Math.round((Math.abs(val) / maxAbs) * 100));
    const label = m.slice(2).replace('-', '/'); // "26/08"
    return `<div class="trend-col">
      <div class="trend-bar-wrap">
        <div class="trend-bar ${val >= 0 ? 'pos' : 'neg'}" style="height:${h}px;"><span class="trend-bar-val">${val >= 0 ? '+' : ''}${val.toLocaleString('de-DE')}</span></div>
      </div>
      <div class="trend-label">${label}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderMiles() {
  document.getElementById('miles-count').textContent = milesLog.length;

  // --- Filter-Dropdowns befüllen (Auswahl dabei erhalten) — VOR der
  // Aufschlüsselung, da Aufschlüsselung + Trend jetzt denselben Filter
  // respektieren wie die Liste unten (nicht mehr immer der Gesamtbestand).
  // Kategorie-Filter ist Mehrfachauswahl: leere Auswahl = alle Kategorien. ---
  const catSelect = document.getElementById('mi-filter-category');
  const prevCats = new Set(Array.from(catSelect.selectedOptions).map(o => o.value));
  const usedCategories = MILES_CATEGORIES.filter(cat => milesLog.some(mv => mv.category === cat));
  catSelect.innerHTML = usedCategories.map(c =>
    `<option value="${c}" ${prevCats.has(c) ? 'selected' : ''}>${c}</option>`
  ).join('');

  const yearSelect = document.getElementById('mi-filter-year');
  const prevYear = yearSelect.value;
  const usedYears = [...new Set(milesLog.map(mv => (mv.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  yearSelect.innerHTML = '<option value="">Alle</option>' + usedYears.map(y => `<option value="${y}">${y}</option>`).join('');
  if (usedYears.includes(prevYear)) yearSelect.value = prevYear;

  const filterCats = Array.from(catSelect.selectedOptions).map(o => o.value);
  const filterYear = yearSelect.value;
  const filtered = milesLog
    .map((mv, idx) => ({ ...mv, idx }))
    .filter(mv => !filterCats.length || filterCats.includes(mv.category))
    .filter(mv => !filterYear || (mv.date || '').startsWith(filterYear));

  // --- Aufschlüsselung nach Kategorie — respektiert jetzt den Filter. Bei
  // Auswahl genau EINER Kategorie zeigt sich statt der (dann bedeutungslosen)
  // 100%-Vergleichsbalken automatisch eine Detailansicht mit
  // Quellen-Vergleichsbalken innerhalb dieser Kategorie. ---
  const breakdownEl = document.getElementById('miles-breakdown');
  if (filtered.length === 0) {
    breakdownEl.innerHTML = milesLog.length === 0
      ? '<div class="empty">Noch keine Meilen-Bewegungen erfasst.</div>'
      : '<div class="empty">Keine Bewegungen für diesen Filter.</div>';
  } else {
    const singleCatMode = filterCats.length === 1;
    let totalGained = 0, totalRedeemed = 0;
    const byCategory = {};
    filtered.forEach(mv => {
      const c = (byCategory[mv.category] = byCategory[mv.category] || { total: 0, gained: 0, redeemed: 0, count: 0, sources: {} });
      c.total += mv.amount;
      c.count += 1;
      if (mv.amount >= 0) { c.gained += mv.amount; totalGained += mv.amount; }
      else { c.redeemed += -mv.amount; totalRedeemed += -mv.amount; }
      // Jede Kategorie mit gesetztem "source"/"Art"-Feld bekommt eine
      // Unterkategorie-Aufschlüsselung — nicht mehr nur Fremdprogramm-
      // Umwandlung, sondern z.B. auch Flughafen (Aktionsmeilen/Shopping).
      if (mv.source) {
        c.sources[mv.source] = (c.sources[mv.source] || 0) + mv.amount;
      }
    });

    // Nach Höhe sortiert (absteigend), damit auf einen Blick sichtbar ist,
    // was am meisten Meilen gebracht hat.
    const sortedCats = MILES_CATEGORIES
      .filter(cat => byCategory[cat])
      .sort((a, b) => byCategory[b].total - byCategory[a].total);
    const topCat = sortedCats.length && byCategory[sortedCats[0]].total > 0 ? sortedCats[0] : null;
    const maxCatTotal = Math.max(1, ...sortedCats.map(c => Math.abs(byCategory[c].total)));

    const filterLabel = filterCats.length === 1 ? ` (${filterCats[0]})` : filterCats.length > 1 ? ` (${filterCats.length} Kategorien)` : '';
    const totalsHtml = `<div class="miles-totals-box">
      <div class="flex-between"><span>Gesamt Zugang${filterLabel}</span><span style="color:var(--green); font-weight:700;">+${totalGained.toLocaleString('de-DE')}</span></div>
      <div class="flex-between" style="margin-top:4px;"><span>Gesamt Abgang/Einlösung</span><span style="color:var(--red); font-weight:700;">−${totalRedeemed.toLocaleString('de-DE')}</span></div>
      <div class="flex-between" style="margin-top:4px; padding-top:6px; border-top:1px solid var(--gray-border);"><span style="font-weight:700;">Netto</span><span style="font-weight:700;">${(totalGained - totalRedeemed).toLocaleString('de-DE')}</span></div>
    </div>`;

    const catRows = sortedCats.map(cat => {
      const data = byCategory[cat];
      const color = categoryColor(cat);
      const pct = totalGained > 0 ? Math.round((data.gained / totalGained) * 100) : 0;
      const catBarPct = Math.min(100, Math.round((Math.abs(data.total) / maxCatTotal) * 100));
      const maxSourceTotal = Math.max(1, ...Object.values(data.sources).map(v => Math.abs(v)));
      const sortedSources = Object.keys(data.sources).sort((a, b) => data.sources[b] - data.sources[a]);
      const sourceRows = sortedSources.map(src => {
        const srcBarPct = Math.min(100, Math.round((Math.abs(data.sources[src]) / maxSourceTotal) * 100));
        return `<div style="padding-left:14px; margin-top:5px;">
          <div class="flex-between" style="font-size:11.5px; color:var(--muted);">
            <span>↳ ${src}</span><span>${data.sources[src].toLocaleString('de-DE')}</span>
          </div>
          <div class="bar-bg" style="height:5px; margin-top:2px;"><div class="bar-fill" style="width:${srcBarPct}%; background:${color}; opacity:0.6;"></div></div>
        </div>`;
      }).join('');
      const metaParts = [`${data.count} ${data.count === 1 ? 'Eintrag' : 'Einträge'}`];
      if (!singleCatMode && data.gained > 0) metaParts.push(`${pct}% der gesammelten Meilen`);
      if (data.redeemed > 0) metaParts.push(`davon ${data.redeemed.toLocaleString('de-DE')} eingelöst`);
      return `<div class="miles-cat-row">
        <div class="flex-between">
          <span style="font-weight:600; color:var(--navy);"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; margin-right:6px;"></span>${cat}${cat === topCat && !singleCatMode ? ' 🏆' : ''}</span>
          <span style="font-weight:700;">${data.total.toLocaleString('de-DE')} Meilen</span>
        </div>
        ${!singleCatMode ? `<div class="bar-bg" style="height:6px; margin-top:5px;"><div class="bar-fill" style="width:${catBarPct}%; background:${color};"></div></div>` : ''}
        <div class="miles-cat-meta" style="margin-top:4px;">${metaParts.join(' · ')}</div>
        ${sourceRows}
      </div>`;
    }).join('');

    breakdownEl.innerHTML = totalsHtml + catRows;
  }

  renderMilesTrend(filtered);

  // --- Chronologische, gefilterte Liste ---
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
        <div class="route"><span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${categoryColor(mv.category)}; margin-right:5px;"></span>${mv.category}${mv.source ? ' · ' + mv.source : ''}</div>
        <div class="meta">${mv.date}</div>
        ${mv.note ? `<div class="meta">📝 ${mv.note}</div>` : ''}
      </div>
      <div class="pts"><div class="p" style="color:${mv.amount >= 0 ? 'var(--green)' : 'var(--red)'};">${mv.amount >= 0 ? '+' : ''}${mv.amount.toLocaleString('de-DE')}</div></div>
    </div>
    <div class="flex-between" style="margin-top:6px;">
      <button class="del" onclick="deleteMilesMovement(${mv.idx})">entfernen</button>
      <button type="button" class="btn small secondary" onclick="startEditMiles(${mv.idx})">✏️ Bearbeiten</button>
    </div>
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

function renderPlannedHotels() {
  document.getElementById('planned-hotels-count').textContent = plannedHotels.length;
  const list = document.getElementById('planned-hotels-list');
  if (plannedHotels.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine geplanten Aufenthalte erfasst.</div>';
    return;
  }
  const sorted = plannedHotels.map((h, idx) => ({ ...h, idx })).sort((a, b) => new Date(a.dateFrom) - new Date(b.dateFrom));
  list.innerHTML = sorted.map(h => {
    const hasPoints = (h.points || 0) > 0 || (h.qp || 0) > 0;
    const isDone = h.planned === false;
    return `<div class="trip">
    <div class="top">
      <div>
        <div class="route">${h.title}</div>
        <div class="meta">${h.dateFrom}${h.dateTo ? ' – ' + h.dateTo : ''}</div>
        <div class="meta"><span class="tag ${isDone ? 'ok' : 'mid'}">${isDone ? '✅ Erledigt — zählt als erzielt' : '📅 Geplant'}</span></div>
        ${h.note ? `<div class="meta">📝 ${h.note}</div>` : ''}
      </div>
      ${hasPoints ? `<div class="pts"><div class="p" style="${isDone ? '' : 'opacity:0.6;'}">${isDone ? '' : '📅 '}+${h.points || 0} P · +${h.qp || 0} QP</div></div>` : ''}
    </div>
    <div class="flex-between" style="margin-top:6px;">
      <button class="del" onclick="deletePlannedHotel(${h.idx})">entfernen</button>
      <div>
        <button type="button" class="btn small secondary" onclick="startEditPlannedHotel(${h.idx})">✏️ Bearbeiten</button>
        ${isDone
          ? `<button type="button" class="btn small secondary" onclick="markPlannedHotelUndone(${h.idx})">↩️ Rückgängig</button>`
          : `<button type="button" class="btn small" style="background:var(--green); color:white;" onclick="markPlannedHotelDone(${h.idx})">✅ War tatsächlich so</button>`}
      </div>
    </div>
  </div>`;
  }).join('');
}

window.markPlannedHotelDone = async function(idx) {
  const h = plannedHotels[idx];
  if (!h) return;
  if (!confirm(`"${h.title}" als tatsächlich erfolgt markieren? Die hinterlegten ${h.points || 0} Points / ${h.qp || 0} QP zählen danach als erzielt statt als geplant.`)) return;
  h.planned = false;
  await savePlannedHotels();
  render();
};

window.markPlannedHotelUndone = async function(idx) {
  const h = plannedHotels[idx];
  if (!h) return;
  h.planned = true;
  await savePlannedHotels();
  render();
};

function renderYearArchive() {
  const btn = document.getElementById('close-year-btn');
  if (btn) btn.textContent = `🔒 Jahr ${currentProgramYear()} abschließen`;

  const list = document.getElementById('year-archive-list');
  if (!list) return;
  if (yearArchive.length === 0) {
    list.innerHTML = '<div class="empty">Noch keine Jahre archiviert.</div>';
    return;
  }
  const sorted = [...yearArchive].sort((a, b) => b.year.localeCompare(a.year));
  list.innerHTML = sorted.map(y => `<div class="trip">
    <div class="top">
      <div>
        <div class="route">Jahr ${y.year}</div>
        <div class="meta">Abgeschlossen am ${y.closedAt}</div>
        <div class="meta">${y.goalsReached && y.goalsReached.length ? '🏆 erreicht: ' + y.goalsReached.join(', ') : 'keine Ziele dieses Jahres erreicht'}</div>
        <div class="meta">Meilen-Stand beim Abschluss: ${y.meilenAtClose.toLocaleString('de-DE')}</div>
      </div>
      <div class="pts">
        <div class="p">${y.points.toLocaleString('de-DE')} P</div>
        <div class="q">${y.qp.toLocaleString('de-DE')} QP</div>
      </div>
    </div>
  </div>`).join('');
}

async function saveYearArchive() { await DB.set(KEY_YEAR_ARCHIVE, yearArchive); }

window.saveCcMilesBalance = async function() {
  ccMilesBalance = parseInt(document.getElementById('cc-miles-balance').value) || 0;
  await DB.set(KEY_CC_MILES_BALANCE, ccMilesBalance);
  // Simulierten Tausch auf den neuen, tatsächlich verfügbaren Höchstwert
  // setzen — beantwortet direkt "wie viele Points/QP wären das max.?".
  calcCcMiles = maxRedeemableCcMiles(ccMilesBalance, leverUsedCcMiles(seasonYear()));
  const sliderEl = document.getElementById('calc-cc-miles');
  // Erst max anheben, DANN value setzen — sonst klemmt der Browser value
  // beim Zuweisen sofort auf dem noch alten (kleineren) max fest.
  sliderEl.max = calcCcMiles;
  sliderEl.value = calcCcMiles;
  renderFlightsNeeded();
};

window.closeCurrentYear = async function() {
  const year = currentProgramYear();
  const totals = computeAchievedTotals(year); // das laufende Jahr, unabhängig vom gewählten Saisonjahr
  const goalsReached = GOAL_LADDER.filter(g => g.reached(totals)).map(g => g.shortLabel);
  const alreadyArchived = yearArchive.some(y => y.year === year);

  const msg = `${year} abschließen?\n\nEndstand: ${totals.p.toLocaleString('de-DE')} Points, ${totals.q.toLocaleString('de-DE')} QP\nErreichte Ziele: ${goalsReached.join(', ') || '– keine –'}\n\nDanach werden die Basiswerte für Points/QP auf 0 zurückgesetzt, damit ${Number(year) + 1} sauber bei 0 startet. Der Meilen-Basiswert und der Trip-Log bleiben unverändert erhalten — ${year} lässt sich jederzeit im Archiv nachschlagen.${alreadyArchived ? `\n\n${year} ist bereits archiviert — der bestehende Eintrag wird überschrieben.` : ''}`;
  if (!confirm(msg)) return;

  const entry = { year, closedAt: new Date().toISOString().slice(0, 10), points: totals.p, qp: totals.q, meilenAtClose: totals.m, goalsReached };
  const idx = yearArchive.findIndex(y => y.year === year);
  if (idx >= 0) yearArchive[idx] = entry; else yearArchive.push(entry);
  await saveYearArchive();

  baseline = { ...baseline, p: 0, q: 0, note: '' };
  await saveBaseline();
  document.getElementById('base-p').value = 0;
  document.getElementById('base-q').value = 0;
  document.getElementById('base-note').value = '';

  render();
};

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
async function saveGround() { await DB.set(KEY_GROUND, groundByYear); }
async function saveSettings() { await DB.set(KEY_SETTINGS, settings); }
async function saveLevers() { await DB.set(KEY_LEVERS, levers); }
async function saveReconcile() { await DB.set(KEY_RECONCILE, reconcileLog); }
async function saveVouchers() { await DB.set(KEY_VOUCHERS, vouchers); }
async function saveYearPlan() { await DB.set(KEY_YEARPLAN, yearPlan); }
async function saveMilesLog() { await DB.set(KEY_MILES_LOG, milesLog); }
async function saveRedemptionIdeas() { await DB.set(KEY_REDEMPTION_IDEAS, redemptionIdeas); }
async function savePlannedHotels() { await DB.set(KEY_PLANNED_HOTELS, plannedHotels); }

async function loadAll() {
  baseline = await DB.get(KEY_BASE, baseline);
  trips = await DB.get(KEY_TRIPS, []);
  promos = await DB.get(KEY_PROMOS, []);
  uptripItems = await DB.get(KEY_UPTRIP, []);
  fristen = await DB.get(KEY_FRISTEN, []);
  valueLog = await DB.get(KEY_VALUECALC, []);
  upgrades = await DB.get(KEY_UPGRADES, []);
  senatorGround = await DB.get(KEY_SENATOR_GROUND, senatorGround);
  groundByYear = await DB.get(KEY_GROUND, {});
  levers = await DB.get(KEY_LEVERS, []);
  reconcileLog = await DB.get(KEY_RECONCILE, []);
  vouchers = await DB.get(KEY_VOUCHERS, []);
  yearPlan = await DB.get(KEY_YEARPLAN, {});
  settings = Object.assign({ seasonYear: null, dashOrder: [], dashHidden: [] }, await DB.get(KEY_SETTINGS, {}));
  // Boden-Punkte waren früher ein einzelner Wert, der fest für 2027 galt.
  if (Object.keys(groundByYear).length === 0 && (senatorGround.points > 0 || senatorGround.qp > 0)) {
    groundByYear['2027'] = { points: senatorGround.points || 0, qp: senatorGround.qp || 0 };
    await saveGround();
  }
  milesLog = await DB.get(KEY_MILES_LOG, []);
  redemptionIdeas = await DB.get(KEY_REDEMPTION_IDEAS, []);
  plannedHotels = await DB.get(KEY_PLANNED_HOTELS, []);
  yearArchive = await DB.get(KEY_YEAR_ARCHIVE, []);
  ccMilesBalance = await DB.get(KEY_CC_MILES_BALANCE, 0);

  let tripsMigrated = false;
  trips.forEach(t => { if (!t.id) { t.id = genId(); tripsMigrated = true; } });
  if (tripsMigrated) await saveTrips();

  let milesMigrated = false;
  milesLog.forEach(mv => { if (!mv.id) { mv.id = genId(); milesMigrated = true; } });
  if (milesMigrated) await saveMilesLog();

  let plannedHotelsMigrated = false;
  plannedHotels.forEach(h => { if (!h.id) { h.id = genId(); plannedHotelsMigrated = true; } });
  if (plannedHotelsMigrated) await savePlannedHotels();

  let uptripDatesMigrated = false;
  uptripItems.forEach(u => {
    const count = u.redemptionCount || 0;
    if (count > 0 && (!u.redemptionDates || u.redemptionDates.length !== count)) {
      // Für Alt-Einlösungen kennen wir nur das Datum der jeweils letzten
      // Einlösung (redeemedDate), nicht das jeder einzelnen — als bester
      // verfügbarer Näherungswert wird es für alle bisherigen Einlösungen
      // übernommen (wirkt sich nur auf sehr alte, mehrfach eingelöste
      // Kollektionen aus, deren Einlösungen tatsächlich in unterschiedlichen
      // Jahren lagen).
      u.redemptionDates = Array.from({ length: count }, () => u.redeemedDate || currentProgramYear() + '-01-01');
      uptripDatesMigrated = true;
    }
  });
  if (uptripDatesMigrated) await saveUptrip();

  // Uptrip wurde auf einen einfachen Kartenzähler pro Kollektion vereinfacht
  // (Karteninventar/Marktplatz entfallen). Bisherige Inventar-Zuordnungen
  // werden einmalig in den Zähler übernommen.
  let uptripHaveMigrated = false;
  uptripItems.forEach(u => {
    if (typeof u.have !== 'number') {
      u.have = Math.min(u.needed || 1, (u.assignedCards || []).reduce((s, a) => s + (a.count || 0), 0));
      uptripHaveMigrated = true;
    }
  });
  if (uptripHaveMigrated) await saveUptrip();

  document.getElementById('base-p').value = baseline.p;
  document.getElementById('base-q').value = baseline.q;
  document.getElementById('base-m').value = baseline.m;
  document.getElementById('base-note').value = baseline.note || '';
  loadGroundInputs();
  document.getElementById('cc-miles-balance').value = ccMilesBalance || '';
  document.getElementById('loading-tag').style.display = 'none';

  render();
}

// ---------- delete / action handlers ----------

window.deleteTrip = async function(idx) {
  const trip = trips[idx];
  trips.splice(idx, 1);
  await saveTrips();
  if (trip && trip.id) {
    const before = milesLog.length;
    milesLog = milesLog.filter(mv => mv.sourceTripId !== trip.id);
    if (milesLog.length !== before) await saveMilesLog();
  }
  render();
};
window.deletePromo = async function(idx) { promos.splice(idx, 1); await savePromos(); render(); };
window.deleteFristen = async function(idx) { fristen.splice(idx, 1); await saveFristen(); render(); };
window.deleteCalc = async function(idx) { valueLog.splice(idx, 1); await saveValueLog(); render(); };
window.deleteUpgrade = async function(idx) { upgrades.splice(idx, 1); await saveUpgrades(); render(); };
window.deleteUptrip = async function(idx) { uptripItems.splice(idx, 1); await saveUptrip(); render(); };
window.deleteMilesMovement = async function(idx) { milesLog.splice(idx, 1); await saveMilesLog(); render(); };
window.deleteRedemptionIdea = async function(idx) { redemptionIdeas.splice(idx, 1); await saveRedemptionIdeas(); render(); };
window.deletePlannedHotel = async function(idx) { plannedHotels.splice(idx, 1); await savePlannedHotels(); render(); };

window.adjustUptripHave = async function(idx, delta) {
  const u = uptripItems[idx];
  if (!u) return;
  u.have = Math.max(0, Math.min(u.needed || 1, (u.have || 0) + delta));
  await saveUptrip();
  render();
};

window.redeemUptrip = async function(idx) {
  const u = uptripItems[idx];
  if (!u) return;
  const maxRedemptions = u.maxRedemptions || 1;
  const redemptionCount = u.redemptionCount || 0;
  if (redemptionCount >= maxRedemptions) return;
  if ((u.have || 0) < (u.needed || 1)) return;

  const parts = [];
  if (u.rewardPoints) parts.push(`+${u.rewardPoints} Points`);
  if (u.rewardQP) parts.push(`+${u.rewardQP} Qualifying Points`);
  if (u.rewardMeilen) parts.push(`+${u.rewardMeilen} Meilen`);
  if (u.rewardOther) parts.push(u.rewardOther);
  const msg = `"${u.name}" einlösen (${redemptionCount + 1}/${maxRedemptions})?\n\nDu erhältst:\n${parts.join('\n') || '(keine numerische Prämie hinterlegt)'}\n\nDas wird sofort zu deinem Dashboard addiert, der Kartenzähler geht um ${u.needed || 1} zurück.`;
  if (!confirm(msg)) return;

  u.have = Math.max(0, (u.have || 0) - (u.needed || 1));
  u.redemptionCount = redemptionCount + 1;
  u.redeemedDate = new Date().toISOString().slice(0, 10);
  // Ein Datum pro Einlösung merken (nicht nur das letzte), damit Points/QP
  // aus Uptrip-Prämien denselben Jahres-Cut respektieren wie Trips/Hotels —
  // nur Meilen bleiben jahresübergreifend gültig.
  u.redemptionDates = u.redemptionDates || [];
  u.redemptionDates.push(u.redeemedDate);

  uptripItems[idx] = u;
  await saveUptrip();
  render();
};

window.undoUptrip = async function(idx) {
  const u = uptripItems[idx];
  if (!u || !(u.redemptionCount > 0)) return;
  if (!confirm(`Letzte Einlösung von "${u.name}" rückgängig machen? Die Points/QP/Meilen dieser Einlösung werden aus dem Dashboard wieder abgezogen und die ${u.needed || 1} Karten dem Zähler wieder gutgeschrieben.`)) return;
  u.redemptionCount -= 1;
  if (u.redemptionDates && u.redemptionDates.length) u.redemptionDates.pop();
  u.have = Math.min(u.needed || 1, (u.have || 0) + (u.needed || 1));
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

document.getElementById('ground-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  groundByYear[seasonYear()] = {
    points: parseInt(document.getElementById('ground-points').value) || 0,
    qp: parseInt(document.getElementById('ground-qp').value) || 0
  };
  await saveGround();
  render();
});

document.getElementById('dash-customize-btn').addEventListener('click', () => toggleDashCustomize());

let editingTripId = null;

window.startEditTrip = function(idx) {
  const t = trips[idx];
  if (!t) return;
  editingTripId = t.id;
  document.getElementById('t-date').value = t.date || '';
  document.getElementById('t-route').value = t.route || '';
  document.getElementById('t-range').value = t.range || 'continental';
  document.getElementById('t-class').value = t.cls || 'economy';
  document.getElementById('t-segments').value = t.segments || 1;
  document.getElementById('t-co2').value = String(t.co2 || 0);
  document.getElementById('t-note').value = t.note || '';
  document.getElementById('t-historical').checked = !!t.historical;
  document.getElementById('t-planned').checked = !!t.planned;
  document.getElementById('t-airline').value = t.airline || '';
  document.getElementById('t-upgrade-from').value = t.upgradeFrom || '';
  document.getElementById('t-upgrade-cost').value = t.upgradeCost || '';
  document.getElementById('t-qpmode').value = t.qpMode || '';
  document.getElementById('t-points-override').value = t.pointsOverride || '';
  document.getElementById('t-cost').value = t.cost || '';
  const linkedMiles = milesLog.filter(mv => mv.sourceTripId === t.id);
  document.getElementById('t-miles').value = (linkedMiles.find(mv => mv.category === 'Flüge') || {}).amount || '';
  document.getElementById('t-exec-miles').value = (linkedMiles.find(mv => mv.category === 'Executive Meilen') || {}).amount || '';
  document.getElementById('t-co2-miles').value = (linkedMiles.find(mv => mv.category === 'CO2-Kompensation') || {}).amount || '';
  document.getElementById('trip-submit-btn').textContent = 'Änderungen speichern';
  document.getElementById('trip-cancel-btn').style.display = 'block';
  document.querySelector('[data-tab="tab-trips"]').click();
  document.getElementById('t-date').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelEditTrip = function() {
  editingTripId = null;
  document.getElementById('trip-form').reset();
  document.getElementById('t-segments').value = 2;
  document.getElementById('trip-submit-btn').textContent = 'Trip speichern';
  document.getElementById('trip-cancel-btn').style.display = 'none';
};

document.getElementById('trip-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const isEdit = !!editingTripId;
  const tripId = isEdit ? editingTripId : genId();
  const trip = {
    id: tripId,
    date: document.getElementById('t-date').value,
    route: document.getElementById('t-route').value,
    range: document.getElementById('t-range').value,
    cls: document.getElementById('t-class').value,
    segments: parseInt(document.getElementById('t-segments').value) || 1,
    co2: parseInt(document.getElementById('t-co2').value) || 0,
    note: document.getElementById('t-note').value,
    historical: document.getElementById('t-historical').checked,
    planned: document.getElementById('t-planned').checked,
    airline: document.getElementById('t-airline').value.trim(),
    upgradeFrom: document.getElementById('t-upgrade-from').value,
    upgradeCost: parseFloat(document.getElementById('t-upgrade-cost').value) || 0,
    qpMode: document.getElementById('t-qpmode').value,
    pointsOverride: parseInt(document.getElementById('t-points-override').value) || 0,
    cost: parseFloat(document.getElementById('t-cost').value) || 0
  };
  if (isEdit) {
    const idx = trips.findIndex(t => t.id === tripId);
    if (idx >= 0) trips[idx] = trip; else trips.push(trip);
  } else {
    trips.push(trip);
  }
  await saveTrips();

  // Meilen für diesen Flug direkt mit anlegen, statt sie separat im
  // Meilen-Tab nachzutragen — mit sourceTripId markiert, damit sie beim
  // Löschen/Bearbeiten des Trips automatisch mit entfernt/neu angelegt werden.
  if (isEdit) milesLog = milesLog.filter(mv => mv.sourceTripId !== tripId);
  const milesFields = [
    { id: 't-miles', category: 'Flüge' },
    { id: 't-exec-miles', category: 'Executive Meilen' },
    { id: 't-co2-miles', category: 'CO2-Kompensation' }
  ];
  let milesChanged = isEdit;
  milesFields.forEach(f => {
    const amount = parseInt(document.getElementById(f.id).value) || 0;
    if (amount > 0) {
      milesLog.push({
        id: genId(),
        date: trip.date,
        category: f.category,
        source: '',
        amount,
        note: `Automatisch aus Trip ${trip.route}`,
        sourceTripId: tripId
      });
      milesChanged = true;
    }
  });
  if (milesChanged) await saveMilesLog();

  cancelEditTrip();
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

document.getElementById('uptrip-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('up-name').value.trim();
  const needed = parseInt(document.getElementById('up-needed').value) || 1;
  const maxRedemptions = parseInt(document.getElementById('up-max-redemptions').value) || 1;
  const rewardPoints = parseInt(document.getElementById('up-reward-p').value) || 0;
  const rewardQP = parseInt(document.getElementById('up-reward-q').value) || 0;
  const rewardMeilen = parseInt(document.getElementById('up-reward-m').value) || 0;
  const rewardOther = document.getElementById('up-reward-other').value;
  const note = document.getElementById('up-note').value;
  const existingIdx = uptripItems.findIndex(u => u.name.toLowerCase() === name.toLowerCase());
  const existing = existingIdx >= 0 ? uptripItems[existingIdx] : null;
  const item = {
    name, needed, maxRedemptions, rewardPoints, rewardQP, rewardMeilen, rewardOther, note,
    have: existing ? Math.min(existing.have || 0, needed) : 0,
    redemptionCount: existing ? (existing.redemptionCount || 0) : 0,
    redemptionDates: existing ? (existing.redemptionDates || []) : [],
    redeemedDate: existing ? existing.redeemedDate : null
  };
  if (existingIdx >= 0) uptripItems[existingIdx] = item;
  else uptripItems.push(item);
  await saveUptrip();
  e.target.reset();
  document.getElementById('up-max-redemptions').value = 1;
  document.getElementById('up-reward-p').value = 0;
  document.getElementById('up-reward-q').value = 0;
  document.getElementById('up-reward-m').value = 0;
  render();
});

document.getElementById('mi-category').addEventListener('change', () => {
  const cat = document.getElementById('mi-category').value;
  const isExternal = cat === 'Fremdprogramm-Umwandlung';
  const isAirport = cat === 'Flughafen';
  document.getElementById('mi-source-wrap').style.display = isExternal ? 'block' : 'none';
  document.getElementById('mi-source').required = isExternal;
  document.getElementById('mi-airport-subtype-wrap').style.display = isAirport ? 'block' : 'none';
});

document.getElementById('mi-filter-category').addEventListener('change', renderMiles);
document.getElementById('mi-filter-year').addEventListener('change', renderMiles);
['tf-year', 'tf-status', 'tf-airline', 'tf-airport'].forEach(id => document.getElementById(id).addEventListener('change', () => {
  renderTrips();
  if (typeof renderRouteMap === 'function') renderRouteMap();
}));
document.getElementById('trip-sort').addEventListener('change', renderTrips);

// Bei eindeutig bekannten Airlines die Sammelart vorschlagen (bleibt änderbar).
document.getElementById('t-airline').addEventListener('input', (e) => {
  const v = e.target.value.trim().toLowerCase();
  if (QP_AIRLINES_FULL.includes(v)) document.getElementById('t-qpmode').value = '';
  else if (QP_AIRLINES_PARTNER.includes(v)) document.getElementById('t-qpmode').value = 'pointsOnly';
});

document.getElementById('calc-range').addEventListener('change', (e) => { calcRange = e.target.value; renderFlightsNeeded(); });
document.getElementById('calc-class').addEventListener('change', (e) => { calcClass = e.target.value; renderFlightsNeeded(); });
document.getElementById('calc-co2').addEventListener('change', (e) => { calcCo2 = parseInt(e.target.value) || 0; renderFlightsNeeded(); });
document.getElementById('calc-lever-800').addEventListener('change', (e) => { calcLever800 = e.target.checked; renderFlightsNeeded(); });
document.getElementById('calc-cc-miles').addEventListener('input', (e) => { calcCcMiles = parseInt(e.target.value) || 0; renderFlightsNeeded(); });

let editingMilesId = null;

window.startEditMiles = function(idx) {
  const mv = milesLog[idx];
  if (!mv) return;
  editingMilesId = mv.id;
  document.getElementById('mi-date').value = mv.date || '';
  const catSelect = document.getElementById('mi-category');
  catSelect.value = mv.category;
  catSelect.dispatchEvent(new Event('change'));
  if (mv.category === 'Fremdprogramm-Umwandlung') document.getElementById('mi-source').value = mv.source || '';
  else if (mv.category === 'Flughafen') document.getElementById('mi-airport-subtype').value = mv.source || '';
  document.getElementById('mi-amount').value = mv.amount;
  document.getElementById('mi-note').value = mv.note || '';
  document.getElementById('miles-submit-btn').textContent = 'Änderungen speichern';
  document.getElementById('miles-cancel-btn').style.display = 'block';
  document.getElementById('mi-date').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelEditMiles = function() {
  editingMilesId = null;
  document.getElementById('miles-form').reset();
  document.getElementById('mi-source-wrap').style.display = 'none';
  document.getElementById('mi-source').required = false;
  document.getElementById('mi-airport-subtype-wrap').style.display = 'none';
  document.getElementById('miles-submit-btn').textContent = 'Bewegung speichern';
  document.getElementById('miles-cancel-btn').style.display = 'none';
};

document.getElementById('miles-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = document.getElementById('mi-category').value;
  const source = document.getElementById('mi-source').value.trim();
  if (category === 'Fremdprogramm-Umwandlung' && !source) {
    alert('Bitte bei "Fremdprogramm-Umwandlung" die Quelle angeben (z.B. "Payback").');
    return;
  }
  let entrySource = '';
  if (category === 'Fremdprogramm-Umwandlung') entrySource = source;
  else if (category === 'Flughafen') entrySource = document.getElementById('mi-airport-subtype').value;

  const entry = {
    date: document.getElementById('mi-date').value,
    category,
    source: entrySource,
    amount: parseInt(document.getElementById('mi-amount').value) || 0,
    note: document.getElementById('mi-note').value
  };

  if (editingMilesId) {
    const idx = milesLog.findIndex(mv => mv.id === editingMilesId);
    if (idx >= 0) {
      // sourceTripId (falls automatisch aus einem Trip entstanden) bleibt erhalten.
      entry.id = milesLog[idx].id;
      if (milesLog[idx].sourceTripId) entry.sourceTripId = milesLog[idx].sourceTripId;
      milesLog[idx] = entry;
    } else {
      entry.id = genId();
      milesLog.push(entry);
    }
  } else {
    entry.id = genId();
    milesLog.push(entry);
  }
  await saveMilesLog();
  cancelEditMiles();
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

let editingPlannedHotelId = null;

window.startEditPlannedHotel = function(idx) {
  const h = plannedHotels[idx];
  if (!h) return;
  editingPlannedHotelId = h.id;
  document.getElementById('ph-title').value = h.title || '';
  document.getElementById('ph-from').value = h.dateFrom || '';
  document.getElementById('ph-to').value = h.dateTo || '';
  document.getElementById('ph-points').value = h.points || '';
  document.getElementById('ph-qp').value = h.qp || '';
  document.getElementById('ph-note').value = h.note || '';
  document.getElementById('planned-hotel-submit-btn').textContent = 'Änderungen speichern';
  document.getElementById('planned-hotel-cancel-btn').style.display = 'block';
  document.getElementById('ph-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.cancelEditPlannedHotel = function() {
  editingPlannedHotelId = null;
  document.getElementById('planned-hotel-form').reset();
  document.getElementById('planned-hotel-submit-btn').textContent = 'Aufenthalt speichern';
  document.getElementById('planned-hotel-cancel-btn').style.display = 'none';
};

document.getElementById('planned-hotel-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const isEdit = !!editingPlannedHotelId;
  const existing = isEdit ? plannedHotels.find(h => h.id === editingPlannedHotelId) : null;
  const hotel = {
    id: isEdit ? editingPlannedHotelId : genId(),
    title: document.getElementById('ph-title').value,
    dateFrom: document.getElementById('ph-from').value,
    dateTo: document.getElementById('ph-to').value,
    points: parseInt(document.getElementById('ph-points').value) || 0,
    qp: parseInt(document.getElementById('ph-qp').value) || 0,
    note: document.getElementById('ph-note').value,
    // "erledigt"-Status (markPlannedHotelDone) bleibt beim Bearbeiten erhalten,
    // statt durchs Neu-Zusammenbauen des Objekts verloren zu gehen.
    planned: existing ? existing.planned : true
  };
  if (isEdit) {
    const idx = plannedHotels.findIndex(h => h.id === hotel.id);
    if (idx >= 0) plannedHotels[idx] = hotel; else plannedHotels.push(hotel);
  } else {
    plannedHotels.push(hotel);
  }
  await savePlannedHotels();
  cancelEditPlannedHotel();
  render();
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('Wirklich alle Trips, Aktionen, Uptrip-Daten, Fristen, Marktplatz-Tausche, Meilen-Bewegungen, Einlöse-Ideen, geplante Hotelaufenthalte und Berechnungen löschen? Basiswerte bleiben erhalten.')) return;
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
  plannedHotels = [];
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
  await savePlannedHotels();
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
