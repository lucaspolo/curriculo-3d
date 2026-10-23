// Logistics for the Magalu scene: a distribution center turns orders into packages, trucks at the docks
// fill up, leave when full, deliver, and back into the dock again.
import * as THREE from "three";
import { COLORS, glow, label, outlinedBox, pickable, roundedBox } from "../lib/kit.js";
import { tr } from "../i18n.js";

const CD = { x: 7, z: 3, w: 4.6, d: 3.5, h: 2.4 };
const DOCK_Z = CD.z + CD.d / 2; // front wall of the building, where the trailers back in
const DOCKS_X = [5.8, 8.2];
const PARK_Z = DOCK_Z + 2.05; // truck origin is mid-length, so this puts the trailer door at the wall
const CAPACITY = 16;
const SPEED = 6;
const LOAD_INTERVAL = { normal: 0.22, peak: 0.1 };
const UNLOAD_INTERVAL = 0.07;
const MAX_QUEUE = 99;

// Waypoints (x, z) on the ground. All destinations share the front road and then branch west.
const FRONT_ROAD = [
  [-1.5, 13.3],
  [-6.5, 12.3],
];
const DESTINATIONS = [
  { name: tr("entrega · região A", "delivery · region A"), at: [-3.5, 14.2], via: [[-1.5, 13.3]] },
  { name: tr("entrega · região B", "delivery · region B"), at: [-11, 9], via: [...FRONT_ROAD, [-10, 9.8]] },
  { name: tr("entrega · região C", "delivery · region C"), at: [-14.5, 1], via: [...FRONT_ROAD, [-11, 8.5], [-13.8, 4]] },
];

const ground = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));

// Truck parts are built with +z as forward, so Object3D.lookAt points the cab along the road.
function makeTruck() {
  const truck = new THREE.Group();
  const cab = outlinedBox(1.25, 1.1, 1.0, COLORS.k8s, { details: false, radius: 0.16 });
  cab.position.set(0, 0.85, 1.35);
  truck.add(cab);
  // Windshield, side windows and a grille, so the cab reads as a cab.
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1424, roughness: 0.15, metalness: 0.8, emissive: 0x16304f });
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.42), glass);
  windshield.position.set(0, 0.2, 0.505);
  cab.add(windshield);
  [-1, 1].forEach((side) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), glass);
    w.position.set(side * 0.63, 0.2, 0.05);
    w.rotation.y = side * Math.PI / 2;
    cab.add(w);
  });
  const grille = new THREE.Mesh(roundedBox(0.8, 0.22, 0.06, 0.03, 2), new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.7, roughness: 0.3 }));
  grille.position.set(0, -0.25, 0.51);
  cab.add(grille);
  const trailerGeo = new THREE.BoxGeometry(1.4, 1.4, 2.7);
  const trailer = new THREE.Mesh(
    trailerGeo,
    new THREE.MeshStandardMaterial({ color: COLORS.steel, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  trailer.position.set(0, 1.02, -0.55);
  trailer.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(trailerGeo),
      new THREE.LineBasicMaterial({ color: glow(COLORS.k8s, 1.3), toneMapped: false }),
    ),
  );
  truck.add(trailer);

  const wheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.2, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.8 });
  const wheels = [];
  [-1.45, -0.85, 1.35].forEach((z) =>
    [-0.66, 0.66].forEach((x) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.27, z);
      truck.add(w);
      wheels.push(w);
    }),
  );
  const lightMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.warn, 2.2), toneMapped: false });
  [-0.4, 0.4].forEach((x) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), lightMat);
    l.position.set(x, 0.65, 1.86);
    truck.add(l);
  });
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 0.04),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.danger, 1.8), toneMapped: false }),
  );
  tail.position.set(0, 0.4, -1.92);
  truck.add(tail);

  // Cargo slots, filled from the cab end towards the trailer door.
  const slots = [];
  [0.45, -0.15, -0.75, -1.35].forEach((z) =>
    [0.6, 1.15].forEach((y) => [-0.32, 0.32].forEach((x) => slots.push(new THREE.Vector3(x, y, z)))),
  );
  return { truck, cab, wheels, slots };
}

export function createLogistics(group, pickables) {
  const box = roundedBox(0.46, 0.46, 0.46, 0.05, 2);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.8, emissive: 0x3a2410 });

  // Distribution center
  const building = outlinedBox(CD.w, CD.h, CD.d, COLORS.message, { details: false, radius: 0.2 });
  building.position.set(CD.x, CD.h / 2, CD.z);
  group.add(building);
  // A row of lit windows above the docks and a roof unit, so it reads as a warehouse.
  const windowMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.warn, 0.9), toneMapped: false });
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), windowMat);
    w.position.set(-CD.w / 2 + 0.6 + i * 0.85, CD.h / 2 - 0.4, CD.d / 2 + 0.01);
    building.add(w);
  }
  const roofUnit = new THREE.Mesh(roundedBox(1.2, 0.4, 0.8, 0.08, 2), new THREE.MeshStandardMaterial({ color: 0x3a4458, metalness: 0.6, roughness: 0.4 }));
  roofUnit.position.set(1, CD.h / 2 + 0.2, -0.6);
  building.add(roofUnit);
  const cdLabel = label(tr("Centro de distribuição", "Distribution center"));
  cdLabel.position.set(0, CD.h / 2 + 0.9, 0);
  building.add(cdLabel);
  const queueLabel = label(tr("fila: 0 pacotes", "queue: 0 packages"), "small");
  queueLabel.position.set(0, CD.h / 2 + 2, 0);
  building.add(queueLabel);
  pickable(pickables, building, {
    title: tr("Centro de distribuição", "Distribution center"),
    text: tr(
      "Pedidos viram pacotes com etiqueta e entram nos caminhões. Na Black Friday a fila cresce mais rápido do que a frota consegue levar.",
      "Orders become labeled packages and go onto the trucks. On Black Friday the queue grows faster than the fleet can carry it.",
    ),
  });
  const doorMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.message, 1.1), toneMapped: false });
  DOCKS_X.forEach((x) => {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), doorMat);
    door.position.set(x, 0.95, DOCK_Z + 0.01);
    group.add(door);
  });

  // Roads: departure, return and the reverse-into-dock curve for every dock
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x24395c, roughness: 0.9, emissive: 0x0a1424 });
  const roadPoints = [];
  const addRoad = (curve) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.45, 6, false), roadMat);
    mesh.scale.y = 0.04; // flatten the tube into a ribbon lying on the ground
    mesh.position.y = 0.02;
    group.add(mesh);
    curve.getSpacedPoints(60).forEach((p) => roadPoints.push(p));
    return curve;
  };

  const routes = DOCKS_X.map((x) => {
    const leave = [
      [x, PARK_Z],
      [x, PARK_Z + 3.5],
      [x - 2.5, 12.8],
    ];
    const turnPoint = [x + 2.5, 12.6];
    const reverseIn = addRoad(ground([[x, PARK_Z], [x, PARK_Z + 2.9], turnPoint]));
    return DESTINATIONS.map((dest) => {
      const outbound = addRoad(ground([...leave, ...dest.via, dest.at]));
      const back = [...dest.via].reverse();
      const inbound = addRoad(ground([dest.at, ...back, [x - 2.5, 12.8], turnPoint]));
      return { outbound, inbound, reverseIn };
    });
  });

  const destinations = DESTINATIONS.map((d) => {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 0.12, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.dim), toneMapped: false }),
    );
    pad.position.set(d.at[0], 0.06, d.at[1]);
    group.add(pad);
    const l = label(d.name, "small plain");
    l.position.set(0, 0.6, 0);
    pad.add(l);
    return { pad, pulse: 0 };
  });

  // Fleet: one truck per dock
  const trucks = DOCKS_X.map((x, d) => {
    const parts = makeTruck();
    group.add(parts.truck);
    parts.truck.position.set(x, 0, PARK_Z);
    const cargo = parts.slots.map((s) => {
      const p = new THREE.Mesh(box, boxMat);
      p.position.copy(s);
      p.visible = false;
      parts.truck.add(p);
      return p;
    });
    pickable(pickables, parts.cab, {
      title: tr("Caminhão", "Truck"),
      text: tr(
        "Recebe pacotes na doca e sai para a entrega quando lota. Depois volta e encosta de ré para carregar de novo.",
        "Takes packages at the dock and leaves to deliver once full. Then it comes back and reverses in to load again.",
      ),
    });
    return { ...parts, dock: d, cargo, state: "loading", reserved: 0, loaded: 0, legs: [], timer: 0 };
  });

  // Packages in flight from the door to a slot inside the trailer
  const flying = [];
  const flyMesh = new THREE.InstancedMesh(box, boxMat, 48);
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
  const tmpS = new THREE.Vector3(1, 1, 1);
  const tmpM = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const aim = new THREE.Vector3();
  const padHot = glow(COLORS.ok, 2);
  const lengths = new Map();
  const lengthOf = (c) => lengths.get(c) ?? lengths.set(c, c.getLength()).get(c);

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
      t.state = "loading";
      t.reserved = 0;
      t.loaded = 0;
      t.timer = 0;
      onRoad--;
      return;
    }
    t.t = leg.from ?? 0;
    t.timer = 0;
  }

  function drive(t, leg, dt) {
    const len = lengthOf(leg.curve);
    const dir = Math.sign(leg.to - leg.from);
    const done = Math.abs(t.t - leg.from);
    const left = Math.abs(leg.to - t.t);
    // Ease in and out over the first and last ~2 units of each leg.
    const ease = Math.min(1, 0.25 + Math.min(done, left) * (len / 2));
    const step = (SPEED * ease * dt) / len;
    t.t = dir > 0 ? Math.min(1, t.t + step) : Math.max(0, t.t - step);
    leg.curve.getPointAt(t.t, tmpP);
    leg.curve.getTangentAt(t.t, tmpT);
    t.truck.position.set(tmpP.x, 0, tmpP.z);
    // Turn smoothly: the legs meet at slightly different headings (e.g. before backing in).
    aim.set(tmpP.x + tmpT.x, 0, tmpP.z + tmpT.z);
    tmpM.lookAt(aim, t.truck.position, UP);
    tmpQ.setFromRotationMatrix(tmpM);
    t.truck.quaternion.slerp(tmpQ, 1 - Math.exp(-dt * 10));
    t.wheels.forEach((w) => (w.rotation.x += (dir * step * len) / 0.27));
    if (t.t === leg.to) nextLeg(t);
  }

  return {
    roadPoints,
    /** Called when a shopper confirms a quote: one more package for the distribution center. */
    order() {
      queue = Math.min(MAX_QUEUE, queue + 1);
    },
    orderTarget: new THREE.Vector3(CD.x, CD.h + 0.2, CD.z),
    update(dt, peakMix) {
      trucks.forEach((t) => {
        if (t.state === "loading") {
          t.timer -= dt;
          if (t.reserved < CAPACITY && queue > 0 && t.timer <= 0 && flying.length < 48) {
            t.timer = THREE.MathUtils.lerp(LOAD_INTERVAL.normal, LOAD_INTERVAL.peak, peakMix);
            queue--;
            const slot = t.reserved++;
            flying.push({ truck: t, slot, t: 0, from: new THREE.Vector3(DOCKS_X[t.dock], 0.9, DOCK_Z - 0.3) });
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
          if (leg.unload !== undefined) {
            t.timer -= dt;
            if (t.timer <= 0) {
              const next = t.cargo.findLastIndex((c) => c.visible);
              if (next < 0) {
                nextLeg(t);
              } else {
                t.cargo[next].visible = false;
                destinations[leg.unload].pulse = 1;
                t.timer = UNLOAD_INTERVAL;
              }
            }
          } else {
            drive(t, leg, dt);
          }
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
        // Slot position moves with the truck, so resolve it every frame.
        f.truck.truck.updateMatrix();
        const to = f.truck.slots[f.slot].clone().applyMatrix4(f.truck.truck.matrix);
        const k = f.t;
        tmpP.lerpVectors(f.from, to, k);
        tmpP.y += Math.sin(k * Math.PI) * 1.2;
        tmpQ.setFromEuler(tmpE.set(k * 3, k * 2, 0));
        flyMesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
      });
      flyMesh.count = flying.length;
      flyMesh.instanceMatrix.needsUpdate = true;

      destinations.forEach((d) => {
        d.pulse = Math.max(0, d.pulse - dt * 2);
        d.pad.material.color.setHex(COLORS.dim).lerp(padHot, d.pulse);
      });

      const count = queue >= MAX_QUEUE ? `${MAX_QUEUE}+` : queue;
      const text = tr(`fila: ${count} pacotes · ${onRoad} na estrada`, `queue: ${count} packages · ${onRoad} on the road`);
      if (text !== lastText) {
        queueLabel.element.textContent = text;
        queueLabel.element.classList.toggle("alert", queue > 30);
        lastText = text;
      }
    },
  };
}
