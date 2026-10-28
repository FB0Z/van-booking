// Driver page — Stage 3, step 1: login.
// Uses SUPABASE_URL and SUPABASE_KEY from ../stage1/config.js.
// Plain fetch to Supabase Auth, same style as the rider page (no library).

// ---------- 1. Texts (ES / EN) ----------
const TEXTS = {
  es: {
    title: "Conductores",
    lang: "English",
    email: "Correo",
    password: "Contraseña",
    login: "Entrar",
    loggingIn: "Entrando…",
    logout: "Salir",
    welcome: "Has entrado como",
    dbOk: "La base de datos te reconoce ✔",
    dbFail: "La base de datos no te reconoce.",
    wrong: "Correo o contraseña incorrectos.",
    offline: "Sin conexión. Inténtalo de nuevo cuando tengas señal.",
    expired: "Tu sesión terminó. Vuelve a entrar.",
    error: "Algo salió mal. Inténtalo de nuevo."
  },
  en: {
    title: "Drivers",
    lang: "Español",
    email: "Email",
    password: "Password",
    login: "Sign in",
    loggingIn: "Signing in…",
    logout: "Sign out",
    welcome: "Signed in as",
    dbOk: "The database recognises you ✔",
    dbFail: "The database doesn't recognise you.",
    wrong: "Wrong email or password.",
    offline: "No connection. Try again when you have signal.",
    expired: "Your session ended. Please sign in again.",
    error: "Something went wrong. Please try again."
  }
};

let lang = readStorage("driverLang") || "es";
let messageKey = "";      // which message is showing, so it can change language
let dbKey = "";           // dbOk / dbFail
let currentSession = null;

function t(key) {
  return TEXTS[lang][key];
}

// ---------- 2. Page elements ----------
const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const signedIn = document.getElementById("signed-in");
const welcome = document.getElementById("welcome");
const dbCheck = document.getElementById("db-check");
const logoutBtn = document.getElementById("logout-btn");
const langBtn = document.getElementById("lang-btn");
const message = document.getElementById("message");

function applyTexts() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  message.textContent = messageKey ? t(messageKey) : "";
  if (currentSession) renderSignedIn();
}

function say(key) {
  messageKey = key;
  message.textContent = key ? t(key) : "";
}

// ---------- 3. Browser storage (wrapped: it can be blocked) ----------
const SESSION_KEY = "driverSession";

function readStorage(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}
function removeStorage(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

function saveSession(s) { writeStorage(SESSION_KEY, JSON.stringify(s)); }
function loadSession() {
  try { return JSON.parse(readStorage(SESSION_KEY)); } catch (e) { return null; }
}
function clearSession() { removeStorage(SESSION_KEY); }

// ---------- 4. Talking to Supabase Auth ----------
async function authRequest(path, body, token) {
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({})); // logout returns no body
  return { ok: res.ok, status: res.status, data };
}

// Keep only what the page needs from Supabase's reply
function toSession(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
    email: data.user && data.user.email
  };
}

// The login ticket (access token) lasts about an hour.
// If it has run out, swap the refresh token for a new one,
// so drivers don't have to type their password every time.
// Returns a session, or null if the driver must sign in again.
// Throws if there is no connection.
async function getValidSession() {
  const s = loadSession();
  if (!s) return null;
  const now = Math.floor(Date.now() / 1000);
  if (s.expires_at - 60 > now) return s;

  const r = await authRequest("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
  if (r.ok) {
    const fresh = toSession(r.data);
    saveSession(fresh);
    return fresh;
  }
  clearSession();
  return null;
}

// Proof that the database sees who is logged in (12-driver-whoami.sql)
async function checkDatabase(session) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/driver_whoami", {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------- 5. Showing the two states ----------
function showLogin() {
  currentSession = null;
  dbKey = "";
  signedIn.hidden = true;
  form.hidden = false;
}

function renderSignedIn() {
  welcome.textContent = t("welcome") + " " + currentSession.email;
  dbCheck.textContent = dbKey ? t(dbKey) : "";
}

async function showSignedIn(session, offline) {
  currentSession = session;
  form.hidden = true;
  signedIn.hidden = false;
  dbKey = "";
  renderSignedIn();
  if (offline) return;

  const me = await checkDatabase(session).catch(() => null);
  dbKey = me && me.email === session.email ? "dbOk" : "dbFail";
  renderSignedIn();
}

// ---------- 6. Buttons ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.disabled = true;
  loginBtn.textContent = t("loggingIn");
  say("");
  try {
    const r = await authRequest("token?grant_type=password", {
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    if (r.ok) {
      const s = toSession(r.data);
      saveSession(s);
      passwordInput.value = "";
      showSignedIn(s);
    } else if (r.status === 400) {
      say("wrong");
    } else {
      say("error");
    }
  } catch (err) {
    say("offline");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = t("login");
  }
});

logoutBtn.addEventListener("click", async () => {
  const s = currentSession;
  clearSession();
  showLogin();
  say("");
  // Tell Supabase too; if there's no signal, the phone is still signed out.
  if (s) authRequest("logout", {}, s.access_token).catch(() => {});
});

langBtn.addEventListener("click", () => {
  lang = lang === "es" ? "en" : "es";
  writeStorage("driverLang", lang);
  applyTexts();
});

// ---------- 7. Start ----------
async function start() {
  applyTexts();
  const stored = loadSession();
  if (!stored) return showLogin();
  try {
    const session = await getValidSession();
    if (session) {
      showSignedIn(session);
    } else {
      showLogin();
      say("expired");
    }
  } catch (e) {
    // No signal: keep the driver signed in on this phone, check again later
    showSignedIn(stored, true);
    say("offline");
  }
}

start();