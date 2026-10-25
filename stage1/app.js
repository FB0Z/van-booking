// 1. ALL the text, in both languages, in one place
const texts = {
  es: {
    title: "Van Lobitos → Talara",
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
    nameLabel: "Tu nombre (sin apellido)",
    stopLabel: "¿Dónde subes?",
    confirm: "Confirmar",
    cancel: "Cancelar",
    nameMissing: "Escribe tu nombre.",
    saving: "Reservando...",
    invalid: "Revisa tu nombre y el lugar donde subes.",
    bookError: "No se pudo reservar. Revisa tu señal e intenta de nuevo.",
    noticeBooked: (name, stop, time) => "¡Listo, " + name + "! Asiento reservado. Salida: " + time + ". Subes en " + stop + ".",
    noticeFull: "Esa van ya se llenó. Elige otra salida.",
    noticeGone: "Esa salida ya no está disponible.",
    today: "Hoy",
    tomorrow: "Mañana",
    locale: "es-PE",
    noDepartures: "No hay salidas por ahora. Vuelve a revisar más tarde.",


  },
  en: {
    title: "Van Lobitos → Talara",
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
    nameLabel: "Your first name (no surname)",
    stopLabel: "Where do you board?",
    confirm: "Confirm",
    cancel: "Cancel",
    nameMissing: "Please type your first name.",
    saving: "Booking...",
    invalid: "Check your name and where you board.",
    bookError: "Could not book. Check your signal and try again.",
    noticeBooked: (name, stop, time) => "Done, " + name + "! Seat booked. Departure: " + time + ". You board at " + stop + ".",
    noticeFull: "That van just filled up. Please choose another departure.",
    noticeGone: "That departure is no longer available.",
    today: "Today",
    tomorrow: "Tomorrow",
    locale: "en-GB",
    noDepartures: "No departures for now. Check back later."
  }
};

// 2. REAL data from Supabase. Starts empty and is filled by loadSlots()
let slots = [];
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

// Ask Supabase for the upcoming departures, then draw the page
async function loadSlots() {
  status = "loading";
  render();
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/get_slots", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: "{}"
    });
    if (!response.ok) throw new Error("Server answered " + response.status);
    const rows = await response.json();
    slots = rows.map(function (row) {
        return { id: row.trip_id, departs: row.departs_at, time: limaTime(row.departs_at), capacity: row.capacity, booked: row.booked };
    });
    status = "ok";
  } catch (error) {
    console.error(error);
    status = "error";
  }
  render();
}

// Ask the database to book one seat. It answers with a status.
async function bookSeat(tripId, name, stop) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/book_seat", {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_trip_id: tripId, p_first_name: name, p_boarding_stop: stop })
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
      note.textContent = t.noticeBooked(notice.name, notice.stop, formatTime(notice.time, t));
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

  if (slots.length === 0) {
    const box = document.createElement("article");
    box.className = "slot";
    box.innerHTML = `<p>${t.noDepartures}</p><button id="refresh-button">${t.retry}</button>`;
    container.appendChild(box);
    document.getElementById("refresh-button").addEventListener("click", loadSlots);
    return;
  }

  for (const slot of slots) {
    const seatsLeft = slot.capacity - slot.booked;
    const heading = dayLabel(slot.departs, t) + " · " + formatTime(slot.time, t);
    const card = document.createElement("article");
    card.className = "slot";

    if (seatsLeft <= 0) {
      card.classList.add("slot-full");
      card.innerHTML = `<h2>${heading}</h2><p>${t.full}</p>`;
    } else if (openSlot === slot.id) {
      card.innerHTML =
        `<h2>${heading}</h2>` +
        `<p>${t.seatsLeft(seatsLeft)}</p>` +
        `<form class="book-form">` +
          `<label>${t.nameLabel}<input name="first_name" maxlength="30" autocomplete="given-name"></label>` +
          `<label>${t.stopLabel}<select name="stop">` +
            `<option>Lobitos</option><option>Sichez</option><option>Piedritas</option>` +
          `</select></label>` +
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
        const stop = form.elements.stop.value;
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
          const result = await bookSeat(slot.id, name, stop);
          if (["booked", "full", "not_found"].includes(result.status)) {
            notice = { kind: result.status, name: name, stop: stop, time: slot.time };
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
        `<h2>${heading}</h2>` +
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