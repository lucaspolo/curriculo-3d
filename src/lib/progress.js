// Pure scroll math, kept free of three.js and the DOM so it runs under `node --test`.

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export const smootherstep = (t) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * Continuous station index for a viewport center: 2.5 means halfway between
 * the centers of sections 2 and 3. `centers` must be ascending.
 */
export function stationProgress(centers, viewportCenter) {
  const last = centers.length - 1;
  if (last < 0) return 0;
  if (viewportCenter <= centers[0]) return 0;
  if (viewportCenter >= centers[last]) return last;
  let i = 0;
  while (viewportCenter >= centers[i + 1]) i++;
  return i + (viewportCenter - centers[i]) / (centers[i + 1] - centers[i]);
}

/**
 * Eases the fractional part so the camera rests while a section is being read
 * and only travels in the middle of the scroll between two sections.
 */
export function travel(progress, hold = 0.22) {
  const i = Math.floor(progress);
  const t = progress - i;
  return { from: i, to: i + 1, t: smootherstep((t - hold) / (1 - 2 * hold)) };
}

/** How much a station is "in view": 1 when centered, 0 one station away. */
export const focusOf = (progress, index) => clamp(1 - Math.abs(progress - index));
