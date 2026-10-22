// Opening scene: a slowly turning network of nodes with signals hopping between neighbors.
import * as THREE from "three";
import { COLORS, glow, Flow } from "../lib/kit.js";

export function createHero() {
  const group = new THREE.Group();
  const net = new THREE.Group();
  group.add(net);

  const N = 150;
  const R = 9;
  const nodes = [];
  // Fibonacci sphere with jitter: evenly spread but not mechanical.
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    const jitter = R * (0.85 + Math.random() * 0.3);
    nodes.push(new THREE.Vector3(Math.cos(phi) * r * jitter, y * jitter, Math.sin(phi) * r * jitter));
  }

  const dots = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    N,
  );
  const m = new THREE.Matrix4();
  nodes.forEach((p, i) => {
    dots.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    dots.setColorAt(i, glow(i % 7 === 0 ? COLORS.message : COLORS.kafka, i % 7 === 0 ? 2.2 : 1.4));
  });
  net.add(dots);

  const edges = [];
  const linePos = [];
  nodes.forEach((p, i) => {
    const nearest = nodes
      .map((q, j) => [j, p.distanceToSquared(q)])
      .filter(([j]) => j > i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3);
    nearest.forEach(([j]) => {
      edges.push([i, j]);
      linePos.push(p.x, p.y, p.z, nodes[j].x, nodes[j].y, nodes[j].z);
    });
  });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  net.add(
    new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: COLORS.kafka,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.2, 1),
    new THREE.MeshBasicMaterial({ color: glow(COLORS.llm, 1.2), wireframe: true, toneMapped: false }),
  );
  net.add(core);

  const flow = new Flow(160, 0.16);
  net.add(flow.mesh);
  const segments = edges.map(([i, j]) => new THREE.LineCurve3(nodes[i], nodes[j]));
  let spawn = 0;

  return {
    id: "hero",
    group,
    pickables: [],
    view: { pos: [0, 1, 31], target: [0, 0, 0], fogFar: 90 },
    update(dt, time, focus) {
      net.rotation.y += dt * 0.12;
      net.rotation.x = Math.sin(time * 0.2) * 0.15;
      core.rotation.y -= dt * 0.4;
      core.rotation.z += dt * 0.25;
      spawn += dt * 30 * focus;
      while (spawn > 1) {
        spawn--;
        const seg = segments[(Math.random() * segments.length) | 0];
        flow.emit(seg, { color: Math.random() < 0.3 ? COLORS.message : COLORS.kafka, speed: 4, scale: 0.9 });
      }
      flow.update(dt);
    },
  };
}
