/*
 * Storage abstraction: localStorage is the instant/offline layer, Supabase
 * (table "mm_store", one row per data domain) is the sync layer so iPhone
 * and iPad end up with the same data. Same get()/set() interface as before,
 * so app.js didn't need to change for this step.
 *
 * Sync model: on get() we try to pull the latest value from Supabase and
 * mirror it into localStorage; if that fails (offline) we fall back to
 * whatever is cached locally. set() writes local-first (so the UI never
 * waits on the network) and then pushes to Supabase in the background.
 * There is no realtime push between devices — reopening the app (or a
 * manual reload) is what picks up changes made on the other device.
 */
const DB = (() => {
  const PREFIX = 'mm_';
  const TABLE = 'mm_store';

  let client = null;
  if (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function setSyncTag(state) {
    const el = document.getElementById('sync-tag');
    if (!el) return;
    if (state === 'ok') { el.textContent = 'synchronisiert'; el.className = 'sync-tag ok'; }
    else if (state === 'busy') { el.textContent = 'speichert…'; el.className = 'sync-tag busy'; }
    else if (state === 'offline') { el.textContent = 'offline (lokal)'; el.className = 'sync-tag off'; }
    else { el.textContent = 'lokal'; el.className = 'sync-tag off'; }
  }

  function readLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('DB local read failed', key, e);
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.error('DB local write failed', key, e);
    }
  }

  async function get(key, fallback = null) {
    if (!client) {
      setSyncTag('off');
      return readLocal(key, fallback);
    }
    try {
      const { data, error } = await client.from(TABLE).select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      if (data) {
        writeLocal(key, data.value);
        setSyncTag('ok');
        return data.value;
      }
      setSyncTag('ok');
      return readLocal(key, fallback);
    } catch (e) {
      console.error('DB.get: Supabase nicht erreichbar, nutze lokalen Stand', key, e);
      setSyncTag('offline');
      return readLocal(key, fallback);
    }
  }

  async function set(key, value) {
    setSyncTag('busy');
    writeLocal(key, value);
    if (!client) {
      setSyncTag('off');
      return;
    }
    try {
      const { error } = await client.from(TABLE).upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      setSyncTag('ok');
    } catch (e) {
      console.error('DB.set: Supabase-Sync fehlgeschlagen, lokal gespeichert', key, e);
      setSyncTag('offline');
    }
  }

  return { get, set, setSyncTag };
})();
