// The route board at the top of the page, like the destination board on the
// windscreen of a colectivo van: the two ends big, the stops in between small.
// When the rider chooses From and To, the board shows THEIR trip,
// e.g. "SICHEZ → TALARA, vía Piedritas", and the corridor line lights up that stretch.
// It only reads the page (the From/To dropdowns); app.js doesn't need to know it exists.

(function () {
  const board = document.getElementById("route-board");
  const slots = document.getElementById("slots");
  if (!board || !slots) return;

  const main = board.querySelector(".board-main");
  const via = board.querySelector(".board-via");
  const WORDS = {
    es: { via: "vía ", direct: "directo" },
    en: { via: "via ", direct: "direct" }
  };

  function words() {
    return WORDS[document.documentElement.lang] || WORDS.es;
  }

  function show(from, to, between, oneWay) {
    main.innerHTML = "";
    const a = document.createElement("span");
    a.textContent = from;
    const arrow = document.createElement("span");
    arrow.className = "board-arrow";
    arrow.textContent = oneWay ? "→" : "⇄";
    const b = document.createElement("span");
    b.textContent = to;
    main.append(a, arrow, b);
    via.textContent = between.length ? words().via + between.join(" · ") : words().direct;
  }

  function update() {
    const fromBox = slots.querySelector('select[name="from"]');
    const toBox = slots.querySelector('select[name="to"]');
    if (!fromBox || !toBox) return;

    const stops = Array.from(fromBox.options).map((o) => o.value);
    const a = stops.indexOf(fromBox.value);
    const b = stops.indexOf(toBox.value);
    if (a < 0 || b < 0) return;

    const between = a < b ? stops.slice(a + 1, b) : stops.slice(b + 1, a).reverse();
    show(fromBox.value, toBox.value, between, true);
    lightCorridor(fromBox.value, toBox.value);
  }

  // The corridor line under the board: the trip's stretch in red,
  // its stops in white and the two ends in red
  function lightCorridor(from, to) {
    const corridor = document.getElementById("corridor");
    if (!corridor) return;
    const dots = Array.from(corridor.querySelectorAll("li"));
    const at = (name) => {
      const li = dots.find((d) => d.dataset.stop === name);
      return li ? parseFloat(li.style.getPropertyValue("--at")) : NaN;
    };
    const p = at(from);
    const q = at(to);
    if (isNaN(p) || isNaN(q)) return; // a stop that isn't on the line yet
    const low = Math.min(p, q);
    const high = Math.max(p, q);
    corridor.style.setProperty("--a", low);
    corridor.style.setProperty("--b", high);
    dots.forEach((d) => {
      const x = parseFloat(d.style.getPropertyValue("--at"));
      d.classList.toggle("on", x >= low && x <= high);
      d.classList.toggle("end", d.dataset.stop === from || d.dataset.stop === to);
    });
  }

  // app.js redraws the page often (loading, booking, language): follow it
  new MutationObserver(update).observe(slots, { childList: true, subtree: true });
  slots.addEventListener("change", update);
  update();
})();