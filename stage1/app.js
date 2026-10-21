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
    nameMissing: "Escribe tu nombre."

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
    nameMissing: "Please type your first name."

  }
};

// 2. REAL data from Supabase. Starts empty and is filled by loadSlots()
let slots = [];
let status = "loading"; // "loading", "ok" or "error"
let openSlot = null; // the trip id whose booking form is open, or null

// Turn a UTC moment from the database into Lima time, like "07:00"
function limaTime(isoString) {
  return new Date(isoString).toLocaleTimeString("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
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
      return { id: row.trip_id, time: limaTime(row.departs_at), capacity: row.capacity, booked: row.booked };
    });
    status = "ok";
  } catch (error) {
    console.error(error);
    status = "error";
  }
  render();
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
   for (const slot of slots) {
    const seatsLeft = slot.capacity - slot.booked;
    const card = document.createElement("article");
    card.className = "slot";

    if (seatsLeft <= 0) {
      card.classList.add("slot-full");
      card.innerHTML = `<h2>${formatTime(slot.time, t)}</h2><p>${t.full}</p>`;
    } else if (openSlot === slot.id) {
      card.innerHTML =
        `<h2>${formatTime(slot.time, t)}</h2>` +
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
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const name = form.elements.first_name.value.trim();
        const stop = form.elements.stop.value;
        if (name === "") {
          form.querySelector(".form-message").textContent = t.nameMissing;
          return;
        }
        console.log("Would book:", slot.id, name, stop); // 1c-2b replaces this line
      });
    } else {
      card.innerHTML =
        `<h2>${formatTime(slot.time, t)}</h2>` +
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