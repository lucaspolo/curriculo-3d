// Kafka scene: a chained pipeline. Each stage consumes one topic, does its job and publishes to the next,
// so normalization, classification and Trust & Privacy are linked only through Kafka.
import * as THREE from "three";
import { COLORS, glow, label, outlinedBox, roundedBox, tube, path, pickable, Flow } from "../lib/kit.js";

const ROW_A = 5;
const ROW_B = -5;
const PARTITIONS = 3;
const SEGMENTS = 8;
const STEP = 0.6;
const HALF_LOG = (SEGMENTS * STEP) / 2;
const PROCESSING = 0.25; // seconds a stage holds a message before publishing downstream

// Topic names are illustrative; the profile describes the stages, not the topic layout.
// dir is the direction messages travel through the log: the bottom row flows right to left.
const TOPICS = [
  { name: "processos.brutos", x: -8, y: ROW_A, dir: 1, color: COLORS.message },
  { name: "processos.normalizados", x: 8, y: ROW_A, dir: 1, color: COLORS.kafka },
  { name: "processos.classificados", x: 8, y: ROW_B, dir: -1, color: COLORS.warn },
  { name: "processos.publicados", x: -8, y: ROW_B, dir: -1, color: COLORS.ok },
];

const STAGES = [
  {
    name: "Normalização",
    x: 0,
    y: ROW_A,
    color: COLORS.kafka,
    text: "Consome processos.brutos, padroniza os dados vindos de fontes diferentes e publica em processos.normalizados.",
  },
  {
    name: "Classificação",
    x: 15.5,
    y: 0,
    color: COLORS.warn,
    text: "Consome processos.normalizados, classifica processos e documentos e publica em processos.classificados.",
  },
  {
    name: "Trust & Privacy",
    x: 0,
    y: ROW_B,
    color: COLORS.privacy,
    text: "Consome processos.classificados, encontra e protege dados pessoais com classificação, NER e LLMs, e publica em processos.publicados.",
  },
];

const SINK = {
  name: "Plataforma",
  x: -16.5,
  y: ROW_B,
  color: COLORS.k8s,
  text: "Os dados tratados chegam à plataforma que serve a informação jurídica pública aos usuários.",
};

const PRODUCERS = [
  { name: "Tribunais", y: ROW_A + 2 },
  { name: "Diários oficiais", y: ROW_A },
  { name: "Documentos", y: ROW_A - 2 },
].map((p) => ({ ...p, x: -16.5 }));

const DAG = [
  { name: "extrair", pos: [-7, 11], deps: [], step: 0 },
  { name: "normalizar", pos: [-2.5, 12.7], deps: [0], step: 1 },
  { name: "classificar", pos: [-2.5, 9.3], deps: [0], step: 1 },
  { name: "carregar", pos: [2, 11], deps: [1, 2], step: 2 },
  { name: "publicar", pos: [6.5, 11], deps: [3], step: 3 },
];

const partitionY = (topic, p) => topic.y + (1 - p) * 1.1;
const entryOf = (topic, p) => new THREE.Vector3(topic.x - topic.dir * (HALF_LOG + 0.5), partitionY(topic, p), 0);
const exitOf = (topic, p) => new THREE.Vector3(topic.x + topic.dir * (HALF_LOG + 0.5), partitionY(topic, p), 0);

/** Point on a box's side or top/bottom facing `toward`, plus whether that port is vertical. */
function port(box, toward) {
  const dx = toward.x - box.x;
  const dy = toward.y - box.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { point: new THREE.Vector3(box.x + Math.sign(dx) * box.hw, box.y, 0), vertical: false };
  }
  return { point: new THREE.Vector3(box.x, box.y + Math.sign(dy) * box.hh, 0), vertical: true };
}

/** Soft elbow from a to b: leaves a along its port's axis, then bends toward b. */
function link(a, b, verticalFirst, z = 0) {
  const corner = verticalFirst ? new THREE.Vector3(a.x, b.y, 0) : new THREE.Vector3(b.x, a.y, 0);
  const mid = a.clone().lerp(b, 0.5).lerp(corner, 0.45);
  mid.z = z;
  return path(a.toArray(), mid.toArray(), b.toArray());
}

export function createKafka() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(600, 0.18);
  group.add(flow.mesh);

  // Topics: an enclosure with one log per partition
  const mtx = new THREE.Matrix4();
  const cold = new THREE.Color(COLORS.dim);
  const topics = TOPICS.map((t) => {
    const enclosure = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(HALF_LOG * 2 + 0.8, 3.9, 1.6)),
      new THREE.LineBasicMaterial({ color: glow(t.color, 0.9), toneMapped: false, transparent: true, opacity: 0.55 }),
    );
    enclosure.position.set(t.x, t.y, 0);
    group.add(enclosure);
    const l = label(t.name, "small");
    l.position.set(t.x, t.y + 2.45, 0);
    group.add(l);

    const logs = new THREE.InstancedMesh(
      roundedBox(STEP * 0.84, 0.8, 0.8, 0.08, 2),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      PARTITIONS * SEGMENTS,
    );
    for (let p = 0; p < PARTITIONS; p++) {
      for (let s = 0; s < SEGMENTS; s++) {
        const x = t.x - t.dir * (HALF_LOG - STEP / 2) + t.dir * s * STEP;
        logs.setMatrixAt(p * SEGMENTS + s, mtx.makeTranslation(x, partitionY(t, p), 0));
        logs.setColorAt(p * SEGMENTS + s, cold);
      }
    }
    group.add(logs);
    pickable(pickables, logs, {
      title: `Tópico ${t.name}`,
      text: "Três partições, cada uma um log ordenado. Cada etapa lê de um tópico e escreve no próximo, então uma etapa lenta não trava as outras.",
    });
    return {
      ...t,
      logs,
      heat: new Float32Array(PARTITIONS * SEGMENTS),
      head: new Array(PARTITIONS).fill(0),
      hot: glow(t.color, 2.4),
    };
  });

  // Producers, stages and the final consumer
  const producers = PRODUCERS.map((p, i) => {
    const mesh = outlinedBox(3.2, 1.2, 1.2, COLORS.message);
    mesh.position.set(p.x, p.y, 0);
    group.add(mesh);
    const l = label(p.name, "small");
    l.position.set(-1.8, 0, 0);
    l.center.set(1, 0.5);
    mesh.add(l);
    pickable(
      pickables,
      mesh,
      { title: `Produtor: ${p.name}`, text: "Clique para publicar uma rajada de mensagens em processos.brutos." },
      () => burst(i, 14),
    );
    return { ...p, hw: 1.6, hh: 0.6, mesh, pulse: 0 };
  });

  const makeService = (s, title) => {
    const mesh = outlinedBox(3.6, 1.6, 1.6, s.color);
    mesh.position.set(s.x, s.y, 0);
    group.add(mesh);
    const l = label(`${s.name} · 0`);
    l.position.set(0, 1.5, 0);
    mesh.add(l);
    pickable(pickables, mesh, { title: `${title}: ${s.name}`, text: s.text });
    return { ...s, hw: 1.8, hh: 0.8, mesh, label: l, count: 0, pulse: 0, dirty: false };
  };
  const stages = STAGES.map((s) => makeService(s, "Etapa"));
  const sink = makeService(SINK, "Destino");
  const consumers = [...stages, sink]; // consumers[t] reads topic t

  // Tubes
  const addTube = (curve, color) => {
    group.add(tube(curve, color, { radius: 0.08, opacity: 0.16 }));
    return curve;
  };
  const producerIn = producers.map((pr) =>
    Array.from({ length: PARTITIONS }, (_, p) => {
      const to = entryOf(topics[0], p);
      return addTube(link(port(pr, to).point, to, false, 0.4), COLORS.message);
    }),
  );
  const topicOut = topics.map((t, ti) =>
    Array.from({ length: PARTITIONS }, (_, p) => {
      const from = exitOf(t, p);
      const to = port(consumers[ti], from).point;
      return addTube(link(from, to, false, -0.4), t.color);
    }),
  );
  const stageOut = stages.map((s, si) =>
    Array.from({ length: PARTITIONS }, (_, p) => {
      const to = entryOf(topics[si + 1], p);
      const from = port(s, to);
      return addTube(link(from.point, to, from.vertical, 0.4), topics[si + 1].color);
    }),
  );

  // Message lifecycle: the partition (the message key) stays the same along the whole pipeline.
  const timers = [];
  const later = (delay, fn) => timers.push({ delay, fn });

  function publish(i) {
    const p = (Math.random() * PARTITIONS) | 0;
    producers[i].pulse = 1;
    flow.emit(producerIn[i][p], { color: COLORS.message, speed: 10, onArrive: () => append(0, p) });
  }

  function append(ti, p) {
    const t = topics[ti];
    t.heat[p * SEGMENTS + t.head[p]] = 1;
    t.head[p] = (t.head[p] + 1) % SEGMENTS;
    flow.emit(topicOut[ti][p], {
      color: t.color,
      speed: 9 + Math.random() * 2,
      scale: 0.85,
      onArrive: () => consume(ti, p),
    });
  }

  function consume(ti, p) {
    const c = consumers[ti];
    c.count++;
    c.pulse = 1;
    c.dirty = true;
    if (ti >= stages.length) return; // the platform is the end of the line
    later(PROCESSING, () =>
      flow.emit(stageOut[ti][p], {
        color: topics[ti + 1].color,
        speed: 10,
        onArrive: () => append(ti + 1, p),
      }),
    );
  }

  const queue = [];
  function burst(producer, n) {
    for (let k = 0; k < n; k++) queue.push({ producer, at: k * 0.06 });
  }

  // Airflow DAG floating above the pipeline
  const dagNodes = DAG.map((t) => {
    const mesh = outlinedBox(2.6, 0.9, 0.9, COLORS.dim);
    mesh.position.set(t.pos[0], t.pos[1], 0);
    group.add(mesh);
    const l = label(t.name, "small plain");
    l.position.set(0, 0.85, 0);
    mesh.add(l);
    return mesh;
  });
  const dagLines = [];
  DAG.forEach((t) =>
    t.deps.forEach((d) => {
      const a = DAG[d].pos;
      dagLines.push(a[0] + 1.3, a[1], 0, t.pos[0] - 1.3, t.pos[1], 0);
    }),
  );
  const dagGeo = new THREE.BufferGeometry();
  dagGeo.setAttribute("position", new THREE.Float32BufferAttribute(dagLines, 3));
  group.add(new THREE.LineSegments(dagGeo, new THREE.LineBasicMaterial({ color: 0x5c6f91 })));
  const dagLabel = label("Airflow · DAG diário");
  dagLabel.position.set(-0.3, 14.4, 0);
  group.add(dagLabel);
  pickable(pickables, dagNodes[0], {
    title: "Airflow",
    text: "Orquestra as etapas em lote: cada tarefa roda quando as dependências terminam.",
  });
  const dagColors = { idle: new THREE.Color(COLORS.dim), running: glow(COLORS.warn, 1.2), done: glow(COLORS.ok, 1.5) };
  let dagClock = 0;

  let spawn = 0;
  const col = new THREE.Color();

  return {
    id: "kafka",
    group,
    pickables,
    view: { pos: [-1.5, 2.5, 48], target: [-1.5, 2.5, 0], fogFar: 120, narrowScale: 1.1 },
    actions: { burst },
    update(dt, time, focus) {
      spawn += dt * 5 * focus;
      while (spawn > 1) {
        spawn--;
        publish((Math.random() * producers.length) | 0);
      }
      for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].at -= dt;
        if (queue[i].at <= 0) {
          publish(queue[i].producer);
          queue.splice(i, 1);
        }
      }
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].delay -= dt;
        if (timers[i].delay <= 0) {
          const { fn } = timers[i];
          timers.splice(i, 1);
          fn();
        }
      }
      flow.update(dt);

      topics.forEach((t) => {
        for (let i = 0; i < t.heat.length; i++) {
          t.heat[i] = Math.max(0, t.heat[i] - dt * 0.6);
          t.logs.setColorAt(i, col.copy(cold).lerp(t.hot, t.heat[i]));
        }
        t.logs.instanceColor.needsUpdate = true;
      });

      producers.forEach((pr) => {
        pr.pulse = Math.max(0, pr.pulse - dt * 4);
        pr.mesh.scale.setScalar(1 + pr.pulse * 0.08 + (pr.mesh.userData.hovered ? 0.08 : 0));
      });
      consumers.forEach((c) => {
        c.pulse = Math.max(0, c.pulse - dt * 3);
        c.mesh.scale.setScalar(1 + c.pulse * 0.12);
        c.mesh.material.emissiveIntensity = 0.08 + c.pulse * 0.5;
        if (c.dirty) {
          c.label.element.textContent = `${c.name} · ${c.count.toLocaleString("pt-BR")}`;
          c.dirty = false;
        }
      });

      // DAG run: steps of 1.1 s, then a pause with everything green before the next run.
      dagClock = (dagClock + dt) % 7;
      const current = dagClock / 1.1;
      DAG.forEach((t, i) => {
        const state =
          current >= 4 ? "done" : t.step < Math.floor(current) ? "done" : t.step === Math.floor(current) ? "running" : "idle";
        dagNodes[i].userData.edges.material.color.copy(dagColors[state]);
        dagNodes[i].material.emissive.copy(dagColors[state]);
        dagNodes[i].material.emissiveIntensity = state === "running" ? 0.25 + Math.sin(time * 10) * 0.1 : 0.05;
      });
    },
  };
}
