// Origins scene: a workbench with one object per phase, lit up in chronological order. Hovering an object
// (or its line in the card's timeline) jumps to it; otherwise the spotlight walks the desk on its own.
import * as THREE from "three";
import { COLORS, glow, label, pickable, damp } from "../lib/kit.js";

const DWELL = 3.4; // seconds the spotlight stays on each object
const HOVER_HOLD = 2.5; // seconds the hovered object keeps the spotlight after the pointer leaves
const DESK_W = 17;
const DESK_D = 10.5;
// Two rows read like the timeline: the low, older objects in front, the taller, recent ones behind.
const FRONT_Z = 2.2;
const BACK_Z = -2.2;
const COLUMNS = [-6, -2, 2, 6];
const TIMELINE_Z = DESK_D / 2 - 0.45;

// Real titles from blog.lucaspolo.dev.
const POSTS = [
  "Criando ciclos - A maneira abrangente",
  "Um pouco sobre cálculo lambda",
  "O problema de Monty Hall e como estatística não é algo intuitivo",
  "Quem programa as linguagens de programação?",
  "Nashorn: Javascript sobre a JVM",
  "Gerando código que gera código",
  "Iterando sobre uma matriz com um único loop",
];

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...extra });
const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
const font = (w, s, mono) => `${w} ${s}px ${mono ? "'JetBrains Mono', monospace" : "Inter, system-ui, sans-serif"}`;

function screen(pxW, pxH, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  return { mesh, ctx, texture };
}

// ---------------------------------------------------------------------------------------------------
// Objects. Each returns { root, play(k, dt, time), idle() }; k goes 0 → 1 while it holds the spotlight.

function books() {
  const root = new THREE.Group();
  const stack = [0x1f6f63, 0x8a5a1c, 0x4b3f8f].map((c, i) => {
    const b = box(2, 0.32, 1.4, mat(c));
    b.position.y = 0.16 + i * 0.33;
    b.rotation.y = (i - 1) * 0.12;
    const pages = box(1.9, 0.26, 1.32, mat(0xd9d2c0));
    pages.position.x = 0.06;
    b.add(pages);
    root.add(b);
    return b;
  });
  const top = stack[2];
  return {
    root,
    play(k) {
      const lift = Math.sin(Math.min(1, k * 3) * Math.PI * 0.5);
      top.position.y = 0.82 + lift * 0.35;
      top.rotation.z = -0.25 * lift;
    },
    idle() {
      top.position.y = 0.82;
      top.rotation.z = 0;
    },
  };
}

function solderingBench() {
  const root = new THREE.Group();
  const board = box(2.2, 0.08, 1.6, mat(0x0d4d2c, { roughness: 0.5 }));
  board.position.y = 0.04;
  root.add(board);
  const chip = box(0.6, 0.12, 0.45, mat(0x0b0d12, { metalness: 0.5 }));
  chip.position.set(-0.4, 0.14, 0);
  root.add(chip);
  const traceMat = new THREE.LineBasicMaterial({ color: 0x3fae6e });
  [
    [-0.1, 0.1, 0.7, 0.1],
    [-0.1, -0.1, 0.5, -0.4],
    [-0.7, 0.2, -0.9, 0.6],
  ].forEach(([x1, z1, x2, z2]) => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, 0.09, z1),
      new THREE.Vector3(x2, 0.09, z1),
      new THREE.Vector3(x2, 0.09, z2),
    ]);
    root.add(new THREE.Line(g, traceMat));
  });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }));
  led.position.set(0.7, 0.16, 0.1);
  root.add(led);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }));
  joint.position.set(0.5, 0.12, -0.4);
  root.add(joint);

  // The iron rests on the board edge, tip pointing at the solder joint.
  const iron = new THREE.Group();
  iron.position.set(0.95, 0.55, -0.25);
  iron.rotation.set(0, 0.5, 0.55);
  root.add(iron);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.1, 14), mat(0x2b5aa8));
  handle.rotation.z = Math.PI / 2;
  handle.position.x = 0.55;
  iron.add(handle);
  const tipMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.55, 10), tipMat);
  tip.rotation.z = Math.PI / 2;
  tip.position.x = -0.27;
  iron.add(tip);

  const smoke = Array.from({ length: 5 }, (_, i) => {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xc8d0de, transparent: true, opacity: 0, depthWrite: false }),
    );
    s.userData.phase = i / 5;
    root.add(s);
    return s;
  });
  const metal = new THREE.Color(0x8a95a8);
  const hot = glow(COLORS.message, 2.6);
  const solder = glow(COLORS.warn, 1.6);
  const ledOn = glow(COLORS.ok, 3);
  const ledOff = new THREE.Color(0x1f3a28);
  return {
    root,
    play(k, dt, time) {
      tipMat.color.copy(metal).lerp(hot, Math.min(1, k * 4));
      joint.material.color.copy(k > 0.45 ? solder : metal);
      // The LED only lights once the joint closes the circuit.
      led.material.color.copy(k > 0.55 ? ledOn : ledOff);
      smoke.forEach((s) => {
        const p = (time * 0.5 + s.userData.phase) % 1;
        s.position.set(0.5 + Math.sin(p * 6) * 0.08, 0.2 + p * 1.2, -0.4);
        s.scale.setScalar(0.6 + p * 1.5);
        s.material.opacity = k > 0.3 && k < 0.8 ? (1 - p) * 0.35 : 0;
      });
    },
    idle() {
      tipMat.color.copy(metal);
      joint.material.color.copy(metal);
      led.material.color.copy(ledOff);
      smoke.forEach((s) => (s.material.opacity = 0));
    },
  };
}

function clipboard() {
  const root = new THREE.Group();
  root.rotation.y = 0.15;
  const board = box(1.9, 0.06, 2.5, mat(0x6b4a2b));
  board.position.y = 0.03;
  root.add(board);
  const clip = box(0.8, 0.12, 0.25, mat(0xaab4c4, { metalness: 0.8, roughness: 0.3 }));
  clip.position.set(0, 0.12, -1.12);
  root.add(clip);
  const paper = screen(520, 680, 1.7, 2.22);
  paper.mesh.rotation.x = -Math.PI / 2;
  paper.mesh.position.set(0, 0.07, 0.08);
  root.add(paper.mesh);
  const questions = ["Responsável pelo domicílio", "Número de moradores", "Tipo de domicílio", "Abastecimento de água", "Energia elétrica", "Rendimento"];
  let visited = 312;
  let drawn = "";
  function draw(ticks) {
    const key = `${ticks}|${visited}`;
    if (key === drawn) return;
    drawn = key;
    const { ctx } = paper;
    ctx.fillStyle = "#e4e7ee";
    ctx.fillRect(0, 0, 520, 680);
    ctx.fillStyle = "#1f4f8f";
    ctx.font = font(800, 44);
    ctx.fillText("IBGE", 36, 70);
    ctx.fillStyle = "#1a2236";
    ctx.font = font(600, 24);
    ctx.fillText("Censo Demográfico 2010", 36, 108);
    ctx.font = font(400, 20);
    ctx.fillStyle = "#4a5570";
    ctx.fillText("Questionário básico", 36, 138);
    questions.forEach((q, i) => {
      const y = 200 + i * 62;
      ctx.strokeStyle = "#4a5570";
      ctx.lineWidth = 2;
      ctx.strokeRect(36, y - 22, 26, 26);
      if (i < ticks) {
        ctx.strokeStyle = "#1f8f4f";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(40, y - 9);
        ctx.lineTo(48, y);
        ctx.lineTo(60, y - 20);
        ctx.stroke();
      }
      ctx.fillStyle = "#1a2236";
      ctx.font = font(400, 22);
      ctx.fillText(q, 78, y);
    });
    ctx.fillStyle = "#1f4f8f";
    ctx.font = font(700, 22);
    ctx.fillText(`domicílios visitados: ${visited}`, 36, 640);
    paper.texture.needsUpdate = true;
  }
  draw(questions.length);
  document.fonts?.ready.then(() => {
    drawn = "";
    draw(questions.length);
  });
  let counted = false;
  return {
    root,
    play(k) {
      const ticks = Math.min(questions.length, Math.floor(k * 1.4 * (questions.length + 1)));
      // One more household each time the form is completed.
      if (ticks >= questions.length && !counted) {
        visited++;
        counted = true;
      }
      draw(ticks);
    },
    idle() {
      counted = false;
      draw(questions.length);
    },
  };
}

function oldPhone() {
  const root = new THREE.Group();
  root.rotation.set(-0.25, -0.2, 0);
  const body = box(0.95, 0.14, 1.9, mat(0x2a2f3a, { metalness: 0.4, roughness: 0.35 }));
  body.position.y = 0.07;
  root.add(body);
  const lcd = screen(300, 240, 0.72, 0.58);
  lcd.mesh.rotation.x = -Math.PI / 2;
  lcd.mesh.position.set(0, 0.145, -0.45);
  root.add(lcd.mesh);
  const keyMat = mat(0x5c6475);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const key = box(0.2, 0.04, 0.13, keyMat);
      key.position.set((c - 1) * 0.26, 0.16, 0.2 + r * 0.19);
      root.add(key);
    }
  }
  let drawn = -1;
  function draw(k) {
    const key = Math.floor(k * 20);
    if (key === drawn) return;
    drawn = key;
    const { ctx } = lcd;
    ctx.fillStyle = "#9fb88a";
    ctx.fillRect(0, 0, 300, 240);
    ctx.fillStyle = "#1d2a14";
    ctx.strokeStyle = "#1d2a14";
    if (k < 0.4) {
      ctx.font = font(600, 22, true);
      ctx.fillText("carregando…", 50, 110);
      ctx.strokeRect(40, 135, 220, 20);
      ctx.fillRect(44, 139, 212 * (k / 0.4), 12);
    } else {
      ctx.fillRect(0, 0, 300, 44);
      ctx.fillStyle = "#9fb88a";
      ctx.font = font(700, 22, true);
      ctx.fillText("m.exemplo", 14, 30);
      ctx.fillStyle = "#1d2a14";
      ctx.font = font(400, 20, true);
      ["> Ofertas", "> Produtos", "> Contato"].forEach((t, i) => ctx.fillText(t, 14, 80 + i * 36));
      ctx.font = font(400, 15, true);
      ctx.fillText("PHP · CodeIgniter", 14, 222);
    }
    lcd.texture.needsUpdate = true;
  }
  draw(1);
  return { root, play: (k) => draw(k), idle: () => draw(1) };
}

function diploma() {
  const root = new THREE.Group();
  const scroll = new THREE.Group();
  scroll.position.y = 0.32;
  scroll.rotation.y = 0.5;
  root.add(scroll);
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 24), mat(0xe8e1cc));
  paper.rotation.z = Math.PI / 2;
  scroll.add(paper);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 8, 24), mat(0xa3242e));
  ribbon.rotation.y = Math.PI / 2;
  scroll.add(ribbon);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), new THREE.MeshBasicMaterial({ toneMapped: false }));
  seal.rotation.x = Math.PI / 2;
  seal.position.set(0, -0.15, 0.32);
  scroll.add(seal);
  const gold = glow(COLORS.message, 2);
  const dull = new THREE.Color(0x7a5a10);
  return {
    root,
    play(k, dt, time) {
      scroll.position.y = 0.32 + Math.sin(Math.min(1, k * 2.5) * Math.PI * 0.5) * 0.6;
      scroll.rotation.x = Math.sin(time * 1.5) * 0.15 * Math.min(1, k * 3);
      seal.material.color.copy(dull).lerp(gold, Math.min(1, k * 3));
    },
    idle() {
      scroll.position.y = 0.32;
      scroll.rotation.x = 0;
      seal.material.color.copy(dull);
    },
  };
}

function statsBoard() {
  const root = new THREE.Group();
  root.position.z = -0.6;
  const board = box(3.4, 2.2, 0.08, mat(0xe4e7ee, { roughness: 0.4 }));
  board.position.y = 1.55;
  board.rotation.x = -0.12;
  root.add(board);
  board.add(new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: 0x8a95a8 })));
  [-1.2, 1.2].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 8), mat(0x5c4630));
    leg.position.set(x, 0.75, 0.15);
    leg.rotation.x = 0.15;
    root.add(leg);
  });
  const N = 11;
  const barMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.k8s, 1.1), toneMapped: false });
  const heights = Array.from({ length: N }, (_, i) => Math.exp(-((i - (N - 1) / 2) ** 2) / 6) * 1.4);
  const bars = heights.map((_, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.04).translate(0, 0.5, 0), barMat);
    b.position.set(-1.25 + i * 0.25, -0.85, 0.06);
    board.add(b);
    return b;
  });
  const curve = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(heights.map((h, i) => new THREE.Vector3(-1.25 + i * 0.25, -0.85 + h, 0.07))),
    new THREE.LineBasicMaterial({ color: glow(COLORS.privacy, 1.6), toneMapped: false }),
  );
  board.add(curve);
  // The histogram grows from the center out, then the normal curve is drawn over it.
  const grow = (k) => {
    bars.forEach((b, i) => {
      const local = THREE.MathUtils.clamp(k * 1.6 - Math.abs(i - (N - 1) / 2) * 0.05, 0, 1);
      b.scale.y = Math.max(0.01, heights[i] * local);
    });
    curve.visible = k > 0.7;
  };
  grow(1);
  return { root, play: (k) => grow(k), idle: () => grow(1) };
}

function radio() {
  const root = new THREE.Group();
  root.rotation.y = -0.3;
  const body = box(0.65, 1.5, 0.38, mat(0x1a1d24, { roughness: 0.5 }));
  body.position.y = 0.75;
  root.add(body);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.2, 10), mat(0x0b0d12));
  antenna.position.set(0.18, 2.1, 0);
  root.add(antenna);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12), mat(0x5c6475));
  knob.position.set(-0.15, 1.57, 0);
  root.add(knob);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.25), new THREE.MeshBasicMaterial({ toneMapped: false }));
  display.position.set(0, 1.15, 0.195);
  root.add(display);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }));
  led.position.set(0.2, 1.4, 0.195);
  root.add(led);
  const waves = Array.from({ length: 3 }, (_, i) => {
    const w = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.03, 6, 48),
      new THREE.MeshBasicMaterial({ color: glow(COLORS.message, 1.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    w.position.set(0.18, 2.7, 0);
    w.userData.offset = i / 3;
    root.add(w);
    return w;
  });
  const red = glow(COLORS.danger, 3);
  const off = new THREE.Color(0x401010);
  const lit = glow(COLORS.ok, 1.2);
  const dim = new THREE.Color(0x3a5a2a);
  return {
    root,
    play(k, dt, time) {
      const transmitting = k > 0.1;
      led.material.color.copy(transmitting && Math.sin(time * 10) > 0 ? red : off);
      display.material.color.copy(transmitting ? lit : dim);
      waves.forEach((w) => {
        const p = (time * 0.7 + w.userData.offset) % 1;
        w.scale.setScalar(0.2 + p * 2.2);
        w.material.opacity = transmitting ? (1 - p) * 0.7 : 0;
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
  const shell = mat(0x8a95a8, { metalness: 0.6, roughness: 0.35 });
  const base = box(3, 0.1, 2, shell);
  base.position.y = 0.05;
  root.add(base);
  const keys = box(2.6, 0.02, 1.1, mat(0x2a2f3a));
  keys.position.set(0, 0.11, 0.25);
  root.add(keys);
  const lid = new THREE.Group();
  lid.position.set(0, 0.1, -1);
  lid.rotation.x = -0.25;
  root.add(lid);
  const back = box(3, 1.95, 0.08, shell);
  back.position.set(0, 0.98, -0.04);
  lid.add(back);
  const display = screen(768, 500, 2.8, 1.82);
  display.mesh.position.set(0, 0.98, 0.005);
  lid.add(display.mesh);
  let drawn = null;
  function draw(highlight) {
    if (highlight === drawn) return;
    drawn = highlight;
    const { ctx } = display;
    ctx.fillStyle = "#1d1e20";
    ctx.fillRect(0, 0, 768, 500);
    ctx.fillStyle = "#2e2e33";
    ctx.fillRect(0, 0, 768, 64);
    ctx.fillStyle = "#dadadb";
    ctx.font = font(700, 26);
    ctx.fillText("(dev) Lucas Polo", 28, 42);
    ctx.font = font(400, 18, true);
    ctx.fillStyle = "#9b9c9d";
    ctx.fillText("blog.lucaspolo.dev", 520, 40);
    POSTS.forEach((title, i) => {
      const y = 104 + i * 56;
      if (i === highlight) {
        ctx.fillStyle = "#3a3b40";
        ctx.fillRect(16, y - 32, 736, 48);
      }
      ctx.fillStyle = i === highlight ? "#ffffff" : "#c4c4c5";
      ctx.font = font(i === highlight ? 600 : 400, 22);
      ctx.fillText(title.length > 56 ? `${title.slice(0, 55)}…` : title, 32, y);
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

const OBJECTS = [
  { year: "2006", short: "Técnico em programação", x: COLUMNS[0], z: FRONT_Z, build: books, text: "Técnico em programação no IFSP: o primeiro contato com lógica e código." },
  {
    year: "2008",
    short: "Solda e montagem de circuitos",
    x: COLUMNS[1],
    z: FRONT_Z,
    build: solderingBench,
    text: "Primeiro emprego, na Luxxel: soldagem e montagem de circuitos eletrônicos e testes de reatores.",
  },
  { year: "2010", short: "Recenseador do IBGE", x: COLUMNS[2], z: FRONT_Z, build: clipboard, text: "Recenseador do IBGE em Itapemirim (ES), de porta em porta. Dados coletados um a um." },
  { year: "2011", short: "Sites móveis na Mobint", x: COLUMNS[3], z: FRONT_Z, build: oldPhone, text: "Estágio na Mobint: sites móveis com PHP (CodeIgniter) e MySQL. Logo depois, a Porto Seguro." },
  {
    year: "2015",
    short: "Sistemas de Informação",
    x: COLUMNS[0],
    z: BACK_Z,
    build: diploma,
    text: "Bacharelado em Sistemas de Informação na Anhanguera, cursado enquanto trabalhava na Porto Seguro.",
  },
  {
    year: "2018",
    short: "Estatística aplicada",
    x: COLUMNS[1],
    z: BACK_Z,
    build: statsBoard,
    text: "Extensão em Estatística Aplicada na FMU. Depois, de 2022 a 2024, Matemática na UNINTER (não concluído).",
  },
  {
    year: "2026",
    short: "Radioamador e Telecom",
    x: COLUMNS[2],
    z: BACK_Z,
    build: radio,
    text: "Radioamador, com um projeto de simulados para a prova da Anatel. Em 2026, pós em Engenharia de Redes de Telecomunicações (Estácio).",
  },
  {
    year: "hoje",
    short: "O blog",
    x: COLUMNS[3],
    z: BACK_Z,
    build: laptop,
    text: "blog.lucaspolo.dev: anotações sobre o que estou aprendendo, de Python e Java a cálculo lambda e estatística.",
  },
];

export function createOrigins() {
  const group = new THREE.Group();
  const pickables = [];

  // Desk
  const top = box(DESK_W, 0.4, DESK_D, mat(0x2a1f18, { roughness: 0.75 }));
  top.position.y = -0.2;
  top.add(new THREE.LineSegments(new THREE.EdgesGeometry(top.geometry), new THREE.LineBasicMaterial({ color: 0x6b4a2b })));
  group.add(top);
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach((sz) => {
      const leg = box(0.4, 6, 0.4, mat(0x1e1611));
      leg.position.set(sx * (DESK_W / 2 - 0.6), -3.4, sz * (DESK_D / 2 - 0.6));
      group.add(leg);
    }),
  );

  // A warm lamp and a ring on the desk follow the active object.
  const lamp = new THREE.PointLight(0xffd9a0, 40, 18, 2);
  lamp.position.set(0, 4, 1);
  group.add(lamp);
  const spot = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.65, 48),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.message, 1.4), toneMapped: false, transparent: true, opacity: 0.8 }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.02;
  group.add(spot);

  const rail = box(DESK_W - 2, 0.04, 0.04, new THREE.MeshBasicMaterial({ color: 0x5c4630 }));
  rail.position.set(0, 0.03, TIMELINE_Z);
  group.add(rail);

  const items = OBJECTS.map((o, i) => {
    const obj = o.build();
    obj.root.position.x += o.x;
    obj.root.position.z += o.z;
    group.add(obj.root);
    const l = label(`${o.year} · ${o.short}`);
    l.position.set(o.x, o.z === FRONT_Z ? 2 : 3.4, o.z);
    l.visible = false;
    group.add(l);
    // An invisible box around the object is easier to hover than its thin parts.
    // Front-row boxes stay low so they don't steal the pointer from the taller objects behind them.
    const h = o.z === FRONT_Z ? 1.4 : 3.2;
    const hit = box(2.6, h, 2.4, new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(o.x, h / 2, o.z);
    group.add(hit);
    pickable(pickables, hit, { title: `${o.year} · ${o.short}`, text: o.text });
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ toneMapped: false }));
    marker.position.set(-7 + i * 2, 0.12, TIMELINE_Z);
    group.add(marker);
    const year = label(o.year, "small plain");
    year.position.set(0, -0.45, 0.3);
    marker.add(year);
    obj.idle();
    return { ...o, obj, label: l, hit, marker };
  });

  let active = 0;
  let clock = 0;
  let hoverHold = 0;
  let listItems = [];
  const markerOn = glow(COLORS.message, 2.4);
  const markerOff = new THREE.Color(COLORS.dim);

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
    view: { pos: [0, 12.5, 16.5], target: [0, 0.8, -0.2], fogFar: 100 },
    bindUi(section) {
      // The card's timeline mirrors the desk: hovering a line moves the spotlight there.
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
      lamp.position.set(spot.position.x, 4, spot.position.z + 1);
      items.forEach((o, i) => {
        o.marker.material.color.copy(i === active ? markerOn : markerOff);
        o.marker.scale.setScalar(i === active ? 1.4 : 1);
      });
    },
  };
}
