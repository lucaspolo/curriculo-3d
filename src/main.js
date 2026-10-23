// Entry point: the HTML already holds the whole resume; this adds the 3D journey on top when WebGL exists.
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./styles.css";
import { stationProgress } from "./lib/progress.js";
import { stepByWheel } from "./wheel-step.js";

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const sections = [...document.querySelectorAll("[data-station]")];
const dots = [...document.querySelectorAll("[data-dot]")];
let centers = [];
let onProgress = () => {};

// Keep in sync with the 800px breakpoint in styles.css and Stage.resize().
const narrow = () => window.innerWidth <= 800;

// Desktop: a station is in place when its section is centered. Phone: when its card's top edge
// reaches the read line, leaving the upper part of the screen for the scene. The value lives in
// styles.css (--read-line) because the scroll snap uses it too.
const READ_LINE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--read-line")) || 0.58;
const measure = () => {
  centers = sections.map((s) =>
    narrow() ? s.querySelector(".card").getBoundingClientRect().top + window.scrollY : s.offsetTop + s.offsetHeight / 2,
  );
};
const onScroll = () => {
  const p = stationProgress(centers, window.scrollY + window.innerHeight * (narrow() ? READ_LINE : 0.5));
  const active = Math.round(p);
  dots.forEach((d, i) => d.classList.toggle("active", i === active));
  onProgress(p);
};

measure();
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });
stepByWheel(sections, { isNarrow: narrow });
window.addEventListener("resize", () => {
  measure();
  onScroll();
});
document.fonts?.ready.then(() => {
  measure();
  onScroll();
});

if (webglAvailable()) {
  start();
} else {
  document.documentElement.classList.add("no-webgl");
}

/** Scrolls (phone only) so the card's top sits on the read line again, with the scene above it. */
function revealScene(section) {
  if (!narrow()) return;
  const card = section.querySelector(".card");
  const top = card.getBoundingClientRect().top + window.scrollY - window.innerHeight * READ_LINE;
  // No explicit behavior: the CSS scroll-behavior applies, which is instant under reduced motion.
  if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top });
}

/** Horizontal slice of the screen (0–1) left free by the text cards and the section dots. */
function freeArea() {
  const w = window.innerWidth;
  // Any card beside a scene works: they all share the same width and left margin.
  const card = document.querySelector(".panel:not(.centered) .card").getBoundingClientRect();
  const dots = document.querySelector(".dots").getBoundingClientRect();
  return { left: (card.right + 24) / w, right: (dots.left - 12) / w };
}

async function start() {
  // three.js only loads when it can be used, so the plain resume stays light.
  const [{ Stage }, { STATIONS }] = await Promise.all([import("./stage.js"), import("./stations/index.js")]);
  const stations = sections.map((s) => STATIONS[s.dataset.station]());
  const stage = new Stage({
    canvas: document.getElementById("stage"),
    labels: document.getElementById("labels"),
    tooltip: document.getElementById("tooltip"),
    stations,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    freeArea,
  });
  onProgress = (p) => stage.setProgress(p);
  onScroll();

  // Stations with their own controls in the card (e.g. tabs) wire them up themselves.
  stations.forEach((s, i) => s.bindUi?.(sections[i]));

  // On phones the card sits over the scene once the visitor scrolls down to its buttons. Any button in
  // a card is there to change the scene, so pressing one scrolls back to where the scene is visible.
  sections.forEach((section) =>
    section.querySelectorAll(".card button").forEach((btn) => btn.addEventListener("click", () => revealScene(section))),
  );

  document.querySelectorAll("[data-action]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [id, action] = btn.dataset.action.split(":");
      const result = stations.find((s) => s.id === id)?.actions?.[action]?.();
      if (typeof result === "boolean") btn.setAttribute("aria-pressed", String(result));
    }),
  );

  if (import.meta.env.DEV) window.stage = stage; // handy in the browser console while developing
}
