// Background of the Trust & Privacy scene: documents at scale go through classification, and only what
// needs it goes on to NER and, for the ambiguous few, to the LLM. The lane split is illustrative.
import * as THREE from "three";
import { COLORS, glow, label, pickable } from "../lib/kit.js";

const Z = -9;
const INPUT = new THREE.Vector3(3.5, 4.2, Z);
const SPEED = 5;
const RATE = 16; // documents per second at full focus
const MAX = 260;

const LANES = [
  { key: "clean", name: "sem dados pessoais", share: 0.6, color: 0x7d8fb0, y: 7.2 },
  { key: "ner", name: "anonimizados pelo NER", share: 0.34, color: COLORS.privacy, y: 3.6 },
  { key: "llm", name: "decididos pelo LLM", share: 0.06, color: COLORS.llm, y: 0.4 },
];

const GATES = [
  {
    name: "Classificação",
    x: 6,
    y: 4.2,
    h: 3.4,
    color: COLORS.message,
    text: "Separa o que não tem dado pessoal, que segue direto, do que precisa de tratamento.",
  },
  {
    name: "NER",
    x: 9.5,
    y: 3.6,
    h: 2.6,
    color: COLORS.privacy,
    text: "Encontra e anonimiza as entidades claras: nomes, CPFs, endereços e telefones.",
  },
  {
    name: "LLM",
    x: 13,
    y: 0.4,
    h: 2,
    color: COLORS.llm,
    text: "Só os casos ambíguos chegam aqui. É a etapa mais cara, por isso recebe a menor fatia.",
  },
];

const v = (x, y) => new THREE.Vector3(x, y, Z);
const PATHS = {
  clean: new THREE.CatmullRomCurve3([INPUT, v(6, 4.2), v(7.8, 6.6), v(9.5, 7.2), v(16.5, 7.2)]),
  ner: new THREE.CatmullRomCurve3([INPUT, v(6, 4.2), v(7.8, 3.7), v(9.5, 3.6), v(16.5, 3.6)]),
  llm: new THREE.CatmullRomCurve3([INPUT, v(6, 4.2), v(7.8, 3.7), v(9.5, 3.6), v(11.2, 1), v(13, 0.4), v(16.5, 0.4)]),
};
const LENGTHS = Object.fromEntries(Object.entries(PATHS).map(([k, c]) => [k, c.getLength()]));

export function createCascade(group, pickables) {
  const neutral = new THREE.Color(0xc8d0de);
  const colors = Object.fromEntries(LANES.map((l) => [l.key, glow(l.color, 1.6)]));

  Object.entries(PATHS).forEach(([key, curve]) => {
    const tubeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 120, 0.06, 6, false),
      new THREE.MeshBasicMaterial({ color: LANES.find((l) => l.key === key).color, transparent: true, opacity: 0.18 }),
    );
    group.add(tubeMesh);
  });

  const gates = GATES.map((g) => {
    const geo = new THREE.BoxGeometry(0.3, g.h, 1.6);
    const gate = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: g.color, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    gate.position.set(g.x, g.y, Z);
    gate.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: glow(g.color, 1.6), toneMapped: false }),
      ),
    );
    group.add(gate);
    const l = label(g.name, "small");
    l.position.set(0, g.h / 2 + 0.45, 0);
    gate.add(l);
    pickable(pickables, gate, { title: g.name, text: g.text });
    return { gate, lit: 0 };
  });
  let litGate = -1;

  const scale = label("escala: dezenas de milhões de documentos por dia", "small");
  scale.position.set(10, 10, Z);
  group.add(scale);

  const exits = LANES.map((l) => {
    // Right-aligned above the lane's end, so the labels stay inside the frame.
    const e = label(`${l.name} · 0%`, "small");
    e.position.set(16.5, l.y + 0.35, Z);
    e.center.set(1, 1);
    group.add(e);
    return e;
  });

  const cards = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.34, 0.44),
    new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }),
    MAX,
  );
  cards.setColorAt(0, neutral);
  cards.frustumCulled = false;
  cards.count = 0;
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
  const m = new THREE.Matrix4();

  return {
    input: INPUT,
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
        g.gate.material.opacity = 0.12 + g.lit * 0.3;
        g.gate.scale.setScalar(1 + g.lit * 0.12);
      });
      spawn += dt * RATE * focus;
      while (spawn > 1) {
        spawn--;
        this.emit();
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const curve = PATHS[it.lane];
        curve.getPointAt(it.t, p);
        // The LLM gate is slower, so its narrow lane visibly queues up.
        const slow = it.lane === "llm" && Math.abs(p.x - 13) < 1.2 ? 0.3 : 1;
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
        cards.setColorAt(i, p.x < 6 ? neutral : colors[it.lane]);
      });
      cards.count = items.length;
      cards.instanceMatrix.needsUpdate = true;
      cards.instanceColor.needsUpdate = true;

      if (total > 0) {
        const text = LANES.map((l) => Math.round((counts[l.key] / total) * 100)).join("|");
        if (text !== lastText) {
          lastText = text;
          LANES.forEach((l, i) => {
            exits[i].element.textContent = `${l.name} · ${Math.round((counts[l.key] / total) * 100)}%`;
          });
        }
      }
    },
  };
}
