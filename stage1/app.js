// 1. ALL the text, in both languages, in one place
const texts = {
  es: {
    title: "Van Lobitos ↔ Talara",
    intro: "Reserva tu asiento y sabe si la van sale.",
    seatsLeft: (n) => (n === 1 ? "1 asiento libre" : n + " asientos libres"),
    full: "Van confirmada, sale",
    book: "Reservar asiento",
    langButton: "English",
    am: "a. m.",
    pm: "p. m.",
    loading: "Cargando salidas...",
    offline: "Sin conexión. Revisa tu señal e intenta de nuevo.",
    retry: "Intentar de nuevo",
    from: "Desde",
    to: "Hasta",
    swap: "Cambiar dirección",
    journey: (from, to, minutes) => from + " → " + to + " · aprox. " + minutes + " min",
    nameLabel: "Tu nombre (sin apellido)",
    confirm: "Confirmar",
    cancel: "Cancelar",
    nameMissing: "Escribe tu nombre.",
    saving: "Reservando...",
    invalid: "Revisa tu nombre y tus paradas.",
    bookError: "No se pudo reservar. Revisa tu señal e intenta de nuevo.",
    noticeBooked: (name, from, to, time) => "¡Listo, " + name + "! Asiento reservado. Salida: " + time + ", de " + from + " a " + to + ".",
    noticeFull: "Esa van ya se llenó. Elige otra salida.",
    noticeGone: "Esa salida ya no está disponible.",
    today: "Hoy",
    tomorrow: "Mañana",
    locale: "es-PE",
    noDepartures: "No hay salidas en esta dirección por ahora. Vuelve a revisar más tarde."
  },
  en: {
    title: "Van Lobitos ↔ Talara",
    intro: "Book your seat and find out if the van is leaving.",
    seatsLeft: (n) => (n === 1 ? "1 seat left" : n + " seats left"),
    full: "Van confirmed, leaving",
    book: "Book a seat",
    langButton: "Español",
    am: "am",
    pm: "pm",
    loading: "Loading departures...",
    offline: "No connection. Check your signal and try again.",
    retry: "Try again",
    from: "From",
    to: "To",
    swap: "Swap direction",
    journey: (from, to, minutes) => from + " → " + to + " · about " + minutes + " min",
    nameLabel: "Your first name (no surname)",
    confirm: "Confirm",
    cancel: "Cancel",
    nameMissing: "Please type your first name.",
    saving: "Booking...",
    invalid: "Check your name and your stops.",
    bookError: "Could not book. Check your signal and try again.",
    noticeBooked: (name, from, to, time) => "Done, " + name + "! Seat booked. Departure: " + time + ", " + from + " to " + to + ".",
    noticeFull: "That van just filled up. Please choose another departure.",
    noticeGone: "That departure is no longer available.",
    today: "Today",
    tomorrow: "Tomorrow",
    locale: "en-GB",
    noDepartures: "No departures in this direction for now. Check back later."
  }
};

// 2. REAL data from Supabase. Starts empty and is filled by loadSlots()
let slots = [];
let stops = []; // [{ name, km }], furthest from Talara first
let from = null; // the rider's start stop
let to = null; // the rider's end stop
let status = "loading"; // "loading", "ok" or "error"
let openSlot = null; // the trip id whose booking form is open, or null
let notice = null; // the message shown after a booking attempt, or null

// Turn a UTC moment from the database into Lima time, like "07:00"
function limaTime(isoString) {
  return new Date(isoString).toLocaleTimeString("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}

// The calendar day in Lima, like "2026-10-28"
function limaDay(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// "Hoy", "Mañana", or a short date like "mié 28 oct"
function dayLabel(isoString, t) {
  const departs = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (limaDay(departs) === limaDay(now)) return t.today;
  if (limaDay(departs) === limaDay(tomorrow)) return t.tomorrow;
  return departs.toLocaleDateString(t.locale, {
    timeZone: "America/Lima", weekday: "short", day: "numeric", month: "short"
  });
}

// How far a stop is from Talara, in km
function kmOf(name) {
  return stops.find(function (s) { return s.name === name; }).km;
}

// Which way the rider is going: km going down means towards Talara
function direction() {
  return kmOf(from) > kmOf(to) ? "to_talara" : "to_lobitos";
}

// Minutes after the van leaves the start of the line until it reaches a stop
function minutesAfterStart(name, tripDirection) {
  const all = stops.map(function (s) { return s.minutes; });
  const start = tripDirection === "to_talara" ? Math.max(...all) : Math.min(...all);
  const stop = stops.find(function (s) { return s.name === name; });
  return Math.abs(start - stop.minutes);
}

// A moment some minutes later, like "the departure + 8 minutes"
function addMinutes(isoString, minutes) {
  return new Date(new Date(isoString).getTime() + minutes * 60000).toISOString();
}

// Ask Supabase to run one of our database functions and give back its rows
async function callRpc(name) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: "{}"
  });
  if (!response.ok) throw new Error("Server answered " + response.status);
  return response.json();
}

// Ask Supabase for the departures and the stops, then draw the page
async function loadSlots() {
  status = "loading";
  render();
  try {
    // Both requests go out at once; if either fails, the page shows "try again"
    const [slotRows, stopRows] = await Promise.all([callRpc("get_slots"), callRpc("get_stops")]);
    slots = slotRows.map(function (row) {
      return { id: row.trip_id, departs: row.departs_at, time: limaTime(row.departs_at), capacity: row.capacity, booked: row.booked, vehicle: { es: row.vehicle_es, en: row.vehicle_en }, direction: row.direction };
    });
      stops = stopRows.map(function (row) { return { name: row.name, km: Number(row.km_from_talara), minutes: Number(row.minutes_from_talara) }; });

    // First visit (or a stop was switched off): start at the far end, go to the other end
    const names = stops.map(function (s) { return s.name; });
    if (!names.includes(from)) from = names[0];
    if (!names.includes(to) || to === from) to = names[names.length - 1] === from ? names[0] : names[names.length - 1];
    status = "ok";
  } catch (error) {
    console.error(error);
    status = "error";
  }
  render();
}

// Ask the database to book one seat. It answers with a status.
async function bookSeat(tripId, name, boarding, dropoff) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/book_seat", {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_trip_id: tripId, p_first_name: name, p_boarding_stop: boarding, p_dropoff_stop: dropoff })
  });
  if (!response.ok) throw new Error("Server answered " + response.status);
  const rows = await response.json();
  return rows[0];
}

// 3. Turn "07:00" into "7:00 a. m." (or "7:00 am")
function formatTime(time, t) {
  const hour = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);
  return (hour % 12 || 12) + ":" + minutes + " " + (hour < 12 ? t.am : t.pm);
}

// The <option>s for one dropdown. The stop picked in the other dropdown is greyed out.
function stopOptions(selected, blocked) {
  return stops.map(function (s) {
    return `<option${s.name === selected ? " selected" : ""}${s.name === blocked ? " disabled" : ""}>${s.name}</option>`;
  }).join("");
}

// 4. Draw the page in the chosen language
let lang = "es";

function render() {
  const t = texts[lang];
  document.documentElement.lang = lang;
  document.getElementById("title").textContent = t.title;
  document.getElementById("intro").textContent = t.intro;
  document.getElementById("lang-button").textContent = t.langButton;

  const container = document.getElementById("slots");
  container.innerHTML = "";

  if (notice) {
    const note = document.createElement("p");
    note.className = "notice notice-" + notice.kind;
    note.setAttribute("role", "status");
    if (notice.kind === "booked") {
      note.textContent = t.noticeBooked(notice.name, notice.from, notice.to, formatTime(notice.time, t));
    } else if (notice.kind === "full") {
      note.textContent = t.noticeFull;
    } else {
      note.textContent = t.noticeGone;
    }
    container.appendChild(note);
  }

  if (status !== "ok") {
    const box = document.createElement("article");
    box.className = "slot";
    if (status === "loading") {
      box.innerHTML = `<p>${t.loading}</p>`;
    } else {
      box.innerHTML = `<p>${t.offline}</p><button id="retry-button">${t.retry}</button>`;
    }
    container.appendChild(box);
    if (status === "error") {
      document.getElementById("retry-button").addEventListener("click", loadSlots);
    }
    return;
  }

  // The From / To box, with the swap button
  const where = document.createElement("article");
  where.className = "slot where";
  where.innerHTML =
    `<div class="where-stops">` +
      `<label>${t.from}<select name="from">${stopOptions(from, to)}</select></label>` +
      `<label>${t.to}<select name="to">${stopOptions(to, from)}</select></label>` +
    `</div>` +
    `<button type="button" class="swap" aria-label="${t.swap}" title="${t.swap}">⇅</button>`;
  container.appendChild(where);

  where.querySelector("select[name=from]").addEventListener("change", function (event) {
    from = event.target.value;
    openSlot = null;
    notice = null;
    render();
  });
  where.querySelector("select[name=to]").addEventListener("change", function (event) {
    to = event.target.value;
    openSlot = null;
    notice = null;
    render();
  });
  where.querySelector(".swap").addEventListener("click", function () {
    const old = from;
    from = to;
    to = old;
    openSlot = null;
    notice = null;
    render();
  });

  // Only the vans going the rider's way
  const shown = slots.filter(function (slot) { return slot.direction === direction(); });

  if (shown.length === 0) {
    const box = document.createElement("article");
    box.className = "slot";
    box.innerHTML = `<p>${t.noDepartures}</p><button id="refresh-button">${t.retry}</button>`;
    container.appendChild(box);
    document.getElementById("refresh-button").addEventListener("click", loadSlots);
    return;
  }

  for (const slot of shown) {
    const seatsLeft = slot.capacity - slot.booked;

    // This rider's own times: when the van reaches their From stop, and their To stop
    const boardMin = minutesAfterStart(from, slot.direction);
    const arriveMin = minutesAfterStart(to, slot.direction);
    const boardAt = addMinutes(slot.departs, boardMin);
    const arriveAt = addMinutes(slot.departs, arriveMin);
    const top =
      `<p class="slot-day">${dayLabel(boardAt, t)}</p>` +
      `<h2>${formatTime(limaTime(boardAt), t)} <span class="arrow">→</span> ${formatTime(limaTime(arriveAt), t)}</h2>` +
      `<p class="slot-route">${t.journey(from, to, arriveMin - boardMin)}</p>`;

    const card = document.createElement("article");
    card.className = "slot";

    if (seatsLeft <= 0) {
      card.classList.add("slot-full");
      card.innerHTML = top + `<p>${t.full}</p>`;
    } else if (openSlot === slot.id) {
      card.innerHTML =
        top +
        `<p>${t.seatsLeft(seatsLeft)}</p>` +
        `<form class="book-form">` +
          `<label>${t.nameLabel}<input name="first_name" maxlength="30" autocomplete="given-name"></label>` +
          `<p class="form-message" role="alert"></p>` +
          `<button type="submit">${t.confirm}</button>` +
          `<button type="button" class="secondary">${t.cancel}</button>` +
        `</form>`;

      const form = card.querySelector("form");
      form.querySelector(".secondary").addEventListener("click", function () {
        openSlot = null;
        render();
      });

      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const name = form.elements.first_name.value.trim();
        const message = form.querySelector(".form-message");
        const buttons = form.querySelectorAll("button");
        const submit = form.querySelector("button[type=submit]");
        if (name === "") {
          message.textContent = t.nameMissing;
          return;
        }

        // Lock the form so a double tap can't book two seats
        buttons.forEach(function (b) { b.disabled = true; });
        submit.textContent = t.saving;
        message.textContent = "";

        try {
          const result = await bookSeat(slot.id, name, from, to);
          if (["booked", "full", "not_found"].includes(result.status)) {
            notice = { kind: result.status, name: name, from: from, to: to, time: limaTime(boardAt) };
            openSlot = null;
            await loadSlots();
            return;
          }
          message.textContent = t.invalid;
        } catch (error) {
          console.error(error);
          message.textContent = t.bookError;
        }
        buttons.forEach(function (b) { b.disabled = false; });
        submit.textContent = t.confirm;
      });

    } else {
      card.innerHTML =
        top +
        `<p>${t.seatsLeft(seatsLeft)}</p>` +
        `<button class="book-button">${t.book}</button>`;
      card.querySelector(".book-button").addEventListener("click", function () {
        openSlot = slot.id;
        render();
      });
    }

    container.appendChild(card);
    if (openSlot === slot.id && seatsLeft > 0) {
      card.querySelector("input").focus();
    }
  }
}

// 5. Switch language when the button is tapped, then draw again
document.getElementById("lang-button").addEventListener("click", function () {
  lang = lang === "es" ? "en" : "es";
  render();
});

loadSlots();