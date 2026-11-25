/**
 * Demo-Modus (Link mit ?demo): Beispieldaten ohne Login, nur im Browser gespeichert, kein Server-Sync.
 * Alle Werte sind erfunden und zeigen nur, was man eintragen kann.
 */
const DEMO_MODE = /[?&]demo(=|&|$)/.test(window.location.search);

const DEMO_DATA = {
  baseline: { p: 0, q: 0, m: 12500, note: 'Beispiel: Meilenstand zu Beginn der Aufzeichnung' },
  'cc-miles-balance': 8000,
  settings: { seasonYear: null, dashOrder: [], dashHidden: [] },
  trips: [
    { id: 'demo_t1', date: '2026-01-20', route: 'FRA-LHR', range: 'continental', cls: 'economy', segments: 1, co2: 80,
      airline: 'Lufthansa', reason: 'business', paidBy: 'other', cost: 0, co2Cost: 18.4, co2ReceiptNo: 'DEMO-CO2-001',
      receiptNo: 'DEMO-TKT-220', bookingId: 'demo_b1', planned: false, historical: false, note: 'Beispiel: Geschäftsreise, Flug vom Arbeitgeber bezahlt, CO₂-Ausgleich selbst',
      flightInfo: [{ flightNo: 'LH900', from: 'FRA', to: 'LHR', date: '2026-01-20', duration: '1h 40m', aircraft: 'A20N', registration: 'D-AINY', cabin: 'E', seat: '12A', miles: 250 }] },
    { id: 'demo_t2', date: '2026-01-22', route: 'LHR-FRA', range: 'continental', cls: 'economy', segments: 1, co2: 80,
      airline: 'Lufthansa', reason: 'business', paidBy: 'other', cost: 0, co2Cost: 0, bookingId: 'demo_b1', planned: false, historical: false, note: 'Rückflug, zusammen gebucht',
      flightInfo: [{ flightNo: 'LH903', from: 'LHR', to: 'FRA', date: '2026-01-22', duration: '1h 35m', aircraft: 'A319', registration: 'D-AIBJ', cabin: 'E', seat: '14F', miles: 250 }] },
    { id: 'demo_t3', date: '2026-03-10', route: 'FRA-JFK', range: 'intercontinental', cls: 'business', segments: 1, co2: 0,
      airline: 'Lufthansa', reason: 'personal', paidBy: 'self', cost: 2450, receiptNo: 'DEMO-TKT-0815', planned: false, historical: false, note: 'Beispiel: Urlaub, selbst bezahlt',
      flightInfo: [{ flightNo: 'LH400', from: 'FRA', to: 'JFK', date: '2026-03-10', duration: '8h 50m', aircraft: 'B748', registration: 'D-ABYA', cabin: 'B', seat: '2A', miles: 4500 }] },
    { id: 'demo_t4', date: '2026-03-18', route: 'JFK-FRA', range: 'intercontinental', cls: 'business', upgradeFrom: 'economy', upgradeCost: 450,
      upgradeReceiptNo: 'DEMO-UPG-01', segments: 1, co2: 0, airline: 'Lufthansa', reason: 'personal', paidBy: 'self', cost: 0, planned: false, historical: false,
      note: 'Beispiel: Upgrade gegen Aufpreis (zählt mit der höheren Klasse)',
      flightInfo: [{ flightNo: 'LH401', from: 'JFK', to: 'FRA', date: '2026-03-18', duration: '7h 20m', aircraft: 'B748', registration: 'D-ABYF', cabin: 'B', seat: '4K', miles: 3800 }] },
    { id: 'demo_t5', date: '2026-06-05', route: 'FRA-VIE-OTP', range: 'continental', cls: 'economy', segments: 2, co2: 30,
      segCls: [{ cls: 'business', range: 'continental' }, { cls: 'economy', range: 'continental' }],
      airline: 'Austrian Airlines', reason: 'business', paidBy: 'other', cost: 0, co2Cost: 12.9, planned: false, historical: false,
      note: 'Beispiel: Umstieg, erste Teilstrecke in Business',
      flightInfo: [
        { flightNo: 'OS126', from: 'FRA', to: 'VIE', date: '2026-06-05', duration: '1h 20m', aircraft: 'A320', registration: 'OE-LBY', cabin: 'B', seat: '2C', miles: 300, livery: 'Star Alliance' },
        { flightNo: 'OS781', from: 'VIE', to: 'OTP', date: '2026-06-05', duration: '1h 35m', aircraft: 'E195', registration: 'OE-LWA', cabin: 'E', seat: '9D', miles: 250 }] },
    { id: 'demo_t6', date: '2026-09-14', route: 'FRA-PMI', range: 'continental', cls: 'economy', segments: 1, co2: 0,
      airline: 'Discover Airlines', reason: 'personal', paidBy: 'self', cost: 189, planned: false, historical: false, note: 'Beispiel: Ferienflug',
      flightInfo: [{ flightNo: '4Y132', from: 'FRA', to: 'PMI', date: '2026-09-14', duration: '2h 05m', aircraft: 'A320', registration: 'D-AIUR', cabin: 'E', seat: '21A' }] },
    { id: 'demo_t7', date: '2026-09-21', route: 'PMI-FRA', range: 'continental', cls: 'business', upgradeFrom: 'economy', upgradeVia: 'evoucher', upgradeVoucherId: 'demo_v1',
      segments: 1, co2: 0, airline: 'Lufthansa', reason: 'personal', paidBy: 'self', cost: 165, planned: false, historical: false,
      note: 'Beispiel: Upgrade per eVoucher (Points nach gebuchter Klasse)',
      flightInfo: [{ flightNo: 'LH1155', from: 'PMI', to: 'FRA', date: '2026-09-21', duration: '2h 10m', aircraft: 'A321', registration: 'D-AIDC', cabin: 'B', seat: '3A' }] },
    { id: 'demo_t8', date: '2025-11-02', route: 'FRA-BCN', range: 'continental', cls: 'economy', segments: 1, co2: 0,
      airline: 'Lufthansa', reason: 'personal', paidBy: 'self', cost: 140, planned: false, historical: false, note: 'Beispiel: Flug aus dem Vorjahr (Jahresvergleich)',
      flightInfo: [{ flightNo: 'LH1132', from: 'FRA', to: 'BCN', date: '2025-11-02', duration: '2h 00m', aircraft: 'A20N', registration: 'D-AINK', cabin: 'E', seat: '17C' }] },
    { id: 'demo_t9', date: '2019-08-12', route: 'MUC-ATH', range: 'continental', cls: 'economy', segments: 1, co2: 0,
      airline: 'Lufthansa', noPoints: true, planned: false, historical: false, note: 'Beispiel: Archivflug, nur Flugdaten (keine Punkte)',
      flightInfo: [{ flightNo: 'LH1752', from: 'MUC', to: 'ATH', date: '2019-08-12', duration: '2h 25m', aircraft: 'A321', registration: 'D-AISP', cabin: 'E', seat: '25F' }] },
    { id: 'demo_t10', date: '2027-02-12', route: 'FRA-SIN', range: 'intercontinental', cls: 'premium', segments: 1, co2: 80,
      airline: 'Lufthansa', reason: 'personal', paidBy: 'self', cost: 1290, planned: true, historical: false, note: 'Beispiel: geplanter Flug (zählt in der Prognose)', flightInfo: [] }
  ],
  'miles-log': [
    { id: 'demo_m1', date: '2026-01-20', category: 'Flüge', source: '', amount: 250, note: 'Automatisch aus Trip FRA-LHR · LH900', sourceTripId: 'demo_t1', sourceLeg: 'LH900' },
    { id: 'demo_m2', date: '2026-01-22', category: 'Flüge', source: '', amount: 250, note: 'Automatisch aus Trip LHR-FRA · LH903', sourceTripId: 'demo_t2', sourceLeg: 'LH903' },
    { id: 'demo_m3', date: '2026-03-10', category: 'Flüge', source: '', amount: 4500, note: 'Automatisch aus Trip FRA-JFK · LH400', sourceTripId: 'demo_t3', sourceLeg: 'LH400' },
    { id: 'demo_m4', date: '2026-03-18', category: 'Flüge', source: '', amount: 3800, note: 'Automatisch aus Trip JFK-FRA · LH401', sourceTripId: 'demo_t4', sourceLeg: 'LH401' },
    { id: 'demo_m5', date: '2026-06-05', category: 'Flüge', source: '', amount: 300, note: 'Automatisch aus Trip FRA-VIE-OTP · OS126', sourceTripId: 'demo_t5', sourceLeg: 'OS126' },
    { id: 'demo_m6', date: '2026-06-05', category: 'Flüge', source: '', amount: 250, note: 'Automatisch aus Trip FRA-VIE-OTP · OS781', sourceTripId: 'demo_t5', sourceLeg: 'OS781' },
    { id: 'demo_m7', date: '2026-02-28', category: 'Kreditkarte', source: '', amount: 1200, note: 'Beispiel: Kreditkartenumsatz Februar' },
    { id: 'demo_m8', date: '2026-05-03', category: 'Hotel', source: '', amount: 800, note: 'Beispiel: Partnerhotel' },
    { id: 'demo_m9', date: '2026-07-15', category: 'Shopping', source: '', amount: 350, note: 'Beispiel: Online-Shopping' },
    { id: 'demo_m10', date: '2026-04-01', category: 'Statuspunkte-Tausch', source: '', amount: -5000, note: 'Hebel: Kreditkarten-Tausch (+20 P/+20 QP)', sourceLeverId: 'demo_l1' },
    { id: 'demo_m11', date: '2026-04-20', category: 'Uptrip', source: '', amount: 2000, note: 'Beispiel: Uptrip-Kollektion eingelöst' }
  ],
  levers: [{ id: 'demo_l1', type: 'cc', date: '2026-04-01', miles: 5000, points: 20, qp: 20 }],
  vouchers: [
    { id: 'demo_v1', type: 'evoucher', title: 'eVoucher Upgrade (Beispiel)', expires: '2027-02-28', note: 'Für ein Upgrade auf Kontinentalflügen', used: true, usedDate: '2026-09-21', usedForTrip: 'demo_t7', createdAt: '2026-02-01' },
    { id: 'demo_v2', type: 'lounge', title: 'Lounge-Gutschein (Beispiel)', expires: '2026-12-31', note: '', used: false, usedDate: null, createdAt: '2026-02-01' }
  ],
  uptrip: [
    { name: 'Europa-Entdecker (Beispiel)', needed: 6, have: 4, maxRedemptions: 1, rewardPoints: 0, rewardQP: 0, rewardMeilen: 2000, rewardOther: '', note: 'Noch 2 Karten fehlen', redemptionCount: 0, redemptionDates: [], redeemedDate: null },
    { name: 'Langstrecke (Beispiel)', needed: 4, have: 4, maxRedemptions: 1, rewardPoints: 40, rewardQP: 40, rewardMeilen: 0, rewardOther: '', note: 'Bereits eingelöst', redemptionCount: 1, redemptionDates: ['2026-04-20'], redeemedDate: '2026-04-20' }
  ],
  fristen: [{ title: 'Meilen prüfen, die bald verfallen (Beispiel)', date: '2027-03-31', note: 'Beispiel für eine Frist' }],
  promos: [{ title: 'Doppelte Meilen auf Europa-Flüge (Beispiel)', until: '2026-12-15', note: 'Vorher registrieren' }],
  'redemption-ideas': [{ title: 'Prämienflug FRA–NRT Business (Beispiel)', miles: 110000, link: '', note: 'Idee für später' }],
  'planned-hotels': [{ id: 'demo_h1', title: 'Hotelaufenthalt (Beispiel)', dateFrom: '2026-12-10', dateTo: '2026-12-12', points: 10, qp: 10, note: 'Partnerhotel mit Points', planned: true }]
};

// Beispielwert für einen Datenbereich (Kopie, damit Änderungen DEMO_DATA nicht verändern)
function demoDefault(key, fallback) {
  return Object.prototype.hasOwnProperty.call(DEMO_DATA, key) ? JSON.parse(JSON.stringify(DEMO_DATA[key])) : fallback;
}

// Eigene Änderungen im Demo-Modus verwerfen: danach gelten wieder die Beispieldaten
function resetDemoData() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('mm_demo_')).forEach(k => localStorage.removeItem(k));
  } catch (e) { /* kein Speicher verfügbar */ }
  window.location.reload();
}
