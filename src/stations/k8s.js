// Kubernetes scene: the GKE cluster where the earlier scenes run. Four namespaces scale for different reasons
// (web load, Kafka lag, schedules); the visitor can deploy, deploy a bad build (canary + rollback),
// run a one-off job, or knock a pod down and watch it come back.
import * as THREE from "three";
import { COLORS, glow, label, pickable, Flow } from "../lib/kit.js";

const SLOTS_X = Array.from({ length: 10 }, (_, i) => -9 + i * 2); // x < 0 is zone a, x > 0 zone b
const INGRESS = new THREE.Vector3(0, 1.2, 10.5);
const PENDING = 1.1; // seconds from scheduled to ready
const VERSION_COLORS = [COLORS.k8s, COLORS.llm, COLORS.kafka, COLORS.message];

const NAMESPACES = [
  { key: "front", z: 6.5, color: COLORS.kafka, min: 2, max: 6, text: "Front-ends em Next.js. Escalam com o número de requisições." },
  { key: "api", z: 2.5, color: COLORS.k8s, min: 3, max: 9, text: "Serviços com milhões de requisições por dia. Escalam com a carga." },
  {
    key: "pipeline",
    z: -1.5,
    color: COLORS.privacy,
    min: 2,
    max: 9,
    text: "Os workers das etapas do Kafka (normalização, classificação, Trust & Privacy). Escalam pelo lag do tópico.",
  },
  { key: "jobs", z: -5.5, color: COLORS.ok, min: 0, max: 4, text: "Jobs pontuais e agendados: rodam até terminar e somem." },
];

const STATE_COLORS = {
  pending: glow(COLORS.warn, 1.6),
  failed: glow(COLORS.danger, 2.2),
  // A normal scale-down is not a failure: only crashed pods and failed canaries turn red.
  terminating: new THREE.Color(0x5c6f91),
  completed: glow(COLORS.ok, 1.8),
};

const rand = () => Math.random().toString(16).slice(2, 7);

export function createK8s() {
  const group = new THREE.Group();
  const pickables = [];
  const flow = new Flow(500, 0.13);
  group.add(flow.mesh);

  // Cluster floor, zones and namespace bands
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(28, 0.3, 17.5),
    new THREE.MeshStandardMaterial({ color: 0x0c1525, roughness: 0.8, emissive: COLORS.k8s, emissiveIntensity: 0.02 }),
  );
  floor.position.set(0, -0.15, 0.5);
  floor.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(floor.geometry),
      new THREE.LineBasicMaterial({ color: glow(COLORS.k8s, 1.1), toneMapped: false }),
    ),
  );
  group.add(floor);
  const header = label("GKE · Google Cloud");
  header.position.set(0, 0.4, -8.6);
  group.add(header);
  for (let z = -8; z < 9.5; z += 0.8) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.4), new THREE.MeshBasicMaterial({ color: 0x3b5578 }));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.02, z);
    group.add(dash);
  }
  [
    ["zona a", -6],
    ["zona b", 6],
  ].forEach(([name, x]) => {
    const l = label(name, "small plain");
    l.position.set(x, 0.3, -8.4);
    group.add(l);
  });

  const namespaces = NAMESPACES.map((ns) => {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(21, 2.6),
      new THREE.MeshBasicMaterial({ color: ns.color, transparent: true, opacity: 0.06, depthWrite: false }),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.set(0, 0.01, ns.z);
    group.add(band);
    const l = label(ns.key);
    l.position.set(10.9, 0.4, ns.z);
    l.center.set(0, 0.5);
    group.add(l);
    pickable(pickables, band, { title: `namespace ${ns.key}`, text: ns.text });
    return { ...ns, label: l, slots: [], desired: ns.min, version: 1 };
  });
  const byKey = Object.fromEntries(namespaces.map((n) => [n.key, n]));

  // Pod slots
  const podGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  namespaces.forEach((ns) => {
    SLOTS_X.forEach((x) => {
      const mesh = new THREE.Mesh(
        podGeo,
        new THREE.MeshStandardMaterial({ color: COLORS.steel, emissive: ns.color, emissiveIntensity: 0.3, roughness: 0.4 }),
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(podGeo),
        new THREE.LineBasicMaterial({ color: glow(ns.color, 1.6), toneMapped: false }),
      );
      mesh.add(edges);
      mesh.position.set(x, 0.7, ns.z);
      mesh.scale.setScalar(0.001);
      mesh.visible = false;
      group.add(mesh);
      const slot = { ns, x, mesh, edges, state: "off", timer: 0, hits: 0, version: 1, buggy: false, progress: 0 };
      // The tooltip reads this object on hover, so describe() keeps it current.
      slot.info = { title: "", text: "" };
      pickable(pickables, mesh, slot.info, () => kill(slot));
      if (ns.key === "jobs") {
        const bar = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 0.16).translate(0.6, 0, 0),
          new THREE.MeshBasicMaterial({ color: glow(COLORS.ok, 1.8), toneMapped: false }),
        );
        bar.position.set(-0.6, 0.85, 0.61);
        mesh.add(bar);
        slot.bar = bar;
      }
      ns.slots.push(slot);
    });
  });

  const versionColor = (v) => glow(VERSION_COLORS[(v - 1) % VERSION_COLORS.length], 1.6);
  const nsColors = Object.fromEntries(namespaces.map((ns) => [ns.key, glow(ns.color, 1.6)]));
  const podColor = (s) => {
    if (STATE_COLORS[s.state]) return STATE_COLORS[s.state];
    return s.ns.key === "api" ? versionColor(s.version) : nsColors[s.ns.key];
  };
  const live = (ns) => ns.slots.filter((s) => s.state === "pending" || s.state === "running");
  const running = (ns) => ns.slots.filter((s) => s.state === "running");

  function describe(s) {
    const names = { pending: "Pending", running: "Running", failed: "Failed", terminating: "Terminating", completed: "Completed" };
    s.info.title = `pod ${s.name} · ${names[s.state] ?? ""}`;
    s.info.text =
      s.ns.key === "jobs"
        ? "Job: roda até terminar e é removido depois."
        : s.state === "running"
          ? "Clique para derrubar este pod e ver o Kubernetes recriá-lo."
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
  }

  // Labels: deploy status, Kafka lag, CronJob
  const status = label("", "small");
  status.position.set(0, 2.4, byKey.api.z + 1);
  status.visible = false;
  group.add(status);
  const setStatus = (text, alert = false) => {
    status.element.textContent = text;
    status.element.classList.toggle("alert", alert);
    status.visible = true;
  };

  const queue = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.6, 1.4).translate(-0.5, 0, 0),
    new THREE.MeshStandardMaterial({ color: COLORS.steel, emissive: COLORS.privacy, emissiveIntensity: 0.5 }),
  );
  queue.position.set(-10.2, 0.4, byKey.pipeline.z);
  group.add(queue);
  const lagLabel = label("lag: 0", "small");
  lagLabel.position.set(-11.5, 1.3, byKey.pipeline.z);
  group.add(lagLabel);
  pickable(pickables, queue, {
    title: "Lag do tópico no Kafka",
    text: "Mensagens esperando consumo. Quanto maior a fila, mais workers o autoscaler sobe.",
  });

  const cron = new THREE.Group();
  cron.position.set(-11.5, 0.9, byKey.jobs.z);
  group.add(cron);
  const clockFace = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.07, 8, 32),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.ok, 1.6), toneMapped: false }),
  );
  cron.add(clockFace);
  const hand = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.5, 0.06).translate(0, 0.22, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  cron.add(hand);
  const cronLabel = label("CronJob · reindexação", "small");
  cronLabel.position.set(0, 1, 0);
  cron.add(cronLabel);
  pickable(pickables, clockFace, { title: "CronJob", text: "Dispara jobs agendados, como uma reindexação periódica." });

  // Ingress
  const ingress = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.13, 12, 40),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.kafka, 1.2), toneMapped: false }),
  );
  ingress.position.copy(INGRESS);
  group.add(ingress);
  const ingressLabel = label("Ingress");
  ingressLabel.position.set(0, 1.7, 0);
  ingress.add(ingressLabel);
  pickable(pickables, ingress, { title: "Ingress", text: "Entrada do cluster: distribui as requisições entre os pods do front." });

  const top = (s) => s.mesh.position.clone().add(new THREE.Vector3(0, 0.7, 0));
  const arc = (a, b, h = 2) => {
    const mid = a.clone().lerp(b, 0.5);
    mid.y += h;
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  };
  const pick = (list) => list[(Math.random() * list.length) | 0];

  let errors = 0;
  let canaryHits = 0;
  function request() {
    if (!running(byKey.front).length) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    // Requests come in low from both sides; dimmer than the in-cluster traffic, as they pass close to the camera.
    const from = new THREE.Vector3(side * (14 + Math.random() * 2), 0.8, 9 + Math.random() * 2);
    flow.emit(arc(from, INGRESS.clone(), 0.6), {
      color: COLORS.kafka,
      intensity: 1.3,
      speed: 14,
      scale: 0.7,
      onArrive: () => {
        const f = pick(running(byKey.front));
        if (!f) return;
        flow.emit(arc(INGRESS.clone(), top(f), 1.5), {
          color: COLORS.kafka,
          speed: 12,
          scale: 0.8,
          onArrive: () => {
            f.hits = 1;
            const apis = running(byKey.api);
            if (!apis.length || f.state !== "running") return;
            // While a canary is up it gets a fixed share of the traffic; the rest goes to healthy pods.
            const canary = apis.find((s) => s.buggy);
            const healthy = apis.filter((s) => !s.buggy);
            const a = canary && (Math.random() < 0.3 || !healthy.length) ? canary : pick(healthy);
            flow.emit(arc(top(f), top(a), 1.2), {
              color: COLORS.k8s,
              speed: 10,
              scale: 0.75,
              onArrive: () => {
                a.hits = 1;
                if (a.buggy) {
                  canaryHits++;
                  if (Math.random() < 0.4) {
                    errors++;
                    flow.emit(arc(top(a), INGRESS.clone(), 2.5), { color: COLORS.danger, speed: 12, scale: 0.9 });
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
    const api = byKey.api;
    deploy = { kind, version: api.version + 1, timer: 0, surge: null, total: running(api).length };
    errors = 0;
    canaryHits = 0;
    if (kind === "canary") {
      deploy.surge = start(api, { version: deploy.version, buggy: true });
      setStatus(`canário v${deploy.version}: recebendo 30% do tráfego…`);
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
      setStatus(`deploy v${deploy.version}: ${fresh}/${deploy.total} pods · ${share}% do tráfego`);
      if (!old.length && !deploy.surge) {
        api.version = deploy.version;
        setStatus(`v${deploy.version} em produção ✓`);
        deploy = null;
        statusTimer = 4;
      }
    } else {
      const c = deploy.surge;
      if (!deploy.done && (c.state === "off" || (c.state === "running" && deploy.timer > 4.5))) {
        const rate = canaryHits ? Math.round((errors / canaryHits) * 100) : 100;
        setStatus(`canário v${deploy.version}: ${rate}% de erros → rollback automático`, true);
        if (c.state === "running") stop(c, "failed");
        deploy.done = deploy.timer;
      }
      if (deploy.done && deploy.timer > deploy.done + 2.5) {
        setStatus(`rollback ✓ · v${api.version} segue em produção`);
        deploy = null;
        statusTimer = 4;
      }
    }
  }

  let cronTimer = 3;
  function runJob(name) {
    const s = start(byKey.jobs, { name: `${name}-${rand()}` });
    if (s) s.duration = 3.5 + Math.random() * 2.5;
  }

  let lag = 60;
  let spawn = 0;
  let consume = 0;
  let reconcile = 0;
  let lastLabels = "";

  return {
    id: "k8s",
    group,
    pickables,
    view: { pos: [0, 19, 25], target: [0, 0, 0.5], fogFar: 110, narrowScale: 1.05 },
    actions: {
      deploy: () => beginDeploy("rolling"),
      baddeploy: () => beginDeploy("canary"),
      job: () => runJob("reprocessar-processos"),
    },
    update(dt, time, focus) {
      const load = THREE.MathUtils.clamp(0.5 + 0.3 * Math.sin(time * 0.3) + 0.15 * Math.sin(time * 1.1), 0, 1);
      // Incoming Kafka traffic with an occasional burst, so the lag (and the pipeline) visibly scales.
      const lagIn = (24 + 18 * Math.sin(time * 0.45) + (Math.sin(time * 0.13) > 0.85 ? 60 : 0)) * focus;
      lag = Math.max(0, lag + (lagIn - running(byKey.pipeline).length * 7) * dt);

      byKey.front.desired = THREE.MathUtils.clamp(Math.round(2 + load * 4), byKey.front.min, byKey.front.max);
      byKey.api.desired = THREE.MathUtils.clamp(Math.round(3 + load * 6), byKey.api.min, byKey.api.max);
      byKey.pipeline.desired = THREE.MathUtils.clamp(Math.ceil(lag / 30) + 2, byKey.pipeline.min, byKey.pipeline.max);

      reconcile -= dt;
      if (reconcile <= 0) {
        reconcile = 0.45;
        ["front", "api", "pipeline"].forEach((key) => {
          const ns = byKey[key];
          if (key === "api" && deploy) return;
          const n = live(ns).length;
          if (n < ns.desired) start(ns);
          else if (n > ns.desired && running(ns).length) stop(pick(running(ns)));
        });
      }
      if (deploy) stepDeploy(dt);
      if (statusTimer > 0) {
        statusTimer -= dt;
        if (statusTimer <= 0) status.visible = false;
      }

      cronTimer -= dt;
      hand.rotation.z = -(1 - cronTimer / 10) * Math.PI * 2;
      if (cronTimer <= 0) {
        cronTimer = 10;
        runJob("reindexacao");
        runJob("reindexacao");
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
            if (s.progress >= 1) stop(s, "completed");
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
          s.mesh.scale.setScalar(sc + s.hits * 0.1 + (s.mesh.userData.hovered && s.state === "running" ? 0.1 : 0));
          const c = podColor(s);
          s.edges.material.color.copy(c);
          s.mesh.material.emissive.copy(c);
          s.mesh.material.emissiveIntensity = 0.12 + s.hits * 0.3;
        }),
      );

      spawn += dt * (6 + load * 18) * focus;
      while (spawn > 1) {
        spawn--;
        request();
      }
      // Kafka messages feed the pipeline workers.
      consume += dt * Math.min(lag, 30) * 0.3 * focus;
      while (consume > 1) {
        consume--;
        const w = pick(running(byKey.pipeline));
        if (w) {
          flow.emit(arc(new THREE.Vector3(-10.2, 0.7, byKey.pipeline.z), top(w), 1.2), {
            color: COLORS.privacy,
            speed: 10,
            scale: 0.7,
            onArrive: () => (w.hits = 1),
          });
        }
      }
      flow.update(dt);

      queue.scale.x = Math.max(0.05, Math.min(lag / 60, 2.6));
      ingress.rotation.z += dt * (0.5 + load * 2);

      const text = [
        `front · ${running(byKey.front).length} pods`,
        `api · ${running(byKey.api).length} pods · v${byKey.api.version}`,
        `pipeline · ${running(byKey.pipeline).length} pods`,
        `jobs · ${live(byKey.jobs).length} rodando`,
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
