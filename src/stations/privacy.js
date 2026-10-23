// Trust & Privacy scene. Foreground: a readable (and entirely fictional) court filing, the Creature suing
// Dr. Victor Frankenstein for child support, goes through classification, NER, LLM disambiguation and
// anonymization. Background: the same pipeline at scale (privacy-cascade.js).
import * as THREE from "three";
import { COLORS, glow, label, pickable } from "../lib/kit.js";
import { tr, locale } from "../i18n.js";
import { createCascade } from "./privacy-cascade.js";

const CW = 1024;
const CH = 1400;
const PAGE_W = 6.8;
const PAGE_H = (PAGE_W * CH) / CW;
const PAGE_POS = new THREE.Vector3(-3.4, 4.6, 0);
const BODY_FONT = 34;
const LINE_H = 54;
const MARGIN = 70;

const TYPES = {
  PESSOA: { name: tr("PESSOA", "PERSON"), color: COLORS.privacy },
  CPF: { name: tr("CPF", "TAX ID"), color: COLORS.message },
  ENDERECO: { name: tr("ENDEREÇO", "ADDRESS"), color: COLORS.warn },
  TELEFONE: { name: tr("TELEFONE", "PHONE"), color: COLORS.kafka },
};

// Every name, number and address below is fictional; the CPFs have invalid check digits on purpose.
const E = {
  criatura: {
    text: tr("a Criatura", "the Creature"),
    ner: "?",
    llm: { type: "PESSOA", note: tr("aqui a expressão identifica o autor da ação", "here the phrase identifies the plaintiff") },
  },
  cpfAutor: { text: "181.818.181-18", type: "CPF" },
  endereco: {
    text: tr("Rua Mary Shelley, 1818, Ingolstadt", "1818 Mary Shelley St., Ingolstadt"),
    ner: tr("PESSOA?", "PERSON?"),
    llm: {
      type: "ENDERECO",
      note: tr(
        "é nome de rua, não de pessoa; continua sendo dado pessoal (endereço)",
        "it is a street name, not a person; still personal data (an address)",
      ),
    },
  },
  victor: { text: "Victor Frankenstein", type: "PESSOA" },
  cpfReu: { text: "123.456.789-00", type: "CPF" },
  telefone: { text: "(00) 91818-1818", type: "TELEFONE" },
  henry: { text: "Henry Clerval", type: "PESSOA" },
  livro: {
    text: tr("“Frankenstein, ou o Moderno Prometeu”", "“Frankenstein; or, The Modern Prometheus”"),
    ner: tr("PESSOA?", "PERSON?"),
    llm: { keep: true, note: tr("é título de livro, não dado pessoal; fica no texto", "it is a book title, not personal data; it stays in the text") },
  },
};
const ENTITIES = Object.values(E);
const AMBIGUOUS = ENTITIES.filter((e) => e.llm);

// Line breaks are part of each version: the page has a fixed width, so English wraps differently.
const LINES = tr(
  [
    { style: "title", text: "PODER JUDICIÁRIO" },
    { style: "subtitle", text: "Vara de Família de Genebra" },
    { style: "meta", text: "Processo nº 1818.0001-07 · Ação de alimentos" },
    { style: "badge", text: "SEGREDO DE JUSTIÇA" },
    { style: "gap" },
    { parts: ["AUTOR: ", E.criatura, ", sem nome de registro,"] },
    { parts: ["CPF ", E.cpfAutor, ", residente na"] },
    { parts: [E.endereco, "."] },
    { parts: ["RÉU: ", E.victor, ", CPF ", E.cpfReu, ","] },
    { parts: ["telefone ", E.telefone, "."] },
    { style: "gap" },
    { parts: ["O autor alega que o réu o criou em"] },
    { parts: ["laboratório e o abandonou sem prestar"] },
    { parts: ["alimentos, conforme o art. 1.694 do"] },
    { parts: ["Código Civil. Testemunha: ", E.henry, "."] },
    { parts: ["A obra ", E.livro] },
    { parts: ["não se confunde com as partes. O autor"] },
    { parts: ["pede a proteção dos seus dados pessoais."] },
    { style: "gap" },
    { style: "meta", text: "Genebra, 31 de outubro de 1818." },
    { style: "legend" },
  ],
  [
    { style: "title", text: "JUDICIAL BRANCH" },
    { style: "subtitle", text: "Family Court of Geneva" },
    { style: "meta", text: "Case no. 1818.0001-07 · Child support claim" },
    { style: "badge", text: "UNDER SEAL" },
    { style: "gap" },
    { parts: ["PLAINTIFF: ", E.criatura, ", with no registered"] },
    { parts: ["name, tax ID ", E.cpfAutor, ", residing at"] },
    { parts: [E.endereco, "."] },
    { parts: ["DEFENDANT: ", E.victor, ","] },
    { parts: ["tax ID ", E.cpfReu, ", phone ", E.telefone, "."] },
    { style: "gap" },
    { parts: ["The plaintiff claims the defendant created"] },
    { parts: ["it in a laboratory and abandoned it without"] },
    { parts: ["support, under art. 1,694 of the Civil"] },
    { parts: ["Code. Witness: ", E.henry, "."] },
    { parts: ["The work ", E.livro] },
    { parts: ["is not to be confused with the parties. The"] },
    { parts: ["plaintiff asks that its personal data be protected."] },
    { style: "gap" },
    { style: "meta", text: "Geneva, October 31, 1818." },
    { style: "legend" },
  ],
);

const finalType = (e) => (e.llm ? (e.llm.keep ? null : e.llm.type) : e.type);

/** Draws the page; in "anon" mode personal data is replaced by [TYPE] placeholders. Returns span rects. */
function drawPage(ctx, mode) {
  ctx.fillStyle = "#d9dde6";
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = "#9aa3b5";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, CW - 48, CH - 48);
  const font = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
  const rects = new Map();
  let y = 130;
  LINES.forEach((line) => {
    ctx.fillStyle = "#1a2236";
    ctx.textAlign = "left";
    if (line.style === "gap") {
      y += LINE_H * 0.6;
      return;
    }
    if (line.style === "title" || line.style === "subtitle") {
      ctx.font = line.style === "title" ? font(700, 36) : font(400, 28);
      ctx.textAlign = "center";
      ctx.fillText(line.text, CW / 2, y);
      y += line.style === "title" ? 48 : 52;
      return;
    }
    if (line.style === "legend") {
      // Color key for the NER highlights, at the foot of the page.
      ctx.font = font(600, 23);
      const items = [...Object.values(TYPES), { name: tr("AMBÍGUO → LLM", "AMBIGUOUS → LLM"), color: COLORS.llm }];
      let lx = MARGIN;
      const ly = CH - 80;
      items.forEach((it) => {
        ctx.fillStyle = `#${new THREE.Color(it.color).getHexString()}`;
        ctx.fillRect(lx, ly - 18, 20, 20);
        ctx.fillStyle = "#4a5570";
        ctx.fillText(it.name, lx + 28, ly);
        lx += ctx.measureText(it.name).width + 50;
      });
      return;
    }
    if (line.style === "meta") {
      ctx.font = font(400, 24);
      ctx.fillStyle = "#4a5570";
      ctx.textAlign = "center";
      ctx.fillText(line.text, CW / 2, y);
      y += 48;
      return;
    }
    if (line.style === "badge") {
      ctx.font = font(700, 20);
      const w = ctx.measureText(line.text).width + 32;
      ctx.fillStyle = "#8a1c3c";
      ctx.fillRect(CW / 2 - w / 2, y - 24, w, 36);
      ctx.fillStyle = "#ffe3ea";
      ctx.textAlign = "center";
      ctx.fillText(line.text, CW / 2, y + 1);
      y += 64;
      return;
    }
    ctx.font = font(400, BODY_FONT);
    let x = MARGIN;
    line.parts.forEach((part) => {
      const text = typeof part === "string" ? part : part.text;
      const w = ctx.measureText(text).width;
      if (typeof part !== "string") {
        const rect = { x: x - 4, y: y - BODY_FONT * 0.88, w: w + 8, h: BODY_FONT * 1.2 };
        rects.set(part, rect);
        const type = finalType(part);
        if (mode === "anon" && type) {
          ctx.fillStyle = "#0b0f18";
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          ctx.fillStyle = "#7d8aa3";
          ctx.font = font(700, 18);
          ctx.textAlign = "center";
          ctx.fillText(`[${TYPES[type].name}]`, rect.x + rect.w / 2, y - 4);
          ctx.textAlign = "left";
          ctx.font = font(400, BODY_FONT);
          x += w;
          return;
        }
      }
      ctx.fillStyle = "#1a2236";
      ctx.fillText(text, x, y);
      x += w;
    });
    y += LINE_H;
  });
  return rects;
}

// Canvas pixels to page-local units (page centered at the origin, +y up).
const toLocalX = (cx) => (cx / CW - 0.5) * PAGE_W;
const toLocalY = (cy) => (0.5 - cy / CH) * PAGE_H;

export function createPrivacy() {
  const group = new THREE.Group();
  const pickables = [];
  const cascade = createCascade(group, pickables);

  const page = new THREE.Group();
  page.position.copy(PAGE_POS);
  group.add(page);

  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // Not tone mapped and kept below the bloom threshold, so the paper reads as paper and the text stays crisp.
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(PAGE_W, PAGE_H),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  page.add(paper);

  // Overlays per entity: tint, growing redaction bar and a floating chip
  const unit = new THREE.PlaneGeometry(1, 1);
  const barGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const overlays = new Map();
  ENTITIES.forEach((e) => {
    const tint = new THREE.Mesh(
      unit,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    tint.position.z = 0.01;
    page.add(tint);
    const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x0b0f18 }));
    bar.position.z = 0.02;
    bar.visible = false;
    page.add(bar);
    // Only ambiguous passages get a callout, in the right margin, linked to the passage by a thin line.
    let chip = null;
    let connector = null;
    if (e.llm) {
      chip = label("", "tag");
      chip.center.set(0, 0.5);
      chip.visible = false;
      page.add(chip);
      connector = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0),
        new THREE.MeshBasicMaterial({ toneMapped: false }),
      );
      connector.visible = false;
      page.add(connector);
    }
    overlays.set(e, { tint, bar, chip, connector });
  });

  let rects = new Map();
  let drawnMode = null;
  function render(mode) {
    rects = drawPage(ctx, mode);
    texture.needsUpdate = true;
    drawnMode = mode;
    rects.forEach((r, e) => {
      const { tint, bar, chip, connector } = overlays.get(e);
      const cx = toLocalX(r.x + r.w / 2);
      const cy = toLocalY(r.y + r.h / 2);
      const w = (r.w / CW) * PAGE_W;
      const h = (r.h / CH) * PAGE_H;
      tint.position.set(cx, cy, 0.01);
      tint.scale.set(w, h, 1);
      bar.position.set(toLocalX(r.x), cy, 0.02);
      bar.userData.w = w;
      bar.scale.set(0.0001, h, 1);
      if (chip) {
        const right = toLocalX(r.x + r.w);
        chip.position.set(PAGE_W / 2 + 0.12, cy, 0.03);
        // Runs along the bottom of the line, like an underline, so it never strikes through the text.
        connector.position.set(right, cy - h / 2, 0.025);
        connector.scale.set(PAGE_W / 2 + 0.1 - right, 0.018, 1);
      }
    });
  }
  render("original");
  // The first draw may use a fallback font; measure again once Inter is ready so overlays line up.
  document.fonts?.load(`${BODY_FONT}px Inter`).then(() => render(drawnMode));

  // Step indicator above the page and a caption below it: the page names each phase as it happens.
  const STEP_NAMES = tr(["Classificação", "NER", "LLM", "Anonimização"], ["Classification", "NER", "LLM", "Anonymization"]);
  const stepper = label("", "steps");
  stepper.position.set(0, PAGE_H / 2 + 0.95, 0.05);
  page.add(stepper);
  const stepEls = STEP_NAMES.map((name, i) => {
    const el = document.createElement("span");
    el.textContent = `${i + 1} ${name}`;
    stepper.element.append(el);
    return el;
  });
  let shownStep = null;
  const setStep = (i) => {
    if (i === shownStep) return;
    shownStep = i;
    stepEls.forEach((el, k) => {
      el.classList.toggle("active", k === i);
      el.classList.toggle("done", k < i);
    });
  };
  const caption = label("", "caption");
  caption.position.set(0, -PAGE_H / 2 - 0.25, 0.05);
  caption.center.set(0.5, 0);
  page.add(caption);
  const setCaption = (text) => {
    if (caption.element.textContent !== text) caption.element.textContent = text;
  };
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(PAGE_W + 0.12, PAGE_H + 0.12)),
    new THREE.LineBasicMaterial({ color: glow(COLORS.message, 2), toneMapped: false, transparent: true, opacity: 0 }),
  );
  frame.position.z = 0.03;
  page.add(frame);

  // Classification stamp and the LLM orb next to the page
  const stamp = label("", "tag");
  stamp.position.set(PAGE_W / 2 - 0.1, PAGE_H / 2 + 0.05, 0.05);
  stamp.center.set(1, 1);
  stamp.visible = false;
  page.add(stamp);
  const setStamp = (text, color) => {
    stamp.element.textContent = text;
    stamp.element.style.background = `#${new THREE.Color(color).getHexString()}`;
    stamp.visible = true;
  };

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 16),
    new THREE.MeshStandardMaterial({ color: COLORS.llm, emissive: COLORS.llm, emissiveIntensity: 0.6, roughness: 0.4 }),
  );
  orb.add(
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({ color: glow(COLORS.llm, 1.2), wireframe: true, toneMapped: false }),
    ),
  );
  orb.position.set(PAGE_W / 2 + 1.4, PAGE_H / 2 - 0.8, 0.4);
  page.add(orb);
  const orbLabel = label("LLM");
  orbLabel.position.set(0, 0.75, 0);
  orb.add(orbLabel);
  const probe = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.llm, 2.6), toneMapped: false }),
  );
  probe.visible = false;
  page.add(probe);

  const scanner = new THREE.Mesh(
    new THREE.PlaneGeometry(PAGE_W + 0.3, 0.05),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.privacy, 2.4), toneMapped: false }),
  );
  scanner.position.z = 0.04;
  scanner.visible = false;
  page.add(scanner);
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, PAGE_H + 0.3),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.ok, 1.5), toneMapped: false }),
  );
  curtain.position.z = 0.04;
  curtain.visible = false;
  page.add(curtain);

  // Entity state: "idle" → "found" (NER) → "resolved" (LLM, ambiguous only)
  const state = new Map(ENTITIES.map((e) => [e, "idle"]));
  const setEntity = (e, s) => {
    state.set(e, s);
    const { tint, chip, connector } = overlays.get(e);
    let color;
    let text;
    if (s === "idle") {
      tint.material.opacity = 0;
      if (chip) chip.visible = connector.visible = false;
      return;
    }
    if (s === "found" && e.llm) {
      color = COLORS.llm;
      text = e.ner;
    } else if (s === "resolved" && e.llm) {
      color = e.llm.keep ? COLORS.ok : TYPES[e.llm.type].color;
      text = e.llm.keep ? tr("LLM: mantém", "LLM: keep") : `LLM: ${TYPES[e.llm.type].name}`;
    } else {
      color = TYPES[e.type].color;
      text = TYPES[e.type].name;
    }
    tint.material.color.setHex(color);
    tint.material.opacity = e.llm?.keep && s === "resolved" ? 0.18 : 0.38;
    if (chip) {
      chip.element.textContent = text;
      chip.element.style.background = `#${new THREE.Color(color).getHexString()}`;
      connector.material.color.setHex(color);
      chip.visible = connector.visible = true;
    }
  };

  pickable(pickables, paper, (hit) => {
    if (!hit?.uv) return null;
    const cx = hit.uv.x * CW;
    const cy = (1 - hit.uv.y) * CH;
    for (const [e, r] of rects) {
      if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) continue;
      const s = state.get(e);
      if (s === "idle") break;
      if (e.llm && s === "resolved") {
        return {
          title: e.llm.keep ? tr("LLM: mantém no texto", "LLM: stays in the text") : `LLM: ${TYPES[e.llm.type].name}`,
          text: `“${e.text.replace(/[“”]/g, "")}” ${e.llm.note}.`,
        };
      }
      if (e.llm) {
        const passage = e.text.replace(/[“”]/g, "");
        return {
          title: tr("Ambíguo: vai para o LLM", "Ambiguous: goes to the LLM"),
          text: tr(`O NER não tem certeza sobre “${passage}”.`, `NER is not sure about “${passage}”.`),
        };
      }
      return {
        title: `${TYPES[e.type].name} · NER`,
        text: tr(`“${e.text}” foi encontrado pelo NER e será anonimizado.`, `NER found “${e.text}”; it will be anonymized.`),
      };
    }
    return {
      title: tr("Petição fictícia", "Fictional filing"),
      text: tr(
        "A Criatura processa o Dr. Victor Frankenstein por pensão alimentícia e pede a proteção dos seus dados. Nomes e números são inventados.",
        "The Creature sues Dr. Victor Frankenstein for child support and asks for its data to be protected. Names and numbers are made up.",
      ),
    };
  });
  pickable(pickables, orb, {
    title: "LLM",
    text: tr(
      "Olha o contexto dos trechos ambíguos que o NER marcou e decide se são dados pessoais.",
      "Looks at the context of the ambiguous passages NER flagged and decides whether they are personal data.",
    ),
  });

  // Timeline of one page
  // Each phase ends with a short pause (BEAT) so the change can be read before the next one starts.
  const BEAT = 0.8;
  const PHASES = [
    { name: "enter", dur: 1.2, step: -1, caption: tr("Chega um documento novo ao pipeline.", "A new document arrives in the pipeline.") },
    { name: "classify", dur: 2.4 + BEAT, step: 0, caption: tr("1 · Classificação: este documento tem dados pessoais? Tem, então segue para o NER.", "1 · Classification: does this document have personal data? It does, so it goes on to NER.") },
    { name: "ner", dur: 5 + BEAT, step: 1, caption: tr("2 · NER: lê o texto e marca nomes, CPFs, endereços e telefones. O que é ambíguo fica em lilás.", "2 · NER: reads the text and marks names, ID numbers, addresses and phones. Ambiguous passages turn lilac.") },
    { name: "llm", dur: 2.4 * AMBIGUOUS.length + BEAT, step: 2, caption: tr("3 · LLM: olha o contexto dos trechos ambíguos.", "3 · LLM: looks at the context of the ambiguous passages.") },
    { name: "anonymize", dur: 2.4 + BEAT, step: 3, caption: tr("4 · Anonimização: os dados pessoais viram marcadores; o resto do texto fica.", "4 · Anonymization: personal data becomes placeholders; the rest of the text stays.") },
    { name: "hold", dur: 4, step: 4, caption: tr("Pronto: a decisão continua pública, os dados pessoais não.", "Done: the ruling stays public, the personal data does not.") },
    { name: "exit", dur: 1.2, step: 4, caption: tr("O documento segue para a plataforma, junto com milhões de outros.", "The document moves on to the platform, along with millions of others.") },
  ];
  let phase = 0;
  let phaseT = 0;
  let compare = false;
  const scanTop = toLocalY(300);
  const scanBottom = toLocalY(1200);
  const orbLocal = orb.position.clone();
  const target = new THREE.Vector3();
  const cascadeLocal = cascade.input.clone().sub(PAGE_POS);

  function reset() {
    phase = 0;
    phaseT = 0;
    ENTITIES.forEach((e) => {
      setEntity(e, "idle");
      overlays.get(e).bar.visible = false;
    });
    stamp.visible = false;
    scanner.visible = false;
    curtain.visible = false;
    probe.visible = false;
    frame.material.opacity = 0;
    setStep(-1);
    setCaption(PHASES[0].caption);
    cascade.highlight(-1);
    page.position.copy(PAGE_POS);
    page.scale.setScalar(0.85);
    if (drawnMode !== "original") render("original");
  }

  function showFinal(mode) {
    ENTITIES.forEach((e) => setEntity(e, e.llm ? "resolved" : "found"));
    scanner.visible = false;
    curtain.visible = false;
    probe.visible = false;
    page.position.copy(PAGE_POS);
    page.scale.setScalar(1);
    setStep(4);
    frame.material.opacity = 0;
    if (mode === "original") {
      render("original");
      setStamp("original", COLORS.danger);
      setCaption(tr("O original, com tudo o que foi marcado: é isto que a anonimização protege.", "The original, with everything that was flagged: this is what anonymization protects."));
    } else {
      render("anon");
      ENTITIES.forEach((e) => {
        const o = overlays.get(e);
        if (o.chip) o.chip.visible = o.connector.visible = false;
        o.tint.material.opacity = 0;
        o.bar.visible = false;
      });
      setStamp(tr("anonimizado ✓", "anonymized ✓"), COLORS.ok);
      setCaption(PHASES.find((p) => p.name === "hold").caption);
    }
  }

  function step(dt, time) {
    const p = PHASES[phase];
    phaseT += dt;
    const k = Math.min(1, phaseT / p.dur);
    // Progress of the phase's own animation; it finishes before the trailing pause.
    const a = Math.min(1, phaseT / Math.max(0.01, p.dur - (p.name === "enter" || p.name === "hold" || p.name === "exit" ? 0 : BEAT)));
    setStep(p.step);
    if (p.name !== "llm") setCaption(p.caption);
    cascade.highlight(p.step >= 0 && p.step <= 2 ? p.step : -1);

    if (p.name === "enter") {
      page.scale.setScalar(0.85 + 0.15 * k);
    } else if (p.name === "classify") {
      // The whole page is examined at once: its frame pulses, then the verdict is stamped.
      frame.material.opacity = a < 1 ? 0.5 + 0.5 * Math.sin(phaseT * 9) : 0.25;
      if (a < 0.55) setStamp(tr("classificando…", "classifying…"), COLORS.message);
      else setStamp(tr("contém dados pessoais", "contains personal data"), COLORS.message);
    } else if (p.name === "ner") {
      frame.material.opacity = 0;
      scanner.visible = a < 1;
      const y = THREE.MathUtils.lerp(scanTop, scanBottom, a);
      scanner.position.y = y;
      rects.forEach((r, e) => {
        if (state.get(e) === "idle" && toLocalY(r.y + r.h / 2) > y) setEntity(e, "found");
      });
    } else if (p.name === "llm") {
      const slot = Math.min(AMBIGUOUS.length - 1, Math.floor(a * AMBIGUOUS.length));
      const local = a >= 1 ? 1 : a * AMBIGUOUS.length - slot;
      const e = AMBIGUOUS[slot];
      const verdict = e.llm.keep ? tr("mantém", "keep") : TYPES[e.llm.type].name;
      const passage = e.text.replace(/[“”]/g, "");
      setCaption(
        local < 0.5
          ? tr(`3 · LLM: e “${passage}”? Olhando o contexto…`, `3 · LLM: what about “${passage}”? Checking the context…`)
          : `3 · LLM: “${passage}” → ${verdict}: ${e.llm.note}.`,
      );
      const r = rects.get(e);
      target.set(toLocalX(r.x + r.w / 2), toLocalY(r.y + r.h / 2), 0.1);
      // First half: a probe travels from the LLM to the passage; then the verdict lands.
      probe.visible = local < 0.5;
      probe.position.lerpVectors(orbLocal, target, Math.min(1, local * 2));
      probe.position.z += Math.sin(Math.min(1, local * 2) * Math.PI) * 0.8;
      if (local >= 0.5 && state.get(e) !== "resolved") setEntity(e, "resolved");
      orb.scale.setScalar(1 + Math.sin(time * 10) * 0.08);
    } else if (p.name === "anonymize") {
      probe.visible = false;
      orb.scale.setScalar(1);
      curtain.visible = a < 1;
      const x = THREE.MathUtils.lerp(-PAGE_W / 2 - 0.1, PAGE_W / 2 + 0.1, a);
      curtain.position.x = x;
      rects.forEach((r, e) => {
        if (!finalType(e)) return;
        const { bar, chip, tint } = overlays.get(e);
        const left = toLocalX(r.x);
        const grow = THREE.MathUtils.clamp((x - left) / bar.userData.w, 0, 1);
        bar.visible = grow > 0;
        bar.scale.x = Math.max(0.0001, grow * bar.userData.w);
        if (grow >= 1) {
          if (chip) chip.visible = overlays.get(e).connector.visible = false;
          tint.material.opacity = 0;
        }
      });
      if (a >= 1 && drawnMode !== "anon") showFinal("anon");
    } else if (p.name === "exit") {
      // The page shrinks and drops into the cascade behind it, then a new one starts.
      const e = k * k;
      page.scale.setScalar(1 - 0.92 * e);
      page.position.copy(PAGE_POS).addScaledVector(cascadeLocal, e);
      if (k >= 1) {
        cascade.emit("llm");
        reset();
        return;
      }
    }
    if (k >= 1) {
      phase = (phase + 1) % PHASES.length;
      phaseT = 0;
    }
  }

  return {
    id: "privacy",
    group,
    pickables,
    view: {
      pos: [3.2, 5.2, 18.5],
      target: [3.2, 4.4, -2.5],
      fogFar: 90,
      // On phones the page is the story; frame it and let the cascade peek in from the side.
      narrow: { pos: [-1.6, 5, 15], target: [-1.6, 4.5, -2.5] },
    },
    actions: {
      compare() {
        compare = !compare;
        if (compare) {
          showFinal("original");
        } else {
          showFinal("anon");
          phase = PHASES.findIndex((p) => p.name === "hold");
          phaseT = 0;
        }
        return compare;
      },
    },
    update(dt, time, focus) {
      cascade.update(dt, time, focus);
      orb.rotation.y += dt;
      // Start the story over whenever the visitor arrives, instead of joining it halfway.
      if (focus < 0.2) {
        if (!compare && (phase !== 0 || phaseT > 0)) reset();
        return;
      }
      if (!compare) step(dt, time);
    },
  };
}
