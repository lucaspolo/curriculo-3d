// Language: Portuguese (pt) or English (en). The page's Portuguese lives in index.html; English comes from
// EN below, keyed by data-i18n (innerHTML), data-i18n-title and data-i18n-label (aria-label).
// Scenes call tr("português", "english") so each string sits next to the code that draws it.

import { pickLanguage } from "./lib/language.js";

const STORE_KEY = "lang";

function detect() {
  let saved = null;
  try {
    saved = window.localStorage.getItem(STORE_KEY);
  } catch {
    // Storage can be blocked (private mode, strict settings); the system language decides then.
  }
  return pickLanguage({
    fromUrl: new URLSearchParams(window.location.search).get("lang"),
    saved,
    systemLanguages: navigator.languages?.length ? navigator.languages : [navigator.language ?? ""],
  });
}

export const lang = detect();
export const locale = lang === "en" ? "en-US" : "pt-BR";
export const tr = (pt, en) => (lang === "en" ? en : pt);

/** Saves the choice and reloads in that language, keeping the visitor on the same section. */
export function switchLanguage(to, sectionId) {
  try {
    window.localStorage.setItem(STORE_KEY, to);
  } catch {
    // Without storage the ?lang= in the URL still carries the choice.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", to);
  url.hash = sectionId ? `#${sectionId}` : "";
  window.location.replace(url);
}

const EN = {
  "nav.label": "Sections",
  "nav.start": "Start",
  "nav.kafka": "Pipelines with Kafka",
  "nav.llm": "LLMs in production",
  "nav.k8s": "Kubernetes and Google Cloud",
  "nav.origins": "Background",
  "nav.contact": "Contact",

  "hero.place": "São Paulo · Brazil",
  "hero.role": "Senior software engineer · <strong>Jusbrasil</strong>",
  "hero.lead":
    "15 years building backend and data systems: pipelines processing tens of millions of documents a day, services handling millions of requests and LLMs in production.",
  "hero.cue": "Scroll to learn a bit more about my projects",

  "kafka.eyebrow": "Jusbrasil · Jan 2022 – present",
  "kafka.title": "Data pipelines with Kafka",
  "kafka.intro":
    "Backend and data engineering on the platform that ingests and serves Brazil's public legal information. Normalization, classification and Trust &amp; Privacy form a pipeline: each stage consumes a Kafka topic, does its job and publishes to the next one.",
  "kafka.f1": "<strong>Tens of millions</strong> of legal proceedings and documents a day",
  "kafka.f2": "Normalization and classification of legal proceedings data",
  "kafka.f3": "Orchestration with <strong>Airflow</strong>, distributed processing with <strong>Spark</strong>, analysis with Pandas",
  "kafka.f4": "Python, Scala, Java, JavaScript and Go",
  "kafka.try": "Click a producer to publish a burst of messages.",

  "privacy.title": "Personal data protection",
  "privacy.intro":
    "Pipelines and mechanisms that protect personal data by combining data classification, named entity recognition (NER) and LLMs, across tens of millions of documents a day.",
  "privacy.f1": '<span class="swatch s-class"></span><strong>Classification</strong> separates what has personal data',
  "privacy.f2": '<span class="swatch s-ner"></span><strong>NER</strong> finds names, ID numbers, addresses and phone numbers',
  "privacy.f3": '<span class="swatch s-llm"></span><strong>LLM</strong> settles the ambiguous cases from context',
  "privacy.aside":
    "In the scene, a fictional lawsuit: the Creature sues Dr. Victor Frankenstein for child support and asks for its data to be protected.",
  "privacy.try": "Hover the highlighted passages to see each decision.",
  "privacy.compare": "Compare with the original",

  "llm.eyebrow": "Jusbrasil · generative AI",
  "llm.title": "LLMs in production, on three fronts",
  "llm.tabs": "LLM fronts",
  "llm.tab1": "Product",
  "llm.tab2": "Code",
  "llm.f1": "<strong>Ingestion pipelines</strong> with LLM steps that turn text into structured data",
  "llm.f2": "<strong>Agents in the product</strong> that call tools and answer citing their sources",
  "llm.f3": "<strong>Coding agents</strong> in the development workflow, with human review",
  "llm.courses": "Courses on LangChain, AI agents and prompt engineering (Alura, 2025).",
  "llm.try": "The tabs switch fronts; left alone, they rotate by themselves.",

  "k8s.eyebrow": "Jusbrasil · infrastructure",
  "k8s.title": "Kubernetes and Google Cloud",
  "k8s.intro":
    "The cluster where all of this runs, deployed with Google Cloud tooling and serving <strong>millions of requests a day</strong>. Each kind of workload scales for its own reason.",
  "k8s.f1": "<strong>front</strong> and <strong>api</strong> scale with requests; the front end is Next.js",
  "k8s.f2": "<strong>pipeline</strong> scales with Kafka topic lag",
  "k8s.f3": "one-off and scheduled <strong>jobs</strong> run to completion",
  "k8s.f4": "Rolling deploys, canary with automatic rollback and replicas across two zones",
  "k8s.try": "Click a pod to knock it down and watch Kubernetes bring it back.",
  "k8s.deploy": "Deploy",
  "k8s.baddeploy": "Buggy deploy",
  "k8s.job": "Run a job",

  "magalu.eyebrow": "Magazine Luiza · Dec 2018 – Jan 2022",
  "magalu.title": "Shipping cost at scale",
  "magalu.intro":
    "From developer to senior developer on critical systems in Python, C#, Node.js and Go, on Kubernetes across Google Cloud, AWS and Azure.",
  "magalu.f1":
    "Shipping cost calculation for Magalu and its marketplace partners, with <strong>millions of requests a day</strong>",
  "magalu.f2": "Resilient integrations with Correios, Bling and AnyMarket",
  "magalu.f3": "Seller tools: shipping labels, Magalu Entregas and freight cost allocation",
  "magalu.f4": "Operating through peaks such as Black Friday",
  "magalu.try": "Trucks leave the distribution center once they are full. On Black Friday, watch the package queue soar.",
  "magalu.blackfriday": "Simulate Black Friday",

  "porto.eyebrow": "Porto Seguro · Jul 2011 – Dec 2018",
  "porto.title": "From proposal to policy",
  "porto.intro":
    "Seven and a half years as a systems analyst on insurance policy issuance: pipelines that received the proposal and, at the end, issued the policy.",
  "porto.f1": "Analysis and development in <strong>Java</strong> and <strong>Informix 4GL</strong>",
  "porto.f2": "Informix and Oracle relational databases",
  "porto.f3": "Data modeling and systems engineering",
  "porto.try": "Follow a customer: they hand in the proposal and drive off with the policy issued.",

  "origins.eyebrow": "Where I come from",
  "origins.title": "From soldering iron to software",
  "origins.t1": "Programming technician, IFSP",
  "origins.t2": "Circuit assembly and soldering, Luxxel",
  "origins.t3": "IBGE census taker, door to door",
  "origins.t4": "Mobile websites in PHP, Mobint",
  "origins.t5": 'Systems analyst, <a href="#porto">Porto Seguro</a>',
  "origins.t6": "Information Systems, Anhanguera",
  "origins.t7": "Applied Statistics, FMU",
  "origins.t8": 'Senior developer, <a href="#magalu">Magazine Luiza</a>',
  "origins.t9": 'Senior software engineer, <a href="#kafka">Jusbrasil</a>',
  "origins.t10": "Postgraduate in Telecommunication Networks, Estácio",
  "origins.today": "today",
  "origins.t11": "I write on my blog about what I am learning",
  "origins.radio": "Ham radio operator in my spare time: signals still interest me as much as code.",
  "origins.try": "Hover the objects on the desk or the lines above.",

  "contact.eyebrow": "Contact",
  "contact.title": "Let's talk",
  "contact.lead": "Software engineering, data at scale or LLMs in production: reach me wherever you prefer.",
  "contact.experience": "Experience",
  "contact.jus": "Senior software engineer · Jan 2022 – present",
  "contact.jusChip": "Jusbrasil <span>2022–present</span>",
  "contact.magalu": "Developer → Senior developer · Dec 2018 – Jan 2022",
  "contact.porto": "Systems analyst · Jul 2011 – Dec 2018",
  "contact.mobint": "Mobile website development intern · Feb – Apr 2011",
  "contact.certs": "Certifications",
  "contact.prompt": "Prompt Engineering",
  "contact.back": "Back to the top",
};

/** Applies the English strings to the page; Portuguese needs nothing, it is already in the HTML. */
export function applyPageLanguage() {
  document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  document.querySelectorAll("[data-lang]").forEach((a) => a.setAttribute("aria-current", String(a.dataset.lang === lang)));
  if (lang !== "en") return;
  document.title = "Lucas Polo · Software Engineer";
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      "content",
      "Lucas Polo, senior software engineer: 15 years in backend and data systems, with Kafka, Spark, Airflow, Kubernetes and LLMs in production.",
    );
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const text = EN[el.dataset.i18n];
    if (text !== undefined) el.innerHTML = text;
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const text = EN[el.dataset.i18nTitle];
    if (text !== undefined) el.title = text;
  });
  document.querySelectorAll("[data-i18n-label]").forEach((el) => {
    const text = EN[el.dataset.i18nLabel];
    if (text !== undefined) el.setAttribute("aria-label", text);
  });
}
