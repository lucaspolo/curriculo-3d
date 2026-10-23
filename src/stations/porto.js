// Porto Seguro scene: the policy issuance pipeline. A customer drives up, hands in the proposal, follows it
// through the stages and drives off with the issued policy. Informix and Oracle answer every stage.
import * as THREE from "three";
import { COLORS, glow, label, pickable, Flow, roundedBox, outline, outlineMaterial, damp } from "../lib/kit.js";
import { tr, locale } from "../i18n.js";
import { makeStation } from "./porto-station.js";

const ROAD_Z = 4.6;
const BELT_Y = 1.45;
const BELT_START = -13;
const ARRIVE_X = -15;
const LEAVE_X = 26;
const DOC_SPEED = 3.2;
const DWELL = 1.3; // seconds a proposal spends inside each stage
const SPAWN_EVERY = 4.2;
const POOL = 6;

// The profile mentions receiving the proposal and issuing the policy; the middle stages are illustrative.
const STAGES = [
  {
    name: tr("Proposta recebida", "Proposal received"),
    short: tr("Proposta", "Proposal"),
    icon: "document",
    x: -9,
    color: COLORS.kafka,
    db: 0,
    text: tr(
      "A proposta entra no pipeline e é registrada para seguir pelas etapas.",
      "The proposal enters the pipeline and is recorded to move through the stages.",
    ),
  },
  {
    name: tr("Análise de risco", "Risk analysis"),
    short: tr("Risco", "Risk"),
    icon: null,
    x: -3,
    color: COLORS.warn,
    db: 0,
    text: tr("Avalia o risco da proposta antes de seguir para o cálculo.", "Assesses the proposal's risk before it moves on to pricing."),
  },
  {
    name: tr("Cálculo do prêmio", "Premium calculation"),
    short: tr("Prêmio", "Premium"),
    icon: "coin",
    x: 3,
    color: COLORS.message,
    db: 1,
    text: tr("Calcula o valor do seguro a partir da proposta e do risco.", "Prices the insurance from the proposal and its risk."),
  },
  {
    name: tr("Emissão da apólice", "Policy issuance"),
    short: tr("Emissão", "Issuance"),
    icon: "seal",
    x: 9,
    color: COLORS.ok,
    db: 1,
    text: tr("Emite a apólice e entrega ao cliente.", "Issues the policy and hands it to the customer."),
  },
];

const DATABASES = [
  { name: "Informix", x: -6, color: COLORS.k8s },
  { name: "Oracle", x: 6, color: COLORS.danger },
];

const CAR_COLORS = [COLORS.kafka, COLORS.message, COLORS.privacy, COLORS.k8s, COLORS.llm, COLORS.warn];
const RISK = [
  [tr("baixo", "low"), COLORS.ok, -0.9],
  [tr("médio", "medium"), COLORS.warn, 0],
  [tr("baixo", "low"), COLORS.ok, -0.6],
  [tr("moderado", "moderate"), COLORS.message, 0.5],
];

const SNIPPETS = [
  {
    title: "Informix 4GL",
    lines: [
      "DATABASE seguros",
      "MAIN",
      "  DEFINE p RECORD LIKE proposta.*",
      "  DECLARE c_prop CURSOR FOR",
      "    SELECT * FROM proposta",
      '     WHERE situacao = "APROVADA"',
      "  FOREACH c_prop INTO p.*",
      "    CALL emite_apolice(p.numero)",
      "  END FOREACH",
      "END MAIN",
    ],
  },
  {
    title: "Java + JDBC (Oracle)",
    lines: [
      "Proposta proposta = propostas.buscar(numero);",
      "Risco risco = analise.avaliar(proposta);",
      "BigDecimal premio = calculo.premio(proposta, risco);",
      "try (PreparedStatement ps = conn.prepareStatement(",
      '    "INSERT INTO apolice (numero, proposta, premio) " +',
      '    "VALUES (seq_apolice.NEXTVAL, ?, ?)")) {',
      "  ps.setLong(1, proposta.getNumero());",
      "  ps.setBigDecimal(2, premio);",
      "  ps.executeUpdate();",
      "}",
    ],
  },
];

function makeTerminal() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  const bezel = new THREE.Mesh(
    roundedBox(8.6, 4.6, 0.5, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.6, metalness: 0.2 }),
  );
  bezel.position.z = -0.27;
  screen.add(bezel);

  let snippet = 0;
  let chars = 0;
  let drawn = -1;
  let pause = 0;
  const total = (s) => s.lines.join("\n").length;

  function draw(time) {
    const s = SNIPPETS[snippet];
    ctx.fillStyle = "#03110a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "600 24px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#3df58a";
    ctx.shadowColor = "#3df58a";
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.55;
    ctx.fillText(`-- ${s.title}`, 32, 44);
    ctx.globalAlpha = 1;
    let left = chars;
    s.lines.forEach((line, i) => {
      if (left <= 0) return;
      const shown = line.slice(0, left);
      left -= line.length + 1;
      ctx.fillText(shown, 32, 92 + i * 40);
      if (left <= 0 && Math.floor(time * 2) % 2 === 0) {
        const w = ctx.measureText(shown).width;
        ctx.fillRect(36 + w, 72 + i * 40, 14, 26);
      }
    });
    // Scanlines for the CRT look.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < canvas.height; y += 4) ctx.fillRect(0, y, canvas.width, 2);
    texture.needsUpdate = true;
  }

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
      const key = Math.floor(chars) * 2 + (Math.floor(time * 2) % 2);
      if (key !== drawn) {
        drawn = key;
        draw(time);
      }
    },
  };
}

// A sheet of paper standing on the belt; turns into the policy (green border and seal) when issued.
function makeDoc() {
  const doc = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x152035, emissive: 0x0b1424, roughness: 0.8, side: THREE.DoubleSide }),
  );
  doc.add(paper);
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.1, 1.4)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(0x8aa0c4), toneMapped: false }),
  );
  doc.add(border);
  const header = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8aa0c4), toneMapped: false }),
  );
  header.position.set(-0.05, 0.5, 0.01);
  doc.add(header);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x3a4a66 });
  [0.25, 0.08, -0.09, -0.26].forEach((y, i) => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(i % 2 ? 0.6 : 0.8, 0.06), lineMat);
    l.position.set(i % 2 ? -0.1 : 0, y, 0.01);
    doc.add(l);
  });
  const seal = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 24),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.ok, 2.4), toneMapped: false }),
  );
  seal.position.set(0.3, -0.45, 0.02);
  doc.add(seal);
  doc.visible = false;
  return { doc, border, header, seal };
}

// Small car built facing +x, the direction of the road.
function makeCar() {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.4, metalness: 0.4, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(roundedBox(2, 0.55, 1.05, 0.2), bodyMat);
  body.position.y = 0.55;
  car.add(body);
  const cabin = new THREE.Mesh(roundedBox(1.05, 0.5, 0.95, 0.2), bodyMat);
  cabin.position.set(-0.15, 1.02, 0);
  car.add(cabin);
  // One hull material for body and cabin, recolored per customer.
  const edgeMat = outlineMaterial(COLORS.text);
  outline(body, 0, { thickness: 0.04, material: edgeMat });
  outline(cabin, 0, { thickness: 0.04, material: edgeMat });
  // Windows all around the cabin, plus bumpers.
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1424, roughness: 0.15, metalness: 0.8, emissive: 0x16304f });
  const side = new THREE.PlaneGeometry(0.8, 0.3);
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(side, glass);
    w.position.set(0, 0.02, s * 0.478);
    if (s < 0) w.rotation.y = Math.PI;
    cabin.add(w);
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.3), glass);
  front.position.set(0.527, 0.02, 0);
  front.rotation.y = Math.PI / 2;
  cabin.add(front);
  const rear = front.clone();
  rear.position.x = -0.527;
  rear.rotation.y = -Math.PI / 2;
  cabin.add(rear);
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.7, roughness: 0.3 });
  [-1, 1].forEach((s) => {
    const bumper = new THREE.Mesh(roundedBox(0.12, 0.14, 1, 0.05, 2), bumperMat);
    bumper.position.set(s * 1.02, 0.4, 0);
    car.add(bumper);
  });
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.1, 0.8),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.danger, 1.6), toneMapped: false }),
  );
  tail.position.set(-1.01, 0.62, 0);
  car.add(tail);
  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.8 });
  const wheels = [];
  [-0.65, 0.65].forEach((x) =>
    [-0.5, 0.5].forEach((z) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.25, z);
      car.add(w);
      wheels.push(w);
    }),
  );
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.12, 0.8),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.warn, 2), toneMapped: false }),
  );
  light.position.set(1.01, 0.6, 0);
  car.add(light);
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: glow(COLORS.ok, 1.3),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  shield.scale.set(1.15, 1, 0.9);
  car.add(shield);
  car.visible = false;
  return { car, bodyMat, edgeMat, wheels, shield, body };
}

export function createPorto() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(80, 0.14);
  group.add(flow.mesh);

  // Road and belt
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.05, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.9, emissive: 0x08101e }),
  );
  road.position.set(2, 0.02, ROAD_Z);
  group.add(road);
  for (let x = -20; x <= 24; x += 2) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x5c6f91 }),
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.06, ROAD_Z);
    group.add(dash);
  }
  const belt = new THREE.Mesh(
    roundedBox(BELT_START * -2 + 1, 0.2, 1.3, 0.08, 2),
    new THREE.MeshStandardMaterial({ color: 0x141d2e, roughness: 0.7, metalness: 0.3 }),
  );
  belt.position.set(0, BELT_Y - 0.82, 0);
  group.add(belt);
  const beltLegs = new THREE.Mesh(
    new THREE.BoxGeometry(BELT_START * -2, 0.55, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x0d1422 }),
  );
  beltLegs.position.set(0, 0.28, 0);
  group.add(beltLegs);

  // Stages: see-through machines the proposal stops inside
  const stages = STAGES.map((s) => {
    const station = makeStation({ name: s.short, color: s.color, icon: s.icon }, BELT_Y - 0.72);
    station.root.position.x = s.x;
    group.add(station.root);
    const info = label("", "small");
    info.position.copy(station.panelTop);
    station.root.add(info);
    pickable(pickables, station.hood, { title: s.name, text: s.text });
    return { ...s, station, info, glow: 0, activity: 0, progress: 0 };
  });

  // Risk gauge on top of the analysis stage
  // The live risk gauge takes the icon's place on the Risco panel.
  const gauge = new THREE.Group();
  gauge.scale.setScalar(0.52);
  gauge.position.y = -0.12;
  stages[1].station.slot.add(gauge);
  [
    [COLORS.ok, Math.PI * 0.66],
    [COLORS.warn, Math.PI * 0.33],
    [COLORS.danger, 0],
  ].forEach(([c, start]) => {
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 24, 1, start, Math.PI / 3),
      new THREE.MeshBasicMaterial({ color: glow(c, 1.3), toneMapped: false, side: THREE.DoubleSide }),
    );
    gauge.add(arc);
  });
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.55, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  needle.geometry.translate(0, 0.27, 0);
  gauge.add(needle);
  let needleTarget = 0;

  // Databases behind the pipeline
  const dbs = DATABASES.map((d) => {
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 2.2, 28),
      new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.5, metalness: 0.4, emissive: d.color, emissiveIntensity: 0.08 }),
    );
    cyl.position.set(d.x, 1.1, -5);
    [-0.6, 0.1, 0.8].forEach((y) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.31, 0.03, 6, 40),
        new THREE.MeshBasicMaterial({ color: glow(d.color, 1.4), toneMapped: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      cyl.add(ring);
    });
    group.add(cyl);
    const l = label(d.name);
    l.position.set(0, 1.7, 0);
    cyl.add(l);
    pickable(pickables, cyl, {
      title: d.name,
      text: tr("Banco relacional consultado e atualizado por cada etapa do pipeline.", "Relational database read and updated by every pipeline stage."),
    });
    return { ...d, cyl, top: new THREE.Vector3(d.x, 2.3, -5), pulse: 0 };
  });

  const terminal = makeTerminal();
  terminal.mesh.position.set(0, 6.2, -9);
  group.add(terminal.mesh);
  pickable(pickables, terminal.mesh, {
    title: tr("Java e Informix 4GL", "Java and Informix 4GL"),
    text: tr(
      "As linguagens do dia a dia na Porto Seguro, sobre bancos Informix e Oracle. Código ilustrativo.",
      "The everyday languages at Porto Seguro, on Informix and Oracle databases. Illustrative code.",
    ),
  });

  const issuedLabel = label(tr("apólices emitidas: 0", "policies issued: 0"));
  issuedLabel.position.set(10, 0.2, ROAD_Z + 2);
  group.add(issuedLabel);
  let issued = 0;
  let policyNumber = 120340;
  let proposalNumber = 584210;

  // Customers: a car and its proposal travel together through the scene
  const docs = Array.from({ length: POOL }, () => {
    const d = makeDoc();
    group.add(d.doc);
    return d;
  });
  const cars = Array.from({ length: POOL }, () => {
    const c = makeCar();
    group.add(c.car);
    pickable(pickables, c.body, {
      title: tr("Cliente", "Customer"),
      text: tr("Entrega a proposta, acompanha o pipeline e sai com a apólice emitida.", "Hands in the proposal, follows the pipeline and drives off with the policy issued."),
    });
    return c;
  });
  const customers = [];

  function spawn() {
    const car = cars.find((c) => !c.car.visible);
    // Docs stay hidden while their car is still arriving, so availability needs its own flag.
    const doc = docs.find((d) => !d.busy);
    if (!car || !doc) return;
    doc.busy = true;
    const color = CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
    car.bodyMat.emissive.setHex(color);
    car.edgeMat.color.copy(glow(color, 1.5));
    car.shield.material.opacity = 0;
    car.car.position.set(-28, 0, ROAD_Z);
    car.car.scale.setScalar(1);
    car.car.visible = true;
    doc.border.material.color.setHex(0x8aa0c4);
    doc.header.material.color.setHex(0x8aa0c4);
    doc.seal.visible = false;
    doc.doc.scale.setScalar(1);
    doc.doc.rotation.set(0, 0, 0);
    customers.push({ car, doc, phase: "arriving", x: -28, speed: 0, docX: BELT_START, stage: 0, timer: 0, fly: 0 });
  }

  function dbQuery(stage) {
    const db = dbs[stage.db];
    const from = new THREE.Vector3(stage.x, BELT_Y + 1.5, -1);
    const mid = from.clone().lerp(db.top, 0.5);
    mid.y += 1.5;
    flow.emit(new THREE.QuadraticBezierCurve3(from, mid, db.top), {
      color: stage.color,
      speed: 10,
      onArrive: () => {
        db.pulse = 1;
        flow.emit(new THREE.QuadraticBezierCurve3(db.top.clone(), mid, from), { color: db.color, speed: 10 });
      },
    });
  }

  function enterStage(c) {
    const s = stages[c.stage];
    s.glow = 1;
    dbQuery(s);
    if (c.stage === 0) {
      s.info.element.textContent = `${tr("proposta nº", "proposal #")} ${++proposalNumber}`;
      c.doc.header.material.color.copy(glow(COLORS.kafka, 1.6));
    } else if (c.stage === 1) {
      const [name, color, angle] = RISK[(Math.random() * RISK.length) | 0];
      c.risk = { name, color };
      needleTarget = angle;
      s.info.element.textContent = "analisando…";
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
      c.doc.border.material.color.copy(glow(c.risk.color, 1.4));
    } else if (c.stage === 2) {
      const value = (c.premium * Math.min(1, k * 1.4)).toLocaleString(locale, { style: "currency", currency: "BRL" });
      s.info.element.textContent = `${tr("prêmio", "premium")} ${value}`;
    } else if (c.stage === 3 && k > 0.5) {
      c.doc.border.material.color.copy(glow(COLORS.ok, 1.8));
      c.doc.header.material.color.copy(glow(COLORS.ok, 1.8));
      c.doc.seal.visible = true;
    }
  }

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let spawnTimer = 1;

  return {
    id: "porto",
    group,
    pickables,
    view: { pos: [1, 13, 27], target: [1, 1.8, -1], fogFar: 110, narrowScale: 1.1 },
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
          // The issued policy flies to the car and becomes a badge above it.
          c.fly = Math.min(1, c.fly + dt * 1.4);
          to.set(c.x, 2.2, ROAD_Z);
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
          c.car.shield.material.opacity = Math.min(0.28, c.car.shield.material.opacity + dt * 0.5);
          c.doc.doc.position.set(c.x, 2.2 + Math.sin(time * 3) * 0.1, ROAD_Z);
          if (c.x > LEAVE_X) {
            c.car.car.visible = false;
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
        const step = Math.abs(gap) < 0.02 ? gap : c.speed * dt;
        c.x += step;
        c.car.car.position.x = c.x;
        c.car.wheels.forEach((w) => (w.rotation.z -= step / 0.24));
        if (c.phase === "leaving") c.car.car.scale.setScalar(Math.min(1, (LEAVE_X - c.x) / 3 + 0.2));
      }

      needle.rotation.z = THREE.MathUtils.lerp(needle.rotation.z, -needleTarget, 1 - Math.exp(-dt * 3));
      // A station is lit while a proposal is inside it; its bar holds full briefly, then empties.
      const busy = new Set(customers.filter((c) => c.phase === "processing").map((c) => c.stage));
      stages.forEach((s, i) => {
        s.glow = Math.max(0, s.glow - dt * 0.8);
        s.activity = damp(s.activity, busy.has(i) ? 1 : 0.15 * s.glow, 5, dt);
        if (!busy.has(i)) s.progress = Math.max(0, s.progress - dt * 0.6);
        s.station.update(dt, time, s.activity, s.progress, s.station.hood.userData.hovered);
      });
      dbs.forEach((d) => {
        d.pulse = Math.max(0, d.pulse - dt * 3);
        d.cyl.material.emissiveIntensity = 0.08 + d.pulse * 0.4;
      });
      flow.update(dt);
      terminal.update(dt, time);
    },
  };
}
