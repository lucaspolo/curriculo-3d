// Trust & Privacy scene. Foreground: a readable (and entirely fictional) court filing, the Creature suing
// Dr. Victor Frankenstein for child support, goes through classification, NER, LLM disambiguation and
// anonymization. Background: the same pipeline at scale (privacy-cascade.js).
import * as THREE from "three";
import { COLORS, glow, label, pickable } from "../lib/kit.js";
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
  PESSOA: { name: "PESSOA", color: COLORS.privacy },
  CPF: { name: "CPF", color: COLORS.message },
  ENDERECO: { name: "ENDEREÇO", color: COLORS.warn },
  TELEFONE: { name: "TELEFONE", color: COLORS.kafka },
};

// Every name, number and address below is fictional; the CPFs have invalid check digits on purpose.
const E = {
  criatura: { text: "a Criatura", ner: "?", llm: { type: "PESSOA", note: "aqui a expressão identifica o autor da ação" } },
  cpfAutor: { text: "181.818.181-18", type: "CPF" },
  endereco: {
    text: "Rua Mary Shelley, 1818, Ingolstadt",
    ner: "PESSOA?",
    llm: { type: "ENDERECO", note: "é nome de rua, não de pessoa; continua sendo dado pessoal (endereço)" },
  },
  victor: { text: "Victor Frankenstein", type: "PESSOA" },
  cpfReu: { text: "123.456.789-00", type: "CPF" },
  telefone: { text: "(00) 91818-1818", type: "TELEFONE" },
  henry: { text: "Henry Clerval", type: "PESSOA" },
  livro: {
    text: "“Frankenstein, ou o Moderno Prometeu”",
    ner: "PESSOA?",
    llm: { keep: true, note: "é título de livro, não dado pessoal; fica no texto" },
  },
};
const ENTITIES = Object.values(E);
const AMBIGUOUS = ENTITIES.filter((e) => e.llm);

const LINES = [
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
];

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
      const items = [...Object.values(TYPES), { name: "AMBÍGUO → LLM", color: COLORS.llm }];
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
    new THREE.PlaneGeometry(0.06, PAGE_H + 0.3),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.ok, 2.4), toneMapped: false }),
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
      text = e.llm.keep ? "LLM: mantém" : `LLM: ${TYPES[e.llm.type].name}`;
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
          title: e.llm.keep ? "LLM: mantém no texto" : `LLM: ${TYPES[e.llm.type].name}`,
          text: `“${e.text.replace(/[“”]/g, "")}” ${e.llm.note}.`,
        };
      }
      if (e.llm) return { title: "Ambíguo: vai para o LLM", text: `O NER não tem certeza sobre “${e.text.replace(/[“”]/g, "")}”.` };
      return { title: `${TYPES[e.type].name} · NER`, text: `“${e.text}” foi encontrado pelo NER e será anonimizado.` };
    }
    return {
      title: "Petição fictícia",
      text: "A Criatura processa o Dr. Victor Frankenstein por pensão alimentícia e pede a proteção dos seus dados. Nomes e números são inventados.",
    };
  });
  pickable(pickables, orb, {
    title: "LLM",
    text: "Olha o contexto dos trechos ambíguos que o NER marcou e decide se são dados pessoais.",
  });

  // Timeline of one page
  const PHASES = [
    { name: "enter", dur: 0.9 },
    { name: "classify", dur: 1.4 },
    { name: "ner", dur: 4.4 },
    { name: "llm", dur: 1.7 * AMBIGUOUS.length },
    { name: "anonymize", dur: 1.6 },
    { name: "hold", dur: 3.5 },
    { name: "exit", dur: 1.2 },
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
    if (mode === "original") {
      render("original");
      setStamp("original", COLORS.danger);
    } else {
      render("anon");
      ENTITIES.forEach((e) => {
        const o = overlays.get(e);
        if (o.chip) o.chip.visible = o.connector.visible = false;
        o.tint.material.opacity = 0;
        o.bar.visible = false;
      });
      setStamp("anonimizado ✓", COLORS.ok);
    }
  }

  function step(dt, time) {
    const p = PHASES[phase];
    phaseT += dt;
    const k = Math.min(1, phaseT / p.dur);

    if (p.name === "enter") {
      page.scale.setScalar(0.85 + 0.15 * k);
    } else if (p.name === "classify") {
      if (!stamp.visible && k > 0.3) setStamp("contém dados pessoais", COLORS.message);
    } else if (p.name === "ner") {
      scanner.visible = k < 1;
      const y = THREE.MathUtils.lerp(scanTop, scanBottom, k);
      scanner.position.y = y;
      rects.forEach((r, e) => {
        if (state.get(e) === "idle" && toLocalY(r.y + r.h / 2) > y) setEntity(e, "found");
      });
    } else if (p.name === "llm") {
      const slot = Math.min(AMBIGUOUS.length - 1, Math.floor(k * AMBIGUOUS.length));
      const local = k * AMBIGUOUS.length - slot;
      const e = AMBIGUOUS[slot];
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
      curtain.visible = k < 1;
      const x = THREE.MathUtils.lerp(-PAGE_W / 2 - 0.1, PAGE_W / 2 + 0.1, k);
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
      if (k >= 1) showFinal("anon");
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
