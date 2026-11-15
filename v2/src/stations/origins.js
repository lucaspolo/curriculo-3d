// Origins island: a workbench with one voxel object per phase, lit up in chronological order. Hovering an
// object (or its line in the card's timeline) jumps to it; otherwise the spotlight walks the bench on its
// own. The phases, their texts and their order are the first version's (OBJECTS in src/stations/origins.js);
// the n-th line of the card's timeline still corresponds to the n-th object.
import * as THREE from "three";
import { COLORS, Vox, V, canvasTexture, damp, label, lamp, pickable } from "../lib/kit.js";
import { pattern } from "../lib/voxel.js";
import { island, paving, greenery } from "../world.js";
import { tr } from "../../../src/i18n.js";
import { OBJECTS, POSTS } from "../../../src/stations/origins.js";

const DWELL = 3.4; // seconds the spotlight stays on each object
const HOVER_HOLD = 2.5; // seconds the hovered object keeps the spotlight after the pointer leaves
const BENCH_Y = 1.5; // height of the bench top above the lawn
const DESK_W = 17;
const DESK_D = 13.5;
const TIMELINE_Z = DESK_D / 2 - 0.45;

const mesh = (vox, options) => vox.mesh(options);
const cube = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lamp(color));
const font = (w, s, mono) => `${w} ${s}px ${mono ? "'JetBrains Mono', monospace" : "Inter, system-ui, sans-serif"}`;

// A flat screen or sheet painted on a canvas.
function screen(pxW, pxH, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas) }));
  return { mesh: plane, ctx: canvas.getContext("2d"), texture: plane.material.map };
}

// ---------------------------------------------------------------------------------------------------
// Objects. Each returns { root, play(k, dt, time), idle() }; k goes 0 → 1 while it holds the spotlight.

function books() {
  const root = new THREE.Group();
  const book = (color) => new Vox().box(-4, 0, -3, 3, 1, 2, color).box(-3, 0, -2, 3, 0, 2, 0xf3ecd8).box(-4, 0, -3, -4, 1, 2, color);
  const pile = new Vox().add(book(0x1f8f7f), 0, 0, 0).add(book(0xc27a2c), 0, 2, 0, 0);
  root.add(mesh(pile));
  const top = mesh(book(0x5b4bb5));
  top.rotation.y = 0.2;
  root.add(top);
  const pencil = mesh(new Vox().box(-3, 0, 0, 2, 0, 0, 0xf0b429).set(3, 0, 0, 0xe58ea0).set(-4, 0, 0, 0x3a3a3a));
  pencil.position.set(1.5, 0, 0.8);
  pencil.rotation.y = -0.5;
  root.add(pencil);
  return {
    root,
    play(k) {
      const lift = Math.sin(Math.min(1, k * 3) * Math.PI * 0.5);
      top.position.y = 1 + lift * 0.45;
      top.rotation.z = -0.22 * lift;
    },
    idle() {
      top.position.y = 1;
      top.rotation.z = 0;
    },
  };
}

function solderingBench() {
  const root = new THREE.Group();
  const board = new Vox().box(-5, 0, -4, 4, 0, 3, pattern.speckle(0x1f7a45, 0x23884d, 0.3));
  board.box(-3, 1, -1, -1, 1, 1, COLORS.ink).box(1, 1, 1, 3, 1, 1, 0xd8c49a).set(2, 1, 1, 0xd9603b).box(1, 1, -3, 1, 2, -3, 0x2f5fb8).box(-4, 1, 2, -1, 1, 2, 0x3a3a3a);
  board.box(0, 0, -1, 3, 0, -1, 0x7fd49a).box(3, 0, -1, 3, 0, 0, 0x7fd49a);
  root.add(mesh(board));
  const led = cube(0.24, 0.24, 0.24, 0x1f3a28);
  led.position.set(0.9, 0.38, 0.1);
  root.add(led);
  // The iron rests on its stand, tip over the joint.
  const iron = mesh(new Vox().box(0, 0, 0, 5, 1, 1, 0x2f6fd0).box(-3, 0, 0, -1, 0, 0, 0xb9c0c8));
  iron.position.set(1.4, 0.7, -0.6);
  iron.rotation.set(0, 0.5, 0.45);
  root.add(iron);
  const smoke = [0, 1, 2].map((i) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    s.userData.phase = i / 3;
    root.add(s);
    return s;
  });
  const on = new THREE.Color(0x5dfa7a);
  const off = new THREE.Color(0x1f3a28);
  return {
    root,
    play(k, dt, time) {
      // The LED only lights once the joint closes the circuit.
      led.material.color.copy(k > 0.55 ? on : off);
      smoke.forEach((s) => {
        const p = (time * 0.5 + s.userData.phase) % 1;
        s.position.set(0.55 + Math.sin(p * 6) * 0.08, 0.5 + p * 1.3, -0.45);
        s.material.opacity = k > 0.3 && k < 0.8 ? (1 - p) * 0.6 : 0;
      });
    },
    idle() {
      led.material.color.copy(off);
      smoke.forEach((s) => (s.material.opacity = 0));
    },
  };
}

function clipboard() {
  const root = new THREE.Group();
  root.rotation.y = 0.15;
  root.add(mesh(new Vox().box(-4, 0, -5, 3, 0, 5, pattern.bands("z", 3, COLORS.wood, COLORS.darkWood)).box(-2, 1, -5, 1, 1, -4, COLORS.stone)));
  const paper = screen(340, 440, 1.7, 2.2);
  paper.mesh.rotation.x = -Math.PI / 2;
  paper.mesh.position.set(0, 0.27, 0.2);
  root.add(paper.mesh);
  const pen = mesh(new Vox().box(-3, 0, 0, 2, 0, 0, 0x2f5fb8).set(3, 0, 0, COLORS.white));
  pen.position.set(1.4, 0.1, 0.9);
  pen.rotation.y = 0.7;
  root.add(pen);
  let visited = 312;
  let drawn = "";
  function draw(ticks) {
    const key = `${ticks}|${visited}`;
    if (key === drawn) return;
    drawn = key;
    const { ctx } = paper;
    ctx.fillStyle = "#f7f3e8";
    ctx.fillRect(0, 0, 340, 440);
    ctx.fillStyle = "#1f4f8f";
    ctx.font = font(800, 34);
    ctx.fillText("IBGE", 24, 50);
    ctx.fillStyle = "#3a4257";
    ctx.font = font(600, 17);
    ctx.fillText(tr("Censo Demográfico 2010", "2010 Population Census"), 24, 78);
    for (let i = 0; i < 6; i++) {
      const y = 126 + i * 42;
      ctx.strokeStyle = "#4a5570";
      ctx.lineWidth = 2;
      ctx.strokeRect(24, y - 16, 20, 20);
      if (i < ticks) {
        ctx.fillStyle = "#1f8f4f";
        ctx.fillRect(28, y - 12, 12, 12);
      }
      ctx.fillStyle = "#b9c0cc";
      ctx.fillRect(58, y - 10, 150 + ((i * 53) % 90), 9);
    }
    ctx.fillStyle = "#1f4f8f";
    ctx.font = font(700, 17);
    ctx.fillText(`${tr("domicílios visitados", "households visited")}: ${visited}`, 24, 412);
    paper.texture.needsUpdate = true;
  }
  draw(6);
  document.fonts?.ready.then(() => {
    drawn = "";
    draw(6);
  });
  let counted = false;
  return {
    root,
    play(k) {
      const ticks = Math.min(6, Math.floor(k * 1.4 * 7));
      // One more household each time the form is completed.
      if (ticks >= 6 && !counted) {
        visited++;
        counted = true;
      }
      draw(ticks);
    },
    idle() {
      counted = false;
      draw(6);
    },
  };
}

function oldPhone() {
  const root = new THREE.Group();
  root.rotation.y = -0.2;
  const body = new Vox().box(-2, 0, -4, 1, 1, 4, 0x3a404c).box(-2, 2, -4, 1, 2, 4, 0x4a5160).box(1, 2, -6, 1, 3, -5, 0x2c3340);
  body.box(-2, 3, 0, 1, 3, 3, (x, y, z) => ((x + z) % 2 ? 0xd9dde2 : 0xc4cad2));
  root.add(mesh(body));
  const lcd = cube(0.8, 0.06, 0.75, 0x6f8a5a);
  lcd.position.set(-0.12, 0.78, -0.5);
  root.add(lcd);
  const bar = cube(0.6, 0.07, 0.12, 0x1d2a14);
  bar.geometry.translate(0.3, 0, 0);
  bar.position.set(-0.42, 0.79, -0.4);
  root.add(bar);
  const dim = new THREE.Color(0x6f8a5a);
  const lit = new THREE.Color(0xb7e08a);
  return {
    root,
    play(k) {
      // The page takes its time to load, as mobile pages did.
      lcd.material.color.copy(dim).lerp(lit, Math.min(1, k * 2.5));
      bar.visible = k < 0.4;
      bar.scale.x = Math.max(0.01, k / 0.4);
    },
    idle() {
      lcd.material.color.copy(lit);
      bar.visible = false;
    },
  };
}

function car() {
  const v = new Vox();
  v.box(-4, 1, -2, 3, 2, 1, COLORS.kafka).box(-2, 3, -2, 1, 4, 1, 0x129488);
  v.box(-2, 3, -2, 1, 3, 1, (x, y, z) => (z === -2 || z === 1 || x === -2 || x === 1 ? COLORS.glass : undefined));
  v.set(3, 2, -2, 0xfff0a0).set(3, 2, 1, 0xfff0a0).box(-4, 1, -2, -4, 1, 1, COLORS.stone);
  for (const x of [-3, 2]) for (const z of [-3, 2]) v.box(x, 0, z, x, 1, z, COLORS.ink);
  return v;
}

function portoCar() {
  const root = new THREE.Group();
  root.rotation.y = 0.35;
  root.add(mesh(car()));
  const policy = cube(0.5, 0.64, 0.06, COLORS.ok);
  policy.position.y = 2;
  policy.visible = false;
  root.add(policy);
  return {
    root,
    play(k, dt, time) {
      policy.visible = k > 0.25;
      policy.position.y = 2 + Math.sin(time * 3) * 0.08;
      policy.rotation.y = time * 1.5;
    },
    idle() {
      policy.visible = false;
    },
  };
}

function diploma() {
  const root = new THREE.Group();
  const scroll = mesh(new Vox().rod("x", 1.5, 0.5, -4, 4, 1.5, (x) => (x === 0 ? 0xc0392b : 0xf3ecd8)));
  scroll.rotation.y = 0.5;
  root.add(scroll);
  const cap = mesh(new Vox().box(-2, 0, -2, 1, 1, 1, 0x23262e).box(-3, 2, -3, 2, 2, 2, 0x2c3038).set(2, 1, 2, 0xf0b429).set(2, 0, 2, 0xf0b429));
  cap.position.set(-1.1, 0, 1.1);
  cap.rotation.y = 0.6;
  root.add(cap);
  return {
    root,
    play(k, dt, time) {
      scroll.position.y = Math.sin(Math.min(1, k * 2.5) * Math.PI * 0.5) * 0.7;
      scroll.rotation.x = Math.sin(time * 1.5) * 0.15 * Math.min(1, k * 3);
    },
    idle() {
      scroll.position.y = 0;
      scroll.rotation.x = 0;
    },
  };
}

function statsBoard() {
  const root = new THREE.Group();
  root.position.z = -0.6;
  const board = new Vox().box(-7, 3, 0, 6, 12, 0, 0xf4f1e8).box(-8, 2, 0, 7, 2, 1, COLORS.stone).box(-8, 13, 0, 7, 13, 0, COLORS.stone);
  board.box(-8, 2, 0, -8, 13, 0, COLORS.stone).box(7, 2, 0, 7, 13, 0, COLORS.stone).box(-6, 0, 0, -6, 1, 0, COLORS.darkWood).box(5, 0, 0, 5, 1, 0, COLORS.darkWood);
  root.add(mesh(board));
  const N = 9;
  const heights = Array.from({ length: N }, (_, i) => Math.exp(-((i - (N - 1) / 2) ** 2) / 5) * 1.9);
  const bars = heights.map((_, i) => {
    const b = cube(0.26, 1, 0.08, COLORS.k8s);
    b.geometry.translate(0, 0.5, 0);
    b.position.set(-1.3 + i * 0.3, 0.95, 0.3);
    root.add(b);
    return b;
  });
  const dots = heights.map((h, i) => {
    const d = cube(0.12, 0.12, 0.08, COLORS.privacy);
    d.position.set(-1.3 + i * 0.3, 1.05 + h, 0.34);
    root.add(d);
    return d;
  });
  // The histogram grows from the center out, then the normal curve is dotted over it.
  const grow = (k) => {
    bars.forEach((b, i) => (b.scale.y = Math.max(0.01, heights[i] * THREE.MathUtils.clamp(k * 1.6 - Math.abs(i - (N - 1) / 2) * 0.05, 0, 1))));
    dots.forEach((d) => (d.visible = k > 0.7));
  };
  grow(1);
  return { root, play: (k) => grow(k), idle: () => grow(1) };
}

function deliveryTruck() {
  const root = new THREE.Group();
  root.rotation.y = -0.35;
  const v = new Vox();
  v.box(-6, 1, -2, 1, 1, 1, COLORS.steel).box(-6, 2, -2, -6, 2, 1, COLORS.k8s).box(-6, 2, -2, 1, 2, -2, COLORS.k8s).box(-6, 2, 1, 1, 2, 1, COLORS.k8s);
  v.box(2, 1, -2, 5, 4, 1, COLORS.k8s).box(4, 3, -2, 5, 3, 1, COLORS.glass).set(5, 2, -2, 0xfff0a0).set(5, 2, 1, 0xfff0a0);
  for (const x of [-5, -2, 3]) for (const z of [-3, 2]) v.box(x, 0, z, x, 1, z, COLORS.ink);
  root.add(mesh(v));
  const parcels = [-1.25, -0.75, -0.25].flatMap((x) => [0.55, 1.05].map((y) => {
    const p = mesh(new Vox().box(0, 0, 0, 1, 1, 2, (px, py, pz) => (pz === 1 ? 0xb98a5c : 0xc99b6b)), { origin: [1, 0, 1.5] });
    p.position.set(x, y - 0.05, 0);
    root.add(p);
    return p;
  }));
  const fill = (n) => parcels.forEach((p, i) => (p.visible = i < n));
  return {
    root,
    play(k) {
      // Fills up, then rolls forward as if leaving for the delivery.
      fill(Math.min(parcels.length, Math.floor(k * 1.6 * parcels.length)));
      root.position.x = root.userData.baseX + (Math.max(0, k - 0.7) / 0.3) * 0.6;
    },
    idle() {
      fill(parcels.length);
      root.position.x = root.userData.baseX;
    },
  };
}

function justiceScale() {
  const root = new THREE.Group();
  const brass = 0xc79a3a;
  root.add(mesh(new Vox().rod("y", -0.5, -0.5, 0, 0, 2.6, brass).box(-1, 1, -1, 0, 9, 0, brass).box(-1, 10, -1, 0, 10, 0, 0xe0b455)));
  const beam = new THREE.Group();
  beam.position.y = 2.4;
  root.add(beam);
  beam.add(mesh(new Vox().box(-5, 0, 0, 4, 0, 0, brass), { origin: [0, 0.5, 0.5] }));
  const pans = [-1, 1].map((side) => {
    const hanger = new THREE.Group();
    hanger.position.x = side * 1.15;
    beam.add(hanger);
    hanger.add(mesh(new Vox().box(-2, -4, -1, 1, -4, 1, brass).set(-2, -3, 0, 0xe0b455).set(1, -3, 0, 0xe0b455).set(-1, -2, 0, 0xe0b455).set(0, -1, 0, 0xe0b455), { origin: [0, 0, 0.5] }));
    return hanger;
  });
  // A small stack of documents on one pan: the court data the platform organizes.
  const docs = cube(0.4, 0.16, 0.3, COLORS.kafka);
  docs.position.set(-0.12, -0.67, 0);
  pans[0].add(docs);
  const gavel = mesh(new Vox().box(-2, 0, 0, 3, 0, 0, 0x8a5a2b).box(-3, -1, -1, -2, 1, 1, 0x6b4226));
  gavel.position.set(1.7, 0.3, 1);
  root.add(gavel);
  const settle = (angle) => {
    beam.rotation.z = angle;
    pans.forEach((p) => (p.rotation.z = -angle));
  };
  return {
    root,
    play(k, dt, time) {
      // Swings, then settles level: balanced, organized information. The gavel taps near the end.
      settle(Math.sin(time * 4) * 0.25 * Math.max(0, 1 - k * 1.6));
      gavel.rotation.z = -Math.sin(THREE.MathUtils.clamp((k - 0.6) / 0.25, 0, 1) * Math.PI) * 0.7;
    },
    idle() {
      settle(0);
      gavel.rotation.z = 0;
    },
  };
}

function radio() {
  const root = new THREE.Group();
  root.rotation.y = -0.3;
  const body = new Vox().box(-2, 0, -1, 1, 6, 0, 0x2a2f38).box(-2, 0, 1, 1, 6, 1, (x, y) => (y < 3 && (x + y) % 2 ? 0x1b1f26 : 0x343a45));
  body.box(0, 7, -1, 0, 12, -1, 0x1b1f26).set(-2, 7, 0, 0x8794a6).box(-2, 2, -2, -2, 4, -2, 0x4a5160);
  root.add(mesh(body));
  const display = cube(0.6, 0.3, 0.06, 0x3a5a2a);
  display.position.set(-0.12, 1.3, 0.53);
  root.add(display);
  const led = cube(0.12, 0.12, 0.06, 0x401010);
  led.position.set(0.25, 1.62, 0.53);
  root.add(led);
  const waves = [0, 1, 2].map((i) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 4, 4), new THREE.MeshBasicMaterial({ color: COLORS.message, transparent: true, opacity: 0, depthWrite: false }));
    w.position.set(0.12, 3.2, -0.12);
    w.rotation.z = Math.PI / 4;
    w.userData.offset = i / 3;
    root.add(w);
    return w;
  });
  const red = new THREE.Color(0xff4040);
  const off = new THREE.Color(0x401010);
  const lit = new THREE.Color(0x9be29b);
  const dim = new THREE.Color(0x3a5a2a);
  return {
    root,
    play(k, dt, time) {
      const transmitting = k > 0.1;
      led.material.color.copy(transmitting && Math.sin(time * 10) > 0 ? red : off);
      display.material.color.copy(transmitting ? lit : dim);
      waves.forEach((w) => {
        const p = (time * 0.7 + w.userData.offset) % 1;
        w.scale.setScalar(0.2 + p * 2);
        w.material.opacity = transmitting ? (1 - p) * 0.8 : 0;
      });
    },
    idle() {
      led.material.color.copy(off);
      display.material.color.copy(dim);
      waves.forEach((w) => (w.material.opacity = 0));
    },
  };
}

function laptop() {
  const root = new THREE.Group();
  root.rotation.y = -0.25;
  const silver = 0xb7bfca;
  const v = new Vox().box(-6, 0, -4, 5, 0, 3, silver).box(-5, 1, -3, 4, 1, 0, (x, y, z) => ((x + z) % 2 ? 0x3a404c : 0x2c3340)).box(-2, 1, 1, 1, 1, 2, 0xa3acb9);
  v.box(-6, 1, -5, 5, 8, -5, silver).box(-5, 2, -4, 4, 7, -4, COLORS.ink);
  root.add(mesh(v));
  const display = screen(640, 400, 2.5, 1.5);
  display.mesh.position.set(-0.12, 1.25, -0.74);
  root.add(display.mesh);
  const mug = mesh(new Vox().rod("y", -0.5, -0.5, 0, 2, 1.5, 0xf4f1e8).rod("y", -0.5, -0.5, 3, 3, 1.5, 0x4a2c1a).box(2, 1, -1, 2, 2, 0, 0xf4f1e8));
  mug.position.set(2.2, 0, 0.6);
  root.add(mug);
  let drawn = null;
  function draw(highlight) {
    if (highlight === drawn) return;
    drawn = highlight;
    const { ctx } = display;
    ctx.fillStyle = "#1d1e20";
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = "#2e2e33";
    ctx.fillRect(0, 0, 640, 52);
    ctx.fillStyle = "#dadadb";
    ctx.font = font(700, 22);
    ctx.fillText("(dev) Lucas Polo", 22, 34);
    ctx.font = font(400, 15, true);
    ctx.fillStyle = "#9b9c9d";
    ctx.fillText("blog.lucaspolo.dev", 440, 33);
    POSTS.forEach((title, i) => {
      const y = 84 + i * 45;
      if (i === highlight) {
        ctx.fillStyle = "#3a3b40";
        ctx.fillRect(12, y - 26, 616, 38);
      }
      ctx.fillStyle = i === highlight ? "#ffffff" : "#c4c4c5";
      ctx.font = font(i === highlight ? 600 : 400, 18);
      ctx.fillText(title.length > 58 ? `${title.slice(0, 57)}…` : title, 26, y);
    });
    display.texture.needsUpdate = true;
  }
  draw(-1);
  document.fonts?.ready.then(() => {
    drawn = null;
    draw(-1);
  });
  return {
    root,
    play: (k) => draw(Math.min(POSTS.length - 1, Math.floor(k * POSTS.length))),
    idle: () => draw(-1),
  };
}

// One builder per phase, in the order of OBJECTS (which is the order of the card's timeline).
const BUILDERS = [books, solderingBench, clipboard, oldPhone, portoCar, diploma, statsBoard, deliveryTruck, justiceScale, radio, laptop];

function bench() {
  const w = Math.round(DESK_W / V / 2);
  const d = Math.round(DESK_D / V / 2);
  const v = new Vox();
  v.box(-w, -2, -d, w - 1, -1, d - 1, pattern.bands("z", 5, 0xc48a4d, 0xb97f43)).box(-w, -2, -d, w - 1, -2, d - 1, 0x9a6b3a);
  v.box(-w, -1, d - 1, w - 1, -1, d - 1, 0xa87539).box(-w, -1, -d, w - 1, -1, -d, 0xa87539);
  for (const x of [-w + 2, w - 5]) for (const z of [-d + 2, d - 5]) v.box(x, -Math.round(BENCH_Y / V), z, x + 2, -3, z + 2, 0x8a5a2b);
  return v;
}

export function createOrigins() {
  const group = new THREE.Group();
  const pickables = [];

  const ground = paving().rect(-10.5, -8.6, 10.5, 8.8, (i, k) => ((Math.floor(i / 4) + Math.floor(k / 4)) % 2 ? 0xeadcbd : 0xe2d2ae));
  group.add(island({ rx: 21, rz: 15, seed: 7, paint: ground.paint }));
  group.add(
    greenery([
      ["palm", -17, -5], ["tree", -13.5, 6.5], ["bush", -12.5, -9.5], ["tree", 13.5, -8.5], ["palm", 17, 4], ["bush", 12.5, 9],
      ["rock", -16.5, 1.5], ["rock", 16.5, -2.5], ["bush", 14.5, -4.5], ["bush", -15, 10.2],
    ]),
  );

  // Everything on the bench lives in the bench's own space, with y = 0 at its top.
  const top = new THREE.Group();
  top.position.y = BENCH_Y;
  group.add(top);
  top.add(mesh(bench()));

  const spot = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.68, 4, 1), lamp(COLORS.warn));
  spot.rotation.x = -Math.PI / 2;
  spot.rotation.z = Math.PI / 4;
  spot.position.y = 0.03;
  top.add(spot);

  const rail = cube(DESK_W - 2, 0.06, 0.06, 0x8a5a2b);
  rail.position.set(0, 0.04, TIMELINE_Z);
  top.add(rail);

  const items = OBJECTS.map((o, i) => {
    const obj = BUILDERS[i]();
    obj.root.position.x += o.x;
    obj.root.userData.baseX = obj.root.position.x;
    obj.root.position.z += o.z;
    top.add(obj.root);
    const l = label(`${o.year} · ${o.short}`);
    l.position.set(o.x, o.tall ? 3.9 : 2.4, o.z);
    l.visible = false;
    top.add(l);
    // An invisible box around the object is easier to hover than its thin parts.
    // Low objects get low boxes so they don't steal the pointer from the taller objects behind them.
    const h = o.tall ? 3.4 : 1.6;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.8, h, 2.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(o.x, h / 2, o.z);
    top.add(hit);
    // Company miniatures link to their full scene.
    const goTo = o.scene ? () => document.getElementById(o.scene)?.scrollIntoView({ block: "center" }) : undefined;
    pickable(pickables, hit, { title: `${o.year} · ${o.short}`, text: o.text }, goTo);
    const marker = cube(0.3, 0.3, 0.3, COLORS.stone);
    marker.position.set(-7.5 + i * 1.5, 0.18, TIMELINE_Z);
    top.add(marker);
    const year = label(o.year, "small plain");
    year.position.set(0, -0.5, 0.4);
    marker.add(year);
    obj.idle();
    return { ...o, obj, label: l, hit, marker };
  });

  let active = 0;
  let clock = 0;
  let hoverHold = 0;
  let listItems = [];
  const markerOn = new THREE.Color(COLORS.message);
  const markerOff = new THREE.Color(0xb9a98a);

  function activate(i) {
    if (i === active) return;
    items[active].obj.idle();
    items[active].label.visible = false;
    active = i;
    clock = 0;
    listItems.forEach((li, k) => li.classList.toggle("active", k === i));
  }

  return {
    id: "origins",
    group,
    pickables,
    view: { pos: [0, 19.5, 22], target: [0, 1.9, 0.2], fogFar: 300 },
    bindUi(section) {
      // The card's timeline mirrors the bench: hovering a line moves the spotlight there.
      listItems = [...section.querySelectorAll(".timeline li")];
      listItems.forEach((li, k) =>
        li.addEventListener("mouseenter", () => {
          activate(k);
          hoverHold = HOVER_HOLD * 3;
        }),
      );
      listItems[active]?.classList.add("active");
    },
    update(dt, time, focus) {
      if (focus < 0.2) {
        activate(0);
        clock = 0;
        return;
      }
      const hovered = items.findIndex((it) => it.hit.userData.hovered);
      if (hovered >= 0) {
        activate(hovered);
        hoverHold = HOVER_HOLD;
      }
      hoverHold = Math.max(0, hoverHold - dt);
      clock += dt;
      if (clock > DWELL && hoverHold === 0 && hovered < 0) activate((active + 1) % items.length);

      const it = items[active];
      it.label.visible = true;
      it.obj.play(Math.min(1, clock / (DWELL * 0.8)), dt, time);
      spot.position.x = damp(spot.position.x, it.x, 6, dt);
      spot.position.z = damp(spot.position.z, it.z, 6, dt);
      spot.rotation.z += dt * 0.6;
      items.forEach((o, i) => {
        o.marker.material.color.copy(i === active ? markerOn : markerOff);
        o.marker.scale.setScalar(i === active ? 1.5 : 1);
      });
    },
  };
}
