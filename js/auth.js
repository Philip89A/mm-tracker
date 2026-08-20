/*
 * Session gating: shows the login screen until a Supabase Auth session
 * exists, then reveals the app shell and triggers the data load. No public
 * signup — accounts are created manually in the Supabase dashboard
 * (Authentication > Users).
 */

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('recovery-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
}

function showRecoveryScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('recovery-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('recovery-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
}

// Supabase fires onAuthStateChange for many events (SIGNED_IN, TOKEN_REFRESHED,
// USER_UPDATED, ...), not just an actual login. TOKEN_REFRESHED in particular
// happens automatically in the background roughly every hour. We must only
// reload all data on a genuine new sign-in — otherwise a background token
// refresh silently re-fetches everything from Supabase and can clobber a
// change that was made moments earlier and hadn't finished syncing yet.
let loadedForUserId = null;

async function enterAppForSession(session) {
  currentUserId = session.user.id;
  showApp();
  if (loadedForUserId !== currentUserId) {
    loadedForUserId = currentUserId;
    await loadAll();
  }
}

async function initAuth() {
  if (!supabaseClient) {
    // No Supabase config at all — nothing we can authenticate against.
    document.getElementById('login-error').textContent = 'Supabase ist nicht konfiguriert.';
    document.getElementById('login-error').style.display = 'block';
    showAuthScreen();
    return;
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      showRecoveryScreen();
      return;
    }
    if (event === 'SIGNED_OUT') {
      currentUserId = null;
      loadedForUserId = null;
      showAuthScreen();
      return;
    }
    if (session) {
      enterAppForSession(session);
    }
  });

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await enterAppForSession(session);
  } else {
    showAuthScreen();
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = 'Anmeldung fehlgeschlagen: ' + (error.message || 'Unbekannter Fehler');
    errEl.style.display = 'block';
  }
});

document.getElementById('forgot-password-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value;
  if (!email) {
    alert('Bitte trage oben zuerst deine E-Mail-Adresse ein und klicke dann erneut auf "Passwort vergessen?".');
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) {
    alert('Fehler beim Senden der E-Mail: ' + error.message);
  } else {
    alert('Falls für "' + email + '" ein Konto existiert, wurde eine E-Mail zum Zurücksetzen des Passworts verschickt.');
  }
});

document.getElementById('recovery-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('recovery-password').value;
  const errEl = document.getElementById('recovery-error');
  errEl.style.display = 'none';
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) {
    errEl.textContent = 'Fehler: ' + error.message;
    errEl.style.display = 'block';
    return;
  }
  alert('Passwort erfolgreich geändert.');
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await enterAppForSession(session);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

initAuth();
