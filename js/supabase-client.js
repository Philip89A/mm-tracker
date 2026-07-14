// Single shared Supabase client instance, used by both db.js (data sync)
// and auth.js (login/session). Creating more than one client against the
// same storage key triggers "Multiple GoTrueClient instances" warnings and
// can cause inconsistent auth state, so this is the only place that calls
// createClient().
const supabaseClient = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL)
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
