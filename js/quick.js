/**
 * Schnellerfassung per Flugnummer (Trips → Erfassen): je Flug Datum + Flugnummer, Abruf der Flugdaten
 * über die Edge Function flight-lookup (AeroDataBox oder Lufthansa Open API), dann nur noch Klasse und
 * Sitz ergänzen. „Als Trip übernehmen“ füllt das normale Trip-Formular (Strecke, Segmente, Klasse je
 * Segment, Flugdetails), damit dort geprüft und wie gewohnt gespeichert wird.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = escHtml;
  const CLASS_TO_CABIN = { economy: 'E', premium: 'W', business: 'B', first: 'F' };
  const FIELDS = [['from', 'Von', 'FRA'], ['to', 'Nach', 'OTP'], ['dep', 'Abflug', '06:50'], ['arr', 'Ankunft', '10:05'],
    ['duration', 'Dauer', '2h 15m'], ['aircraft', 'Flugzeug', 'A320'], ['registration', 'Kennzeichen', 'D-AIWA'], ['airline', 'Airline', 'Lufthansa']];

  const today = () => new Date().toISOString().slice(0, 10);
  const blank = (date) => ({ date: date || today(), flightNo: '', from: '', to: '', dep: '', arr: '', duration: '', aircraft: '', registration: '', airline: '', cls: 'economy', seat: '', miles: '', execMiles: '', co2Miles: '', src: '' });
  let legs = [blank()];

  const place = (c) => (AIRPORTS[c] ? `${AIRPORTS[c][2]}, ${countryLabel(AIRPORTS[c][3])}` : '');

  function render() {
    $('qe-legs').innerHTML = legs.map((l, i) => `<div class="flight-row qe-leg" data-i="${i}">
      <div class="flex-between"><b style="color:var(--navy);">Flug ${i + 1}${l.from && l.to ? ` · ${esc(l.from)} → ${esc(l.to)}` : ''}</b>
        ${legs.length > 1 ? `<button type="button" class="del" onclick="qeRemove(${i})">entfernen</button>` : ''}</div>
      <div class="qe-head">
        <div><label>Datum</label><input type="date" data-k="date" value="${esc(l.date)}"></div>
        <div><label>Flugnummer</label><input type="text" data-k="flightNo" placeholder="LH1418" autocomplete="off" value="${esc(l.flightNo)}"></div>
        <div><label>&nbsp;</label><button type="button" class="btn small" onclick="qeLookup(${i})">🔎 Abrufen</button></div>
      </div>
      ${l.src ? `<div class="hint" style="margin:4px 0 0;">${esc(l.src)}</div>` : ''}
      <div class="flight-row-grid">${FIELDS.map(([k, lab, ph]) => `<div><label>${lab}</label><input type="text" data-k="${k}" placeholder="${ph}" autocomplete="off" value="${esc(l[k] || '')}"></div>`).join('')}</div>
      ${l.from || l.to ? `<div class="hint" style="margin:4px 0 0;">${esc(place(l.from))}${l.from && l.to ? ' → ' : ''}${esc(place(l.to))}</div>` : ''}
      <div class="flight-row-grid">
        <div><label>Klasse</label><select data-k="cls">${[['economy', 'Economy'], ['premium', 'Premium Economy'], ['business', 'Business'], ['first', 'First']].map(([k, v]) => `<option value="${k}"${l.cls === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label>Sitz</label><input type="text" data-k="seat" placeholder="15A" autocomplete="off" value="${esc(l.seat)}"></div>
        <div><label>Meilen</label><input type="text" inputmode="numeric" data-k="miles" placeholder="668" autocomplete="off" value="${esc(l.miles || '')}"></div>
        <div><label>Executive Meilen</label><input type="text" inputmode="numeric" data-k="execMiles" placeholder="0" autocomplete="off" value="${esc(l.execMiles || '')}"></div>
        <div><label>CO₂-Kompensationsmeilen</label><input type="text" inputmode="numeric" data-k="co2Miles" placeholder="0" autocomplete="off" value="${esc(l.co2Miles || '')}"></div>
      </div>
    </div>`).join('');
  }

  // Eingaben direkt in den Zustand übernehmen (ohne Neuzeichnen, damit der Cursor bleibt)
  $('qe-legs').addEventListener('input', (e) => {
    const row = e.target.closest('.qe-leg'), k = e.target.dataset.k;
    if (!row || !k) return;
    let v = e.target.value;
    if (['flightNo', 'from', 'to', 'registration', 'aircraft', 'seat'].includes(k)) v = v.toUpperCase();
    legs[Number(row.dataset.i)][k] = k === 'flightNo' ? v.replace(/\s+/g, '') : v;
  });
  $('qe-legs').addEventListener('change', (e) => {
    const row = e.target.closest('.qe-leg'), k = e.target.dataset.k;
    if (row && k === 'cls') legs[Number(row.dataset.i)].cls = e.target.value;
  });

  window.qeRemove = (i) => { legs.splice(i, 1); render(); };
  $('qe-add-leg').addEventListener('click', () => {
    const last = legs[legs.length - 1];
    legs.push(Object.assign(blank(last && last.date), { from: last ? last.to : '' }));
    render();
  });

  const fmtDur = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : '');

  // Einheitliche Airline-Namen (wie in der Sammelart-Erkennung) und Flugzeug-Kurzcodes (wie in Flighty),
  // damit Statistik und Sitzregel (A319/A320/A321 = 3-3) greifen.
  const AIRLINE_BY_IATA = { LH: 'Lufthansa', OS: 'Austrian Airlines', LX: 'SWISS', SN: 'Brussels Airlines', EW: 'Eurowings', '4Y': 'Discover Airlines',
    EN: 'Air Dolomiti', CL: 'Lufthansa City Airlines', AZ: 'ITA Airways', LO: 'LOT Polish Airlines', OU: 'Croatia Airlines', LG: 'Luxair', WK: 'Edelweiss',
    TK: 'Turkish Airlines', AY: 'Finnair', DE: 'Condor', RO: 'TAROM', OZ: 'Asiana Airlines', UA: 'United', AC: 'Air Canada', SQ: 'Singapore Airlines', NH: 'ANA', TG: 'Thai Airways', SK: 'SAS', FR: 'Ryanair' };
  function aircraftCode(model) {
    const m = String(model || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!m) return '';
    if (/^[A-Z]\d{2}[A-Z0-9]$|^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(m) && m.length <= 4) return m; // schon ein Kurzcode
    const rules = [[/A319.*NEO|A319-?1?\d{2}N/, 'A19N'], [/A320.*NEO|A320-?2\d{2}N/, 'A20N'], [/A321.*NEO|A321-?2\d{2}N/, 'A21N'],
      [/A318/, 'A318'], [/A319/, 'A319'], [/A320/, 'A320'], [/A321/, 'A321'], [/A220-?100|CS100|BCS1/, 'BCS1'], [/A220-?300|CS300|BCS3/, 'BCS3'],
      [/A330-?200/, 'A332'], [/A330-?300/, 'A333'], [/A330-?900|A330.*NEO/, 'A339'], [/A340-?300/, 'A343'], [/A340-?600/, 'A346'],
      [/A350-?900/, 'A359'], [/A350-?1000/, 'A35K'], [/A380/, 'A388'], [/737-?800|737 MAX 8|737-?8/, 'B738'], [/737-?900/, 'B739'],
      [/747-?8/, 'B748'], [/747-?400/, 'B744'], [/757-?300/, 'B753'], [/757-?200/, 'B752'], [/767-?300/, 'B763'], [/777-?300/, 'B77W'],
      [/787-?9/, 'B789'], [/787-?10/, 'B78X'], [/787-?8/, 'B788'], [/CRJ ?900|CRJ-?9/, 'CRJ9'], [/CRJ ?700|CRJ-?7/, 'CRJ7'],
      [/E ?190|EMBRAER 190|ERJ-?190/, 'E190'], [/E ?195|EMBRAER 195|ERJ-?195/, 'E195'], [/E ?175|EMBRAER 175/, 'E175'], [/AVRO RJ ?85|RJ ?85/, 'RJ85'],
      [/DASH 8|DHC-?8-?400|Q400/, 'DH8D'], [/ATR ?72/, 'AT76'], [/ATR ?42/, 'AT45']];
    const hit = rules.find(([re]) => re.test(m));
    return hit ? hit[1] : m;
  }

  window.qeLookup = async function (i) {
    const l = legs[i], msg = $('qe-msg');
    if (!l.flightNo || !l.date) { msg.textContent = 'Bitte Datum und Flugnummer eintragen.'; return; }
    msg.textContent = `Rufe ${l.flightNo} am ${l.date} ab …`;
    try {
      const r = await callEdge('flight-lookup', { action: 'lookup', flightNo: l.flightNo, date: l.date });
      const found = (r.legs || [])[0];
      if (!found) { msg.textContent = r.note || 'Keine Daten gefunden — bitte die Felder selbst ausfüllen.'; return; }
      Object.assign(l, {
        from: found.from || l.from, to: found.to || l.to, dep: found.depLocal || l.dep, arr: found.arrLocal || l.arr,
        duration: fmtDur(found.durationMin) || l.duration, aircraft: aircraftCode(found.aircraft) || l.aircraft,
        registration: (found.registration || l.registration || '').toUpperCase(),
        airline: AIRLINE_BY_IATA[found.airlineIata || l.flightNo.slice(0, 2)] || found.airline || l.airline,
        src: `Abgerufen über ${r.source}${found.status ? ' · Status: ' + found.status : ''}${(r.legs || []).length > 1 ? ' · mehrere Teilstrecken unter dieser Nummer, erste übernommen' : ''}`
      });
      msg.textContent = 'Daten übernommen — bitte prüfen.';
      render();
    } catch (e) {
      msg.textContent = e.needsSetup ? 'Für den Abruf ist noch keine Datenquelle eingerichtet (siehe unten). Du kannst die Felder auch selbst ausfüllen.' : 'Abruf fehlgeschlagen: ' + e.message;
      if (e.needsSetup) $('qe-setup').open = true;
    }
  };

  const isEu = (c) => AIRPORTS[c] && (AIRPORTS[c][4] === 'EU' || AIRPORTS[c][3] === 'ES');
  const rangeOf = (a, b) => (isEu(a) && isEu(b) ? 'continental' : 'intercontinental');

  // Flüge in das Trip-Formular übernehmen
  $('qe-apply').addEventListener('click', () => {
    const msg = $('qe-msg');
    const L = legs.filter(l => l.from || l.to || l.flightNo);
    if (!L.length) { msg.textContent = 'Bitte mindestens einen Flug eintragen.'; return; }
    if (L.some(l => !/^[A-Z]{3}$/.test(l.from) || !/^[A-Z]{3}$/.test(l.to))) { msg.textContent = 'Bei jedem Flug werden Von und Nach als IATA-Code gebraucht (abrufen oder eintragen).'; return; }
    const sorted = [...L].sort((a, b) => (a.date + a.dep).localeCompare(b.date + b.dep));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].from !== sorted[i - 1].to) { msg.textContent = `${sorted[i - 1].to} und ${sorted[i].from} hängen nicht zusammen — nicht zusammenhängende Flüge bitte als getrennte Trips erfassen.`; return; }
    }
    if (typeof cancelEditTrip === 'function' && editingTripId) cancelEditTrip();
    const set = (id, v) => { const e = $(id); e.value = v; };
    const ranges = sorted.map(l => rangeOf(l.from, l.to));
    const first = sorted[0];
    set('t-date', first.date);
    set('t-route', [sorted[0].from, ...sorted.map(l => l.to)].join('–'));
    set('t-segments', sorted.length);
    set('t-range', ranges[0]);
    set('t-class', first.cls);
    set('t-co2', $('qe-co2').value);
    set('t-paidby', $('qe-paidby').value);
    set('t-reason', $('qe-reason').value);
    set('t-airline', first.airline || '');
    $('t-airline').dispatchEvent(new Event('input')); // schlägt die Sammelart vor
    $('t-planned').checked = first.date > today();
    // Klasse/Reichweite je Segment nur, wo sie vom ersten Segment abweichen
    rebuildSegRows(sorted.map((l, i) => ({ cls: l.cls === first.cls ? '' : l.cls, range: ranges[i] === ranges[0] ? '' : ranges[i] })));
    $('t-seg-details').open = sorted.some((l, i) => l.cls !== first.cls || ranges[i] !== ranges[0]);
    loadFlightRows(sorted.map(l => ({ flightNo: l.flightNo, from: l.from, to: l.to, date: l.date, duration: l.duration, aircraft: l.aircraft, registration: l.registration, seat: l.seat, miles: l.miles, execMiles: l.execMiles, co2Miles: l.co2Miles, cabin: CLASS_TO_CABIN[l.cls] || '' })));
    msg.textContent = 'Übernommen — unten prüfen, ggf. Kosten und Belege ergänzen und „Trip speichern“.';
    $('trip-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Nach dem Speichern eines Trips die Schnellerfassung leeren
  $('trip-form').addEventListener('submit', () => { legs = [blank()]; setTimeout(render, 0); $('qe-msg').textContent = ''; });

  // ---------- Datenquelle ----------
  async function refreshStatus() {
    try {
      const r = await callEdge('flight-lookup', { action: 'status' });
      $('qe-status').textContent = `AeroDataBox: ${r.aerodatabox ? '✅ eingerichtet' : 'nicht eingerichtet'} · Lufthansa-API: ${r.lufthansa ? '✅ eingerichtet' : 'nicht eingerichtet'}`;
    } catch (e) { $('qe-status').textContent = e.message; }
  }
  $('qe-setup').addEventListener('toggle', (e) => { if (e.target.open) refreshStatus(); });
  $('qe-key-save').addEventListener('click', async () => {
    try { await callEdge('flight-lookup', { action: 'save-key', key: $('qe-key').value }); $('qe-key').value = ''; refreshStatus(); }
    catch (e) { $('qe-status').textContent = e.message; }
  });
  $('qe-key-del').addEventListener('click', async () => {
    if (!confirm('Gespeicherten AeroDataBox-Schlüssel löschen?')) return;
    try { await callEdge('flight-lookup', { action: 'delete-key' }); } catch (e) { /* Status zeigt es */ }
    refreshStatus();
  });

  render();
})();
