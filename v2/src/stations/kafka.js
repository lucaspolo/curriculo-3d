// Kafka island: the same chained pipeline as the first version, as a voxel diorama. Each stage consumes one
// topic, does its job and publishes to the next. Names and texts come from the first version's scene.
import * as THREE from "three";
import { COLORS, Flow, Vox, hop, label, lamp, pickable, place } from "../lib/kit.js";
import { pattern } from "../lib/voxel.js";
import { island, paving, greenery } from "../world.js";
import { tr, locale } from "../../../src/i18n.js";
import { TOPICS, STAGES, SINK, PRODUCERS, DAG } from "../../../src/stations/kafka.js";

const BACK = -5;
const FRONT = 5;
const PARTITIONS = 3;
const SEGMENTS = 8;
const STEP = 0.6;
const HALF_LOG = (SEGMENTS * STEP) / 2;
const PROCESSING = 0.25; // seconds a stage holds a message before publishing downstream
const DECK = 0.75; // height of a topic's tiles above the ground

// Where each piece stands on the island. The back row runs left to right, the front row comes back.
const TOPIC_AT = [[-8, BACK, 1], [8, BACK, 1], [8, FRONT, -1], [-8, FRONT, -1]];
const STAGE_AT = [[0, BACK], [15.5, 0], [0, FRONT]];
const SINK_AT = [-16.2, FRONT];
const PRODUCER_AT = [[-16.5, BACK - 3.4], [-16.5, BACK], [-16.5, BACK + 3.4]];

const laneZ = (z, p) => z + (p - 1) * 1.1;

function courthouse() {
  const v = new Vox();
  v.box(-7, 0, -5, 6, 0, 5, COLORS.darkStone).box(-6, 1, -4, 5, 1, 4, COLORS.stone);
  v.box(-5, 2, -4, 4, 9, 1, pattern.speckle(COLORS.cream, COLORS.wall, 0.3));
  for (const x of [-5, -2, 1, 4]) v.box(x, 2, 3, x, 9, 3, COLORS.white).set(x, 2, 4, COLORS.stone);
  v.box(-6, 10, -4, 5, 10, 4, COLORS.stone);
  for (let r = 0; r < 5; r++) v.box(-6 + r, 11 + r, -4, 5 - r, 11 + r, 4, r % 2 ? COLORS.cream : COLORS.white);
  v.box(-1, 2, 1, 0, 6, 1, COLORS.darkWood).set(-3, 5, 1, COLORS.glass).set(2, 5, 1, COLORS.glass);
  return v;
}

function newsstand() {
  const v = new Vox();
  v.box(-5, 0, -4, 4, 7, 2, pattern.bands("x", 2, COLORS.cream, COLORS.wall));
  v.box(-4, 3, 2, 3, 6, 2, COLORS.ink).box(-5, 3, 3, 4, 3, 3, COLORS.wood);
  for (let z = 2; z <= 5; z++) v.box(-6, 9 - Math.floor((z - 2) / 2), z, 5, 9 - Math.floor((z - 2) / 2), z, pattern.bands("x", 2, COLORS.danger, COLORS.white));
  v.box(-5, 8, -4, 4, 9, 1, COLORS.roof);
  // Stacks of gazettes on the counter and on the ground.
  v.box(-3, 4, 3, -2, 5, 3, COLORS.white).set(-3, 5, 3, COLORS.stone).box(1, 4, 3, 2, 4, 3, COLORS.white);
  v.box(-8, 0, 3, -7, 2, 4, (x, y) => (y === 1 ? COLORS.stone : COLORS.white));
  return v;
}

function archive() {
  const v = new Vox();
  v.box(-5, 0, -3, 4, 10, 2, pattern.speckle(0x6f8fb3, 0x7a9ac0, 0.3));
  for (const y of [1, 4, 7]) v.box(-4, y, 3, 3, y + 1, 3, 0x8fb0d6).box(-1, y + 1, 4, 0, y + 1, 4, COLORS.ink);
  v.box(-5, 11, -3, 4, 11, 2, COLORS.steel);
  // A folder left on top, one sheet sticking out.
  v.box(-3, 12, -1, 1, 12, 1, 0xf2c14e).box(-2, 13, -1, 1, 13, 0, COLORS.white);
  return v;
}

// One stage of the pipeline: a machine with a funnel on top, an emblem on the front and a lamp on the roof.
function machine(color, emblem) {
  const v = new Vox();
  const shade = new THREE.Color(color).multiplyScalar(0.82).getHex();
  v.box(-7, 0, -5, 6, 1, 4, COLORS.darkStone);
  v.box(-7, 2, -5, 6, 10, 4, pattern.speckle(color, shade, 0.22));
  v.box(-7, 7, -5, 6, 7, 4, COLORS.white).box(-7, 11, -5, 6, 11, 4, COLORS.steel);
  v.box(-3, 12, -2, 2, 13, 1, COLORS.steel).box(-4, 14, -3, 3, 14, 2, COLORS.darkStone).cut(-2, 14, -1, 1, 14, 0);
  for (const x of [-6, 5]) v.box(x, 3, 5, x, 5, 5, COLORS.ink);
  emblem(v);
  return v;
}

const EMBLEMS = [
  // Normalization: different shapes in, equal blocks out.
  (v) => v.box(-3, 3, 5, 2, 5, 5, COLORS.white).set(-2, 4, 5, COLORS.kafka).set(0, 4, 5, COLORS.kafka).set(1, 4, 5, COLORS.kafka),
  // Classification: three bins, one per class.
  (v) => [COLORS.kafka, COLORS.message, COLORS.privacy].forEach((c, i) => v.box(-4 + i * 3, 3, 5, -3 + i * 3, 5, 5, c)),
  // Trust & Privacy: a shield.
  (v) => v.box(-2, 3, 5, 1, 6, 5, COLORS.white).cut(-2, 3, 5, -2, 3, 5).cut(1, 3, 5, 1, 3, 5).box(-1, 4, 5, 0, 5, 5, COLORS.privacy),
];

// The platform that serves the data: a building with a big screen and an antenna.
function platform() {
  const v = new Vox();
  v.box(-7, 0, -5, 6, 0, 4, COLORS.darkStone);
  v.box(-6, 1, -4, 5, 11, 3, pattern.bricks(0x4f86d9, 0x3f73c2));
  v.box(-4, 4, 4, 3, 9, 4, COLORS.glass).box(-3, 5, 4, -1, 5, 4, COLORS.white).box(-3, 7, 4, 2, 7, 4, COLORS.white);
  v.box(-1, 1, 4, 0, 2, 4, COLORS.ink).box(-7, 12, -5, 6, 12, 4, COLORS.steel);
  v.box(3, 13, -2, 3, 17, -2, COLORS.steel).box(1, 17, -3, 5, 17, -1, COLORS.white).set(3, 18, -2, COLORS.danger);
  return v;
}

// A topic's bed: a low wooden tray the three partitions lie in.
function tray(color) {
  const v = new Vox();
  v.box(-12, 0, -8, 11, 1, 7, pattern.bands("x", 3, COLORS.wood, COLORS.darkWood));
  v.box(-12, 2, -8, 11, 2, -8, color).box(-12, 2, 7, 11, 2, 7, color).box(-12, 2, -8, -12, 2, 7, color).box(11, 2, -8, 11, 2, 7, color);
  return v;
}

// Airflow, as a windmill: the tower here, the sails turn on their own.
function windmillTower() {
  const v = new Vox();
  for (let y = 0; y < 22; y++) {
    const r = y < 8 ? 3 : y < 16 ? 2.5 : 2;
    v.rod("y", -0.5, -0.5, y, y, r, y % 6 < 2 ? COLORS.roof : COLORS.white);
  }
  v.rod("y", -0.5, -0.5, 22, 23, 2.6, COLORS.roof).box(-1, 24, -1, 0, 24, 0, COLORS.roof).box(-1, 1, 3, 0, 4, 3, COLORS.darkWood);
  return v;
}

function windmillSails() {
  const v = new Vox();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let s = 1; s <= 10; s++) {
      v.set(dx * s, dy * s, 0, COLORS.darkWood);
      if (s > 2) v.set(dx * s + (dy ? 1 : 0), dy * s + (dx ? 1 : 0), 0, s % 2 ? COLORS.white : COLORS.cream).set(dx * s + (dy ? 2 : 0), dy * s + (dx ? 2 : 0), 0, COLORS.white);
    }
  }
  return v.box(-1, -1, 0, 1, 1, 1, COLORS.steel);
}

export function createKafka() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(600, 0.36);
  group.add(flow.mesh);

  const ground = paving()
    .rect(-19.5, -9.4, 19.2, 8.6, (i, k) => ((Math.floor(i / 4) + Math.floor(k / 4)) % 2 ? 0xeadcbd : 0xe2d2ae))
    .disc(0, -11.5, 3.2, 0xd8c8a2);
  group.add(island({ rx: 25, rz: 16.5, seed: 1, paint: ground.paint }));
  group.add(
    greenery([
      ["palm", -22, -6], ["palm", 21.5, 5], ["tree", -10, -12.5], ["tree", 11, -12.8], ["bush", -6, -12.6], ["bush", 6.5, -12.4],
      ["palm", 19, -9], ["rock", -21, 4], ["bush", 21.5, -2], ["tree", -19.5, 9.5], ["rock", 12, 11.5], ["bush", -3, 11.8], ["palm", 6, 12],
    ]),
  );

  // Topics: a tray with one row of tiles per partition. A tile lights up when a message is appended.
  const cold = new THREE.Color(0xd9cdb4);
  const mtx = new THREE.Matrix4();
  const topics = TOPICS.map((t, ti) => {
    const [x, z, dir] = TOPIC_AT[ti];
    place(group, tray(t.color), [x, 0, z]);
    const l = label(t.name, "small");
    l.position.set(x, 2.3, z - 2.2);
    group.add(l);
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(STEP * 0.84, 0.3, 0.86), new THREE.MeshLambertMaterial(), PARTITIONS * SEGMENTS);
    for (let p = 0; p < PARTITIONS; p++) {
      for (let s = 0; s < SEGMENTS; s++) {
        tiles.setMatrixAt(p * SEGMENTS + s, mtx.makeTranslation(x - dir * (HALF_LOG - STEP / 2) + dir * s * STEP, DECK - 0.1, laneZ(z, p)));
        tiles.setColorAt(p * SEGMENTS + s, cold);
      }
    }
    tiles.receiveShadow = true;
    group.add(tiles);
    pickable(pickables, tiles, {
      title: tr(`Tópico ${t.name}`, `Topic ${t.name}`),
      text: tr(
        "Três partições, cada uma um log ordenado. Cada etapa lê de um tópico e escreve no próximo, então uma etapa lenta não trava as outras.",
        "Three partitions, each an ordered log. Each stage reads from one topic and writes to the next, so a slow stage does not hold the others back.",
      ),
    });
    return {
      ...t, x, z, dir, tiles,
      heat: new Float32Array(PARTITIONS * SEGMENTS),
      head: new Array(PARTITIONS).fill(0),
      hot: new THREE.Color(t.color),
      entry: (p) => new THREE.Vector3(x - dir * (HALF_LOG + 0.4), DECK + 0.2, laneZ(z, p)),
      exit: (p) => new THREE.Vector3(x + dir * (HALF_LOG + 0.4), DECK + 0.2, laneZ(z, p)),
    };
  });

  // Producers, stages and the final consumer
  const producers = PRODUCERS.map((p, i) => {
    const [x, z] = PRODUCER_AT[i];
    const mesh = place(group, [courthouse, newsstand, archive][i](), [x, 0, z]);
    mesh.rotation.y = Math.PI / 2; // facing the pipeline
    const l = label(p.name, "small");
    l.position.set(0, i === 0 ? 4.6 : 3.4, 0);
    mesh.add(l);
    pickable(
      pickables,
      mesh,
      {
        title: tr(`Produtor: ${p.name}`, `Producer: ${p.name}`),
        text: tr("Clique para publicar uma rajada de mensagens em processos.brutos.", "Click to publish a burst of messages to cases.raw."),
      },
      () => burst(i, 14),
    );
    return { ...p, mesh, pulse: 0, out: new THREE.Vector3(x + 1.6, 1.6, z) };
  });

  const makeService = (s, at, vox, title) => {
    const mesh = place(group, vox, [at[0], 0, at[1]]);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lamp(COLORS.white));
    bulb.position.set(1.2, 3.25, -0.6);
    mesh.add(bulb);
    const l = label(`${s.name} · 0`);
    l.position.set(0, 4.6, 0);
    mesh.add(l);
    pickable(pickables, mesh, { title: `${title}: ${s.name}`, text: s.text });
    return { ...s, mesh, bulb, label: l, count: 0, pulse: 0, dirty: false, lit: new THREE.Color(s.color), mouth: new THREE.Vector3(at[0], 3.6, at[1]) };
  };
  const stages = STAGES.map((s, i) => makeService(s, STAGE_AT[i], machine(s.color, EMBLEMS[i]), tr("Etapa", "Stage")));
  const sink = makeService(SINK, SINK_AT, platform(), tr("Destino", "Destination"));
  const consumers = [...stages, sink]; // consumers[t] reads topic t

  // Message lifecycle: the partition (the message key) stays the same along the whole pipeline.
  const timers = [];
  const later = (delay, fn) => timers.push({ delay, fn });

  function publish(i) {
    const p = (Math.random() * PARTITIONS) | 0;
    producers[i].pulse = 1;
    flow.emit(hop(producers[i].out, topics[0].entry(p), 1.8), { color: COLORS.message, speed: 10, onArrive: () => append(0, p) });
  }

  function append(ti, p) {
    const t = topics[ti];
    t.heat[p * SEGMENTS + t.head[p]] = 1;
    t.head[p] = (t.head[p] + 1) % SEGMENTS;
    flow.emit(hop(t.exit(p), consumers[ti].mouth, 1.6), { color: t.color, speed: 9 + Math.random() * 2, scale: 0.85, onArrive: () => consume(ti, p) });
  }

  function consume(ti, p) {
    const c = consumers[ti];
    c.count++;
    c.pulse = 1;
    c.dirty = true;
    if (ti >= stages.length) return; // the platform is the end of the line
    later(PROCESSING, () =>
      flow.emit(hop(c.mouth, topics[ti + 1].entry(p), 2.2), { color: topics[ti + 1].color, speed: 10, onArrive: () => append(ti + 1, p) }),
    );
  }

  const queue = [];
  function burst(producer, n) {
    for (let k = 0; k < n; k++) queue.push({ producer, at: k * 0.06 });
  }

  // Airflow: a windmill behind the pipeline, with the daily DAG on a board beside it.
  place(group, windmillTower(), [-4.6, 0, -11.6]);
  const sails = windmillSails().mesh({ origin: [0.5, 0.5, 0] });
  sails.position.set(-4.7, 5.3, -10.6);
  group.add(sails);
  const board = new Vox().box(-22, 0, 0, 21, 15, 0, pattern.speckle(0x3b4a5c, 0x445468, 0.25)).box(-23, -1, 0, 22, -1, 0, COLORS.darkWood).box(-23, 16, 0, 22, 16, 0, COLORS.darkWood);
  board.box(-23, -1, 0, -23, 16, 0, COLORS.darkWood).box(22, -1, 0, 22, 16, 0, COLORS.darkWood).box(-16, -12, 0, -15, -2, 0, COLORS.darkWood).box(14, -12, 0, 15, -2, 0, COLORS.darkWood);
  const boardMesh = place(group, board, [3.6, 3, -11.4]);
  const dagAt = (t) => new THREE.Vector3((t.pos[0] - 0.4) * 0.7, (t.pos[1] - 11) * 0.62 + 2, 0.3);
  const dagLamps = DAG.map((t) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.25), lamp(COLORS.stone));
    mesh.position.copy(dagAt(t));
    boardMesh.add(mesh);
    const l = label(t.name, "small plain");
    l.position.set(0, 0, 0.3);
    mesh.add(l);
    return mesh;
  });
  DAG.forEach((t) =>
    t.deps.forEach((d) => {
      const a = dagAt(DAG[d]);
      const b = dagAt(t);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b) - 2.2, 0.12, 0.12), lamp(0xcfd6de));
      wire.position.copy(a).lerp(b, 0.5);
      wire.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      boardMesh.add(wire);
    }),
  );
  const dagLabel = label(tr("Airflow · DAG diário", "Airflow · daily DAG"));
  dagLabel.position.set(0, 5, 0);
  boardMesh.add(dagLabel);
  pickable(pickables, boardMesh, {
    title: "Airflow",
    text: tr("Orquestra as etapas em lote: cada tarefa roda quando as dependências terminam.", "Orchestrates the batch steps: each task runs once its dependencies finish."),
  });
  const dagColors = { idle: new THREE.Color(0x9aa5b1), running: new THREE.Color(COLORS.warn), done: new THREE.Color(COLORS.ok) };
  let dagClock = 0;

  let spawn = 0;
  const col = new THREE.Color();
  const white = new THREE.Color(COLORS.white);

  return {
    id: "kafka",
    group,
    pickables,
    view: { pos: [0, 33, 40], target: [0, 0.5, -1.5], fogFar: 320, narrowScale: 1.12 },
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
          t.tiles.setColorAt(i, col.copy(cold).lerp(t.hot, t.heat[i]));
        }
        t.tiles.instanceColor.needsUpdate = true;
      });

      producers.forEach((pr) => {
        pr.pulse = Math.max(0, pr.pulse - dt * 4);
        pr.mesh.scale.setScalar(1 + pr.pulse * 0.05 + (pr.mesh.userData.hovered ? 0.06 : 0));
      });
      consumers.forEach((c) => {
        c.pulse = Math.max(0, c.pulse - dt * 3);
        c.mesh.scale.setScalar(1 + c.pulse * 0.05);
        c.bulb.material.color.copy(white).lerp(c.lit, 0.35 + c.pulse * 0.65);
        if (c.dirty) {
          c.label.element.textContent = `${c.name} · ${c.count.toLocaleString(locale)}`;
          c.dirty = false;
        }
      });

      sails.rotation.z -= dt * 0.9;
      // DAG run: steps of 1.1 s, then a pause with everything green before the next run.
      dagClock = (dagClock + dt) % 7;
      const current = dagClock / 1.1;
      DAG.forEach((t, i) => {
        const state = current >= 4 || t.step < Math.floor(current) ? "done" : t.step === Math.floor(current) ? "running" : "idle";
        dagLamps[i].material.color.copy(dagColors[state]);
        dagLamps[i].scale.setScalar(state === "running" ? 1 + Math.sin(time * 10) * 0.06 : 1);
      });
    },
  };
}
