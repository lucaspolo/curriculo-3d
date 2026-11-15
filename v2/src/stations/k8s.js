// Kubernetes island: the cluster as a container yard. Four namespaces scale for different reasons (web load,
// Kafka lag, schedules); the visitor can deploy, deploy a bad build (canary + rollback), run a one-off job,
// or knock a pod down and watch it come back. The behavior is the first version's scene, pod for pod.
import * as THREE from "three";
import { COLORS, Flow, Vox, damp, hop, label, lamp, pickable, place } from "../lib/kit.js";
import { pattern } from "../lib/voxel.js";
import { island, paving, greenery } from "../world.js";
import { tr } from "../../../src/i18n.js";
import { NAMESPACES } from "../../../src/stations/k8s.js";

const SLOTS_X = Array.from({ length: 10 }, (_, i) => -9 + i * 2); // x < 0 is zone a, x > 0 zone b
const LANE_Z = { front: 6.5, api: 2.5, pipeline: -1.5, jobs: -5.5 };
const LANE_COLORS = { front: COLORS.kafka, api: COLORS.k8s, pipeline: COLORS.privacy, jobs: COLORS.ok };
const INGRESS = new THREE.Vector3(0, 2.4, 11);
const PENDING = 1.1; // seconds from scheduled to ready
const VERSION_COLORS = [COLORS.k8s, COLORS.llm, COLORS.kafka, COLORS.message];
const STATE_COLORS = {
  pending: new THREE.Color(COLORS.warn),
  failed: new THREE.Color(COLORS.danger),
  // A normal scale-down is not a failure: only crashed pods and failed canaries turn red.
  terminating: new THREE.Color(0x8d98a8),
  completed: new THREE.Color(0x7be08f),
};

const rand = () => Math.random().toString(16).slice(2, 7);

// A pod: a small shipping container in near-white, so the material's color can tint it by state.
function container() {
  const v = new Vox();
  v.box(-3, 0, -2, 2, 4, 2, (x) => (x % 2 ? 0xffffff : 0xe2e2e2));
  v.box(-3, 0, -2, 2, 0, 2, 0xbdbdbd).box(-3, 4, -2, 2, 4, 2, 0xf4f4f4);
  return v.box(-1, 1, 2, -1, 3, 2, 0xa8a8a8).box(0, 1, 2, 0, 3, 2, 0xc9c9c9).set(1, 2, 2, 0x8a8a8a);
}

function ingressGate() {
  const v = new Vox();
  for (const x of [-7, 5]) v.box(x, 0, -1, x + 1, 11, 0, pattern.bands("y", 2, COLORS.kafka, COLORS.white));
  return v.box(-7, 12, -1, 6, 14, 0, COLORS.kafka).box(-5, 13, 1, 4, 13, 1, COLORS.white);
}

function clockTower() {
  const v = new Vox();
  v.box(-3, 0, -3, 2, 13, 2, pattern.bricks(0xd9c9a8, 0xc9b894)).box(-4, 14, -4, 3, 14, 3, COLORS.darkStone);
  for (let r = 0; r < 4; r++) v.box(-4 + r, 15 + r, -4 + r, 3 - r, 15 + r, 3 - r, COLORS.ok);
  return v.box(-2, 7, 3, 1, 10, 3, COLORS.white).box(-1, 1, 3, 0, 3, 3, COLORS.darkWood);
}

export function createK8s() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(500, 0.28);
  group.add(flow.mesh);

  // The yard: concrete, one painted strip per namespace and a dashed line between the two zones.
  const ground = paving().rect(-13.6, -8.2, 13.2, 9.4, (i, k) => ((i + k) % 2 ? 0xd9dde2 : 0xd1d6dc));
  const paper = new THREE.Color(0xe6e9ed);
  NAMESPACES.forEach((ns) => ground.rect(-10.3, LANE_Z[ns.key] - 1.25, 10.3, LANE_Z[ns.key] + 1.25, new THREE.Color(LANE_COLORS[ns.key]).lerp(paper, 0.72).getHex()));
  ground.rect(-0.12, -8, 0.12, 9, (i, k) => (Math.floor(k / 2) % 2 ? 0x5d6b7c : undefined));
  group.add(island({ rx: 24, rz: 16.5, seed: 4, paint: ground.paint }));
  group.add(
    greenery([
      ["palm", -20.5, 3], ["tree", -17, -9.5], ["bush", -8, -11.6], ["tree", 7, -11.8], ["palm", 19.5, -6], ["bush", 16.5, 7],
      ["rock", 18.5, 1], ["bush", -17.5, 9], ["palm", 14, 11.5], ["rock", -19, -3], ["bush", 2, -12.4],
    ]),
  );
  const header = label("GKE · Google Cloud");
  header.position.set(0, 0.6, -8.8);
  group.add(header);
  [
    [tr("zona a", "zone a"), -6],
    [tr("zona b", "zone b"), 6],
  ].forEach(([name, x]) => {
    const l = label(name, "small plain");
    l.position.set(x, 0.4, -7.6);
    group.add(l);
  });

  const namespaces = NAMESPACES.map((ns) => {
    const z = LANE_Z[ns.key];
    // An invisible slab over the strip, so hovering anywhere on it explains the namespace.
    const band = new THREE.Mesh(new THREE.BoxGeometry(21, 0.1, 2.5), new THREE.MeshBasicMaterial({ visible: false }));
    band.position.set(0, 0.05, z);
    group.add(band);
    const l = label(ns.key);
    l.position.set(11, 0.5, z);
    l.center.set(0, 0.5);
    group.add(l);
    pickable(pickables, band, { title: `namespace ${ns.key}`, text: ns.text });
    return { ...ns, z, color: LANE_COLORS[ns.key], label: l, slots: [], desired: ns.min, version: 1 };
  });
  const byKey = Object.fromEntries(namespaces.map((n) => [n.key, n]));

  // Pod slots
  const podGeometry = container().geometry();
  namespaces.forEach((ns) => {
    SLOTS_X.forEach((x) => {
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(podGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.08), lamp(COLORS.white));
      led.position.set(0.42, 0.95, 0.76);
      mesh.add(led);
      mesh.position.set(x, 0, ns.z);
      mesh.scale.setScalar(0.001);
      mesh.visible = false;
      group.add(mesh);
      const slot = { ns, x, mesh, material, led, state: "off", timer: 0, hits: 0, version: 1, buggy: false, progress: 0 };
      // The tooltip reads this object on hover, so describe() keeps it current.
      slot.info = { title: "", text: "" };
      pickable(pickables, mesh, slot.info, () => kill(slot));
      if (ns.key === "jobs") {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.18).translate(0.7, 0, 0), lamp(COLORS.ok));
        bar.position.set(-0.82, 1.6, 0);
        mesh.add(bar);
        slot.bar = bar;
      }
      ns.slots.push(slot);
    });
  });

  const versionColors = VERSION_COLORS.map((c) => new THREE.Color(c));
  const nsColors = Object.fromEntries(namespaces.map((ns) => [ns.key, new THREE.Color(ns.color)]));
  const podColor = (s) => STATE_COLORS[s.state] ?? (s.ns.key === "api" ? versionColors[(s.version - 1) % versionColors.length] : nsColors[s.ns.key]);
  const live = (ns) => ns.slots.filter((s) => s.state === "pending" || s.state === "running");
  const running = (ns) => ns.slots.filter((s) => s.state === "running");

  function describe(s) {
    const names = { pending: "Pending", running: "Running", failed: "Failed", terminating: "Terminating", completed: "Completed" };
    s.info.title = `pod ${s.name} · ${names[s.state] ?? ""}`;
    s.info.text =
      s.ns.key === "jobs"
        ? tr("Job: roda até terminar e é removido depois.", "Job: runs to completion and is removed afterwards.")
        : s.state === "running"
          ? tr("Clique para derrubar este pod e ver o Kubernetes recriá-lo.", "Click to knock this pod down and watch Kubernetes recreate it.")
          : "";
  }

  function start(ns, { version = ns.version, buggy = false, name } = {}) {
    const free = ns.slots.filter((s) => s.state === "off");
    if (!free.length) return null;
    // Spread replicas across zones: take a free slot in the zone with fewer live pods.
    const inZoneA = live(ns).filter((s) => s.x < 0).length;
    const inZoneB = live(ns).length - inZoneA;
    const preferA = inZoneA <= inZoneB;
    free.sort((a, b) => (preferA ? a.x - b.x : b.x - a.x) + (Math.random() - 0.5) * 3);
    const s = free[0];
    s.state = "pending";
    s.timer = PENDING;
    s.version = version;
    s.buggy = buggy;
    s.progress = 0;
    s.name = name ?? `${ns.key}${ns.key === "api" ? `-v${version}` : ""}-${rand()}`;
    s.mesh.visible = true;
    describe(s);
    return s;
  }

  function stop(s, state = "terminating") {
    s.state = state;
    s.timer = state === "failed" ? 0.9 : state === "completed" ? 1.6 : 0.7;
    describe(s);
  }

  function kill(s) {
    if (s.state !== "running" || s.ns.key === "jobs") return;
    stop(s, "failed");
    focusOn(s.ns.key, 5);
    healing = s.ns;
    setStatus(tr(`pod ${s.name} caiu → o Kubernetes está recriando…`, `pod ${s.name} went down → Kubernetes is recreating it…`), true, s.ns);
  }

  // Labels: deploy status, Kafka lag, CronJob
  const status = label("", "small");
  status.position.set(0, 3, byKey.api.z + 1);
  status.visible = false;
  group.add(status);
  const setStatus = (text, alert = false, ns = byKey.api) => {
    status.element.textContent = text;
    status.element.classList.toggle("alert", alert);
    status.position.set(0, 3, ns.z + 1);
    status.visible = true;
  };

  // Focus mode: while a visitor-triggered action plays out, the autoscaler holds still, traffic thins
  // and the other namespaces dim, so the action is the only thing moving.
  let spotlight = null;
  let spotlightHold = 0;
  let healing = null;
  function focusOn(key, seconds) {
    spotlight = key;
    spotlightHold = Math.max(spotlightHold, seconds);
  }

  // Kafka lag: crates piling up beside the pipeline's strip.
  const CRATES = 12;
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshLambertMaterial({ color: 0xd98ab0 }), CRATES);
  const m = new THREE.Matrix4();
  for (let i = 0; i < CRATES; i++) crates.setMatrixAt(i, m.makeTranslation(-11.6 - (i % 2) * 0.7, 0.32 + Math.floor(i / 4) * 0.66, byKey.pipeline.z - 0.36 + (Math.floor(i / 2) % 2) * 0.72));
  crates.castShadow = true;
  group.add(crates);
  const lagLabel = label("lag: 0", "small");
  lagLabel.position.set(-12, 2.8, byKey.pipeline.z);
  group.add(lagLabel);
  pickable(pickables, crates, {
    title: tr("Lag do tópico no Kafka", "Kafka topic lag"),
    text: tr("Mensagens esperando consumo. Quanto maior a fila, mais workers o autoscaler sobe.", "Messages waiting to be consumed. The longer the queue, the more workers the autoscaler adds."),
  });

  const tower = place(group, clockTower(), [-12, 0, byKey.jobs.z]);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.06).translate(0, 0.2, 0), lamp(COLORS.ink));
  hand.position.set(-0.12, 2.15, 0.82);
  tower.add(hand);
  const cronLabel = label(tr("CronJob · reindexação", "CronJob · reindex"), "small");
  cronLabel.position.set(0, 5.4, 0);
  tower.add(cronLabel);
  pickable(pickables, tower, { title: "CronJob", text: tr("Dispara jobs agendados, como uma reindexação periódica.", "Fires scheduled jobs, such as a periodic reindex.") });

  // Ingress
  const gate = place(group, ingressGate(), [0, 0, INGRESS.z]);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), lamp(COLORS.kafka));
  beacon.position.set(-0.12, 4.3, -0.12);
  gate.add(beacon);
  const ingressLabel = label("Ingress");
  ingressLabel.position.set(0, 5.3, 0);
  gate.add(ingressLabel);
  pickable(pickables, gate, { title: "Ingress", text: tr("Entrada do cluster: distribui as requisições entre os pods do front.", "The cluster entry point: spreads requests across the front pods.") });

  const top = (s) => new THREE.Vector3(s.x, 1.5, s.ns.z);
  const pick = (list) => list[(Math.random() * list.length) | 0];

  let errors = 0;
  let canaryHits = 0;
  function request() {
    if (!running(byKey.front).length) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    // Requests come in over the water from both sides of the gate.
    const from = new THREE.Vector3(side * (15 + Math.random() * 4), 0.6, 15 + Math.random() * 3);
    flow.emit(hop(from, INGRESS, 1.2), {
      color: COLORS.kafka,
      speed: 14,
      scale: 0.8,
      onArrive: () => {
        const f = pick(running(byKey.front));
        if (!f) return;
        flow.emit(hop(INGRESS, top(f), 1.5), {
          color: COLORS.kafka,
          speed: 12,
          onArrive: () => {
            f.hits = 1;
            const apis = running(byKey.api);
            if (!apis.length || f.state !== "running") return;
            // While a canary is up it gets a fixed share of the traffic; the rest goes to healthy pods.
            const canary = apis.find((s) => s.buggy);
            const healthy = apis.filter((s) => !s.buggy);
            const a = canary && (Math.random() < 0.3 || !healthy.length) ? canary : pick(healthy);
            flow.emit(hop(top(f), top(a), 1.4), {
              color: COLORS.k8s,
              speed: 10,
              onArrive: () => {
                a.hits = 1;
                if (a.buggy) {
                  canaryHits++;
                  if (Math.random() < 0.4) {
                    errors++;
                    flow.emit(hop(top(a), INGRESS, 3), { color: COLORS.danger, speed: 12, scale: 1.15 });
                  }
                }
              },
            });
          },
        });
      },
    });
  }

  // Deploys run on the api namespace; the autoscaler holds its count while one is in progress.
  let deploy = null;
  let statusTimer = 0;
  function beginDeploy(kind) {
    if (deploy) return;
    focusOn("api", 3);
    const api = byKey.api;
    deploy = { kind, version: api.version + 1, timer: 0, surge: null, total: running(api).length };
    errors = 0;
    canaryHits = 0;
    if (kind === "canary") {
      deploy.surge = start(api, { version: deploy.version, buggy: true });
      setStatus(tr(`canário v${deploy.version}: recebendo 30% do tráfego…`, `canary v${deploy.version}: receiving 30% of traffic…`));
    } else {
      setStatus(`deploy v${deploy.version}: 0/${deploy.total} pods`);
    }
  }

  function stepDeploy(dt) {
    const api = byKey.api;
    deploy.timer += dt;
    if (deploy.kind === "rolling") {
      const old = api.slots.filter((s) => s.state === "running" && s.version < deploy.version);
      const fresh = running(api).filter((s) => s.version === deploy.version).length;
      if (!deploy.surge && old.length) {
        deploy.surge = start(api, { version: deploy.version });
      } else if (deploy.surge && deploy.surge.state !== "pending") {
        // New pod is ready (or was knocked down): retire one old pod, then surge the next.
        if (deploy.surge.state === "running" && old.length) stop(pick(old));
        deploy.surge = null;
      }
      const share = Math.round((fresh / Math.max(1, running(api).length)) * 100);
      setStatus(
        tr(`deploy v${deploy.version}: ${fresh}/${deploy.total} pods · ${share}% do tráfego`, `deploy v${deploy.version}: ${fresh}/${deploy.total} pods · ${share}% of traffic`),
      );
      if (!old.length && !deploy.surge) {
        api.version = deploy.version;
        setStatus(tr(`v${deploy.version} em produção ✓`, `v${deploy.version} in production ✓`));
        deploy = null;
        statusTimer = 4;
      }
    } else {
      const c = deploy.surge;
      if (!deploy.done && (c.state === "off" || (c.state === "running" && deploy.timer > 4.5))) {
        const rate = canaryHits ? Math.round((errors / canaryHits) * 100) : 100;
        setStatus(tr(`canário v${deploy.version}: ${rate}% de erros → rollback automático`, `canary v${deploy.version}: ${rate}% errors → automatic rollback`), true);
        if (c.state === "running") stop(c, "failed");
        deploy.done = deploy.timer;
      }
      if (deploy.done && deploy.timer > deploy.done + 2.5) {
        setStatus(tr(`rollback ✓ · v${api.version} segue em produção`, `rollback ✓ · v${api.version} stays in production`));
        deploy = null;
        statusTimer = 4;
      }
    }
  }

  let cronTimer = 3;
  function runJob(name, manual = false) {
    const s = start(byKey.jobs, { name: `${name}-${rand()}` });
    if (!s) return;
    s.duration = 3.5 + Math.random() * 2.5;
    if (manual) {
      focusOn("jobs", PENDING + s.duration + 2.5);
      setStatus(tr(`job ${s.name}: rodando até terminar…`, `job ${s.name}: running to completion…`), false, byKey.jobs);
      s.manual = true;
    }
  }

  let lag = 60;
  let calm = 0;
  let spawn = 0;
  let consume = 0;
  let reconcile = 0;
  let lastLabels = "";

  return {
    id: "k8s",
    group,
    pickables,
    view: { pos: [0, 27, 34], target: [0, 0, 1], fogFar: 300, narrowScale: 1.05 },
    actions: {
      deploy: () => beginDeploy("rolling"),
      baddeploy: () => beginDeploy("canary"),
      job: () => runJob(tr("reprocessar-processos", "reprocess-cases"), true),
    },
    update(dt, time, focus) {
      // Slow, smooth load: one cycle every ~50 s, so replicas change rarely enough to follow.
      const load = THREE.MathUtils.clamp(0.5 + 0.35 * Math.sin(time * 0.125), 0, 1);
      // Incoming Kafka traffic with an occasional burst, so the lag (and the pipeline) visibly scales.
      const lagIn = (18 + 8 * Math.sin(time * 0.2) + (Math.sin(time * 0.07) > 0.9 ? 30 : 0)) * focus;
      lag = Math.max(0, lag + (lagIn - running(byKey.pipeline).length * 7) * dt);

      if (deploy) spotlightHold = Math.max(spotlightHold, 3);
      spotlightHold = Math.max(0, spotlightHold - dt);
      if (spotlightHold === 0) spotlight = null;
      calm = damp(calm, spotlight ? 1 : 0, 4, dt);

      // The autoscaler holds its targets while an action is in focus.
      if (!spotlight) {
        byKey.front.desired = THREE.MathUtils.clamp(Math.round(2 + load * 4), byKey.front.min, byKey.front.max);
        byKey.api.desired = THREE.MathUtils.clamp(Math.round(3 + load * 6), byKey.api.min, byKey.api.max);
        byKey.pipeline.desired = THREE.MathUtils.clamp(Math.ceil(lag / 30) + 2, byKey.pipeline.min, byKey.pipeline.max);
      }

      reconcile -= dt;
      if (reconcile <= 0) {
        reconcile = 1.5;
        ["front", "api", "pipeline"].forEach((key) => {
          const ns = byKey[key];
          if (key === "api" && deploy) return;
          // In focus mode only the spotlighted namespace reconciles (e.g. replacing a knocked-down pod).
          if (spotlight && key !== spotlight) return;
          const n = live(ns).length;
          if (n < ns.desired) start(ns);
          else if (n > ns.desired && running(ns).length && !spotlight) stop(pick(running(ns)));
        });
      }
      if (healing && running(healing).length >= healing.desired) {
        setStatus(tr("pod recriado ✓ · o serviço não parou", "pod recreated ✓ · the service never stopped"), false, healing);
        statusTimer = 3;
        healing = null;
      }
      if (deploy) stepDeploy(dt);
      if (statusTimer > 0) {
        statusTimer -= dt;
        if (statusTimer <= 0) status.visible = false;
      }

      cronTimer -= dt;
      hand.rotation.z = -(1 - cronTimer / 20) * Math.PI * 2;
      if (cronTimer <= 0) {
        cronTimer = 20;
        if (!spotlight) runJob(tr("reindexacao", "reindex"));
      }

      namespaces.forEach((ns) =>
        ns.slots.forEach((s) => {
          if (s.state === "off") return;
          s.timer -= dt;
          let target = 1;
          if (s.state === "pending") {
            target = 0.7;
            if (s.timer <= 0) {
              s.state = "running";
              describe(s);
            }
          } else if (s.state === "running" && ns.key === "jobs") {
            s.progress = Math.min(1, s.progress + dt / s.duration);
            if (s.progress >= 1) {
              stop(s, "completed");
              if (s.manual) {
                setStatus(tr(`job ${s.name}: concluído ✓ e removido`, `job ${s.name}: completed ✓ and removed`), false, byKey.jobs);
                statusTimer = 3;
                s.manual = false;
              }
            }
          } else if (s.state === "failed" || s.state === "terminating" || s.state === "completed") {
            target = s.state === "completed" ? 1 : 0.001;
            if (s.timer <= 0) {
              s.state = "off";
              s.mesh.visible = false;
              s.mesh.scale.setScalar(0.001);
              return;
            }
          }
          if (s.bar) s.bar.scale.x = Math.max(0.001, s.state === "completed" ? 1 : s.progress);
          s.hits = Math.max(0, s.hits - dt * 4);
          s.mesh.position.x = s.x + (s.state === "failed" ? Math.sin(time * 60) * 0.08 : 0);
          const sc = THREE.MathUtils.lerp(s.mesh.scale.x, target, 1 - Math.exp(-dt * 8));
          s.mesh.scale.setScalar(sc + s.hits * 0.08 + (s.mesh.userData.hovered && s.state === "running" ? 0.1 : 0));
          const c = podColor(s);
          // Outside the spotlighted namespace, pods fade toward the concrete while an action plays.
          const dim = spotlight && ns.key !== spotlight ? calm * 0.6 : 0;
          s.material.color.copy(c).lerp(paper, dim);
          s.led.material.color.copy(c).lerp(paper, 0.5 - s.hits * 0.5);
        }),
      );

      namespaces.forEach((ns) => (ns.label.element.style.opacity = !spotlight || ns.key === spotlight ? "" : "0.35"));

      spawn += dt * (2 + load * 4) * (1 - 0.6 * calm) * focus;
      while (spawn > 1) {
        spawn--;
        request();
      }
      // Kafka messages feed the pipeline workers.
      consume += dt * Math.min(lag, 30) * 0.1 * (1 - 0.6 * calm) * focus;
      while (consume > 1) {
        consume--;
        const w = pick(running(byKey.pipeline));
        if (w) flow.emit(hop(new THREE.Vector3(-11.4, 1.2, byKey.pipeline.z), top(w), 1.4), { color: COLORS.privacy, speed: 10, scale: 0.85, onArrive: () => (w.hits = 1) });
      }
      flow.update(dt);

      crates.count = THREE.MathUtils.clamp(Math.round(lag / 12), 0, CRATES);
      beacon.rotation.y += dt * (0.6 + load * 1.6);

      const text = [
        `front · ${running(byKey.front).length} pods`,
        `api · ${running(byKey.api).length} pods · v${byKey.api.version}`,
        `pipeline · ${running(byKey.pipeline).length} pods`,
        `jobs · ${live(byKey.jobs).length} ${tr("rodando", "running")}`,
        `lag: ${Math.round(lag)} msgs`,
      ];
      const key = text.join("|");
      if (key !== lastLabels) {
        lastLabels = key;
        namespaces.forEach((ns, i) => (ns.label.element.textContent = text[i]));
        lagLabel.element.textContent = text[4];
      }
    },
  };
}
