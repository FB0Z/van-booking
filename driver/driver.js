// Driver page — Stage 3.
// Step 1: login. Step 2a: driver profile + verification status.
// Uses SUPABASE_URL and SUPABASE_KEY from ../stage1/config.js.
// Plain fetch to Supabase, same style as the rider page (no library).

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
    wrong: "Correo o contraseña incorrectos.",
    offline: "Sin conexión. Inténtalo de nuevo cuando tengas señal.",
    expired: "Tu sesión terminó. Vuelve a entrar.",
    error: "Algo salió mal. Inténtalo de nuevo.",
    loading: "Cargando…",

    profileTitle: "Tus datos de conductor",
    profileIntro: "Completa tus datos. Los revisaremos antes de que puedas ver pasajeros.",
    editVerifiedWarn: "Si cambias tus datos, los revisaremos de nuevo y no verás pasajeros hasta entonces.",
    fullName: "Nombre completo",
    phone: "Celular",
    vehicle: "Vehículo",
    plate: "Placa",
    seats: "Asientos para pasajeros",
    licence: "Número de brevete",
    soat: "SOAT vence el",
    send: "Enviar para revisión",
    saving: "Enviando…",
    cancel: "Cancelar",
    edit: "Editar mis datos",
    saved: "Datos enviados para revisión.",

    badge_pending: "En revisión",
    badge_verified: "✔ Verificado",
    badge_rejected: "No aprobado",
    badge_suspended: "Suspendido",
    text_pending: "Estamos revisando tus datos. Cuando estés verificado, aquí verás tus viajes y pasajeros.",
    text_verified: "Estás verificado. Pronto verás aquí tus viajes y pasajeros.",
    text_rejected: "No pudimos aprobar tus datos. Corrígelos y envíalos de nuevo.",
    text_suspended: "Tu cuenta está suspendida. Contacta al equipo para más información.",
    note: "Nota del equipo:",
    soatWarn: "Tu SOAT está vencido. Actualiza la fecha.",

    r_invalid_name: "Escribe tu nombre completo.",
    r_invalid_phone: "Revisa el número de celular (9 dígitos).",
    r_invalid_vehicle: "Elige un vehículo.",
    r_invalid_plate: "Revisa la placa.",
    r_invalid_seats: "Los asientos deben estar entre 1 y 20.",
    r_invalid_licence: "Revisa el número de brevete.",
    r_soat_expired: "Ese SOAT está vencido. Se necesita un SOAT vigente."
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
    wrong: "Wrong email or password.",
    offline: "No connection. Try again when you have signal.",
    expired: "Your session ended. Please sign in again.",
    error: "Something went wrong. Please try again.",
    loading: "Loading…",

    profileTitle: "Your driver details",
    profileIntro: "Fill in your details. We'll check them before you can see passengers.",
    editVerifiedWarn: "If you change your details, we'll check them again, and you won't see passengers until then.",
    fullName: "Full name",
    phone: "Mobile number",
    vehicle: "Vehicle",
    plate: "Number plate",
    seats: "Passenger seats",
    licence: "Driving licence number",
    soat: "SOAT valid until",
    send: "Send for checking",
    saving: "Sending…",
    cancel: "Cancel",
    edit: "Edit my details",
    saved: "Details sent for checking.",

    badge_pending: "Being checked",
    badge_verified: "✔ Verified",
    badge_rejected: "Not approved",
    badge_suspended: "Suspended",
    text_pending: "We're checking your details. Once you're verified, your trips and passengers will appear here.",
    text_verified: "You're verified. Your trips and passengers will appear here soon.",
    text_rejected: "We couldn't approve your details. Please correct them and send them again.",
    text_suspended: "Your account is suspended. Please contact the team for more information.",
    note: "Note from the team:",
    soatWarn: "Your SOAT has expired. Please update the date.",

    r_invalid_name: "Please enter your full name.",
    r_invalid_phone: "Check the mobile number (9 digits).",
    r_invalid_vehicle: "Please choose a vehicle.",
    r_invalid_plate: "Check the number plate.",
    r_invalid_seats: "Seats must be between 1 and 20.",
    r_invalid_licence: "Check the licence number.",
    r_soat_expired: "That SOAT has expired. A valid SOAT is needed."
  }
};

// Usual passenger seats, filled in when a vehicle is chosen (the driver can change it)
const DEFAULT_SEATS = { van: 8, mototaxi: 3, moto: 1 };

let lang = readStorage("driverLang") || "es";
let messageKey = "";       // which message is showing, so it can change language
let currentSession = null;
let driver = null;         // this driver's profile, or null if they haven't sent one
let vehicleTypes = [];

function t(key) {
  return TEXTS[lang][key] || TEXTS[lang].error;
}

// ---------- 2. Page elements ----------
const $ = (id) => document.getElementById(id);

const loginForm = $("login-form");
const emailInput = $("email");
const passwordInput = $("password");
const loginBtn = $("login-btn");
const signedIn = $("signed-in");
const welcome = $("welcome");
const logoutBtn = $("logout-btn");
const langBtn = $("lang-btn");
const message = $("message");

const statusCard = $("status-card");
const statusBadge = $("status-badge");
const statusText = $("status-text");
const statusNote = $("status-note");
const soatWarning = $("soat-warning");
const summary = $("summary");
const editBtn = $("edit-btn");

const profileForm = $("profile-form");
const profileIntro = $("profile-intro");
const nameInput = $("full-name");
const phoneInput = $("phone");
const vehicleSelect = $("vehicle");
const plateInput = $("plate");
const seatsInput = $("seats");
const licenceInput = $("licence");
const soatInput = $("soat");
const saveBtn = $("save-btn");
const cancelEditBtn = $("cancel-edit-btn");

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

// ---------- 3. Dates in Lima time ----------
// Today in Lima as "YYYY-MM-DD" (same format as the date box and the database)
function limaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

// "2027-03-01" -> "1 mar 2027" / "1 Mar 2027"
function showDate(isoDate) {
  const d = new Date(isoDate + "T12:00:00Z");
  return d.toLocaleDateString(lang === "es" ? "es-PE" : "en-GB", {
    timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric"
  });
}

// ---------- 4. Browser storage (wrapped: it can be blocked) ----------
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

// ---------- 5. Talking to Supabase ----------
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

// Call a database function as the signed-in driver.
// Returns its answer, or null if the session ended (the page then shows the login).
// Throws TypeError with no connection, Error for anything else.
async function callAsDriver(name, body) {
  const s = await getValidSession();
  if (!s) {
    showLogin();
    say("expired");
    return null;
  }
  currentSession = s;
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + s.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(name + " failed: " + res.status);
  return res.json();
}

function sayProblem(err) {
  say(err instanceof TypeError ? "offline" : "error");
}

// ---------- 6. Showing the right part of the page ----------
function showLogin() {
  currentSession = null;
  driver = null;
  signedIn.hidden = true;
  loginForm.hidden = false;
}

function showSignedIn(session, offline) {
  currentSession = session;
  loginForm.hidden = true;
  signedIn.hidden = false;
  statusCard.hidden = true;
  profileForm.hidden = true;
  renderSignedIn();
  if (!offline) loadProfile();
}

function renderSignedIn() {
  welcome.textContent = t("welcome") + " " + currentSession.email;
  fillVehicleOptions();
  if (!statusCard.hidden && driver) renderStatusCard();
  profileIntro.textContent = t(driver && driver.status === "verified" ? "editVerifiedWarn" : "profileIntro");
}

function vehicleName(code) {
  const v = vehicleTypes.find((x) => x.code === code);
  if (!v) return code;
  return lang === "es" ? v.name_es : v.name_en;
}

function fillVehicleOptions() {
  const keep = vehicleSelect.value;
  vehicleSelect.innerHTML = "";
  vehicleTypes.forEach((v) => {
    const option = document.createElement("option");
    option.value = v.code;
    option.textContent = lang === "es" ? v.name_es : v.name_en;
    vehicleSelect.appendChild(option);
  });
  if (keep) vehicleSelect.value = keep;
}

// Load the vehicle list and this driver's profile, then show the card or the form
async function loadProfile() {
  say("loading");
  try {
    const types = await callAsDriver("get_vehicle_types");
    if (types === null) return;
    const rows = await callAsDriver("get_my_driver");
    if (rows === null) return;

    vehicleTypes = types;
    driver = rows[0] || null;
    say("");
    if (driver) showStatusCard();
    else startEditing();
  } catch (err) {
    sayProblem(err);
  }
}

function showStatusCard() {
  profileForm.hidden = true;
  statusCard.hidden = false;
  renderSignedIn();
}

function renderStatusCard() {
  const s = driver.status;
  statusBadge.textContent = t("badge_" + s);
  statusBadge.className = "badge badge-" + s;
  statusText.textContent = t("text_" + s);
  statusNote.textContent = driver.status_note ? t("note") + " " + driver.status_note : "";
  statusNote.hidden = !driver.status_note;
  soatWarning.hidden = driver.soat_expires >= limaToday();
  editBtn.hidden = s === "suspended";

  const rows = [
    ["fullName", driver.full_name],
    ["phone", driver.phone],
    ["vehicle", vehicleName(driver.vehicle_type)],
    ["plate", driver.plate],
    ["seats", String(driver.seats)],
    ["licence", driver.licence_number],
    ["soat", showDate(driver.soat_expires)]
  ];
  summary.innerHTML = "";
  rows.forEach(([key, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = t(key);
    const dd = document.createElement("dd");
    dd.textContent = value;
    summary.append(dt, dd);
  });
}

// Open the form, filled in with their details if they have sent them before
function startEditing() {
  statusCard.hidden = true;
  profileForm.hidden = false;
  fillVehicleOptions();
  soatInput.min = limaToday();

  if (driver) {
    nameInput.value = driver.full_name;
    phoneInput.value = driver.phone;
    vehicleSelect.value = driver.vehicle_type;
    plateInput.value = driver.plate;
    seatsInput.value = driver.seats;
    licenceInput.value = driver.licence_number;
    soatInput.value = driver.soat_expires;
  } else {
    profileForm.reset();
    fillVehicleOptions(); // reset() can clear the select
    seatsInput.value = DEFAULT_SEATS[vehicleSelect.value] || 1;
  }
  cancelEditBtn.hidden = !driver;
  renderSignedIn();
}

// ---------- 7. Buttons ----------
loginForm.addEventListener("submit", async (e) => {
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

logoutBtn.addEventListener("click", () => {
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

vehicleSelect.addEventListener("change", () => {
  seatsInput.value = DEFAULT_SEATS[vehicleSelect.value] || 1;
});

editBtn.addEventListener("click", () => {
  say("");
  startEditing();
});

cancelEditBtn.addEventListener("click", () => {
  say("");
  showStatusCard();
});

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveBtn.disabled = true;
  saveBtn.textContent = t("saving");
  say("");
  try {
    const result = await callAsDriver("save_my_driver", {
      p_full_name: nameInput.value,
      p_phone: phoneInput.value,
      p_vehicle_type: vehicleSelect.value,
      p_plate: plateInput.value,
      p_seats: Number(seatsInput.value),
      p_licence_number: licenceInput.value,
      p_soat_expires: soatInput.value
    });
    if (result === null) return;

    if (result === "saved") {
      await loadProfile();
      say("saved");
    } else if (result === "suspended") {
      await loadProfile();
      say("text_suspended");
    } else if (result === "not_logged_in") {
      showLogin();
      say("expired");
    } else {
      say("r_" + result);
    }
  } catch (err) {
    sayProblem(err);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = t("send");
  }
});

// ---------- 8. Start ----------
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
    // No signal: keep the driver signed in on this phone, try again later
    showSignedIn(stored, true);
    say("offline");
  }
}

start();