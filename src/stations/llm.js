// LLM scene: one model serving three fronts, each shown as a concrete vignette (llm-vignettes.js).
// The card has tabs; the camera slides between the panels and cycles on its own when left alone.
import * as THREE from "three";
import { COLORS, glow, label, pickable, Flow, damp, outlinedBox } from "../lib/kit.js";
import { tr, locale } from "../i18n.js";
import { CW, CH, VIGNETTES, TOOLS } from "./llm-vignettes.js";

const PANEL_W = 9;
const PANEL_H = (PANEL_W * CH) / CW;
const PANEL_Y = 4.5;
const SPACING = 11.5;
const PANEL_X = [-SPACING, 0, SPACING];
const COLORS_BY_PANEL = [COLORS.kafka, COLORS.message, COLORS.ok];
const CORE = new THREE.Vector3(0, 9.6, -8);
const MANUAL_PAUSE = 25; // seconds without auto-cycling after a tab click
const REDRAW_FPS = 20;

const INFO = [
  {
    title: tr("LLM no pipeline de ingestão", "LLM in the ingestion pipeline"),
    text: tr(
      "Uma etapa do pipeline lê a decisão e devolve dados estruturados, validados por schema antes de seguir para o próximo tópico.",
      "A pipeline step reads the ruling and returns structured data, validated against a schema before moving on to the next topic.",
    ),
  },
  {
    title: tr("Agente no produto", "Agent in the product"),
    text: tr(
      "O agente chama ferramentas (busca, consulta, cálculo) e responde citando a fonte.",
      "The agent calls tools (search, lookup, calculation) and answers citing its source.",
    ),
  },
  {
    title: tr("Agente de código", "Coding agent"),
    text: tr(
      "Da issue ao pull request: reproduz o erro, corrige, roda os testes e abre o PR. Uma pessoa revisa e aprova.",
      "From issue to pull request: reproduces the bug, fixes it, runs the tests and opens the PR. A person reviews and approves.",
    ),
  },
];

function makePanel(i) {
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  // Not tone mapped and kept below the bloom threshold, so the text stays crisp.
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  mesh.position.set(PANEL_X[i], PANEL_Y, 0);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: glow(COLORS_BY_PANEL[i], 1.4), toneMapped: false }),
  );
  mesh.add(frame);
  // Title on the top-left corner, clear of the beam that arrives at the top center.
  const l = label(VIGNETTES[i].title);
  l.position.set(-PANEL_W / 2, PANEL_H / 2 + 0.12, 0);
  l.center.set(0, 1);
  mesh.add(l);
  return { mesh, frame, ctx, texture, t: 0, drawnKey: -1 };
}

export function createLlm() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(60, 0.14);
  group.add(flow.mesh);

  const panels = VIGNETTES.map((v, i) => {
    const p = makePanel(i);
    group.add(p.mesh);
    pickable(pickables, p.mesh, INFO[i]);
    // Inactive panels show their finished state, so the neighbors never look empty.
    v.draw(p.ctx, v.duration);
    p.texture.needsUpdate = true;
    return p;
  });
  // Canvas text drawn before the web fonts load uses a fallback; draw the finished states again.
  document.fonts?.ready.then(() =>
    panels.forEach((p, i) => {
      VIGNETTES[i].draw(p.ctx, VIGNETTES[i].duration);
      p.texture.needsUpdate = true;
      p.drawnKey = -1;
    }),
  );

  // The shared model above the panels, wired to each of them
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 32, 20),
    new THREE.MeshStandardMaterial({ color: COLORS.llm, emissive: COLORS.llm, emissiveIntensity: 0.6, roughness: 0.35 }),
  );
  core.position.copy(CORE);
  group.add(core);
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.25, 1),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.llm, 1.1), wireframe: true, toneMapped: false }),
  );
  core.add(shell);
  const coreLabel = label("LLM");
  coreLabel.position.set(0, 1.8, 0);
  core.add(coreLabel);
  pickable(pickables, core, {
    title: "LLM",
    text: tr(
      "O mesmo tipo de modelo servindo pipeline, produto e desenvolvimento.",
      "The same kind of model serving the pipeline, the product and development.",
    ),
  });

  const beams = PANEL_X.map((x, i) => {
    const curve = new THREE.CatmullRomCurve3([
      CORE.clone(),
      new THREE.Vector3((CORE.x + x) / 2, CORE.y - 0.5, -3.5),
      new THREE.Vector3(x, PANEL_Y + PANEL_H / 2 + 0.05, -0.05),
    ]);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.05, 6, false),
      new THREE.MeshBasicMaterial({ color: COLORS_BY_PANEL[i], transparent: true, opacity: 0.25 }),
    );
    group.add(mesh);
    return { curve, mesh };
  });

  // Tools the product agent calls, under its panel
  const toolY = PANEL_Y - PANEL_H / 2 - 0.8;
  const tools = TOOLS.map((tool, i) => {
    const x = (i - 1) * 3;
    const mesh = outlinedBox(2.4, 0.7, 0.7, COLORS.message);
    mesh.position.set(PANEL_X[1] + x, toolY, 0.6);
    group.add(mesh);
    const name = tool.call.slice(0, tool.call.indexOf("("));
    const l = label(name, "small");
    l.position.set(0, -0.75, 0);
    mesh.add(l);
    pickable(pickables, mesh, { title: tr(`ferramenta: ${name}`, `tool: ${name}`), text: tr(`Chamada pelo agente: ${tool.call}`, `Called by the agent: ${tool.call}`) });
    const from = new THREE.Vector3(PANEL_X[1] + x * 0.6, PANEL_Y - PANEL_H / 2, 0.1);
    const to = mesh.position.clone().add(new THREE.Vector3(0, 0.35, 0));
    return { mesh, glow: 0, down: new THREE.LineCurve3(from, to), up: new THREE.LineCurve3(to, from) };
  });

  let active = 0;
  let pausedFor = 0;
  let lastTool = null;
  let llmSpawn = 0;
  let buttons = [];
  const shift = new THREE.Vector3();
  const frameOn = COLORS_BY_PANEL.map((c) => glow(c, 1.4));
  const frameOff = COLORS_BY_PANEL.map((c) => new THREE.Color(c).multiplyScalar(0.45));

  function show(i, manual) {
    active = i;
    panels[i].t = 0;
    panels[i].drawnKey = -1;
    if (manual) pausedFor = MANUAL_PAUSE;
    buttons.forEach((b, k) => {
      b.setAttribute("aria-selected", String(k === i));
      b.tabIndex = k === i ? 0 : -1;
    });
  }

  return {
    id: "llm",
    group,
    pickables,
    shift,
    view: {
      pos: [0, 5.4, 13.8],
      target: [0, 4.4, 0],
      fogFar: 90,
      narrow: { pos: [0, 5.4, 11.2], target: [0, 4.9, 0] },
    },
    bindUi(section) {
      buttons = [...section.querySelectorAll("[data-tab]")];
      buttons.forEach((b) => b.addEventListener("click", () => show(Number(b.dataset.tab), true)));
      // Arrow keys move between tabs, as in the WAI-ARIA tabs pattern.
      section.querySelector("[role=tablist]")?.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = (active + (e.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length;
        show(next, true);
        buttons[next].focus();
      });
      show(active, false);
    },
    update(dt, time, focus) {
      // Restart the tour when the visitor arrives, instead of joining it halfway.
      if (focus < 0.2) {
        if (active !== 0 || panels[0].t > 0) show(0, false);
        pausedFor = 0;
        shift.x = PANEL_X[0];
        return;
      }

      shift.x = damp(shift.x, PANEL_X[active], 3, dt);

      const v = VIGNETTES[active];
      const p = panels[active];
      p.t += dt;
      pausedFor = Math.max(0, pausedFor - dt);
      if (p.t > v.duration) {
        if (pausedFor > 0) p.t = 0; // keep replaying the chosen tab
        else show((active + 1) % panels.length, false);
      }
      const key = Math.floor(p.t * REDRAW_FPS);
      if (key !== p.drawnKey) {
        p.drawnKey = key;
        v.draw(p.ctx, Math.min(p.t, v.duration));
        p.texture.needsUpdate = true;
      }

      // The model "thinks" for the active panel: pulses run down its beam.
      const phase = v.phaseAt(p.t);
      if (phase.llm) {
        llmSpawn += dt * 6;
        while (llmSpawn > 1) {
          llmSpawn--;
          flow.emit(beams[active].curve, { color: COLORS.llm, speed: 9 });
        }
      }
      core.scale.setScalar(1 + (phase.llm ? 0.08 * Math.sin(time * 12) : 0));
      shell.rotation.y += dt * (phase.llm ? 1.2 : 0.3);
      beams.forEach((b, i) => (b.mesh.material.opacity = i === active ? 0.45 : 0.15));
      panels.forEach((pn, i) => pn.frame.material.color.copy(i === active ? frameOn[i] : frameOff[i]));

      // Compare against the vignette sampled this frame: show() may already have switched `active`.
      const isProduct = v === VIGNETTES[1];
      if (isProduct && phase.tool != null && phase.tool !== lastTool) {
        const tool = tools[phase.tool];
        flow.emit(tool.down, {
          color: COLORS.message,
          speed: 6,
          onArrive: () => {
            tool.glow = 1;
            flow.emit(tool.up, { color: COLORS.ok, speed: 6 });
          },
        });
      }
      lastTool = isProduct ? phase.tool : null;
      tools.forEach((t) => {
        t.glow = Math.max(0, t.glow - dt * 1.5);
        t.mesh.material.emissiveIntensity = 0.05 + t.glow * 0.6;
      });
      flow.update(dt);
    },
  };
}
