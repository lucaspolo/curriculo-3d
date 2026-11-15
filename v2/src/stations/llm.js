// LLM island: one model serving three fronts, each shown as a concrete vignette on a billboard. The vignettes
// themselves (what is typed, when) are the first version's; here they get voxel frames, a robot head for the
// model and little machines for the agent's tools. The card's tabs slide the camera between the billboards.
import * as THREE from "three";
import { COLORS, Flow, Vox, canvasTexture, damp, label, lamp, pickable, place } from "../lib/kit.js";
import { pattern } from "../lib/voxel.js";
import { island, paving, greenery } from "../world.js";
import { tr } from "../../../src/i18n.js";
import { CW, CH, VIGNETTES, TOOLS } from "../../../src/stations/llm-vignettes.js";
import { INFO } from "../../../src/stations/llm.js";

const PANEL_W = 9;
const PANEL_H = (PANEL_W * CH) / CW;
const PANEL_Y = 4.75;
const SPACING = 11.5;
const PANEL_X = [-SPACING, 0, SPACING];
const PANEL_COLORS = [COLORS.kafka, COLORS.message, COLORS.ok];
const HEAD = new THREE.Vector3(0, 8.8, -7);
const MANUAL_PAUSE = 25; // seconds without auto-cycling after a tab click
const REDRAW_FPS = 20;

// A billboard: dark board, colored border and two posts. The screen itself is a plane laid over it.
function billboard(color) {
  const v = new Vox();
  v.box(-19, -13, -2, 18, 12, -1, COLORS.ink);
  v.box(-20, -14, -2, 19, -14, 0, color).box(-20, 13, -2, 19, 13, 0, color).box(-20, -14, -2, -20, 13, 0, color).box(19, -14, -2, 19, 13, 0, color);
  for (const x of [-13, 11]) v.box(x, -19, -2, x + 1, -15, -1, pattern.bands("y", 2, COLORS.steel, COLORS.darkStone));
  return v;
}

function modelHead() {
  const v = new Vox();
  const dark = 0x6a4fd0;
  v.box(-5, 0, -4, 4, 9, 4, COLORS.white).box(-5, 0, -4, 4, 1, 4, pattern.speckle(COLORS.llm, dark, 0.3)).box(-5, 9, -4, 4, 9, 4, COLORS.llm);
  v.box(-4, 4, 5, 3, 6, 5, COLORS.ink).box(-6, 3, -1, -6, 6, 1, dark).box(5, 3, -1, 5, 6, 1, dark);
  return v.box(-1, 10, -1, 0, 12, 0, COLORS.steel).box(-2, 13, -2, 1, 14, 1, COLORS.danger);
}

function pillar() {
  const v = new Vox();
  for (let y = 0; y < 28; y++) v.rod("y", -0.5, -0.5, y, y, y < 2 || y > 25 ? 3 : 2, y % 5 === 0 ? COLORS.stone : COLORS.white);
  return v;
}

// The three tools the product agent calls: look something up, read a record, do the math.
const TOOL_MODELS = [
  () => new Vox().box(-4, 0, -3, 3, 3, 2, pattern.speckle(COLORS.message, 0xe0841f, 0.3)).rod("z", -0.5, 6.5, 3, 3, 2.6, COLORS.glass).rod("z", -0.5, 6.5, 2, 2, 3, COLORS.steel).box(2, 3, 2, 3, 4, 2, COLORS.steel),
  () => new Vox().box(-4, 0, -3, 3, 1, 2, 0x2f7fe0).box(-4, 2, -3, 3, 3, 2, COLORS.white).box(-4, 4, -3, 3, 5, 2, COLORS.danger).box(-4, 6, -3, 3, 6, 2, COLORS.white).box(-4, 7, -3, 3, 7, 2, COLORS.ok),
  () => new Vox().box(-4, 0, -3, 3, 5, 2, COLORS.steel).box(-3, 4, 3, 2, 4, 3, 0x9be29b).box(-3, 1, 3, 2, 2, 3, (x, y) => ((x + y) % 2 ? COLORS.white : COLORS.warn)),
];

function makePanel(i) {
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const texture = canvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), new THREE.MeshBasicMaterial({ map: texture }));
  mesh.position.set(PANEL_X[i], PANEL_Y, 0.02);
  // A strip of light along the top: bright on the billboard that is playing.
  const strip = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W, 0.16, 0.2), lamp(PANEL_COLORS[i]));
  strip.position.set(0, PANEL_H / 2 + 0.32, 0.1);
  mesh.add(strip);
  // Title on the top-left corner, clear of the messages that arrive at the top center.
  const l = label(VIGNETTES[i].title);
  l.position.set(-PANEL_W / 2, PANEL_H / 2 + 0.6, 0);
  l.center.set(0, 1);
  mesh.add(l);
  return { mesh, strip, ctx, texture, t: 0, drawnKey: -1 };
}

export function createLlm() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(80, 0.3);
  group.add(flow.mesh);

  const ground = paving().rect(-18.5, -3, 18.5, 4.6, (i) => (Math.floor(i / 3) % 2 ? 0xc79a5e : 0xbd8f54)).disc(0, -7, 3.4, 0xe2d2ae);
  group.add(island({ rx: 25, rz: 14, seed: 3, paint: ground.paint }));
  group.add(
    greenery([
      ["palm", -22, -6], ["tree", -9, -10], ["bush", -14, -8.5], ["tree", 9.5, -10.2], ["palm", 21.5, -3], ["bush", 15, -8],
      ["rock", -19, 6.5], ["bush", -8, 9.6], ["palm", 13, 9.5], ["rock", 20, 6], ["bush", 3.5, 10.5],
    ]),
  );

  const panels = VIGNETTES.map((v, i) => {
    place(group, billboard(PANEL_COLORS[i]), [PANEL_X[i], PANEL_Y, 0]);
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

  // The shared model: a robot head on a pillar behind the billboards, wired to each of them.
  place(group, pillar(), [HEAD.x, 0, HEAD.z]);
  const head = modelHead().mesh({ origin: [0, 5, 0] });
  head.position.copy(HEAD);
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.1), lamp(0x7ff0ff));
  visor.position.set(-0.12, 0.12, 1.5);
  head.add(visor);
  const headLabel = label("LLM");
  headLabel.position.set(0, 3, 0);
  head.add(headLabel);
  pickable(pickables, head, {
    title: "LLM",
    text: tr("O mesmo tipo de modelo servindo pipeline, produto e desenvolvimento.", "The same kind of model serving the pipeline, the product and development."),
  });

  const beads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshLambertMaterial({ color: 0xcbbcff }), 3 * 24);
  const m = new THREE.Matrix4();
  const beams = PANEL_X.map((x, i) => {
    const curve = new THREE.CatmullRomCurve3([
      HEAD.clone(),
      new THREE.Vector3((HEAD.x + x) / 2, HEAD.y + 0.6, -3.5),
      new THREE.Vector3(x, PANEL_Y + PANEL_H / 2 + 0.5, 0.1),
    ]);
    curve.getSpacedPoints(25).slice(1, 25).forEach((p, k) => beads.setMatrixAt(i * 24 + k, m.makeTranslation(p.x, p.y, p.z)));
    return curve;
  });
  group.add(beads);

  // Tools the product agent calls, under its billboard
  const tools = TOOLS.map((tool, i) => {
    const x = PANEL_X[1] + (i - 1) * 3;
    const mesh = place(group, TOOL_MODELS[i](), [x, 0, 2.6]);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), lamp(COLORS.stone));
    bulb.position.set(-0.6, i === 1 ? 2.2 : 1.8, -0.4);
    mesh.add(bulb);
    const toolName = tool.call.slice(0, tool.call.indexOf("("));
    const l = label(toolName, "small");
    l.position.set(0, -0.2, 1.3);
    mesh.add(l);
    pickable(pickables, mesh, { title: tr(`ferramenta: ${toolName}`, `tool: ${toolName}`), text: tr(`Chamada pelo agente: ${tool.call}`, `Called by the agent: ${tool.call}`) });
    const from = new THREE.Vector3(PANEL_X[1] + (i - 1) * 2, PANEL_Y - PANEL_H / 2 - 0.3, 0.4);
    const to = new THREE.Vector3(x, 1.9, 2.6);
    return { bulb, glow: 0, down: new THREE.LineCurve3(from, to), up: new THREE.LineCurve3(to, from) };
  });

  let active = 0;
  let pausedFor = 0;
  let lastTool = null;
  let llmSpawn = 0;
  let buttons = [];
  const shift = new THREE.Vector3();
  const stripOn = PANEL_COLORS.map((c) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.35));
  const stripOff = PANEL_COLORS.map((c) => new THREE.Color(c).multiplyScalar(0.55));
  const idle = new THREE.Color(COLORS.stone);
  const lit = new THREE.Color(COLORS.ok);

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
      pos: [0, 8.8, 25.5],
      target: [0, 4.6, 0],
      fogFar: 300,
      narrow: { pos: [0, 7, 18], target: [0, 5.2, 0] },
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

      // The model "thinks" for the active billboard: cubes run down its line.
      const phase = v.phaseAt(p.t);
      if (phase.llm) {
        llmSpawn += dt * 6;
        while (llmSpawn > 1) {
          llmSpawn--;
          flow.emit(beams[active], { color: COLORS.llm, speed: 9 });
        }
      }
      head.position.y = HEAD.y + Math.sin(time * 1.6) * 0.12;
      head.rotation.y = damp(head.rotation.y, (PANEL_X[active] / SPACING) * 0.5, 3, dt);
      visor.scale.x = phase.llm ? 0.6 + 0.4 * Math.abs(Math.sin(time * 9)) : 1;
      panels.forEach((pn, i) => pn.strip.material.color.copy(i === active ? stripOn[i] : stripOff[i]));

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
        t.bulb.material.color.copy(idle).lerp(lit, t.glow);
      });
      flow.update(dt);
    },
  };
}
