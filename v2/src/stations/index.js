import { createHero } from "./hero.js";
import { createKafka } from "./kafka.js";
import { createPrivacy } from "./privacy.js";
import { createLlm } from "./llm.js";
import { createK8s } from "./k8s.js";
import { createMagalu } from "./magalu.js";
import { createPorto } from "./porto.js";
import { createOrigins } from "./origins.js";
import { createOverview } from "./overview.js";

// Keyed by the `data-station` attribute of each <section> in index.html; the page order defines the journey.
export const STATIONS = {
  hero: createHero,
  kafka: createKafka,
  privacy: createPrivacy,
  llm: createLlm,
  k8s: createK8s,
  magalu: createMagalu,
  porto: createPorto,
  origins: createOrigins,
  overview: createOverview,
};
