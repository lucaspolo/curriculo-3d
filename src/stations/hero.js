// Opening scene: a constellation of the career. Each star is a phase (companies, studies, hobbies), each
// point a technology from the LinkedIn profile linked to the phases where it was used. A ham radio in the
// middle sends "LUCAS POLO" in Morse code; every dit and dah travels out to a star and on to a skill.
import * as THREE from "three";
import { COLORS, glow, label, pickable, Flow, roundedBox, outline, damp } from "../lib/kit.js";

// Chronological order: the trajectory line follows it around the ring.
const HUBS = [
  { id: "eletronica", name: "Eletrônica", years: "2008", color: COLORS.warn, scene: "origens", text: "Montagem e solda de circuitos na Luxxel: o começo, antes do código." },
  { id: "mobint", name: "Mobint", years: "2011", color: 0x7d8fb0, scene: "origens", text: "Estágio em sites móveis com PHP e MySQL." },
  { id: "porto", name: "Porto Seguro", years: "2011–2018", color: COLORS.k8s, scene: "porto", text: "Emissão de apólices, da proposta à apólice, em Java e Informix 4GL sobre Informix e Oracle." },
  { id: "estatistica", name: "Estatística", years: "2018", color: COLORS.privacy, scene: "origens", text: "Extensão em Estatística Aplicada (FMU) e, depois, Matemática (UNINTER)." },
  { id: "magalu", name: "Magazine Luiza", years: "2018–2022", color: COLORS.message, scene: "magalu", text: "Cálculo de frete em escala, com Python, C#, Node.js e Go em Kubernetes." },
  { id: "jusbrasil", name: "Jusbrasil", years: "2022–hoje", color: COLORS.kafka, scene: "kafka", text: "Pipelines com Kafka, proteção de dados, LLMs em produção e Kubernetes." },
  { id: "radio", name: "Radioamador e Telecom", years: "", color: COLORS.llm, scene: "origens", text: "Hobby, pós em Redes de Telecomunicações e um projeto de simulados para a prova da Anatel." },
  { id: "blog", name: "Blog", years: "hoje", color: COLORS.ok, scene: "origens", text: "Anotações sobre o que estou aprendendo, de Python e Java a estatística." },
];

// Technology → phases where it was used (from the LinkedIn profile and the blog).
const SKILLS = {
  Circuitos: ["eletronica", "radio"],
  PHP: ["mobint"],
  MySQL: ["mobint", "magalu"],
  Java: ["porto", "jusbrasil", "blog"],
  "Informix 4GL": ["porto"],
  Oracle: ["porto"],
  "Modelagem de dados": ["porto", "magalu"],
  Pandas: ["estatistica", "jusbrasil"],
  Python: ["magalu", "jusbrasil", "blog"],
  "C#": ["magalu"],
  "Node.js": ["magalu"],
  Go: ["magalu", "jusbrasil"],
  Kubernetes: ["magalu", "jusbrasil"],
  GCP: ["magalu", "jusbrasil"],
  AWS: ["magalu"],
  Azure: ["magalu"],
  PostgreSQL: ["magalu", "jusbrasil"],
  Redis: ["magalu", "blog"],
  MongoDB: ["magalu"],
  "SQL Server": ["magalu"],
  Scala: ["jusbrasil"],
  JavaScript: ["jusbrasil"],
  Kafka: ["jusbrasil"],
  Airflow: ["jusbrasil"],
  Spark: ["jusbrasil"],
  LLMs: ["jusbrasil"],
  "Next.js": ["jusbrasil", "radio"],
  TypeScript: ["jusbrasil", "radio"],
};

// Phase-to-phase links that are not about a technology.
const BRIDGES = [
  ["eletronica", "radio", "O mesmo interesse por sinal, do ferro de solda ao rádio."],
  ["estatistica", "blog", "Estatística aparece no blog, como no post sobre o problema de Monty Hall."],
];

const MORSE = {
  L: ".-..",
  U: "..-",
  C: "-.-.",
  A: ".-",
  S: "...",
  P: ".--.",
  O: "---",
};
const MESSAGE = "LUCAS POLO";
const UNIT = 0.13; // seconds per Morse unit: dit = 1, dah = 3, gaps of 1, 3 and 7

/** Morse timeline: [{ on, dur, letters }], where letters is the text sent once this step starts. */
function morseTimeline() {
  const steps = [];
  let sent = "";
  [...MESSAGE].forEach((ch, i) => {
    if (ch === " ") {
      sent += " ";
      steps.push({ on: false, dur: 7 * UNIT, letters: sent });
      return;
    }
    sent += ch;
    [...MORSE[ch]].forEach((sym, j) => {
      steps.push({ on: true, dah: sym === "-", dur: (sym === "-" ? 3 : 1) * UNIT, letters: sent });
      const last = j === MORSE[ch].length - 1;
      const nextIsSpace = MESSAGE[i + 1] === " ";
      if (!last) steps.push({ on: false, dur: UNIT, letters: sent });
      else if (!nextIsSpace) steps.push({ on: false, dur: 3 * UNIT, letters: sent });
    });
  });
  steps.push({ on: false, dur: 2.5, letters: sent });
  return steps;
}

function makeRadio() {
  const radio = new THREE.Group();
  const body = new THREE.Mesh(
    roundedBox(1, 2.2, 0.55, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.45, metalness: 0.4 }),
  );
  body.position.y = 0;
  radio.add(body);
  outline(body, COLORS.llm, { thickness: 0.04 });
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.09, 1.5, 12),
    new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.6 }),
  );
  antenna.position.set(0.28, 1.85, 0);
  radio.add(antenna);
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.36),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.ok, 0.8), toneMapped: false }),
  );
  display.position.set(0, 0.55, 0.28);
  radio.add(display);
  const holes = new THREE.CircleGeometry(0.03, 8);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x07080b });
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const h = new THREE.Mesh(holes, holeMat);
      h.position.set(-0.28 + c * 0.14, -0.55 - r * 0.12, 0.28);
      radio.add(h);
    }
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }));
  led.position.set(0.3, 0.92, 0.28);
  radio.add(led);
  return { radio, led, tip: new THREE.Vector3(0.28, 2.6, 0) };
}

// --- Light and life: glow sprites, rim-lit coronas, twinkling dust, a flowing trajectory -----------

let glowTexture = null;
/** Soft radial falloff shared by every halo, nebula and particle sprite. */
function softGlow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.45)");
  g.addColorStop(0.6, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

function glowSprite(color, scale, opacity) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softGlow(),
      color: glow(color, 1),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    }),
  );
  s.scale.setScalar(scale);
  return s;
}

/** Fresnel shell: bright at the silhouette, clear in the middle, like a star's corona. */
function corona(color, radius) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: { color: { value: glow(color, 2.2) }, strength: { value: 1 } },
      vertexShader: `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 color;
        uniform float strength;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vV)), 2.2) * strength;
          gl_FragColor = vec4(color * f, f);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/** Dust that drifts and twinkles across the constellation. */
function stardust(count, radius) {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const tint = new Float32Array(count * 3);
  const palette = [COLORS.kafka, COLORS.llm, COLORS.message, COLORS.k8s, 0xffffff].map((c) => new THREE.Color(c));
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * radius;
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 6, Math.sin(a) * r], i * 3);
    phase[i] = Math.random() * Math.PI * 2;
    const c = palette[(Math.random() * palette.length) | 0];
    tint.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("phase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, map: { value: softGlow() } },
    vertexShader: `
      attribute float phase;
      attribute vec3 tint;
      uniform float time;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(time * 0.4 + phase) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float twinkle = 0.55 + 0.45 * sin(time * 1.8 + phase * 3.0);
        vColor = tint;
        vAlpha = twinkle;
        gl_PointSize = (0.6 + twinkle * 1.2) * (160.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float a = texture2D(map, gl_PointCoord).a * vAlpha * 0.6;
        gl_FragColor = vec4(vColor * 1.4 * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, material);
}

/** Energy running along the trajectory: brighter dashes that flow in chronological order. */
function flowingTube(curve) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 300, 0.05, 8, true),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: glow(COLORS.text, 1.2) } },
      vertexShader: `
        varying float vU;
        void main() {
          vU = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying float vU;
        void main() {
          float dash = smoothstep(0.55, 1.0, fract(vU * 36.0 - time * 0.35));
          float a = 0.12 + dash * 0.55;
          gl_FragColor = vec4(color * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

export function createHero() {
  const group = new THREE.Group();
  const sky = new THREE.Group(); // everything that turns
  group.add(sky);
  const pickables = [];
  const flow = new Flow(200, 0.1);
  sky.add(flow.mesh);

  const dust = stardust(420, 14);
  sky.add(dust);

  // Stars on a ring, in chronological order, at gently varying heights.
  const R = 9.5;
  const hubs = HUBS.map((h, i) => {
    const a = (i / HUBS.length) * Math.PI * 2 + Math.PI * 0.6;
    const pos = new THREE.Vector3(Math.cos(a) * R, Math.sin(i * 1.7) * 1.2, Math.sin(a) * R);
    const star = new THREE.Group();
    star.position.copy(pos);
    sky.add(star);

    // A faint nebula in the phase's colour, then the star itself: core, corona and halo.
    const nebula = glowSprite(h.color, 9, 0.07);
    nebula.position.y = -0.6;
    star.add(nebula);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), new THREE.MeshBasicMaterial({ toneMapped: false }));
    star.add(mesh);
    const shell = corona(h.color, 0.55);
    star.add(shell);
    const halo = glowSprite(h.color, 3, 0.5);
    star.add(halo);

    // Orbit rings at random tilts, with small moons travelling on them.
    const orbits = [0.95, 1.3].map((r, k) => {
      const orbit = new THREE.Group();
      orbit.rotation.set(0.6 + Math.random() * 0.9, Math.random() * Math.PI, k * 0.7);
      star.add(orbit);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.008, 6, 96),
        new THREE.MeshBasicMaterial({ color: glow(h.color, 0.9), toneMapped: false, transparent: true, opacity: 0.45, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2;
      orbit.add(ring);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: glow(h.color, 2), toneMapped: false }));
      orbit.add(moon);
      return { orbit, moon, r, speed: 0.6 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2 };
    });

    const title = h.years ? `${h.name} · ${h.years}` : h.name;
    const l = label(title);
    l.position.set(0, 1.25, 0);
    star.add(l);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(pos);
    sky.add(hit);
    pickable(pickables, hit, { title, text: `${h.text} Clique para ver a cena.` }, () =>
      document.getElementById(h.scene)?.scrollIntoView({ block: "center" }),
    );
    return { ...h, pos, star, mesh, shell, halo, orbits, hit, label: l, pulse: 0, skills: [], beat: Math.random() * Math.PI * 2 };
  });
  const hubById = Object.fromEntries(hubs.map((h) => [h.id, h]));

  // The trajectory: a closed curve through the stars in order, with a comet that travels the career.
  const trajectory = new THREE.CatmullRomCurve3(hubs.map((h) => h.pos), true, "centripetal");
  const trail = flowingTube(trajectory);
  sky.add(trail);
  const TRAIL = 60;
  const cometGeo = new THREE.BufferGeometry();
  cometGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
  const cometColors = new Float32Array(TRAIL * 3);
  cometGeo.setAttribute("color", new THREE.BufferAttribute(cometColors, 3));
  const cometTail = new THREE.Line(
    cometGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  cometTail.frustumCulled = false;
  sky.add(cometTail);
  const cometHead = glowSprite(0xffffff, 1.6, 0.95);
  sky.add(cometHead);
  const cometCore = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: glow(0xffffff, 3), toneMapped: false }));
  sky.add(cometCore);
  let cometT = 0;
  const cometColor = new THREE.Color();
  const tmpP = new THREE.Vector3();

  // Skills: shared ones sit between their phases (pulled toward the center), single-phase ones orbit theirs.
  const linkMat = (color) =>
    new THREE.LineBasicMaterial({ color: glow(color, 1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const links = [];
  // Single-phase skills fan out around their star, evenly spaced on an arc facing outward.
  const fan = {};
  Object.values(SKILLS).forEach((ids) => {
    if (ids.length === 1) fan[ids[0]] = (fan[ids[0]] ?? 0) + 1;
  });
  const placed = {};
  const skills = Object.entries(SKILLS).map(([name, ids], k) => {
    const owners = ids.map((id) => hubById[id]);
    const pos = new THREE.Vector3();
    if (owners.length > 1) {
      owners.forEach((o) => pos.add(o.pos));
      pos.multiplyScalar(0.62 / owners.length);
      pos.y += Math.sin(k * 2.3) * 0.9;
    } else {
      const hub = owners[0];
      const j = (placed[hub.id] = (placed[hub.id] ?? -1) + 1);
      const m = fan[hub.id];
      const base = Math.atan2(hub.pos.z, hub.pos.x);
      const a = base + (j - (m - 1) / 2) * 0.5;
      const r = 2.6 + (j % 2) * 0.6;
      pos.set(hub.pos.x + Math.cos(a) * r, hub.pos.y + (j % 2 ? 0.4 : -0.2), hub.pos.z + Math.sin(a) * r);
    }
    const color = owners[owners.length - 1].color;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), new THREE.MeshBasicMaterial({ toneMapped: false }));
    mesh.position.copy(pos);
    sky.add(mesh);
    const halo = glowSprite(color, 0.9, 0.3);
    mesh.add(halo);
    const l = label(name, "small");
    l.position.set(0, 0.36, 0);
    mesh.add(l);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(pos);
    sky.add(hit);
    const where = owners.map((o) => o.name).join(", ");
    pickable(pickables, hit, { title: name, text: `Usado em: ${where}.` });
    const skill = { name, pos, mesh, halo, hit, label: l, owners, links: [], pulse: 0, color, phase: Math.random() * 6.28 };
    owners.forEach((o) => {
      // Gentle arcs instead of straight lines: lifted in the middle, like orbits between bodies.
      const mid = o.pos.clone().lerp(pos, 0.5);
      mid.y += 0.9 + o.pos.distanceTo(pos) * 0.08;
      const curve = new THREE.QuadraticBezierCurve3(o.pos.clone(), mid, pos.clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), linkMat(o.color));
      sky.add(line);
      const link = { line, hub: o, skill, curve };
      links.push(link);
      skill.links.push(link);
      o.skills.push(skill);
    });
    return skill;
  });

  // Bridges only show while one of their ends is in focus.
  const bridges = BRIDGES.map(([a, b]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([hubById[a].pos, hubById[b].pos]);
    const line = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({ color: glow(COLORS.text, 0.7), dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0 }),
    );
    line.computeLineDistances();
    sky.add(line);
    return { line, ends: [hubById[a], hubById[b]] };
  });

  // The radio in the middle, sending the name in Morse; each symbol leaves as a ring of radio waves.
  const { radio, led, tip } = makeRadio();
  radio.position.y = -1.2;
  group.add(radio);
  const radioGlow = glowSprite(COLORS.llm, 6, 0.18);
  radioGlow.position.y = 0.3;
  radio.add(radioGlow);
  const morseLabel = label("", "small");
  morseLabel.position.set(0, -1.6, 0);
  radio.add(morseLabel);
  pickable(pickables, radio.children[0], {
    title: "Radioamador",
    text: "O rádio transmite “LUCAS POLO” em código Morse. Cada ponto e traço sai como um pulso para a constelação.",
  });
  const waves = Array.from({ length: 14 }, () => {
    const w = new THREE.Mesh(
      new THREE.RingGeometry(0.988, 1, 128),
      new THREE.MeshBasicMaterial({ color: glow(COLORS.llm, 1.6), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    w.rotation.x = -Math.PI / 2;
    w.position.y = tip.y + radio.position.y - 0.2;
    w.visible = false;
    group.add(w);
    return { mesh: w, t: 1, dah: false };
  });
  let nextWave = 0;
  const steps = morseTimeline();
  let step = 0;
  let stepT = 0;
  let nextHub = 0;
  const ledOn = glow(COLORS.danger, 3);
  const ledOff = new THREE.Color(0x401010);

  // Focus: the hovered star or skill, otherwise a star picked by the automatic tour.
  const TOUR_STEP = 4.5;
  let tourIndex = 0;
  let tourT = 0;
  let focusHub = hubs[0];

  const tipLocal = new THREE.Vector3();
  function transmit(dah) {
    const w = waves[nextWave];
    nextWave = (nextWave + 1) % waves.length;
    w.t = 0;
    w.dah = dah;
    w.mesh.visible = true;
    // From the antenna tip (radio space) into the turning sky.
    tipLocal.copy(tip).add(radio.position);
    sky.worldToLocal(group.localToWorld(tipLocal));
    const hub = hubs[nextHub];
    nextHub = (nextHub + 1) % hubs.length;
    flow.emit(new THREE.LineCurve3(tipLocal.clone(), hub.pos), {
      color: hub.color,
      speed: 14,
      scale: dah ? 1.6 : 1,
      onArrive: () => {
        hub.pulse = 1;
        // Only the star in focus forwards the signal to its skills; the rest of the sky stays quiet.
        if (hub !== focusHub) return;
        const s = hub.skills[(Math.random() * hub.skills.length) | 0];
        if (!s) return;
        const link = s.links.find((l) => l.hub === hub);
        flow.emit(link.curve, { color: hub.color, speed: 8, scale: 0.8, onArrive: () => (s.pulse = 1) });
      },
    });
  }

  let spin = 0.05;
  let lastFocus = null;

  return {
    id: "hero",
    group,
    pickables,
    view: { pos: [0, 22, 23.5], target: [0, -1, 0.5], fogFar: 100, narrow: { pos: [0, 24, 21], target: [0, -1, 0.5] } },
    update(dt, time, focus) {
      // Morse
      stepT += dt;
      while (stepT >= steps[step].dur) {
        stepT -= steps[step].dur;
        step = (step + 1) % steps.length;
        if (steps[step].on) transmit(steps[step].dah);
      }
      const cur = steps[step];
      led.material.color.copy(cur.on ? ledOn : ledOff);
      radioGlow.material.opacity = cur.on ? 0.35 : 0.15;
      const text = `${cur.letters}${Math.floor(time * 2) % 2 ? "_" : " "}`;
      if (morseLabel.element.textContent !== text) morseLabel.element.textContent = text;
      waves.forEach((w) => {
        if (!w.mesh.visible) return;
        w.t += dt / (w.dah ? 2.2 : 1.6);
        if (w.t >= 1) {
          w.mesh.visible = false;
          return;
        }
        w.mesh.scale.setScalar(0.4 + w.t * (w.dah ? 7.5 : 5));
        // Fades fast so a few rings at most share the center at any time.
        w.mesh.material.opacity = (1 - w.t) ** 2 * (w.dah ? 0.4 : 0.25);
      });
      flow.update(dt);

      // At rest only the ring, the stars and faint dots show. The focused star (hovered, or the tour's)
      // reveals its links and skill names; a hovered skill reveals the phases where it was used.
      const hovered = hubs.find((h) => h.hit.userData.hovered);
      const skill = skills.find((s) => s.hit.userData.hovered);
      if (!hovered && !skill) {
        tourT += dt;
        if (tourT > TOUR_STEP) {
          tourT = 0;
          tourIndex = (tourIndex + 1) % hubs.length;
        }
      }
      focusHub = hovered ?? (skill ? null : hubs[tourIndex]);
      const litHubs = new Set(focusHub ? [focusHub] : skill.owners);
      const litSkills = new Set(focusHub ? focusHub.skills : [skill]);
      const focusKey = focusHub?.id ?? skill.name;

      spin = damp(spin, hovered || skill ? 0 : 0.05, 3, dt);
      sky.rotation.y += dt * spin;
      dust.material.uniforms.time.value = time;
      trail.material.uniforms.time.value = time;

      hubs.forEach((h) => {
        h.pulse = Math.max(0, h.pulse - dt * 2.5);
        const on = litHubs.has(h);
        // Each star breathes on its own rhythm, and flares when a signal arrives.
        const breath = 0.5 + 0.5 * Math.sin(time * 1.3 + h.beat);
        h.mesh.material.color.setHex(h.color).multiplyScalar((on ? 1.3 : 0.75) + h.pulse * 1.2 + breath * 0.2);
        h.shell.material.uniforms.strength.value = (on ? 1 : 0.55) + h.pulse * 0.8 + breath * 0.15;
        h.halo.material.opacity = (on ? 0.55 : 0.28) + h.pulse * 0.3;
        h.halo.scale.setScalar(3 + breath * 0.4 + h.pulse * 1.2 + (on ? 0.6 : 0));
        h.orbits.forEach((o) => {
          const a = time * o.speed + o.phase;
          o.moon.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
          o.orbit.rotation.y += dt * 0.15;
        });
      });
      skills.forEach((s) => {
        s.pulse = Math.max(0, s.pulse - dt * 2);
        const on = litSkills.has(s);
        const twinkle = 0.5 + 0.5 * Math.sin(time * 2.2 + s.phase);
        s.mesh.material.color.setHex(s.color).multiplyScalar((on ? 1.3 : 0.35) + s.pulse * 1.4 + twinkle * 0.15);
        s.mesh.scale.setScalar((on ? 1.2 : 0.8) + s.pulse * 0.8);
        s.halo.material.opacity = (on ? 0.5 : 0.12) + s.pulse * 0.4;
      });
      links.forEach((l) => {
        const on = litHubs.has(l.hub) && litSkills.has(l.skill);
        l.line.material.opacity = damp(l.line.material.opacity, on ? 0.65 : 0, 6, dt);
      });
      bridges.forEach((b) => {
        const on = b.ends.some((h) => h === focusHub);
        b.line.material.opacity = damp(b.line.material.opacity, on ? 0.45 : 0, 6, dt);
      });
      if (focusKey !== lastFocus) {
        lastFocus = focusKey;
        skills.forEach((s) => (s.label.element.style.opacity = litSkills.has(s) ? "" : "0"));
        hubs.forEach((h) => (h.label.element.style.opacity = litHubs.has(h) ? "" : "0.6"));
      }

      // Comet: one lap of the career every ~20 s, its tail taking the colour of the nearest star.
      cometT = (cometT + dt / 20) % 1;
      const posAttr = cometGeo.attributes.position;
      for (let i = 0; i < TRAIL; i++) {
        const t = (cometT - i * 0.0025 + 1) % 1;
        trajectory.getPointAt(t, tmpP);
        posAttr.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
      }
      trajectory.getPointAt(cometT, tmpP);
      cometHead.position.copy(tmpP);
      cometCore.position.copy(tmpP);
      let nearest = hubs[0];
      hubs.forEach((h) => {
        if (h.pos.distanceToSquared(tmpP) < nearest.pos.distanceToSquared(tmpP)) nearest = h;
      });
      cometColor.lerp(new THREE.Color(nearest.color), 1 - Math.exp(-dt * 2));
      cometHead.material.color.copy(cometColor).multiplyScalar(1.4);
      for (let i = 0; i < TRAIL; i++) {
        const f = (1 - i / TRAIL) ** 2 * 2.2;
        cometColors.set([cometColor.r * f, cometColor.g * f, cometColor.b * f], i * 3);
      }
      posAttr.needsUpdate = true;
      cometGeo.attributes.color.needsUpdate = true;

      radio.rotation.y = Math.sin(time * 0.4) * 0.25;
    },
  };
}
