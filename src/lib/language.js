// Pure language choice, kept apart from i18n.js (which reads window at import) so it can be tested in Node.

export const SUPPORTED = ["pt", "en"];

/** Link (?lang=) first, then the visitor's saved choice, then the system language; English otherwise. */
export function pickLanguage({ fromUrl, saved, systemLanguages = [] }) {
  if (SUPPORTED.includes(fromUrl)) return fromUrl;
  if (SUPPORTED.includes(saved)) return saved;
  for (const l of systemLanguages) {
    const code = l.toLowerCase();
    if (code.startsWith("pt")) return "pt";
    if (code.startsWith("en")) return "en";
  }
  return "en";
}
