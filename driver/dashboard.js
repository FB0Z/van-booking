// Driver dashboard — Stage 3, steps 3 + 4.
// Shown only to VERIFIED drivers. Uses helpers from driver.js
// (callAsDriver, driver, lang, limaToday) and the functions in 15-driver-dashboard.sql.
// The database decides who may see what: this page only shows what it's given.

// ---------- 1. Texts (ES / EN) ----------
const DASH_TEXTS = {
  es: {
    title: "Tus salidas",
    note: "Hoy y los próximos 14 días.",
    refresh: "Actualizar",
    loading: "Cargando…",
    none: "No tienes salidas. Añade una abajo.",
    notVan: "Las salidas programadas son solo para vans. Los viajes en mototaxi y moto llegarán más adelante.",
    loadError: "No se pudieron cargar tus salidas. Revisa tu señal e inténtalo de nuevo.",
    today: "Hoy",
    tomorrow: "Mañana",
    locale: "es-PE",
    to_talara: "Lobitos → Talara",
    to_lobitos: "Talara → Lobitos",
    bookedOf: (n, c) => n + " de " + c + " reservados",
    boardedN: (n) => (n === 1 ? "1 subió" : n + " subieron"),
    st_leaving: "Saliendo",
    st_delayed: (m) => "Retraso +" + m + " min",
    st_full: "Llena",
    st_cancelled: "Cancelada",
    btnLeaving: "🚐 Saliendo ahora",
    btnDelay: "⏱ Retraso",
    btnFull: "Llena",
    btnCancel: "Cancelar salida",
    btnNormal: "Volver a normal",
    btnReactivate: "Reactivar salida",
    delayAsk: "¿Cuántos minutos de retraso?",
    delaySend: "Avisar retraso",
    no: "No",
    minutes: (m) => m + " min",
    cancelAsk: "¿Cancelar esta salida? Los pasajeros verán que está cancelada.",
    cancelYes: "Sí, cancelar",
    cancelledInfo: "Salida cancelada. Los pasajeros lo ven en la página.",
    statusHint: "Los pasajeros ven estos avisos en la página de reservas.",
    passengers: (n) => "Pasajeros (" + n + ")",
    noPassengers: "Aún no hay reservas.",
    boardsAt: (stop, time) => "Suben en " + stop + " · aprox. " + time,
    getsOff: "baja en",
    askCode: "Pide el código a cada pasajero al subir y marca ✔.",
    saving: "Guardando…",
    actionError: "No se pudo guardar. Revisa tu señal e inténtalo de nuevo.",
    notAllowed: "Ya no puedes cambiar esta salida.",
    addOpen: "+ Añadir salida",
    addClose: "Cerrar",
    date: "Día",
    time: "Hora de salida",
    direction: "Dirección",
    seats: "Asientos",
    add: "Añadir salida",
    adding: "Añadiendo…",
    added: "Salida añadida.",
    a_in_past: "Esa hora ya pasó.",
    a_too_far: "Solo puedes añadir salidas hasta 30 días adelante.",
    a_duplicate: "Ya tienes una salida a esa hora.",
    a_invalid_seats: "Los asientos deben estar entre 1 y 20.",
    a_invalid_direction: "Elige una dirección.",
    a_not_van: "Solo los choferes de van pueden añadir salidas.",
    a_not_allowed: "Ya no puedes añadir salidas."
  },
  en: {
    title: "Your departures",
    note: "Today and the next 14 days.",
    refresh: "Refresh",
    loading: "Loading…",
    none: "You have no departures. Add one below.",
    notVan: "Scheduled departures are for vans only. Mototaxi and motorbike rides are coming later.",
    loadError: "We couldn't load your departures. Check your signal and try again.",
    today: "Today",
    tomorrow: "Tomorrow",
    locale: "en-GB",
    to_talara: "Lobitos → Talara",
    to_lobitos: "Talara → Lobitos",
    bookedOf: (n, c) => n + " of " + c + " booked",
    boardedN: (n) => n + " boarded",
    st_leaving: "Leaving",
    st_delayed: (m) => "Delayed +" + m + " min",
    st_full: "Full",
    st_cancelled: "Cancelled",
    btnLeaving: "🚐 Leaving now",
    btnDelay: "⏱ Delayed",
    btnFull: "Full",
    btnCancel: "Cancel departure",
    btnNormal: "Back to normal",
    btnReactivate: "Restore departure",
    delayAsk: "How many minutes late?",
    delaySend: "Send delay",
    no: "No",
    minutes: (m) => m + " min",
    cancelAsk: "Cancel this departure? Passengers will see that it's cancelled.",
    cancelYes: "Yes, cancel",
    cancelledInfo: "Departure cancelled. Passengers can see this on the booking page.",
    statusHint: "Passengers see these updates on the booking page.",
    passengers: (n) => "Passengers (" + n + ")",
    noPassengers: "No bookings yet.",
    boardsAt: (stop, time) => "Board at " + stop + " · about " + time,
    getsOff: "gets off at",
    askCode: "Ask each passenger for their code as they board, then tick ✔.",
    saving: "Saving…",
    actionError: "Couldn't save. Check your signal and try again.",
    notAllowed: "You can't change this departure any more.",
    addOpen: "+ Add departure",
    addClose: "Close",
    date: "Day",
    time: "Departure time",
    direction: "Direction",
    seats: "Seats",
    add: "Add departure",
    adding: "Adding…",
    added: "Departure added.",
    a_in_past: "That time has already passed.",
    a_too_far: "You can only add departures up to 30 days ahead.",
    a_duplicate: "You already have a departure at that time.",
    a_invalid_seats: "Seats must be between 1 and 20.",
    a_invalid_direction: "Please choose a direction.",
    a_not_van: "Only van drivers can add departures.",
    a_not_allowed: "You can't add departures any more."
  }
};

function dt(key, ...args) {
  const value = DASH_TEXTS[lang][key];
  return typeof value === "function" ? value(...args) : value;
}

const DELAY_CHOICES = [10, 15, 20, 30, 45, 60];
const REFRESH_EVERY_MS = 60 * 1000; // new bookings appear without pressing anything

// ---------- 2. State ----------
const dash = {
  trips: null,        // from get_my_trips(); null = not loaded yet
  stops: [],          // from get_stops(), for "board at Sichez · about 7:08"
  error: false,
  openTrip: null,     // the trip whose passengers are showing
  passengers: {},     // trip id -> list from get_trip_passengers()
  delayFor: null,     // the trip whose "how many minutes" question is open
  cancelFor: null,    // the trip whose "cancel this departure?" question is open
  busyTrip: null,     // the trip being saved right now
  message: "",        // a message key, shown under the list
  addOpen: false,
  timer: null
};

// ---------- 3. Page elements ----------
const dashSection = document.getElementById("dashboard");
const dashTitle = document.getElementById("dash-title");
const dashNote = document.getElementById("dash-note");
const dashRefresh = document.getElementById("dash-refresh");
const tripList = document.getElementById("trip-list");
const dashMessage = document.getElementById("dash-message");
const addToggle = document.getElementById("add-toggle");
const addForm = document.getElementById("add-form");
const addDate = document.getElementById("add-date");
const addTime = document.getElementById("add-time");
const addDirection = document.getElementById("add-direction");
const addSeats = document.getElementById("add-seats");
const addBtn = document.getElementById("add-btn");

// ---------- 4. Time helpers (Lima time) ----------
function dTime(iso) {
  return new Date(iso).toLocaleTimeString(dt("locale"), {
    timeZone: "America/Lima", hour: "numeric", minute: "2-digit", hour12: true
  });
}

function dDay(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function dDayHeading(iso) {
  const date = new Date(iso).toLocaleDateString(dt("locale"), {
    timeZone: "America/Lima", weekday: "short", day: "numeric", month: "short"
  });
  const tomorrow = dDay(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  if (dDay(iso) === limaToday()) return dt("today") + " · " + date;
  if (dDay(iso) === tomorrow) return dt("tomorrow") + " · " + date;
  return date;
}

function plusMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

// When the van reaches a stop: minutes from the start of the line
function stopTime(trip, stopName) {
  const stop = dash.stops.find((s) => s.name === stopName);
  if (!stop || dash.stops.length === 0) return null;
  const all = dash.stops.map((s) => Number(s.minutes_from_talara));
  const start = trip.direction === "to_talara" ? Math.max(...all) : Math.min(...all);
  const leaves = plusMinutes(trip.departs_at, trip.status === "delayed" ? trip.delay_minutes : 0);
  return dTime(plusMinutes(leaves, Math.abs(start - Number(stop.minutes_from_talara))));
}

// ---------- 5. Loading ----------
function isVerified() {
  return typeof driver !== "undefined" && driver && driver.status === "verified";
}

async function loadDashboard() {
  if (!isVerified()) return hideDashboard();
  dashSection.hidden = false;
  if (!dash.timer) dash.timer = setInterval(autoRefresh, REFRESH_EVERY_MS);
  if (!addDate.value) resetAddForm();
  renderDashboard();
  await refreshTrips();
}

function hideDashboard() {
  dashSection.hidden = true;
  if (dash.timer) clearInterval(dash.timer);
  Object.assign(dash, {
    trips: null, error: false, openTrip: null, passengers: {}, delayFor: null,
    cancelFor: null, busyTrip: null, message: "", addOpen: false, timer: null
  });
}

async function refreshTrips() {
  try {
    const [trips, stops] = await Promise.all([callAsDriver("get_my_trips"), callAsDriver("get_stops")]);
    if (trips === null || stops === null) return; // signed out
    dash.trips = trips;
    dash.stops = stops;
    dash.error = false;
    if (dash.openTrip && !trips.some((t) => t.trip_id === dash.openTrip)) dash.openTrip = null;
    if (dash.openTrip) await loadPassengers(dash.openTrip);
  } catch (err) {
    dash.error = true;
  }
  renderDashboard();
}

async function loadPassengers(tripId) {
  const rows = await callAsDriver("get_trip_passengers", { p_trip_id: tripId });
  if (rows !== null) dash.passengers[tripId] = rows;
}

function autoRefresh() {
  if (dashSection.hidden || document.visibilityState !== "visible") return;
  if (dash.busyTrip || dash.delayFor || dash.cancelFor) return; // don't jump while the driver is choosing
  refreshTrips();
}

// ---------- 6. Actions ----------
async function setStatus(trip, status, minutes) {
  dash.busyTrip = trip.trip_id;
  dash.message = "";
  renderDashboard();
  try {
    const result = await callAsDriver("set_trip_status", {
      p_trip_id: trip.trip_id, p_status: status, p_delay_minutes: minutes || null
    });
    if (result === null) return;
    dash.delayFor = null;
    dash.cancelFor = null;
    if (result !== "ok") dash.message = result === "not_allowed" ? "notAllowed" : "actionError";
    dash.busyTrip = null;
    await refreshTrips();
    if (result === "not_allowed") loadProfile(); // maybe no longer verified
  } catch (err) {
    dash.message = "actionError";
  } finally {
    dash.busyTrip = null;
    renderDashboard();
  }
}

async function setBoarded(trip, passenger, boarded) {
  passenger.boarded = boarded; // show the tick straight away
  trip.boarded += boarded ? 1 : -1;
  dash.message = "";
  renderDashboard();
  try {
    const result = await callAsDriver("set_boarded", { p_booking_id: passenger.booking_id, p_boarded: boarded });
    if (result === null) return;
    if (result !== "ok") throw new Error(result);
  } catch (err) {
    passenger.boarded = !boarded; // put it back
    trip.boarded += boarded ? -1 : 1;
    dash.message = err.message === "not_allowed" ? "notAllowed" : "actionError";
    renderDashboard();
  }
}

async function toggleTrip(trip) {
  dash.delayFor = null;
  dash.cancelFor = null;
  dash.message = "";
  if (dash.openTrip === trip.trip_id) {
    dash.openTrip = null;
    return renderDashboard();
  }
  dash.openTrip = trip.trip_id;
  renderDashboard();
  try {
    await loadPassengers(trip.trip_id);
  } catch (err) {
    dash.message = "loadError";
  }
  renderDashboard();
}

// ---------- 7. Drawing ----------
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function button(text, className, onClick, disabled) {
  const b = el("button", className, text);
  b.type = "button";
  b.disabled = Boolean(disabled);
  b.addEventListener("click", onClick);
  return b;
}

function tripBadge(trip) {
  if (trip.status === "scheduled") return null;
  const text = trip.status === "delayed" ? dt("st_delayed", trip.delay_minutes) : dt("st_" + trip.status);
  return el("span", "badge trip-badge badge-" + trip.status, text);
}

function renderDashboard() {
  if (dashSection.hidden) return;
  dashTitle.textContent = dt("title");
  dashNote.textContent = dt("note");
  dashRefresh.textContent = dt("refresh");
  dashMessage.textContent = dash.message ? dt(dash.message) : "";
  renderAddForm();

  tripList.innerHTML = "";
  const isVan = driver.vehicle_type === "van";
  if (!isVan) {
    tripList.appendChild(el("p", "muted", dt("notVan")));
    return;
  }
  if (dash.error && !dash.trips) return tripList.appendChild(el("p", "warning", dt("loadError")));
  if (dash.trips === null) return tripList.appendChild(el("p", "muted", dt("loading")));
  if (dash.error) tripList.appendChild(el("p", "warning", dt("loadError")));
  if (dash.trips.length === 0) return tripList.appendChild(el("p", "muted", dt("none")));

  let lastDay = null;
  dash.trips.forEach((trip) => {
    const day = dDay(trip.departs_at);
    if (day !== lastDay) {
      tripList.appendChild(el("h3", "dash-day", dDayHeading(trip.departs_at)));
      lastDay = day;
    }
    tripList.appendChild(renderTrip(trip));
  });
}

function renderTrip(trip) {
  const open = dash.openTrip === trip.trip_id;
  const box = el("article", "trip trip-" + trip.status + (open ? " open" : ""));

  // The summary line: tap to open / close
  const summary = el("button", "trip-summary");
  summary.type = "button";
  summary.setAttribute("aria-expanded", String(open));
  const timeLine = el("span", "trip-time", dTime(trip.departs_at));
  if (trip.status === "delayed") {
    timeLine.textContent += " → " + dTime(plusMinutes(trip.departs_at, trip.delay_minutes));
  }
  summary.appendChild(timeLine);
  const badge = tripBadge(trip);
  if (badge) summary.appendChild(badge);
  summary.appendChild(el("span", "trip-route", dt(trip.direction)));
  summary.appendChild(el("span", "trip-count",
    dt("bookedOf", trip.booked, trip.capacity) + (trip.booked ? " · " + dt("boardedN", trip.boarded) : "")));
  summary.appendChild(el("span", "trip-chevron", open ? "▲" : "▼"));
  summary.addEventListener("click", () => toggleTrip(trip));
  box.appendChild(summary);

  if (open) {
    const detail = el("div", "trip-detail");
    detail.appendChild(renderStatusControls(trip));
    detail.appendChild(renderPassengers(trip));
    box.appendChild(detail);
  }
  return box;
}

function renderStatusControls(trip) {
  const wrap = el("div", "status-controls");
  const busy = dash.busyTrip === trip.trip_id;

  if (busy) {
    wrap.appendChild(el("p", "muted", dt("saving")));
    return wrap;
  }

  if (trip.status === "cancelled") {
    wrap.appendChild(el("p", "warning", dt("cancelledInfo")));
    wrap.appendChild(button(dt("btnReactivate"), "secondary", () => setStatus(trip, "scheduled")));
    return wrap;
  }

  if (dash.delayFor === trip.trip_id) {
    wrap.appendChild(el("p", "ask", dt("delayAsk")));
    const select = el("select", "delay-select");
    DELAY_CHOICES.forEach((m) => {
      const o = el("option", null, dt("minutes", m));
      o.value = m;
      if (m === (trip.delay_minutes || 15)) o.selected = true;
      select.appendChild(o);
    });
    wrap.appendChild(select);
    const row = el("div", "button-row");
    row.appendChild(button(dt("delaySend"), "", () => setStatus(trip, "delayed", Number(select.value))));
    row.appendChild(button(dt("no"), "secondary", () => { dash.delayFor = null; renderDashboard(); }));
    wrap.appendChild(row);
    return wrap;
  }

  if (dash.cancelFor === trip.trip_id) {
    wrap.appendChild(el("p", "ask", dt("cancelAsk")));
    const row = el("div", "button-row");
    row.appendChild(button(dt("cancelYes"), "danger", () => setStatus(trip, "cancelled")));
    row.appendChild(button(dt("no"), "secondary", () => { dash.cancelFor = null; renderDashboard(); }));
    wrap.appendChild(row);
    return wrap;
  }

  const grid = el("div", "status-grid");
  grid.appendChild(button(dt("btnLeaving"), trip.status === "leaving" ? "chosen" : "",
    () => setStatus(trip, "leaving"), trip.status === "leaving"));
  grid.appendChild(button(dt("btnDelay"), trip.status === "delayed" ? "chosen" : "",
    () => { dash.delayFor = trip.trip_id; dash.cancelFor = null; renderDashboard(); }));
  grid.appendChild(button(dt("btnFull"), trip.status === "full" ? "chosen" : "",
    () => setStatus(trip, "full"), trip.status === "full"));
  grid.appendChild(button(dt("btnCancel"), "danger-outline",
    () => { dash.cancelFor = trip.trip_id; dash.delayFor = null; renderDashboard(); }));
  wrap.appendChild(grid);
  if (trip.status !== "scheduled") {
    wrap.appendChild(button(dt("btnNormal"), "secondary", () => setStatus(trip, "scheduled")));
  }
  wrap.appendChild(el("p", "hint", dt("statusHint")));
  return wrap;
}

function renderPassengers(trip) {
  const wrap = el("div", "passengers");
  const list = dash.passengers[trip.trip_id];
  wrap.appendChild(el("h4", null, dt("passengers", list ? list.length : trip.booked)));
  if (!list) {
    wrap.appendChild(el("p", "muted", dt("loading")));
    return wrap;
  }
  if (list.length === 0) {
    wrap.appendChild(el("p", "muted", dt("noPassengers")));
    return wrap;
  }
  wrap.appendChild(el("p", "hint", dt("askCode")));

  // Group by boarding stop; the database already sorted them in the van's order
  let current = null;
  let ul = null;
  list.forEach((p) => {
    if (p.boarding_stop !== current) {
      current = p.boarding_stop;
      const time = stopTime(trip, current);
      wrap.appendChild(el("h5", "stop-heading", time ? dt("boardsAt", current, time) : current));
      ul = el("ul", "passenger-list");
      wrap.appendChild(ul);
    }
    const li = el("li", "passenger" + (p.boarded ? " boarded" : ""));
    const label = el("label");
    const box = el("input");
    box.type = "checkbox";
    box.checked = p.boarded;
    box.disabled = trip.status === "cancelled";
    box.addEventListener("change", () => setBoarded(trip, p, box.checked));
    const text = el("span", "passenger-text");
    text.appendChild(el("strong", null, p.first_name));
    text.appendChild(el("span", "muted", " " + dt("getsOff") + " " + p.dropoff_stop));
    text.appendChild(el("span", "code", p.booking_code));
    label.append(box, text);
    li.appendChild(label);
    ul.appendChild(li);
  });
  return wrap;
}

// ---------- 8. Add a departure ----------
function resetAddForm() {
  addDate.min = limaToday();
  addDate.max = dDay(new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString());
  addDate.value = limaToday();
  addTime.value = "07:00";
  addDirection.value = "to_talara";
  addSeats.value = (driver && driver.seats) || 8;
}

function renderAddForm() {
  const isVan = driver && driver.vehicle_type === "van";
  addToggle.hidden = !isVan;
  addForm.hidden = !isVan || !dash.addOpen;
  addToggle.textContent = dt(dash.addOpen ? "addClose" : "addOpen");
  addForm.querySelectorAll("[data-dt]").forEach((e) => { e.textContent = dt(e.dataset.dt); });
  addDirection.options[0].textContent = dt("to_talara");
  addDirection.options[1].textContent = dt("to_lobitos");
}

addToggle.addEventListener("click", () => {
  dash.addOpen = !dash.addOpen;
  dash.message = "";
  if (dash.addOpen) resetAddForm();
  renderDashboard();
});

dashRefresh.addEventListener("click", () => {
  dash.message = "";
  refreshTrips();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addBtn.disabled = true;
  addBtn.textContent = dt("adding");
  dash.message = "";
  try {
    // Peru has no summer time, so Lima is always UTC-5
    const departs = addDate.value + "T" + addTime.value + ":00-05:00";
    const rows = await callAsDriver("add_my_trip", {
      p_departs_at: departs, p_direction: addDirection.value, p_capacity: Number(addSeats.value)
    });
    if (rows === null) return;
    const result = rows[0].status;
    if (result === "added") {
      dash.message = "added";
      dash.addOpen = false;
      await refreshTrips();
    } else {
      dash.message = DASH_TEXTS[lang]["a_" + result] ? "a_" + result : "actionError";
    }
  } catch (err) {
    dash.message = "actionError";
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = dt("add");
    renderDashboard();
  }
});