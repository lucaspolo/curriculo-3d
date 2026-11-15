// Porto Seguro island: the policy issuance pipeline. A customer drives up, hands in the proposal, follows it
// along the conveyor through the stages and drives off with the issued policy. Informix and Oracle answer
// every stage. Stage names and texts are the first version's; the middle stages are illustrative.
import * as THREE from "three";
import { COLORS, Flow, Vox, canvasTexture, damp, hop, label, lamp, pickable, place } from "../lib/kit.js";
import { pattern } from "../lib/voxel.js";
import { island, paving, greenery } from "../world.js";
import { tr, locale } from "../../../src/i18n.js";
import { STAGES, DATABASES, RISK, SNIPPETS } from "../../../src/stations/porto.js";

const ROAD_Z = 5.4;
const BELT_Y = 1.25;
const BELT_START = -13;
const SPAWN_X = -22;
const ARRIVE_X = -15;
const LEAVE_X = 21;
const STAGE_X = [-9, -3, 3, 9];
const DOC_SPEED = 3.2;
const DWELL = 1.3; // seconds a proposal spends inside each stage
const SPAWN_EVERY = 4.2;
const POOL = 6;
const CAR_COLORS = [COLORS.kafka, COLORS.message, COLORS.privacy, COLORS.k8s, COLORS.llm, COLORS.warn];

// A stage of the line: two legs and a hood over the belt, with a slot for its lamp on top.
function stageArch(color) {
  const v = new Vox();
  const shade = new THREE.Color(color).multiplyScalar(0.8).getHex();
  for (const z of [-5, 3]) v.box(-5, 0, z, 4, 9, z + 1, pattern.speckle(color, shade, 0.25));
  v.box(-5, 10, -5, 4, 12, 4, pattern.speckle(color, shade, 0.25)).box(-5, 11, -5, 4, 11, 4, COLORS.white);
  return v.box(-3, 13, -2, 2, 13, 1, COLORS.steel).box(-4, 8, 5, 3, 11, 5, COLORS.ink);
}

function conveyor() {
  const v = new Vox();
  v.box(-55, 4, -3, 54, 4, 2, (x) => (x % 4 === 0 ? 0x3c4654 : 0x4a5564)).box(-55, 3, -4, 54, 3, 3, COLORS.steel);
  for (let x = -52; x <= 52; x += 13) v.box(x, 0, -3, x + 1, 2, -2, COLORS.darkStone).box(x, 0, 1, x + 1, 2, 2, COLORS.darkStone);
  return v;
}

function database(color) {
  const v = new Vox();
  const shade = new THREE.Color(color).multiplyScalar(0.78).getHex();
  for (let y = 0; y < 10; y++) v.rod("y", -0.5, -0.5, y, y, 5, y % 3 === 2 ? COLORS.white : y % 3 ? color : shade);
  return v.rod("y", -0.5, -0.5, 10, 10, 4.2, COLORS.stone);
}

function crt() {
  const v = new Vox();
  v.box(-18, 0, -5, 17, 19, -1, pattern.speckle(0xe7dcc4, 0xddd0b4, 0.3)).box(-17, 1, 0, 16, 18, 0, 0xcfc2a5).cut(-16, 2, 0, 15, 17, 0);
  v.box(-16, 2, -1, 15, 17, -1, COLORS.ink).box(-8, -4, -4, 7, -1, -2, 0xcfc2a5).box(-12, -5, -6, 11, -5, 0, 0xbfb295);
  return v.set(13, 1, 0, COLORS.ok).set(11, 1, 0, COLORS.danger);
}

// Built facing +x, the direction of the road. Near-white, so the material's color paints each customer's car.
function carModel() {
  const v = new Vox();
  v.box(-4, 1, -2, 3, 2, 1, 0xffffff).box(-2, 3, -2, 1, 4, 1, 0xf2f2f2);
  v.box(-2, 3, -2, 1, 3, 1, (x, y, z) => (z === -2 || z === 1 || x === -2 || x === 1 ? 0x5d6570 : undefined));
  v.box(-4, 1, -2, -4, 1, 1, 0x8a8a8a).box(3, 1, -2, 3, 1, 1, 0x8a8a8a).set(3, 2, -2, 0xfff0a0).set(3, 2, 1, 0xfff0a0);
  for (const x of [-3, 2]) for (const z of [-3, 2]) v.box(x, 0, z, x, 1, z, 0x2c2c2c);
  return v;
}

// A sheet of paper standing on the belt, lines and all.
function sheet() {
  return new Vox().box(-2, 0, 0, 2, 6, 0, (x, y) => (y < 5 && y % 2 === 0 && Math.abs(x) < 2 ? 0xb9c0c8 : 0xfbf7ec));
}

function makeTerminal() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = canvasTexture(canvas);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.8), new THREE.MeshBasicMaterial({ map: texture }));
  let snippet = 0;
  let chars = 0;
  let drawn = -1;
  let pause = 0;
  const total = (s) => s.lines.join("\n").length;

  function draw(blink) {
    const s = SNIPPETS[snippet];
    ctx.fillStyle = "#06180f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "600 24px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#2fbf74";
    ctx.fillText(`-- ${s.title}`, 32, 44);
    ctx.fillStyle = "#5dfaa0";
    let left = Math.floor(chars);
    s.lines.forEach((line, i) => {
      if (left <= 0) return;
      const shown = line.slice(0, left);
      left -= line.length + 1;
      ctx.fillText(shown, 32, 92 + i * 40);
      if (left <= 0 && blink) ctx.fillRect(36 + ctx.measureText(shown).width, 72 + i * 40, 14, 26);
    });
    texture.needsUpdate = true;
  }
  document.fonts?.ready.then(() => (drawn = -1));

  return {
    mesh: screen,
    update(dt, time) {
      const s = SNIPPETS[snippet];
      if (chars < total(s)) {
        chars = Math.min(total(s), chars + dt * 45);
      } else {
        pause += dt;
        if (pause > 3) {
          pause = 0;
          chars = 0;
          snippet = (snippet + 1) % SNIPPETS.length;
        }
      }
      const blink = Math.floor(time * 2) % 2;
      // Twenty redraws a second are plenty for typing; each one repaints and re-uploads the whole screen.
      const key = Math.floor(chars / 2.25) * 2 + blink + snippet * 100000;
      if (key !== drawn) {
        drawn = key;
        draw(blink === 0);
      }
    },
  };
}

export function createPorto() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(80, 0.3);
  group.add(flow.mesh);

  const ground = paving()
    .rect(-15, -3.4, 15, 2.6, (i, k) => ((Math.floor(i / 4) + Math.floor(k / 4)) % 2 ? 0xeadcbd : 0xe2d2ae))
    .rect(-25, ROAD_Z - 1.3, 25, ROAD_Z + 1.3, (i, k) => (k === Math.round(ROAD_Z / 0.25) && Math.floor(i / 4) % 2 ? 0xf3ead8 : (i + k) % 2 ? 0x7a8390 : 0x727b88))
    .disc(-6, -6, 2.2, 0xd9dde2)
    .disc(6, -6, 2.2, 0xd9dde2);
  group.add(island({ rx: 27, rz: 15.5, seed: 6, paint: ground.paint }));
  group.add(
    greenery([
      ["palm", -22.5, -4], ["tree", -14, -9.5], ["bush", -10.5, -7.5], ["tree", 14.5, -9.8], ["palm", 23, -3], ["bush", 11, -7.6],
      ["rock", -21, 10], ["bush", -9, 10.8], ["palm", 9, 11], ["rock", 20, 9.6], ["bush", 0.5, 11.2], ["tree", -19.5, -8.5],
    ]),
  );

  place(group, conveyor(), [0, 0, 0]);

  // Stages: arches over the belt. The proposal stops under each one.
  const stages = STAGES.map((s, i) => {
    const x = STAGE_X[i];
    const mesh = place(group, stageArch(s.color), [x, 0, 0]);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lamp(COLORS.stone));
    bulb.position.set(-0.12, 3.75, -0.12);
    mesh.add(bulb);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.08).translate(0.8, 0, 0), lamp(s.color));
    bar.position.set(-0.92, 2.5, 1.52);
    bar.scale.x = 0.001;
    mesh.add(bar);
    const name = label(s.short);
    name.position.set(0, 5, 0);
    mesh.add(name);
    const info = label("", "small");
    info.position.set(0, 4.25, 0);
    mesh.add(info);
    pickable(pickables, mesh, { title: s.name, text: s.text });
    return { ...s, x, mesh, bulb, bar, info, lit: new THREE.Color(s.color), glow: 0, activity: 0, progress: 0 };
  });

  // Risk lights on the analysis stage: low, medium, moderate.
  const riskLights = [COLORS.ok, COLORS.warn, COLORS.message].map((c, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), lamp(c));
    mesh.position.set(-0.6 + i * 0.5, 3.05, 1.5);
    stages[1].mesh.add(mesh);
    return { mesh, on: new THREE.Color(c), off: new THREE.Color(c).multiplyScalar(0.35) };
  });
  let riskLevel = -1;

  // Databases behind the line
  const dbs = DATABASES.map((d, i) => {
    const x = i === 0 ? -6 : 6;
    const mesh = place(group, database(d.color), [x, 0, -6]);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lamp(COLORS.stone));
    bulb.position.set(-0.12, 3, -0.12);
    mesh.add(bulb);
    const l = label(d.name);
    l.position.set(0, 4, 0);
    mesh.add(l);
    pickable(pickables, mesh, {
      title: d.name,
      text: tr("Banco relacional consultado e atualizado por cada etapa do pipeline.", "Relational database read and updated by every pipeline stage."),
    });
    return { ...d, bulb, top: new THREE.Vector3(x, 3.1, -6), lit: new THREE.Color(d.color), pulse: 0 };
  });

  const terminal = makeTerminal();
  const monitor = place(group, crt(), [0, 1.4, -10.4]);
  terminal.mesh.position.set(0, 2.5, 0.02);
  monitor.add(terminal.mesh);
  pickable(pickables, terminal.mesh, {
    title: tr("Java e Informix 4GL", "Java and Informix 4GL"),
    text: tr(
      "As linguagens do dia a dia na Porto Seguro, sobre bancos Informix e Oracle. Código ilustrativo.",
      "The everyday languages at Porto Seguro, on Informix and Oracle databases. Illustrative code.",
    ),
  });

  const issuedLabel = label(tr("apólices emitidas: 0", "policies issued: 0"));
  issuedLabel.position.set(9.5, 0.4, ROAD_Z + 2.4);
  group.add(issuedLabel);
  let issued = 0;
  let policyNumber = 120340;
  let proposalNumber = 584210;

  // Customers: a car and its proposal travel together through the scene
  const sheetGeometry = sheet().geometry({ origin: [0.5, 0, 0.5] });
  const docs = Array.from({ length: POOL }, () => {
    const doc = new THREE.Mesh(sheetGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    doc.castShadow = true;
    const header = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.06), lamp(0x8aa0c4));
    header.position.set(0, 1.5, 0.14);
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.06), lamp(COLORS.ok));
    seal.position.set(0.3, 0.3, 0.14);
    doc.add(header, seal);
    doc.visible = false;
    group.add(doc);
    return { doc, header, seal, busy: false };
  });
  const carGeometry = carModel().geometry({ origin: [0, 0, 0] });
  const cars = Array.from({ length: POOL }, () => {
    const car = new THREE.Mesh(carGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    car.castShadow = true;
    car.visible = false;
    group.add(car);
    pickable(pickables, car, {
      title: tr("Cliente", "Customer"),
      text: tr("Entrega a proposta, acompanha o pipeline e sai com a apólice emitida.", "Hands in the proposal, follows the pipeline and drives off with the policy issued."),
    });
    return car;
  });
  const customers = [];

  function spawn() {
    const car = cars.find((c) => !c.visible);
    // Docs stay hidden while their car is still arriving, so availability needs its own flag.
    const doc = docs.find((d) => !d.busy);
    if (!car || !doc) return;
    doc.busy = true;
    car.material.color.set(CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
    car.position.set(SPAWN_X, 0, ROAD_Z);
    car.visible = true;
    doc.header.material.color.set(0x8aa0c4);
    doc.doc.material.color.set(0xffffff);
    doc.seal.visible = false;
    doc.doc.scale.setScalar(1);
    doc.doc.rotation.set(0, 0, 0);
    customers.push({ car, doc, phase: "arriving", x: SPAWN_X, speed: 0, docX: BELT_START, stage: 0, timer: 0, fly: 0 });
  }

  function dbQuery(stage) {
    const db = dbs[stage.db];
    const from = new THREE.Vector3(stage.x, 3.4, -1);
    flow.emit(hop(from, db.top, 2), {
      color: stage.color,
      speed: 10,
      onArrive: () => {
        db.pulse = 1;
        flow.emit(hop(db.top, from, 2), { color: db.color, speed: 10 });
      },
    });
  }

  function enterStage(c) {
    const s = stages[c.stage];
    s.glow = 1;
    dbQuery(s);
    if (c.stage === 0) {
      s.info.element.textContent = `${tr("proposta nº", "proposal #")} ${++proposalNumber}`;
      c.doc.header.material.color.set(COLORS.kafka);
    } else if (c.stage === 1) {
      const [name, color, angle] = RISK[(Math.random() * RISK.length) | 0];
      c.risk = { name, color, level: angle < -0.3 ? 0 : angle > 0.3 ? 2 : 1 };
      riskLevel = -1;
      s.info.element.textContent = tr("analisando…", "analyzing…");
    } else if (c.stage === 2) {
      c.premium = 900 + Math.random() * 2600;
    } else {
      s.info.element.textContent = `${tr("apólice nº", "policy #")} ${++policyNumber}`;
    }
  }

  function processStage(c, k) {
    const s = stages[c.stage];
    s.progress = k;
    if (c.stage === 1 && k > 0.6) {
      s.info.element.textContent = tr(`risco ${c.risk.name}`, `${c.risk.name} risk`);
      riskLevel = c.risk.level;
    } else if (c.stage === 2) {
      const value = (c.premium * Math.min(1, k * 1.4)).toLocaleString(locale, { style: "currency", currency: "BRL" });
      s.info.element.textContent = `${tr("prêmio", "premium")} ${value}`;
    } else if (c.stage === 3 && k > 0.5) {
      c.doc.header.material.color.set(COLORS.ok);
      c.doc.doc.material.color.set(0xdff7e6);
      c.doc.seal.visible = true;
    }
  }

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const idle = new THREE.Color(COLORS.stone);
  let spawnTimer = 1;

  return {
    id: "porto",
    group,
    pickables,
    view: { pos: [0, 23, 38], target: [0, 1.8, -1.6], fogFar: 320, narrowScale: 1.1 },
    update(dt, time, focus) {
      spawnTimer -= dt * focus;
      if (spawnTimer <= 0) {
        spawnTimer = SPAWN_EVERY;
        spawn();
      }

      for (let i = customers.length - 1; i >= 0; i--) {
        const c = customers[i];
        let carTarget = c.x;

        if (c.phase === "arriving") {
          carTarget = ARRIVE_X;
          if (Math.abs(c.x - ARRIVE_X) < 0.05) {
            c.phase = "handing";
            c.fly = 0;
            c.doc.doc.visible = true;
          }
        } else if (c.phase === "handing") {
          // The proposal hops from the car onto the start of the belt.
          c.fly = Math.min(1, c.fly + dt * 1.6);
          from.set(c.x, 1.6, ROAD_Z);
          to.set(BELT_START, BELT_Y, 0);
          c.doc.doc.position.lerpVectors(from, to, c.fly);
          c.doc.doc.position.y += Math.sin(c.fly * Math.PI) * 1.5;
          if (c.fly === 1) {
            c.phase = "moving";
            c.docX = BELT_START;
          }
        } else if (c.phase === "moving" || c.phase === "processing") {
          const s = stages[c.stage];
          if (c.phase === "moving") {
            c.docX = Math.min(s.x, c.docX + DOC_SPEED * dt);
            if (c.docX === s.x) {
              c.phase = "processing";
              c.timer = 0;
              enterStage(c);
            }
          } else {
            c.timer += dt;
            processStage(c, c.timer / DWELL);
            if (c.timer >= DWELL) {
              if (c.stage === stages.length - 1) {
                c.phase = "delivering";
                c.fly = 0;
                c.flyFrom = c.doc.doc.position.clone();
              } else {
                c.stage++;
                c.phase = "moving";
              }
            }
          }
          c.doc.doc.position.set(c.docX, BELT_Y, 0);
          carTarget = Math.max(ARRIVE_X, c.docX);
        } else if (c.phase === "delivering") {
          // The issued policy flies to the car and rides above it.
          c.fly = Math.min(1, c.fly + dt * 1.4);
          to.set(c.x, 2, ROAD_Z);
          c.doc.doc.position.lerpVectors(c.flyFrom, to, c.fly);
          c.doc.doc.position.y += Math.sin(c.fly * Math.PI) * 1.8;
          c.doc.doc.scale.setScalar(1 - c.fly * 0.45);
          c.doc.doc.rotation.y = c.fly * Math.PI * 2;
          carTarget = c.x;
          if (c.fly === 1) {
            c.phase = "leaving";
            issued++;
            issuedLabel.element.textContent = `${tr("apólices emitidas", "policies issued")}: ${issued.toLocaleString(locale)}`;
          }
        } else if (c.phase === "leaving") {
          carTarget = LEAVE_X + 5;
          c.doc.doc.position.set(c.x, 2 + Math.sin(time * 3) * 0.1, ROAD_Z);
          if (c.x > LEAVE_X) {
            c.car.visible = false;
            c.doc.doc.visible = false;
            c.doc.busy = false;
            customers.splice(i, 1);
            continue;
          }
        }

        // Cars accelerate and brake smoothly towards their target spot on the road.
        const gap = carTarget - c.x;
        const maxSpeed = c.phase === "leaving" ? 9 : c.phase === "arriving" ? 8 : DOC_SPEED * 1.2;
        const want = Math.sign(gap) * Math.min(maxSpeed, Math.abs(gap) * 3);
        c.speed += (want - c.speed) * (1 - Math.exp(-dt * 4));
        c.x += Math.abs(gap) < 0.02 ? gap : c.speed * dt;
        c.car.position.x = c.x;
        // They come ashore and leave at the island's ends, growing in and shrinking out there.
        c.car.scale.setScalar(THREE.MathUtils.clamp(Math.min((c.x - SPAWN_X) / 2.5 + 0.15, (LEAVE_X - c.x) / 2.5 + 0.15), 0.01, 1));
      }

      // A station is lit while a proposal is inside it; its bar holds full briefly, then empties.
      const busy = new Set(customers.filter((c) => c.phase === "processing").map((c) => c.stage));
      stages.forEach((s, i) => {
        s.glow = Math.max(0, s.glow - dt * 0.8);
        s.activity = damp(s.activity, busy.has(i) ? 1 : 0.15 * s.glow, 5, dt);
        if (!busy.has(i)) s.progress = Math.max(0, s.progress - dt * 0.6);
        s.bulb.material.color.copy(idle).lerp(s.lit, s.activity * (0.7 + 0.3 * Math.sin(time * 6 - i)));
        s.bar.scale.x = Math.max(0.001, s.progress);
        s.mesh.scale.setScalar(1 + (s.mesh.userData.hovered ? 0.04 : 0));
      });
      riskLights.forEach((r, i) => r.mesh.material.color.copy(i === riskLevel ? r.on : r.off));
      dbs.forEach((d) => {
        d.pulse = Math.max(0, d.pulse - dt * 3);
        d.bulb.material.color.copy(idle).lerp(d.lit, d.pulse);
      });
      flow.update(dt);
      terminal.update(dt, time);
    },
  };
}
