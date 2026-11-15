// The Trust & Privacy story told on one page: the fictional filing goes through classification, NER, LLM
// disambiguation and anonymization, with its overlays, labels and timeline. Each version of the site puts
// this on its own scenery and brings its own figure for the model.
import * as THREE from "three";
import { COLORS, label, pickable, canvasTexture } from "../lib/kit.js";
import { tr } from "../i18n.js";
import { CW, CH, PAGE_W, PAGE_H, BODY_FONT, TYPES, ENTITIES, AMBIGUOUS, finalType, drawPage, toLocalX, toLocalY } from "./privacy-page.js";

/**
 * Builds the page inside `group`, centered at `at`. `orb` is the object standing for the LLM, already placed
 * in the page's own coordinates: the probe leaves from it and it swells while the model is deciding.
 * `cascade` is the pipeline at scale the page falls into ({ input, highlight(step), emit(lane) }), and
 * `bright(hex, intensity)` gives the color of the lines that should stand out in that version's lighting.
 */
export function createFiling({ group, pickables, at, cascade, orb, bright }) {
  const page = new THREE.Group();
  page.position.copy(at);
  group.add(page);

  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const texture = canvasTexture(canvas);
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
    new THREE.LineBasicMaterial({ color: bright(COLORS.message, 2), toneMapped: false, transparent: true, opacity: 0 }),
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

  page.add(orb);
  const probe = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ color: bright(COLORS.llm, 2.6), toneMapped: false }),
  );
  probe.visible = false;
  page.add(probe);

  const scanner = new THREE.Mesh(
    new THREE.PlaneGeometry(PAGE_W + 0.3, 0.05),
    new THREE.MeshBasicMaterial({ color: bright(COLORS.privacy, 2.4), toneMapped: false }),
  );
  scanner.position.z = 0.04;
  scanner.visible = false;
  page.add(scanner);
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, PAGE_H + 0.3),
    new THREE.MeshBasicMaterial({ color: bright(COLORS.ok, 1.5), toneMapped: false }),
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
  const cascadeLocal = cascade.input.clone().sub(at);

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
    page.position.copy(at);
    page.scale.setScalar(0.85);
    if (drawnMode !== "original") render("original");
  }

  function showFinal(mode) {
    ENTITIES.forEach((e) => setEntity(e, e.llm ? "resolved" : "found"));
    scanner.visible = false;
    curtain.visible = false;
    probe.visible = false;
    page.position.copy(at);
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
      page.position.copy(at).addScaledVector(cascadeLocal, e);
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
    page,
    /** Switches between the original page, with everything that was flagged, and the anonymized one. */
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
    update(dt, time, focus) {
      // Start the story over whenever the visitor arrives, instead of joining it halfway.
      if (focus < 0.2) {
        if (!compare && (phase !== 0 || phaseT > 0)) reset();
        return;
      }
      if (!compare) step(dt, time);
    },
  };
}
