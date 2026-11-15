// Magalu island: houses across the island ask the tower for shipping quotes; partner integrations fail and
// recover; confirmed orders become parcels that trucks carry out of the distribution center. Same story and
// same road map as the first version's scene; the center, the trucks and the regions are illustrative.
import * as THREE from "three";
import { COLORS, Flow, Vox, V, label, lamp, pickable, place } from "../lib/kit.js";
import { hash, pattern } from "../lib/voxel.js";
import { island, paving, greenery } from "../world.js";
import { tr } from "../../../src/i18n.js";
import { PARTNERS } from "../../../src/stations/magalu.js";
import { DESTINATIONS } from "../../../src/stations/magalu-logistics.js";

const HOUSES = 46;
const BASE_RATE = 7;
const PEAK_FACTOR = 6;
const ORDER_RATE = 0.3; // share of quotes that turn into an order
const TOWER_IN = new THREE.Vector3(0, 4.6, 0);

const CD = { x: 7, z: 3, w: 4.5, d: 3.5, h: 2.5 };
const DOCK_Z = CD.z + CD.d / 2; // front wall of the building, where the trucks back in
const DOCKS_X = [5.8, 8.2];
const PARK_Z = DOCK_Z + 2.05; // truck origin is mid-length, so this puts its tail at the wall
const CAPACITY = 16;
const SPEED = 6;
const LOAD_INTERVAL = { normal: 0.22, peak: 0.1 };
const UNLOAD_INTERVAL = 0.07;
const MAX_QUEUE = 99;
const road = (points) => new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));

function house() {
  const v = new Vox();
  v.box(-2, 0, -2, 2, 3, 2, 0xfff6e6);
  v.box(-2, 0, 3, 2, 3, 3, (x, y) => (x === 0 && y < 2 ? 0x9a6b3a : Math.abs(x) === 1 && y === 2 ? 0x9fd8f5 : 0xfff6e6));
  for (let r = 0; r < 3; r++) v.box(-3 + r, 4 + r, -3 + r, 3 - r, 4 + r, 4 - r, r % 2 ? 0xe07a4a : 0xd9603b);
  return v;
}

function quoteTower() {
  const v = new Vox();
  v.box(-6, 0, -6, 5, 1, 5, COLORS.darkStone);
  for (let y = 2; y < 20; y++) v.box(-5, y, -5, 4, y, 4, y % 6 === 1 ? COLORS.white : pattern.speckle(COLORS.kafka, 0x129488, 0.25));
  for (const y of [5, 11, 17]) v.box(-3, y, 5, 2, y + 1, 5, COLORS.glass).box(5, y, -3, 5, y + 1, 2, COLORS.glass);
  return v.box(-6, 20, -6, 5, 20, 5, COLORS.steel).box(-1, 21, -1, 0, 24, 0, COLORS.steel);
}

const PARTNER_MODELS = [
  // A post office: yellow walls, blue band and a mail slot.
  () => new Vox().box(-6, 0, -3, 5, 5, 2, 0xf7c93c).box(-6, 4, -3, 5, 4, 3, 0x2f5fb8).box(-2, 2, 3, 1, 2, 3, COLORS.ink).box(-6, 6, -3, 5, 6, 2, 0x2f5fb8).box(-5, 0, 3, -4, 3, 3, 0x8a5a2b),
  // An office with a wall of screens.
  () => new Vox().box(-6, 0, -3, 5, 6, 2, pattern.bricks(0x9aa7b8, 0x8794a6)).box(-4, 2, 3, 3, 4, 3, (x) => (x % 2 ? COLORS.glass : COLORS.white)).box(-6, 7, -3, 5, 7, 2, COLORS.steel),
  // A market stall under a striped awning.
  () => new Vox().box(-6, 0, -3, 5, 4, 1, 0xfff0d6).box(-6, 5, -4, 5, 5, 3, pattern.bands("x", 2, COLORS.privacy, COLORS.white)).box(-5, 2, 2, 4, 2, 3, COLORS.wood).box(-4, 3, 2, -3, 3, 3, COLORS.ok).box(0, 3, 2, 1, 3, 3, COLORS.message),
];

function warehouse() {
  const w = Math.round(CD.w / V / 2);
  const d = Math.round(CD.d / V / 2);
  const v = new Vox();
  v.box(-w, 0, -d, w - 1, 9, d - 1, pattern.bands("x", 3, 0xf0b060, 0xe8a552)).box(-w, 10, -d, w - 1, 10, d - 1, COLORS.steel);
  for (const x of DOCKS_X) v.box(Math.round((x - CD.x) / V) - 3, 0, d - 1, Math.round((x - CD.x) / V) + 2, 5, d - 1, COLORS.ink);
  for (let i = 0; i < 5; i++) v.box(-w + 2 + i * 3, 7, d - 1, -w + 3 + i * 3, 7, d - 1, COLORS.warn);
  return v.box(2, 11, -5, 6, 12, -2, 0x8794a6);
}

// Built with +z as forward, so Object3D.lookAt points the cab along the road.
function truckModel() {
  const v = new Vox();
  v.box(-3, 1, -8, 2, 1, 8, COLORS.steel).box(-3, 2, -8, 2, 2, 3, 0x8794a6);
  v.box(-3, 3, -8, -3, 3, 3, COLORS.k8s).box(2, 3, -8, 2, 3, 3, COLORS.k8s).box(-3, 3, 3, 2, 3, 3, COLORS.k8s);
  v.box(-3, 2, 4, 2, 6, 7, pattern.speckle(COLORS.k8s, 0x2f7fe0, 0.3)).box(-2, 4, 8, 1, 5, 8, COLORS.glass).box(-3, 2, 8, 2, 2, 8, COLORS.stone);
  v.set(-2, 3, 8, COLORS.warn).set(1, 3, 8, COLORS.warn).box(-3, 2, -9, 2, 2, -9, COLORS.danger);
  for (const z of [-6, -3, 5]) for (const x of [-4, 3]) v.box(x, 0, z, x, 1, z + 1, COLORS.ink);
  return v;
}

const parcel = () => new Vox().box(0, 0, 0, 1, 1, 1, (x, y, z) => (x === 0 && z === 0 ? 0xb98a5c : 0xc99b6b)).geometry({ origin: [1, 1, 1], jitter: 0.08 });

export function createMagalu() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(600, 0.3);
  group.add(flow.mesh);

  // Roads first: departure, return and the reverse-into-dock curve for every dock. The island is painted
  // with them, and the houses keep off them.
  const routes = DOCKS_X.map((x) => {
    const leave = [[x, PARK_Z], [x, PARK_Z + 3.5], [x - 2.5, 12.8]];
    const turnPoint = [x + 2.5, 12.6];
    const reverseIn = road([[x, PARK_Z], [x, PARK_Z + 2.9], turnPoint]);
    return DESTINATIONS.map((dest) => ({
      outbound: road([...leave, ...dest.via, dest.at]),
      inbound: road([dest.at, ...[...dest.via].reverse(), [x - 2.5, 12.8], turnPoint]),
      reverseIn,
    }));
  });
  const roadPoints = routes.flat().flatMap((r) => [r.outbound, r.inbound, r.reverseIn]).flatMap((c) => c.getSpacedPoints(90));
  const ground = paving()
    .disc(0, 0, 3.2, 0xe2d2ae)
    .rect(CD.x - 3.6, CD.z - 2.6, CD.x + 3.6, PARK_Z + 2.6, 0xd9dde2)
    .stroke(roadPoints, 1.3, (i, k) => ((i + k) % 2 ? 0x7a8390 : 0x727b88));
  DESTINATIONS.forEach((d) => ground.disc(d.at[0], d.at[1], 1.1, 0xd9dde2));
  group.add(island({ rx: 25, rz: 19, seed: 5, paint: ground.paint }));
  group.add(
    greenery([
      ["palm", -21, -6], ["tree", -6, -14.5], ["palm", 20.5, 6], ["bush", 17.5, -9], ["rock", -19.5, 9.5], ["bush", 12, 15.5],
      ["tree", 19, -3.5], ["palm", -2, 16.2], ["rock", 21.5, 0.5], ["bush", -16, -11],
    ]),
  );

  // Houses: where quotes come from. They keep off the partners, the center's yard and the roads.
  const blocked = (p) =>
    PARTNERS.some(({ pos }) => Math.hypot(p.x - pos[0], p.z - pos[2]) < 3.5) ||
    (p.x > 3 && p.x < 12 && p.z > 0 && p.z < 10.5) ||
    roadPoints.some((r) => Math.hypot(p.x - r.x, p.z - r.z) < 1.5);
  const houses = [];
  while (houses.length < HOUSES) {
    const a = Math.random() * Math.PI * 2;
    const r = 5 + Math.sqrt(Math.random()) * 10.5;
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.9 + 2);
    if (!blocked(p) && !houses.some((h) => h.distanceTo(p) < 1.7)) houses.push(p);
  }
  const homes = new THREE.InstancedMesh(house().geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), HOUSES);
  const houseHeat = new Float32Array(HOUSES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  houses.forEach((p, i) => {
    homes.setMatrixAt(i, m.compose(p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.floor(hash(i, 3) * 4) * (Math.PI / 2)), one));
    homes.setColorAt(i, new THREE.Color(0xffffff));
  });
  homes.castShadow = true;
  homes.receiveShadow = true;
  group.add(homes);
  pickable(pickables, homes, {
    title: tr("Clientes e sellers", "Customers and sellers"),
    text: tr("Cada carrinho pede uma cotação de frete antes de fechar a compra.", "Every cart asks for a shipping quote before checkout."),
  });

  // Shipping calculator tower
  const tower = place(group, quoteTower(), [0, 0, 0]);
  const dish = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.2), lamp(COLORS.kafka));
  dish.position.set(-0.12, 6.2, -0.12);
  tower.add(dish);
  const towerLabel = label(tr("Cálculo de frete", "Shipping cost"));
  towerLabel.position.set(0, 7.2, 0);
  tower.add(towerLabel);
  const hud = label(tr("tráfego normal", "normal traffic"), "small");
  hud.position.set(0, 8.4, 0);
  tower.add(hud);
  pickable(pickables, tower, {
    title: tr("Cálculo de frete", "Shipping cost"),
    text: tr(
      "Serviço que cota o frete da Magalu e dos parceiros do marketplace, com milhões de requisições por dia.",
      "Service that quotes shipping for Magalu and its marketplace partners, with millions of requests a day.",
    ),
  });

  const arc = (a, b, lift) => new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).setY(lift), b);
  const orderTarget = new THREE.Vector3(CD.x, CD.h + 0.4, CD.z);
  const orderCurve = arc(TOWER_IN, orderTarget, 6.5);

  const partners = PARTNERS.map((p, i) => {
    const mesh = place(group, PARTNER_MODELS[i](), [p.pos[0], 0, p.pos[2]]);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), lamp(COLORS.message));
    bulb.position.set(1, i === 2 ? 1.75 : 2.2, -0.2);
    mesh.add(bulb);
    const l = label(p.name);
    l.position.set(0, 3.1, 0);
    mesh.add(l);
    const door = new THREE.Vector3(p.pos[0], 1.6, p.pos[2]);
    pickable(pickables, mesh, { title: p.name, text: p.text });
    return { ...p, bulb, label: l, out: arc(TOWER_IN, door, 6.2), back: arc(door, TOWER_IN, 6.2), failedFor: 0, shown: null };
  });

  // Distribution center, its two docks and the delivery regions
  const center = place(group, warehouse(), [CD.x, 0, CD.z]);
  const cdLabel = label(tr("Centro de distribuição", "Distribution center"));
  cdLabel.position.set(0, CD.h + 1.6, 0);
  center.add(cdLabel);
  const queueLabel = label(tr("fila: 0 pacotes", "queue: 0 packages"), "small");
  queueLabel.position.set(0, CD.h + 2.6, 0);
  center.add(queueLabel);
  pickable(pickables, center, {
    title: tr("Centro de distribuição", "Distribution center"),
    text: tr(
      "Pedidos viram pacotes com etiqueta e entram nos caminhões. Na Black Friday a fila cresce mais rápido do que a frota consegue levar.",
      "Orders become labeled packages and go onto the trucks. On Black Friday the queue grows faster than the fleet can carry it.",
    ),
  });
  const destinations = DESTINATIONS.map((d) => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 1.2), lamp(COLORS.stone));
    pad.position.set(d.at[0], 0.1, d.at[1]);
    group.add(pad);
    const l = label(d.name, "small");
    l.position.set(0, 1, 0);
    pad.add(l);
    return { pad, pulse: 0 };
  });

  // Fleet: one truck per dock, each with a parcel waiting in every slot of its bed.
  const parcelGeometry = parcel();
  const parcelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const slots = [];
  [0.4, -0.15, -0.7, -1.25].forEach((z) => [1, 1.5].forEach((y) => [-0.28, 0.28].forEach((x) => slots.push(new THREE.Vector3(x, y, z)))));
  const truckGeometry = truckModel().geometry();
  const trucks = DOCKS_X.map((x, dock) => {
    const truck = new THREE.Group();
    const body = new THREE.Mesh(truckGeometry, parcelMaterial);
    body.castShadow = true;
    truck.add(body);
    truck.position.set(x, 0, PARK_Z);
    group.add(truck);
    const cargo = slots.map((s) => {
      const p = new THREE.Mesh(parcelGeometry, parcelMaterial);
      p.position.copy(s);
      p.visible = false;
      truck.add(p);
      return p;
    });
    pickable(pickables, body, {
      title: tr("Caminhão", "Truck"),
      text: tr(
        "Recebe pacotes na doca e sai para a entrega quando lota. Depois volta e encosta de ré para carregar de novo.",
        "Takes packages at the dock and leaves to deliver once full. Then it comes back and reverses in to load again.",
      ),
    });
    return { truck, dock, cargo, state: "loading", reserved: 0, loaded: 0, legs: [], timer: 0 };
  });

  // Parcels in flight from the dock door to a slot on the truck
  const flying = [];
  const flyMesh = new THREE.InstancedMesh(parcelGeometry, parcelMaterial, 48);
  flyMesh.count = 0;
  flyMesh.frustumCulled = false;
  group.add(flyMesh);

  let queue = 0;
  let onRoad = 0;
  let lastText = "";
  const tmpP = new THREE.Vector3();
  const tmpT = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpM = new THREE.Matrix4();
  const aim = new THREE.Vector3();

  function depart(t) {
    const pick = (Math.random() * DESTINATIONS.length) | 0;
    const r = routes[t.dock][pick];
    t.legs = [
      { curve: r.outbound, from: 0, to: 1 },
      { unload: pick },
      { curve: r.inbound, from: 0, to: 1 },
      // Backing in: travel the curve from its far end to the dock while the cab keeps facing away.
      { curve: r.reverseIn, from: 1, to: 0 },
    ];
    t.leg = -1;
    t.state = "driving";
    onRoad++;
    nextLeg(t);
  }

  function nextLeg(t) {
    t.leg++;
    const leg = t.legs[t.leg];
    if (!leg) {
      Object.assign(t, { state: "loading", reserved: 0, loaded: 0, timer: 0 });
      onRoad--;
      return;
    }
    t.t = leg.from ?? 0;
    t.timer = 0;
  }

  function drive(t, leg, dt) {
    const len = leg.curve.getLength();
    const dir = Math.sign(leg.to - leg.from);
    // Ease in and out over the first and last ~2 units of each leg.
    const ease = Math.min(1, 0.25 + Math.min(Math.abs(t.t - leg.from), Math.abs(leg.to - t.t)) * (len / 2));
    const step = (SPEED * ease * dt) / len;
    t.t = dir > 0 ? Math.min(1, t.t + step) : Math.max(0, t.t - step);
    leg.curve.getPointAt(t.t, tmpP);
    leg.curve.getTangentAt(t.t, tmpT);
    t.truck.position.set(tmpP.x, 0, tmpP.z);
    // Turn smoothly: the legs meet at slightly different headings (e.g. before backing in).
    aim.set(tmpP.x + tmpT.x, 0, tmpP.z + tmpT.z);
    tmpM.lookAt(aim, t.truck.position, THREE.Object3D.DEFAULT_UP);
    t.truck.quaternion.slerp(tmpQ.setFromRotationMatrix(tmpM), 1 - Math.exp(-dt * 10));
    if (t.t === leg.to) nextLeg(t);
  }

  function logistics(dt, peakMix) {
    trucks.forEach((t) => {
      if (t.state === "loading") {
        t.timer -= dt;
        if (t.reserved < CAPACITY && queue > 0 && t.timer <= 0 && flying.length < 48) {
          t.timer = THREE.MathUtils.lerp(LOAD_INTERVAL.normal, LOAD_INTERVAL.peak, peakMix);
          queue--;
          flying.push({ truck: t, slot: t.reserved++, t: 0, from: new THREE.Vector3(DOCKS_X[t.dock], 0.9, DOCK_Z - 0.3) });
        }
        if (t.loaded === CAPACITY) {
          t.state = "full";
          t.timer = 0.5;
        }
      } else if (t.state === "full") {
        t.timer -= dt;
        if (t.timer <= 0) depart(t);
      } else if (t.state === "driving") {
        const leg = t.legs[t.leg];
        if (leg.unload === undefined) return drive(t, leg, dt);
        t.timer -= dt;
        if (t.timer > 0) return;
        const next = t.cargo.findLastIndex((c) => c.visible);
        if (next < 0) return nextLeg(t);
        t.cargo[next].visible = false;
        destinations[leg.unload].pulse = 1;
        t.timer = UNLOAD_INTERVAL;
      }
    });

    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.t += dt * 2.2;
      if (f.t >= 1) {
        f.truck.cargo[f.slot].visible = true;
        f.truck.loaded++;
        flying.splice(i, 1);
      }
    }
    flying.forEach((f, i) => {
      // The slot moves with the truck, so resolve it every frame.
      f.truck.truck.updateMatrix();
      tmpT.copy(slots[f.slot]).applyMatrix4(f.truck.truck.matrix);
      tmpP.lerpVectors(f.from, tmpT, f.t).setY(THREE.MathUtils.lerp(f.from.y, tmpT.y, f.t) + Math.sin(f.t * Math.PI) * 1.2);
      flyMesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ.setFromEuler(tmpE.set(f.t * 3, f.t * 2, 0)), one));
    });
    flyMesh.count = flying.length;
    flyMesh.instanceMatrix.needsUpdate = true;

    destinations.forEach((d) => {
      d.pulse = Math.max(0, d.pulse - dt * 2);
      d.pad.material.color.set(COLORS.stone).lerp(green, d.pulse);
    });

    const count = queue >= MAX_QUEUE ? `${MAX_QUEUE}+` : queue;
    const text = tr(`fila: ${count} pacotes · ${onRoad} na estrada`, `queue: ${count} packages · ${onRoad} on the road`);
    if (text !== lastText) {
      queueLabel.element.textContent = text;
      queueLabel.element.classList.toggle("alert", queue > 30);
      lastText = text;
    }
  }

  function quote() {
    const i = (Math.random() * HOUSES) | 0;
    const roof = houses[i].clone().setY(1.6);
    const lift = 5 + houses[i].length() * 0.25;
    flow.emit(arc(roof, TOWER_IN, lift), {
      color: COLORS.kafka,
      speed: 13,
      onArrive: () => {
        flow.emit(arc(TOWER_IN, roof, lift), { color: COLORS.message, speed: 13, scale: 0.85, onArrive: () => (houseHeat[i] = 1) });
        if (Math.random() < 0.25) callPartner();
        if (Math.random() < ORDER_RATE) flow.emit(orderCurve, { color: COLORS.ok, speed: 9, onArrive: () => (queue = Math.min(MAX_QUEUE, queue + 1)) });
      },
    });
  }

  function callPartner() {
    const p = partners[(Math.random() * partners.length) | 0];
    // Circuit open: the call bounces back right away and the quote uses the fallback.
    if (p.failedFor > 0) return flow.emit(p.out, { color: COLORS.danger, speed: 18, scale: 0.8 });
    flow.emit(p.out, { color: COLORS.message, speed: 11, scale: 0.85, onArrive: () => flow.emit(p.back, { color: COLORS.ok, speed: 11, scale: 0.85 }) });
  }

  let peak = false;
  let peakMix = 0;
  let spawn = 0;
  let failTimer = 5;
  const green = new THREE.Color(COLORS.ok);
  const plain = new THREE.Color(0xffffff);
  const warm = new THREE.Color(0xffb866);
  const tmp = new THREE.Color();
  const calm = new THREE.Color(COLORS.kafka);
  const busy = new THREE.Color(COLORS.privacy);

  return {
    id: "magalu",
    group,
    pickables,
    view: { pos: [0, 33, 40], target: [0, 0, 2.6], fogFar: 320, narrowScale: 1.12 },
    actions: {
      blackfriday() {
        peak = !peak;
        hud.element.textContent = peak ? tr(`Black Friday · tráfego ${PEAK_FACTOR}×`, `Black Friday · ${PEAK_FACTOR}× traffic`) : tr("tráfego normal", "normal traffic");
        hud.element.classList.toggle("alert", peak);
        return peak;
      },
    },
    update(dt, time, focus) {
      peakMix = THREE.MathUtils.lerp(peakMix, peak ? 1 : 0, 1 - Math.exp(-dt * 2));
      spawn += dt * BASE_RATE * (1 + peakMix * (PEAK_FACTOR - 1)) * focus;
      while (spawn > 1) {
        spawn--;
        quote();
      }
      flow.update(dt);
      logistics(dt, peakMix);

      for (let i = 0; i < HOUSES; i++) {
        houseHeat[i] = Math.max(0, houseHeat[i] - dt * 1.5);
        homes.setColorAt(i, tmp.copy(plain).lerp(warm, houseHeat[i]));
      }
      homes.instanceColor.needsUpdate = true;

      dish.rotation.y += dt * (1.2 + peakMix * 5);
      dish.material.color.copy(calm).lerp(busy, peakMix);

      failTimer -= dt;
      if (failTimer <= 0) {
        failTimer = 6 + Math.random() * 4;
        partners[(Math.random() * partners.length) | 0].failedFor = 2.8;
      }
      partners.forEach((p) => {
        p.failedFor = Math.max(0, p.failedFor - dt);
        const failed = p.failedFor > 0;
        if (failed === p.shown) return;
        p.shown = failed;
        p.label.element.textContent = failed ? `${p.name} · timeout → fallback` : p.name;
        p.label.element.classList.toggle("alert", failed);
        p.bulb.material.color.set(failed ? COLORS.danger : COLORS.message);
      });
    },
  };
}
