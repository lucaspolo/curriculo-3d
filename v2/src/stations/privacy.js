// Trust & Privacy island. In front, the same fictional filing as the first version (src/stations/
// privacy-filing.js tells its story) stands on an easel, with a voxel robot as the LLM. Behind it, the same
// pipeline at scale: documents on three lanes, through three gates. The lane split is illustrative.
import * as THREE from "three";
import { COLORS, Vox, label, lamp, pickable, place, vx } from "../lib/kit.js";
import { pattern } from "../lib/voxel.js";
import { island, paving, greenery } from "../world.js";
import { tr } from "../../../src/i18n.js";
import { createFiling } from "../../../src/stations/privacy-filing.js";
import { PAGE_W, PAGE_H } from "../../../src/stations/privacy-page.js";
import { LANES, GATES } from "../../../src/stations/privacy-cascade.js";

const PAGE_AT = new THREE.Vector3(-4.4, 6.1, 2.2);
const SPEED = 5;
const RATE = 16; // documents per second at full focus
const MAX = 260;

// The lanes use the first version's coordinates (x along the flow, y across it), laid flat on the ground.
const onGround = (x, y) => new THREE.Vector3(x * 0.74 + 1.6, 0.8, -2.6 - y * 0.95);
const lane = (points) => new THREE.CatmullRomCurve3(points.map(([x, y]) => onGround(x, y)));
const PATHS = {
  clean: lane([[3.5, 4.2], [6, 4.2], [7.8, 6.6], [9.5, 7.2], [16.5, 7.2]]),
  ner: lane([[3.5, 4.2], [6, 4.2], [7.8, 3.7], [9.5, 3.6], [16.5, 3.6]]),
  llm: lane([[3.5, 4.2], [6, 4.2], [7.8, 3.7], [9.5, 3.6], [11.2, 1], [13, 0.4], [16.5, 0.4]]),
};
const LENGTHS = Object.fromEntries(Object.entries(PATHS).map(([k, c]) => [k, c.getLength()]));
const GATE_X = onGround(6, 0).x; // where the first gate stands: documents get their lane's color past it
const SLOW_X = onGround(13, 0).x;

function gateArch(color, span) {
  const v = new Vox();
  const half = Math.max(3, vx(span / 2));
  for (const z of [-half - 1, half]) v.box(-1, 0, z, 0, 9, z + 1, pattern.bands("y", 2, color, COLORS.white));
  return v.box(-1, 10, -half - 1, 0, 11, half + 1, color);
}

function robot() {
  const v = new Vox();
  const dark = 0x6a4fd0;
  v.box(-3, 0, -2, -2, 1, 1, COLORS.ink).box(1, 0, -2, 2, 1, 1, COLORS.ink);
  v.box(-3, 2, -2, 2, 7, 1, pattern.speckle(COLORS.llm, dark, 0.25)).box(-2, 4, 2, 1, 5, 2, COLORS.white).set(-1, 4, 2, COLORS.ok);
  v.box(-5, 4, -1, -4, 6, 0, dark).box(3, 4, -1, 4, 6, 0, dark).set(-5, 3, 0, COLORS.steel).set(4, 3, 0, COLORS.steel);
  v.box(-3, 8, -2, 2, 12, 1, COLORS.white).box(-2, 10, 2, 1, 10, 2, COLORS.ink);
  return v.set(-1, 13, 0, COLORS.steel).set(-1, 14, 0, COLORS.danger);
}

function easel() {
  const w = vx(PAGE_W / 2) + 1;
  const h = vx(PAGE_H / 2) + 1;
  const v = new Vox();
  // The board stays a voxel behind the paper: touching it, the two surfaces would flicker through each other.
  v.box(-w, -h, -2, w - 1, h - 1, -2, pattern.bands("y", 4, COLORS.wood, COLORS.darkWood));
  v.box(-w - 1, -h - 1, -2, w, -h - 1, -1, COLORS.darkWood).box(-w - 1, h, -2, w, h, -1, COLORS.darkWood);
  for (const x of [-w + 3, w - 5]) v.box(x, -h - vx(PAGE_AT.y - PAGE_H / 2) + 1, -2, x + 1, -h - 2, -1, COLORS.darkWood);
  return v;
}

function createCascade(group, pickables) {
  const neutral = new THREE.Color(0xf7f2e4);
  const colors = Object.fromEntries(LANES.map((l) => [l.key, new THREE.Color(l.color)]));

  // Lane beds: a row of flat tiles along each path, in the lane's color.
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), new THREE.MeshLambertMaterial(), 3 * 44);
  const m = new THREE.Matrix4();
  const tint = new THREE.Color();
  LANES.forEach((l, li) => {
    PATHS[l.key].getSpacedPoints(43).forEach((p, i) => {
      tiles.setMatrixAt(li * 44 + i, m.makeTranslation(p.x, 0.06, p.z));
      tiles.setColorAt(li * 44 + i, tint.set(l.color).lerp(neutral, 0.45));
    });
  });
  tiles.receiveShadow = true;
  group.add(tiles);

  const gates = GATES.map((g) => {
    const at = onGround(g.x, g.y);
    const mesh = place(group, gateArch(g.color, g.h * 0.95 + 0.8), [at.x, 0, at.z]);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lamp(g.color));
    bulb.position.set(-0.12, 3.25, 0);
    mesh.add(bulb);
    const l = label(g.name, "small");
    l.position.set(0, 4, 0);
    mesh.add(l);
    pickable(pickables, mesh, { title: g.name, text: g.text });
    return { mesh, bulb, lit: 0, color: new THREE.Color(g.color) };
  });
  let litGate = -1;

  const scale = label(tr("escala: dezenas de milhões de documentos por dia", "scale: tens of millions of documents a day"), "small");
  scale.position.copy(onGround(10, 9.6)).setY(3.2);
  group.add(scale);

  const exits = LANES.map((l) => {
    const e = label(`${l.name} · 0%`, "small");
    e.position.copy(onGround(16.5, l.y)).setY(1.7);
    e.center.set(1, 0.5);
    group.add(e);
    return e;
  });

  const cards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.48, 0.06), new THREE.MeshLambertMaterial(), MAX);
  cards.setColorAt(0, neutral);
  cards.frustumCulled = false;
  cards.count = 0;
  cards.castShadow = true;
  group.add(cards);

  const items = [];
  const counts = { clean: 0, ner: 0, llm: 0 };
  let total = 0;
  let spawn = 0;
  let lastText = "";
  const pickLane = () => {
    const r = Math.random();
    return r < LANES[0].share ? "clean" : r < LANES[0].share + LANES[1].share ? "ner" : "llm";
  };
  const p = new THREE.Vector3();
  const white = new THREE.Color(COLORS.white);

  return {
    input: PATHS.clean.getPointAt(0),
    /** Lights the gate matching the step the foreground page is in (0 classification, 1 NER, 2 LLM). */
    highlight(i) {
      litGate = i;
    },
    /** Adds one document; `lane` forces its path (the showcased page always ends up in the LLM lane). */
    emit(lane = pickLane()) {
      if (items.length >= MAX) return;
      items.push({ lane, t: 0, wobble: Math.random() * Math.PI * 2 });
    },
    update(dt, time, focus) {
      gates.forEach((g, i) => {
        g.lit = Math.max(i === litGate ? 1 : 0, g.lit - dt * 2);
        g.bulb.material.color.copy(g.color).lerp(white, g.lit * 0.6);
        g.bulb.scale.setScalar(1 + g.lit * 0.5);
      });
      spawn += dt * RATE * focus;
      while (spawn > 1) {
        spawn--;
        this.emit();
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        PATHS[it.lane].getPointAt(it.t, p);
        // The LLM gate is slower, so its narrow lane visibly queues up.
        const slow = it.lane === "llm" && Math.abs(p.x - SLOW_X) < 1.2 ? 0.3 : 1;
        it.t += (dt * SPEED * slow) / LENGTHS[it.lane];
        if (it.t >= 1) {
          counts[it.lane]++;
          total++;
          items[i] = items[items.length - 1];
          items.pop();
        }
      }
      items.forEach((it, i) => {
        PATHS[it.lane].getPointAt(it.t, p);
        p.y += Math.sin(time * 3 + it.wobble) * 0.05;
        cards.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
        // Unclassified until the first gate, then the lane's color.
        cards.setColorAt(i, p.x < GATE_X ? neutral : colors[it.lane]);
      });
      cards.count = items.length;
      cards.instanceMatrix.needsUpdate = true;
      cards.instanceColor.needsUpdate = true;

      if (total > 0) {
        const text = LANES.map((l) => Math.round((counts[l.key] / total) * 100)).join("|");
        if (text !== lastText) {
          lastText = text;
          LANES.forEach((l, i) => (exits[i].element.textContent = `${l.name} · ${Math.round((counts[l.key] / total) * 100)}%`));
        }
      }
    },
  };
}

export function createPrivacy() {
  const group = new THREE.Group();
  const pickables = [];

  const ground = paving()
    .rect(-9.6, -0.2, 3.4, 5, (i, k) => ((Math.floor(i / 4) + Math.floor(k / 4)) % 2 ? 0xeadcbd : 0xe2d2ae))
    .rect(3.4, -10.4, 14.6, -1.6, (i, k) => ((i + k) % 8 < 4 ? 0xdfe5ea : 0xd5dce3));
  group.add(island({ rx: 24, rz: 15.5, seed: 2, paint: ground.paint }));
  group.add(
    greenery([
      ["palm", -19, -4], ["tree", -13, -9.5], ["bush", -8, -10.8], ["tree", -2.5, -11.5], ["palm", 20.5, 3.5], ["bush", 14, 6],
      ["rock", 8, 9], ["palm", -17, 8.5], ["bush", -2, 10.5], ["tree", 19.5, -8.5], ["rock", -20.5, 1.5], ["bush", 9.5, 3.6],
    ]),
  );

  const cascade = createCascade(group, pickables);

  // The LLM: a robot beside the easel. The filing wants an object of the page's own to send its probe
  // from and to swell while the model thinks; the page shrinks and leaves at the end of each run, and the
  // robot should not go with it. So the filing gets an empty stand-in at the robot's head, and the robot
  // copies its pulse.
  const bot = new THREE.Group();
  bot.position.set(PAGE_AT.x + 5.6, 0, PAGE_AT.z + 0.4);
  group.add(bot);
  const body = robot().mesh();
  bot.add(body);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.06), lamp(0x7ff0ff));
  eyes.position.set(0, 2.62, 0.78);
  bot.add(eyes);
  const name = label("LLM");
  name.position.set(0, 4.1, 0);
  bot.add(name);
  const standIn = new THREE.Object3D();
  standIn.position.set(5.6, 2.7 - PAGE_AT.y, 0.4);

  place(group, easel(), PAGE_AT.toArray());
  const filing = createFiling({ group, pickables, at: PAGE_AT, cascade, orb: standIn, bright: (hex) => new THREE.Color(hex) });
  // The filing registered the stand-in, which has nothing to click on: the robot answers for it.
  pickable(pickables, body, standIn.userData.info);

  return {
    id: "privacy",
    group,
    pickables,
    view: {
      pos: [3.2, 10.2, 27.5],
      target: [3.2, 4.9, -2.5],
      fogFar: 300,
      // On phones the page is the story; frame it and let the cascade peek in from the side.
      narrow: { pos: [-3, 8, 19], target: [-3, 5.6, 0] },
    },
    actions: { compare: filing.compare },
    update(dt, time, focus) {
      cascade.update(dt, time, focus);
      filing.update(dt, time, focus);
      bot.scale.setScalar(standIn.scale.x);
      eyes.scale.x = 0.75 + 0.25 * Math.sin(time * 2.2);
    },
  };
}
