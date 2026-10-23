// Kubernetes scene: the GKE cluster where the earlier scenes run. Four namespaces scale for different reasons
// (web load, Kafka lag, schedules); the visitor can deploy, deploy a bad build (canary + rollback),
// run a one-off job, or knock a pod down and watch it come back.
import * as THREE from "three";
import { COLORS, glow, label, pickable, Flow, roundedBox, outline, damp } from "../lib/kit.js";
import { tr } from "../i18n.js";

const SLOTS_X = Array.from({ length: 10 }, (_, i) => -9 + i * 2); // x < 0 is zone a, x > 0 zone b
const INGRESS = new THREE.Vector3(0, 1.2, 10.5);
const PENDING = 1.1; // seconds from scheduled to ready
const VERSION_COLORS = [COLORS.k8s, COLORS.llm, COLORS.kafka, COLORS.message];

const NAMESPACES = [
  { key: "front", z: 6.5, color: COLORS.kafka, min: 2, max: 6, text: tr("Front-ends em Next.js. Escalam com o número de requisições.", "Next.js front ends. They scale with the number of requests."),
  },
  { key: "api", z: 2.5, color: COLORS.k8s, min: 3, max: 9, text: tr("Serviços com milhões de requisições por dia. Escalam com a carga.", "Services handling millions of requests a day. They scale with load."),
  },
  {
    key: "pipeline",
    z: -1.5,
    color: COLORS.privacy,
    min: 2,
    max: 9,
    text: tr(
      "Os workers das etapas do Kafka (normalização, classificação, Trust & Privacy). Escalam pelo lag do tópico.",
      "Workers for the Kafka stages (normalization, classification, Trust & Privacy). They scale with topic lag.",
    ),
  },
  { key: "jobs", z: -5.5, color: COLORS.ok, min: 0, max: 4, text: tr("Jobs pontuais e agendados: rodam até terminar e somem.", "One-off and scheduled jobs: they run to completion and go away."),
  },
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
    roundedBox(28, 0.3, 17.5, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x0c1525, roughness: 0.8, emissive: COLORS.k8s, emissiveIntensity: 0.02 }),
  );
  floor.position.set(0, -0.15, 0.5);
  outline(floor, COLORS.k8s, { thickness: 0.06 }).material.color.multiplyScalar(0.7);
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
    [tr("zona a", "zone a"), -6],
    [tr("zona b", "zone b"), 6],
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
    return { ...ns, band, label: l, slots: [], desired: ns.min, version: 1 };
  });
  const byKey = Object.fromEntries(namespaces.map((n) => [n.key, n]));

  // Pod slots
  const podGeo = roundedBox(1.2, 1.2, 1.2, 0.22);
  const slotGeo = roundedBox(0.62, 0.1, 0.05, 0.02, 2);
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x0d1626, metalness: 0.5, roughness: 0.4 });
  const ledGeo = new THREE.SphereGeometry(0.07, 10, 8);
  namespaces.forEach((ns) => {
    SLOTS_X.forEach((x) => {
      const mesh = new THREE.Mesh(
        podGeo,
        new THREE.MeshStandardMaterial({ color: COLORS.steel, emissive: ns.color, emissiveIntensity: 0.3, roughness: 0.4 }),
      );
      const edges = outline(mesh, ns.color, { thickness: 0.05 });
      // Vent slits on the front and a status light that follows the pod state.
      [0.16, -0.02, -0.2].forEach((y) => {
        const slot = new THREE.Mesh(slotGeo, slotMat);
        slot.position.set(-0.12, y, 0.6);
        mesh.add(slot);
      });
      const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ toneMapped: false }));
      led.position.set(0.38, 0.32, 0.6);
      mesh.add(led);
      edges.userData.led = led;
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
  status.position.set(0, 2.4, byKey.api.z + 1);
  status.visible = false;
  group.add(status);
  const setStatus = (text, alert = false, ns = byKey.api) => {
    status.element.textContent = text;
    status.element.classList.toggle("alert", alert);
    status.position.set(0, 2.4, ns.z + 1);
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

  const queue = new THREE.Mesh(
    roundedBox(1, 0.6, 1.4, 0.12).clone().translate(-0.5, 0, 0),
    new THREE.MeshStandardMaterial({ color: COLORS.steel, emissive: COLORS.privacy, emissiveIntensity: 0.5 }),
  );
  queue.position.set(-10.2, 0.4, byKey.pipeline.z);
  group.add(queue);
  const lagLabel = label("lag: 0", "small");
  lagLabel.position.set(-11.5, 1.3, byKey.pipeline.z);
  group.add(lagLabel);
  pickable(pickables, queue, {
    title: tr("Lag do tópico no Kafka", "Kafka topic lag"),
    text: tr(
      "Mensagens esperando consumo. Quanto maior a fila, mais workers o autoscaler sobe.",
      "Messages waiting to be consumed. The longer the queue, the more workers the autoscaler adds.",
    ),
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
  const cronLabel = label(tr("CronJob · reindexação", "CronJob · reindex"), "small");
  cronLabel.position.set(0, 1, 0);
  cron.add(cronLabel);
  pickable(pickables, clockFace, { title: "CronJob", text: tr("Dispara jobs agendados, como uma reindexação periódica.", "Fires scheduled jobs, such as a periodic reindex."),
  });

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
  pickable(pickables, ingress, { title: "Ingress", text: tr("Entrada do cluster: distribui as requisições entre os pods do front.", "The cluster entry point: spreads requests across the front pods."),
  });

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
          tr(
            `deploy v${deploy.version}: ${fresh}/${deploy.total} pods · ${share}% do tráfego`,
            `deploy v${deploy.version}: ${fresh}/${deploy.total} pods · ${share}% of traffic`,
          ),
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
        setStatus(
          tr(`canário v${deploy.version}: ${rate}% de erros → rollback automático`, `canary v${deploy.version}: ${rate}% errors → automatic rollback`),
          true,
        );
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
    view: { pos: [0, 19, 25], target: [0, 0, 0.5], fogFar: 110, narrowScale: 1.05 },
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
          s.mesh.scale.setScalar(sc + s.hits * 0.1 + (s.mesh.userData.hovered && s.state === "running" ? 0.1 : 0));
          const c = podColor(s);
          // Outside the spotlighted namespace, pods fade back while an action plays.
          const dim = spotlight && ns.key !== spotlight ? 1 - calm * 0.65 : 1;
          s.edges.material.color.copy(c).multiplyScalar(dim);
          s.edges.userData.led.material.color.copy(c).multiplyScalar(1.6 * dim);
          s.mesh.material.emissive.copy(c);
          s.mesh.material.emissiveIntensity = (0.12 + s.hits * 0.3) * dim;
        }),
      );

      namespaces.forEach((ns) => {
        const lit = !spotlight || ns.key === spotlight;
        ns.band.material.opacity = 0.06 + (spotlight && lit ? 0.1 * calm : 0) - (lit ? 0 : 0.04 * calm);
        ns.label.element.style.opacity = lit ? "" : "0.35";
      });

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
      ingress.rotation.z += dt * (0.3 + load * 0.6);

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
