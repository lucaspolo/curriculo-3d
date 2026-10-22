// One wheel or trackpad gesture moves exactly one topic. Native CSS snap alone picks the *nearest*
// section, so a short swipe snaps back and a long one with momentum overshoots. Touch, keyboard and
// the scrollbar keep the native snap; this only handles wheel events on wide screens.

const IDLE_MS = 220; // a gap longer than this between wheel events starts a new gesture
const THRESHOLD = 30; // pixels of wheel delta before a gesture counts, so tiny nudges do nothing

export function stepByWheel(sections, { isNarrow }) {
  let lastWheel = 0;
  let accum = 0;
  let locked = false;

  const current = () => {
    const mid = window.innerHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    sections.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const waitUntilSettled = () => {
    let lastY = window.scrollY;
    const timer = setInterval(() => {
      const settled = window.scrollY === lastY;
      lastY = window.scrollY;
      // Stay locked while trackpad momentum keeps firing, or the leftover inertia would skip a topic.
      if (settled && performance.now() - lastWheel > IDLE_MS) {
        clearInterval(timer);
        locked = false;
      }
    }, 100);
  };

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || isNarrow() || e.deltaY === 0) return; // pinch zoom, phones, horizontal swipes
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now;

      const index = current();
      const dir = Math.sign(e.deltaY);
      // A section taller than the screen scrolls natively until its edge comes into view.
      const r = sections[index].getBoundingClientRect();
      if ((dir > 0 && r.bottom > window.innerHeight + 2) || (dir < 0 && r.top < -2)) {
        if (!locked) return;
      }

      e.preventDefault();
      if (locked) return;
      if (gap > IDLE_MS) accum = 0;
      accum += e.deltaY;
      if (Math.abs(accum) < THRESHOLD) return;

      accum = 0;
      const next = Math.min(sections.length - 1, Math.max(0, index + dir));
      if (next === index) return;
      locked = true;
      // No explicit behavior: the CSS scroll-behavior applies, which is instant under reduced motion.
      sections[next].scrollIntoView({ block: "center" });
      waitUntilSettled();
    },
    { passive: false },
  );
}
