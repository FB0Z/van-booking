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
    pm: "p. m."
  },
  en: {
    title: "Van Lobitos → Talara",
    intro: "Book your seat and find out if the van is leaving.",
    seatsLeft: (n) => (n === 1 ? "1 seat left" : n + " seats left"),
    full: "Van confirmed, leaving",
    book: "Book a seat",
    langButton: "Español",
    am: "am",
    pm: "pm"
  }
};

// 2. REAL data from Supabase. Starts empty and is filled by loadSlots()
let slots = [];

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
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/get_slots", {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: "{}"
  });
  const rows = await response.json();
  slots = rows.map(function (row) {
    return { time: limaTime(row.departs_at), capacity: row.capacity, booked: row.booked };
  });
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

  for (const slot of slots) {
    const seatsLeft = slot.capacity - slot.booked;
    const card = document.createElement("article");
    card.className = "slot";

    if (seatsLeft <= 0) {
      card.classList.add("slot-full");
      card.innerHTML = `<h2>${formatTime(slot.time, t)}</h2><p>${t.full}</p>`;
    } else {
      card.innerHTML =
        `<h2>${formatTime(slot.time, t)}</h2>` +
        `<p>${t.seatsLeft(seatsLeft)}</p>` +
        `<button>${t.book}</button>`;
    }
    container.appendChild(card);
  }
}

// 5. Switch language when the button is tapped, then draw again
document.getElementById("lang-button").addEventListener("click", function () {
  lang = lang === "es" ? "en" : "es";
  render();
});

render();
loadSlots();
