/**
 * Sonderlackierungen (Liveries) je Kennzeichen, recherchiert im November 2026.
 * from/to: Zeitraum der Lackierung (JJJJ-MM-TT). from = null heißt: laut Quelle aktuell so lackiert,
 * seit wann ist nicht belegt. temp = true: zeitlich begrenzte Beklebung, deren Ende nicht belegt ist.
 * approx = true: Startdatum nur als frühestmöglicher Zeitpunkt bekannt.
 * Liveries wechseln — maßgeblich ist das Flugdatum. Was hier fehlt oder abweicht, trägst du je Flug
 * im Feld „Lackierung“ ein (das hat Vorrang; „Standard“ blendet einen Eintrag hier aus).
 */
const LIVERIES = {
  // Lufthansa
  'D-AINY': [{ name: 'Lovehansa', from: '2022-06-10', src: 'Lufthansa Newsroom: ab 10.06.2022, später dauerhaft' }],
  'D-AING': [{ name: 'Lufthansa 100 Jahre', from: '2026-01-19', src: 'Lufthansa Newsroom / Flightradar24: seit 19.01.2026' }],
  'D-AIND': [{ name: 'Lufthansa 100 Jahre', from: '2026-01-01', approx: true, src: 'Flightradar24 (Jubiläumsflotte 2026); genaues Startdatum nicht belegt, frühestens 2026' }],
  'D-AIEQ': [{ name: '600th Airbus', from: '2023-05-24', src: 'Lufthansa Newsroom: Übergabe 24.05.2023' }],
  'D-AIEP': [{ name: 'help alliance „Helping Hands“', from: '2024-12-12', src: 'Lufthansa Newsroom: seit 12.12.2024' }],
  'D-AIEM': [{ name: 'Lufthansa 100 Jahre (Geschichten von Mitarbeitenden)', from: '2026-01-01', approx: true, src: 'Lufthansa Newsroom (Jubiläum 2026); genaues Startdatum nicht belegt, frühestens 2026' }],
  'D-AISZ': [{ name: 'Retro „Lockheed Super Star“', from: '2026-02-03', src: 'meilenoptimieren.com: neu lackiert 03.02.2026' }],
  'D-AIBH': [{ name: 'Star Alliance', from: null, src: 'meilenoptimieren.com (Stand 2026)' }],
  'D-AIBI': [{ name: 'Star Alliance', from: null, src: 'meilenoptimieren.com (Stand 2026)' }],
  'D-AIBJ': [{ name: 'Star Alliance', from: null, src: 'meilenoptimieren.com (Stand 2026)' }],
  'D-AIUA': [{ name: 'Star Alliance', from: null, src: 'meilenoptimieren.com (Stand 2026)' }],
  'D-AIZH': [{ name: 'Star Alliance', from: null, src: 'meilenoptimieren.com (Stand 2026)' }],
  'D-AIZM': [{ name: 'Star Alliance', from: null, src: 'meilenoptimieren.com (Stand 2026)' }],
  'D-AIZN': [{ name: 'Star Alliance', from: null, src: 'meilenoptimieren.com (Stand 2026)' }],
  'D-AIUD': [{ name: 'Fanhansa (WM 2014)', from: '2014-05-01', temp: true, src: 'WM 2014; wann zurücklackiert, ist nicht belegt' }],
  'D-AISQ': [{ name: 'Fanhansa „Mannschaftsflieger“', from: '2018-06-01', temp: true, src: 'WM 2018, Beklebung; Entfernung „beim nächsten Wartungsereignis“, Datum nicht belegt' }],
  // Austrian
  'OE-LBY': [{ name: 'Star Alliance', from: null, src: 'Flightradar24 (Star Alliance Livery), von dir bestätigt (Nov. 2026)' }],
  'OE-LBX': [{ name: 'Star Alliance', from: '2012-11-01', to: '2018-12-31', src: 'JetPhotos: 11/2012–12/2018 (Austrian-Flottenseite nennt es noch, widersprüchlich)' }],
  // Condor
  'D-ABON': [{ name: 'Condor „Wir lieben Fliegen“', from: '2006-01-01', src: '50 Jahre Condor (2006), Name „Willi“ (airhistory.net); laut dir 2023 noch aktiv' }],
  // TAROM
  'YR-BGG': [{ name: 'Retro (55 Jahre TAROM) / „Happy 60 Years“', from: '2009-01-01', temp: true, src: 'Retro-Lackierung 2009, später „Happy 60 Years“; ob noch aktuell, ist nicht belegt' }]
};

// Oberbegriff für Filter: alle Star-Alliance- bzw. 100-Jahre-Varianten zusammenfassen
function liveryGroup(name) {
  const n = String(name || '');
  if (/star\s*alliance/i.test(n)) return 'Star Alliance';
  if (/100\s*(jahre|years)/i.test(n)) return 'Lufthansa 100 Jahre';
  return n;
}

// Lackierung eines Flugs: manueller Eintrag am Flug geht vor, sonst der passende Eintrag oben.
// status: 'manual' | 'yes' (zum Flugdatum belegt) | 'likely' (aktuell so, Beginn unbekannt) |
//         'unclear' (befristet, Ende unbekannt) | 'other' (nur zu einer anderen Zeit)
function liveryFor(reg, date, manual) {
  const m = String(manual || '').trim();
  if (m) return /^standard$/i.test(m) ? null : { name: m, status: 'manual', src: 'von dir eingetragen' };
  const list = LIVERIES[String(reg || '').trim().toUpperCase().replace(/\s+/g, '')];
  if (!list) return null;
  const d = date || '';
  let other = null;
  for (const e of list) {
    if (e.from && d && d < e.from) { other = other || { ...e, status: 'other', when: 'erst ab ' + e.from.split('-').reverse().join('.') }; continue; }
    if (e.to && d && d > e.to) { other = other || { ...e, status: 'other', when: 'nur bis ' + e.to.split('-').reverse().join('.') }; continue; }
    if (!e.from) return { ...e, status: 'likely' };
    return { ...e, status: e.temp || e.approx ? 'unclear' : 'yes' };
  }
  return other;
}
