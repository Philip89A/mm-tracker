/**
 * Belege zu Trips: Belegnummern (Flug, Upgrade, CO₂-Ausgleich) und optionale Dateien (PDF/Foto).
 * Dateien liegen im privaten Supabase-Bucket „receipts“ unter <user_id>/<trip_id>/…; der Zugriff ist
 * per Policy auf den eigenen Ordner beschränkt. Im Trip steht nur die Dateiliste (trip.receiptFiles),
 * die Dateien selbst sind nicht im JSON-Backup. Zustand des Formulars (tripReceiptFiles, …) liegt in app.js.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = escHtml;
  const BUCKET = 'receipts';
  const MAX_BYTES = 10 * 1024 * 1024;
  const KIND = { flight: 'Flug', upgrade: 'Upgrade', co2: 'CO₂-Ausgleich', other: 'Sonstiges' };
  const kb = (n) => (n >= 1048576 ? (n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  const storage = () => (typeof supabaseClient !== 'undefined' && supabaseClient ? supabaseClient.storage.from(BUCKET) : null);

  function formTripId() {
    if (editingTripId) return editingTripId;
    if (!pendingTripId) pendingTripId = genId();
    return pendingTripId;
  }

  function renderReceiptFiles() {
    const el = $('t-rc-list');
    if (!el) return;
    el.innerHTML = tripReceiptFiles.length ? tripReceiptFiles.map((f, i) => `<div class="sim-row"><div><b>${esc(f.name)}</b>
      <div class="meta" style="font-size:12px; color:var(--muted);">${esc(KIND[f.kind] || 'Sonstiges')} · ${kb(f.size || 0)}</div></div>
      <div style="white-space:nowrap;"><button type="button" class="btn small secondary" onclick="openReceipt('${i}', true)">Öffnen</button> <button type="button" class="del" onclick="removeReceiptFile(${i})">entfernen</button></div></div>`).join('')
      : '<div class="hint" style="margin:4px 0 0;">Noch keine Dateien.</div>';
  }
  window.renderReceiptFiles = renderReceiptFiles;

  async function uploadFiles(files) {
    const msg = $('t-rc-msg');
    const st = storage();
    if (!st || !currentUserId) { msg.textContent = 'Zum Hochladen bitte anmelden (die Belegnummer lässt sich auch ohne Anmeldung eintragen).'; return; }
    const tripId = formTripId();
    for (const file of files) {
      if (file.size > MAX_BYTES) { msg.textContent = `„${file.name}“ ist größer als 10 MB und wurde nicht hochgeladen.`; continue; }
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${currentUserId}/${tripId}/${Date.now()}-${safe}`;
      msg.textContent = `Lade „${file.name}“ hoch …`;
      const { error } = await st.upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (error) { msg.textContent = `Hochladen fehlgeschlagen: ${error.message}`; continue; }
      const entry = { path, name: file.name, size: file.size, type: file.type || '', kind: $('t-rc-kind').value };
      tripReceiptFiles.push(entry);
      tripSessionUploads.push(path);
      msg.textContent = 'Hochgeladen. Mit „Trip speichern“ wird die Zuordnung gesichert.';
    }
    renderReceiptFiles();
  }

  $('t-rc-file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) await uploadFiles(files);
  });

  // Datei im neuen Tab öffnen (kurzlebiger, signierter Link)
  window.openReceipt = async function (ref, isIndex) {
    const f = isIndex ? tripReceiptFiles[Number(ref)] : { path: ref };
    const st = storage();
    if (!f || !st) return;
    const { data, error } = await st.createSignedUrl(f.path, 300);
    if (error || !data) { alert('Die Datei konnte nicht geöffnet werden: ' + (error ? error.message : 'nicht gefunden')); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  window.removeReceiptFile = function (i) {
    const f = tripReceiptFiles[i];
    if (!f) return;
    tripReceiptFiles.splice(i, 1);
    // Eine in dieser Bearbeitung hochgeladene Datei kann sofort weg, eine gespeicherte erst beim Speichern.
    if (tripSessionUploads.includes(f.path)) { tripSessionUploads = tripSessionUploads.filter(p => p !== f.path); deleteReceiptFiles([f.path]); }
    else tripFilesToDelete.push(f.path);
    renderReceiptFiles();
  };

  window.deleteReceiptFiles = async function (paths) {
    const st = storage();
    if (!st || !paths || !paths.length) return;
    const { error } = await st.remove(paths);
    if (error) console.error('Beleg-Dateien konnten nicht gelöscht werden:', error.message);
  };

  // Abbrechen: in dieser Bearbeitung hochgeladene, nicht gespeicherte Dateien wieder entfernen
  window.discardReceiptUploads = function () {
    if (tripSessionUploads.length) deleteReceiptFiles(tripSessionUploads);
  };

  // Belegzeilen im Trip-Log
  window.receiptLinesHtml = function (t) {
    const parts = [];
    if (t.receiptNo) parts.push(`Flug ${esc(t.receiptNo)}`);
    if (t.upgradeReceiptNo) parts.push(`Upgrade ${esc(t.upgradeReceiptNo)}`);
    if (t.co2ReceiptNo) parts.push(`CO₂ Fuel ${esc(t.co2ReceiptNo)}`);
    if (t.co2ReceiptNo2) parts.push(`CO₂ Projects ${esc(t.co2ReceiptNo2)}`);
    const files = (t.receiptFiles || []).map(f => `<a href="#" onclick="openReceipt('${esc(f.path)}'); return false;">📎 ${esc(f.name)}</a>`);
    if (!parts.length && !files.length) return '';
    return `<div class="meta">🧾 ${parts.join(' · ') || 'Belege'}${files.length ? ' · ' + files.join(' · ') : ''}</div>`;
  };

  renderReceiptFiles();
})();
