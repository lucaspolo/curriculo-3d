// Magalu scene: shoppers across the map ask for shipping quotes; partner integrations fail and recover;
// confirmed orders become packages that trucks carry out of the distribution center.
import * as THREE from "three";
import { COLORS, glow, label, outlinedBox, tube, path, pickable, Flow } from "../lib/kit.js";
import { createLogistics } from "./magalu-logistics.js";

const CITIES = 46;
const BASE_RATE = 7;
const PEAK_FACTOR = 6;
const ORDER_RATE = 0.3; // share of quotes that turn into an order

const PARTNERS = [
  { name: "Correios", pos: [-12, 1.2, -6], text: "Cotação e postagem. A integração tem retentativa e fallback quando o parceiro oscila." },
  { name: "Bling", pos: [6, 1.2, -13], text: "ERP dos sellers do marketplace, integrado de forma resiliente." },
  { name: "AnyMarket", pos: [14, 1.2, -3], text: "Hub de marketplaces conectado ao fluxo de pedidos e fretes." },
];

export function createMagalu() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(600, 0.15);
  group.add(flow.mesh);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(17, 64),
    new THREE.MeshStandardMaterial({ color: 0x0b1322, roughness: 0.9, emissive: 0x060b14 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  [6, 11, 16].forEach((r) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.03, r, 96),
      new THREE.MeshBasicMaterial({ color: 0x1b2c48, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);
  });

  const logistics = createLogistics(group, pickables);

  // Keep shoppers off the partners, the distribution center yard and the roads.
  const blocked = (p) =>
    PARTNERS.some(({ pos }) => Math.hypot(p.x - pos[0], p.z - pos[2]) < 3.5) ||
    (p.x > 3.5 && p.x < 12 && p.z > 0 && p.z < 10.5) ||
    logistics.roadPoints.some((r) => Math.hypot(p.x - r.x, p.z - r.z) < 1.1);
  const cities = [];
  while (cities.length < CITIES) {
    const a = Math.random() * Math.PI * 2;
    const r = 5 + Math.sqrt(Math.random()) * 10.5;
    const p = new THREE.Vector3(Math.cos(a) * r, 0.15, Math.sin(a) * r * 0.9 + 2);
    if (!blocked(p)) cities.push(p);
  }
  const cityDots = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    CITIES,
  );
  const cityHeat = new Float32Array(CITIES);
  const m = new THREE.Matrix4();
  cities.forEach((p, i) => {
    cityDots.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    cityDots.setColorAt(i, new THREE.Color(COLORS.dim));
  });
  group.add(cityDots);
  pickable(pickables, cityDots, {
    title: "Clientes e sellers",
    text: "Cada carrinho pede uma cotação de frete antes de fechar a compra.",
  });

  // Shipping calculator tower
  const tower = new THREE.Group();
  group.add(tower);
  const towerBody = outlinedBox(2.6, 5, 2.6, COLORS.kafka);
  towerBody.position.y = 2.5;
  tower.add(towerBody);
  const rings = [1.4, 2.8, 4.2].map((y, i) => {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(2.6 + i * 0.25, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: glow(COLORS.kafka, 1.4), toneMapped: false }),
    );
    r.position.y = y;
    r.rotation.x = Math.PI / 2;
    tower.add(r);
    return r;
  });
  const towerLabel = label("Cálculo de frete");
  towerLabel.position.set(0, 6.3, 0);
  tower.add(towerLabel);
  const hud = label("tráfego normal", "small");
  hud.position.set(0, 7.7, 0);
  tower.add(hud);
  pickable(pickables, towerBody, {
    title: "Cálculo de frete",
    text: "Serviço que cota o frete da Magalu e dos parceiros do marketplace, com milhões de requisições por dia.",
  });
  const TOWER_IN = new THREE.Vector3(0, 3.2, 0);

  const orderTarget = logistics.orderTarget;
  const orderCurve = path([1.3, 3.6, 0.8], [(orderTarget.x + 1.3) / 2, 5.2, (orderTarget.z + 0.8) / 2], orderTarget.toArray());
  group.add(tube(orderCurve, COLORS.ok, { radius: 0.07, opacity: 0.18 }));

  const partners = PARTNERS.map((p) => {
    const mesh = outlinedBox(3, 1.4, 1.4, COLORS.message);
    mesh.position.set(...p.pos);
    group.add(mesh);
    const l = label(p.name);
    l.position.set(0, 1.3, 0);
    mesh.add(l);
    const out = path([0, 3.6, 0], [p.pos[0] * 0.5, 5.5, p.pos[2] * 0.5], [p.pos[0], p.pos[1] + 0.3, p.pos[2]]);
    const back = path(...out.points.slice().reverse().map((v) => v.toArray()));
    const t = tube(out, COLORS.message, { radius: 0.08, opacity: 0.2 });
    group.add(t);
    pickable(pickables, mesh, { title: p.name, text: p.text });
    return { ...p, mesh, label: l, out, back, tube: t, failedFor: 0 };
  });

  function quote() {
    const i = (Math.random() * CITIES) | 0;
    const c = cities[i];
    const mid = c.clone().lerp(TOWER_IN, 0.5);
    mid.y = 4 + c.length() * 0.25;
    const curve = new THREE.QuadraticBezierCurve3(c.clone(), mid, TOWER_IN);
    flow.emit(curve, {
      color: COLORS.kafka,
      speed: 13,
      onArrive: () => {
        const backCurve = new THREE.QuadraticBezierCurve3(TOWER_IN, mid, c.clone());
        flow.emit(backCurve, { color: COLORS.message, speed: 13, scale: 0.8, onArrive: () => (cityHeat[i] = 1) });
        if (Math.random() < 0.25) callPartner();
        if (Math.random() < ORDER_RATE) {
          flow.emit(orderCurve, { color: COLORS.ok, speed: 9, scale: 0.8, onArrive: () => logistics.order() });
        }
      },
    });
  }

  function callPartner() {
    const p = partners[(Math.random() * partners.length) | 0];
    if (p.failedFor > 0) {
      // Circuit open: the call bounces back right away and the quote uses the fallback.
      flow.emit(p.out, { color: COLORS.danger, speed: 18, scale: 0.7 });
      return;
    }
    flow.emit(p.out, {
      color: COLORS.message,
      speed: 11,
      scale: 0.8,
      onArrive: () => flow.emit(p.back, { color: COLORS.ok, speed: 11, scale: 0.8 }),
    });
  }

  let peak = false;
  let peakMix = 0;
  let spawn = 0;
  let failTimer = 5;

  const okColor = glow(COLORS.message, 1.6);
  const badColor = glow(COLORS.danger, 2);
  const cold = new THREE.Color(COLORS.dim);
  const hot = glow(COLORS.message, 2.4);
  const tmp = new THREE.Color();
  const calm = glow(COLORS.kafka, 1.4);
  const busy = glow(COLORS.privacy, 2);

  return {
    id: "magalu",
    group,
    pickables,
    view: { pos: [0, 21, 34], target: [0, 0, 3], fogFar: 120, narrowScale: 1.12 },
    actions: {
      blackfriday() {
        peak = !peak;
        hud.element.textContent = peak ? `Black Friday · tráfego ${PEAK_FACTOR}×` : "tráfego normal";
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
      logistics.update(dt, peakMix);

      for (let i = 0; i < CITIES; i++) {
        cityHeat[i] = Math.max(0, cityHeat[i] - dt * 1.5);
        cityDots.setColorAt(i, tmp.copy(cold).lerp(hot, cityHeat[i]));
      }
      cityDots.instanceColor.needsUpdate = true;

      const ringColor = tmp.copy(calm).lerp(busy, peakMix);
      rings.forEach((r, i) => {
        r.rotation.z += dt * (0.6 + i * 0.3) * (1 + peakMix * 4) * (i % 2 ? -1 : 1);
        r.material.color.copy(ringColor);
      });
      towerBody.material.emissiveIntensity = 0.1 + peakMix * 0.4;

      failTimer -= dt;
      if (failTimer <= 0) {
        failTimer = 6 + Math.random() * 4;
        const p = partners[(Math.random() * partners.length) | 0];
        p.failedFor = 2.8;
      }
      partners.forEach((p) => {
        const wasFailed = p.failedFor > 0;
        p.failedFor = Math.max(0, p.failedFor - dt);
        const failed = p.failedFor > 0;
        if (failed !== wasFailed || p.label.element.dataset.init !== "1") {
          p.label.element.dataset.init = "1";
          p.label.element.textContent = failed ? `${p.name} · timeout → fallback` : p.name;
          p.label.element.classList.toggle("alert", failed);
          p.mesh.userData.edges.material.color.copy(failed ? badColor : okColor);
          p.tube.material.color.setHex(failed ? COLORS.danger : COLORS.message);
        }
      });
    },
  };
}
