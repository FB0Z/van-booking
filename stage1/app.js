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

// 2. FAKE data for now. In Step 1b this comes from Supabase
const capacity = 8;
const slots = [
  { time: "07:00", booked: 3 },
  { time: "09:00", booked: 8 },
  { time: "11:00", booked: 1 }
];

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
    const seatsLeft = capacity - slot.booked;
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