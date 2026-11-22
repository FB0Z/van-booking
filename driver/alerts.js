// Road alerts — Stage 3, step 5.
// Verified drivers (van, mototaxi or motorbike) warn riders about the road.
// Riders see them as a banner at the top of the booking page.
// Uses helpers from driver.js (callAsDriver, lang) and 16-road-alerts.sql.

// ---------- 1. Texts (ES / EN) ----------
const ALERT_TEXTS = {
  es: {
    title: "Avisos de la carretera",
    intro: "Avisa a los pasajeros si hay un problema en la carretera. Lo verán arriba en la página de reservas.",
    level: "Tipo de aviso",
    lv_closed: "🚧 Carretera cerrada",
    lv_warning: "⚠ Precaución",
    lv_info: "ℹ Información",
    presets: "Mensajes rápidos",
    presetPick: "Elige uno o escribe el tuyo abajo",
    message: "Mensaje (lo leen los pasajeros)",
    hours: "Mostrar durante",
    hoursN: (h) => h + " horas",
    post: "Publicar aviso",
    posting: "Publicando…",
    posted: "Aviso publicado. Los pasajeros ya lo ven.",
    mine: "Tus avisos activos",
    none: "No tienes avisos activos.",
    until: (time) => "hasta las " + time,
    end: "Quitar",
    ended: "Aviso quitado.",
    r_too_many: "Ya tienes 3 avisos activos. Quita uno primero.",
    r_invalid_message: "Escribe un mensaje (de 3 a 200 letras).",
    r_not_allowed: "Solo los choferes verificados pueden publicar avisos.",
    error: "No se pudo guardar. Revisa tu señal e inténtalo de nuevo.",
    locale: "es-PE"
  },
  en: {
    title: "Road alerts",
    intro: "Warn passengers about a problem on the road. They'll see it at the top of the booking page.",
    level: "Type of alert",
    lv_closed: "🚧 Road closed",
    lv_warning: "⚠ Take care",
    lv_info: "ℹ Information",
    presets: "Quick messages (in Spanish, for riders)",
    presetPick: "Pick one or write your own below",
    message: "Message (passengers read this)",
    hours: "Show for",
    hoursN: (h) => h + " hours",
    post: "Post alert",
    posting: "Posting…",
    posted: "Alert posted. Passengers can see it now.",
    mine: "Your active alerts",
    none: "You have no active alerts.",
    until: (time) => "until " + time,
    end: "Remove",
    ended: "Alert removed.",
    r_too_many: "You already have 3 active alerts. Remove one first.",
    r_invalid_message: "Please write a message (3 to 200 characters).",
    r_not_allowed: "Only verified drivers can post alerts.",
    error: "Couldn't save. Check your signal and try again.",
    locale: "en-GB"
  }
};

// Ready-made messages in Spanish, because riders read them in Spanish.
// Based on the brief: the Costanera road floods north of Piedritas (p.50).
const ALERT_PRESETS = [
  { level: "closed", text: "Carretera inundada al norte de Piedritas. Las vans van por la Panamericana." },
  { level: "warning", text: "Lluvia fuerte: las vans pueden salir tarde." },
  { level: "warning", text: "Obras en la carretera: hay demoras." },
  { level: "warning", text: "Accidente en la carretera: vamos más lento." },
  { level: "info", text: "La carretera ya está abierta otra vez." }
];

const ALERT_HOURS = [3, 6, 12, 24];

function at(key, ...args) {
  const value = ALERT_TEXTS[lang][key];
  return typeof value === "function" ? value(...args) : value;
}

// ---------- 2. State and page elements ----------
const alertsState = { mine: null, message: "", busy: false };

const alertsCard = document.getElementById("alerts-card");
const alertsTitle = document.getElementById("alerts-title");
const alertsIntro = document.getElementById("alerts-intro");
const alertForm = document.getElementById("alert-form");
const alertLevel = document.getElementById("alert-level");
const alertPreset = document.getElementById("alert-preset");
const alertText = document.getElementById("alert-text");
const alertHours = document.getElementById("alert-hours");
const alertBtn = document.getElementById("alert-btn");
const alertStatus = document.getElementById("alert-status");
const myAlertsTitle = document.getElementById("my-alerts-title");
const myAlerts = document.getElementById("my-alerts");

// ---------- 3. Loading ----------
async function loadAlerts() {
  if (!(typeof driver !== "undefined" && driver && driver.status === "verified")) return hideAlerts();
  alertsCard.hidden = false;
  renderAlerts();
  try {
    const rows = await callAsDriver("get_my_road_alerts");
    if (rows === null) return;
    alertsState.mine = rows;
  } catch (err) {
    alertsState.message = "error";
  }
  renderAlerts();
}

function hideAlerts() {
  alertsCard.hidden = true;
  alertsState.mine = null;
  alertsState.message = "";
}

// ---------- 4. Drawing ----------
// Refill a dropdown (e.g. after a language switch), keeping the choice, or using the default
function fillSelect(select, items, fallback) {
  const keep = select.dataset.filled ? select.value : fallback;
  select.dataset.filled = "yes";
  select.innerHTML = "";
  items.forEach(([value, text]) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    select.appendChild(o);
  });
  if (keep) select.value = keep;
}

function renderAlerts() {
  if (alertsCard.hidden) return;
  alertsTitle.textContent = at("title");
  alertsIntro.textContent = at("intro");
  alertForm.querySelectorAll("[data-at]").forEach((e) => { e.textContent = at(e.dataset.at); });
  fillSelect(alertLevel, ["closed", "warning", "info"].map((l) => [l, at("lv_" + l)]), "warning");
  fillSelect(alertPreset, [["", at("presetPick")]].concat(ALERT_PRESETS.map((p, i) => [String(i), p.text])), "");
  fillSelect(alertHours, ALERT_HOURS.map((h) => [String(h), at("hoursN", h)]), "6");
  alertBtn.disabled = alertsState.busy;
  alertBtn.textContent = at(alertsState.busy ? "posting" : "post");
  alertStatus.textContent = alertsState.message ? at(alertsState.message) : "";
  myAlertsTitle.textContent = at("mine");

  myAlerts.innerHTML = "";
  if (alertsState.mine === null) return;
  if (alertsState.mine.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = at("none");
    myAlerts.appendChild(li);
    return;
  }
  alertsState.mine.forEach((a) => {
    const li = document.createElement("li");
    li.className = "my-alert my-alert-" + a.level;
    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = at("lv_" + a.level);
    const msg = document.createElement("p");
    msg.textContent = a.message;
    const until = document.createElement("p");
    until.className = "muted";
    until.textContent = at("until", new Date(a.expires_at).toLocaleTimeString(at("locale"), {
      timeZone: "America/Lima", hour: "numeric", minute: "2-digit", hour12: true
    }));
    text.append(title, msg, until);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary small";
    btn.textContent = at("end");
    btn.addEventListener("click", () => endAlert(a, btn));
    li.append(text, btn);
    myAlerts.appendChild(li);
  });
}

// ---------- 5. Actions ----------
alertPreset.addEventListener("change", () => {
  const p = ALERT_PRESETS[Number(alertPreset.value)];
  if (alertPreset.value === "" || !p) return;
  alertText.value = p.text;
  alertLevel.value = p.level;
});

alertForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertsState.busy = true;
  alertsState.message = "";
  renderAlerts();
  try {
    const result = await callAsDriver("post_road_alert", {
      p_level: alertLevel.value, p_message: alertText.value, p_hours: Number(alertHours.value)
    });
    if (result === null) return;
    if (result === "posted") {
      alertText.value = "";
      alertPreset.value = "";
      alertLevel.value = "warning"; // start the next alert fresh
      alertHours.value = "6";
      alertsState.message = "posted";
      alertsState.mine = await callAsDriver("get_my_road_alerts");
    } else {
      alertsState.message = ALERT_TEXTS[lang]["r_" + result] ? "r_" + result : "error";
    }
  } catch (err) {
    alertsState.message = "error";
  } finally {
    alertsState.busy = false;
    renderAlerts();
  }
});

async function endAlert(alert, btn) {
  btn.disabled = true;
  alertsState.message = "";
  try {
    const result = await callAsDriver("end_road_alert", { p_alert_id: alert.alert_id });
    if (result === null) return;
    alertsState.message = result === "ok" ? "ended" : "r_not_allowed";
    alertsState.mine = await callAsDriver("get_my_road_alerts");
  } catch (err) {
    alertsState.message = "error";
  }
  renderAlerts();
}