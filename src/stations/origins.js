// Origins scene: a circuit board (electronics roots), a radio tower (ham radio, telecom) and the timeline.
import * as THREE from "three";
import { COLORS, glow, label, pickable, Flow } from "../lib/kit.js";

const MILESTONES = [
  [2006, "IFSP"],
  [2008, "Luxxel"],
  [2010, "IBGE"],
  [2011, "Mobint e Porto Seguro"],
  [2015, "Bacharelado"],
  [2018, "Magalu"],
  [2022, "Jusbrasil"],
  [2026, "Pós Telecom"],
];
const yearX = (y) => -14 + ((y - 2006) / 20) * 28;

function manhattan(from, to, rng) {
  // Board traces only turn at right angles, like a real PCB layout.
  const pts = [from];
  const midX = from.x + (to.x - from.x) * (0.3 + rng() * 0.4);
  pts.push(new THREE.Vector3(midX, from.y, 0), new THREE.Vector3(midX, to.y, 0), to);
  const curve = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].distanceTo(pts[i + 1]) > 0.001) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  }
  return curve;
}

export function createOrigins() {
  const group = new THREE.Group();
  const pickables = [];

  // Circuit board
  const board = new THREE.Group();
  board.position.set(-4, 1.2, 0);
  board.rotation.x = -0.35;
  group.add(board);
  const pcb = new THREE.Mesh(
    new THREE.BoxGeometry(15, 9, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x06241a, roughness: 0.7, emissive: 0x021008 }),
  );
  pcb.position.z = -0.2;
  board.add(pcb);
  pickable(pickables, pcb, {
    title: "Eletrônica, 2008",
    text: "Primeiro emprego: soldagem e montagem de circuitos e testes de reatores eletrônicos na Luxxel.",
  });

  const chips = [
    [-4.5, 1.5, 2.4, 1.6],
    [1, -1.5, 2, 2],
    [4.8, 2.2, 1.6, 1.2],
    [-3.5, -2.6, 1.4, 1],
  ].map(([x, y, w, h]) => {
    const chip = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.4, metalness: 0.5 }),
    );
    chip.position.set(x, y, 0.1);
    board.add(chip);
    return new THREE.Vector3(x, y, 0.05);
  });

  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const traces = [];
  const pinsOf = (c, k) => new THREE.Vector3(c.x + (k - 1) * 0.35, c.y, 0.05);
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      for (let k = 0; k < 2; k++) traces.push(manhattan(pinsOf(chips[i], k), pinsOf(chips[j], k + 1), rng));
    }
  }
  for (let k = 0; k < 6; k++) {
    const c = chips[k % chips.length];
    traces.push(manhattan(pinsOf(c, k % 3), new THREE.Vector3(-7.2 + (k % 2) * 14.4, -4 + k * 1.5, 0.05), rng));
  }
  const traceMat = new THREE.LineBasicMaterial({ color: 0x2f8f5b });
  traces.forEach((t) => {
    const g = new THREE.BufferGeometry().setFromPoints(t.getPoints(4));
    board.add(new THREE.Line(g, traceMat));
  });
  const flow = new Flow(120, 0.12);
  board.add(flow.mesh);
  const boardLabel = label("2008 · solda e montagem de circuitos");
  boardLabel.position.set(0, 5.2, 0);
  board.add(boardLabel);

  // Radio tower
  const tower = new THREE.Group();
  tower.position.set(12, -5.5, -1);
  group.add(tower);
  const mast = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.15, 0.9, 10, 4, 6)),
    new THREE.LineBasicMaterial({ color: glow(COLORS.k8s, 1.2), toneMapped: false }),
  );
  mast.position.y = 5;
  tower.add(mast);
  const lattice = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.9, 10, 4, 6),
    new THREE.MeshBasicMaterial({ color: COLORS.k8s, wireframe: true, transparent: true, opacity: 0.35 }),
  );
  lattice.position.y = 5;
  tower.add(lattice);
  const dipole = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.message, 2), toneMapped: false }),
  );
  dipole.position.y = 9.6;
  tower.add(dipole);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.danger, 3), toneMapped: false }),
  );
  tip.position.y = 10.2;
  tower.add(tip);
  pickable(pickables, lattice, {
    title: "Radioamador",
    text: "Hobby antigo que virou estudo: pós-graduação em Engenharia de Redes de Telecomunicações (Estácio).",
  });
  const towerLabel = label("Radioamador · Telecom");
  towerLabel.position.set(0, 11.4, 0);
  tower.add(towerLabel);

  const waves = Array.from({ length: 4 }, (_, i) => {
    const w = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.04, 6, 64),
      new THREE.MeshBasicMaterial({
        color: glow(COLORS.message, 1.6),
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    w.position.y = 10.2;
    w.userData.offset = i / 4;
    tower.add(w);
    return w;
  });

  // Timeline
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(29, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x2b3a55 }),
  );
  line.position.y = -6.5;
  group.add(line);
  const markers = MILESTONES.map(([year, name]) => {
    const mk = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.dim), toneMapped: false }),
    );
    mk.position.set(yearX(year), -6.5, 0);
    group.add(mk);
    const l = label(String(year), "small plain");
    l.position.set(0, -0.8, 0);
    mk.add(l);
    pickable(pickables, mk, { title: String(year), text: name });
    return mk;
  });
  const markerHot = glow(COLORS.message, 2.6);
  const tipOn = glow(COLORS.danger, 3);
  const tipOff = glow(COLORS.danger, 0.6);
  const markerCold = new THREE.Color(COLORS.dim);

  let spawn = 0;

  return {
    id: "origins",
    group,
    pickables,
    view: { pos: [1, 3, 33], target: [1, 0, 0], fogFar: 100 },
    update(dt, time, focus) {
      spawn += dt * 14 * focus;
      while (spawn > 1) {
        spawn--;
        flow.emit(traces[(Math.random() * traces.length) | 0], {
          color: Math.random() < 0.5 ? COLORS.ok : COLORS.message,
          speed: 6,
        });
      }
      flow.update(dt);

      waves.forEach((w) => {
        const k = (time * 0.4 + w.userData.offset) % 1;
        w.scale.setScalar(0.6 + k * 5);
        w.material.opacity = (1 - k) * 0.55;
      });
      tip.material.color.copy(Math.sin(time * 4) > 0 ? tipOn : tipOff);

      // A pulse runs along the timeline, lighting each year as it passes.
      const head = -15 + ((time * 6) % 34);
      markers.forEach((mk) => {
        const d = Math.abs(mk.position.x - head);
        mk.material.color.copy(markerCold).lerp(markerHot, Math.max(0, 1 - d / 3));
        mk.scale.setScalar(1 + (mk.userData.hovered ? 0.5 : 0));
      });
    },
  };
}
