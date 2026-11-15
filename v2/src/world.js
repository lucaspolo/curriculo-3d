// The sunny world the scenes sit in: sky and sun, the sea, drifting clouds, and the builders for islands and
// the plants on them.
import * as THREE from "three";
import { Vox, V, VOXEL, hash, linear } from "./lib/voxel.js";

export const SKY = { zenith: 0x3f9fea, horizon: 0xdff2ff, sun: 0xfff3cf, sea: 0x35c3cf };
/** From the ground toward the sun that lights the scenes: in front of them and to the right. */
export const SUNLIGHT = new THREE.Vector3(0.5, 0.78, 0.42).normalize();
// The sun's disc sits elsewhere, low and ahead, where the opening's camera can see it. The scenes never
// show the sky, so the two are never on screen together.
const SUN_DISC = new THREE.Vector3(0.13, 0.3, -0.95).normalize();
/** Water surface, a little below the grass (y = 0). */
export const SEA_LEVEL = -0.7;

function createSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color(SKY.zenith) },
        horizon: { value: new THREE.Color(SKY.horizon) },
        sunColor: { value: new THREE.Color(SKY.sun) },
        sunDir: { value: SUN_DISC },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 color = mix(horizon, zenith, pow(max(d.y, 0.0), 0.5));
          float s = max(dot(d, sunDir), 0.0);
          color += sunColor * (smoothstep(0.9982, 0.9987, s) + pow(s, 90.0) * 0.5 + pow(s, 9.0) * 0.2);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  );
  sky.scale.setScalar(1500);
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  return sky;
}

function createSea(clock) {
  const material = new THREE.MeshLambertMaterial({ color: SKY.sea });
  // Square patches of water brighten and fade, each on its own beat: ripples at the scenes' voxel grain.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.clock = clock;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSea;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSea = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float clock;
        varying vec3 vSea;
        float ripple(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 cell = floor(vSea.xz / 0.75);
        float beat = sin(clock * (0.5 + ripple(cell + 3.0)) + ripple(cell) * 6.2832) * 0.5 + 0.5;
        // Far away the patches are smaller than a pixel and would only flicker.
        float near = 1.0 - smoothstep(50.0, 130.0, distance(vSea.xz, cameraPosition.xz));
        diffuseColor.rgb *= 1.0 + near * (0.16 * beat * step(0.55, ripple(cell + 11.0)) - 0.05);`,
      );
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), material);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  sea.receiveShadow = true;
  return sea;
}

function createClouds() {
  // Unlit: lit by the scenes' sun and warm ground light they would turn beige instead of white.
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const shapes = [0, 1, 2, 3].map((s) => {
    const v = new Vox();
    const puffs = 3 + Math.floor(hash(s, 1) * 3);
    for (let i = 0; i < puffs; i++) {
      const r = 4 + hash(s, i, 2) * 4;
      v.ball(i * 6 + hash(s, i, 3) * 3, r * 0.45, hash(s, i, 4) * 5, r, r * 0.5, r * 0.75, (x, y) => (y < 1 ? 0xdcebfa : 0xffffff));
    }
    // Clouds are far and large, so their voxels are too: at the scenes' grain they would be smooth blobs.
    return v.geometry({ size: 1.6, jitter: 0.012 });
  });
  const group = new THREE.Group();
  // They stand still, far and high enough to clear the opening's text: a backdrop like the first
  // version's stars, not something to watch.
  for (let i = 0; i < 24; i++) {
    const mesh = new THREE.Mesh(shapes[i % shapes.length], material);
    const z = -520 + hash(i, 7) * 240;
    const elevation = THREE.MathUtils.degToRad(15.5 + hash(i, 6) * 11);
    mesh.position.set(-300 + hash(i, 5) * 1500, 5 + (30 - z) * Math.tan(elevation), z);
    mesh.scale.setScalar(0.9 + hash(i, 8) * 0.9);
    group.add(mesh);
  }
  return group;
}

/** Sky, sea and clouds: what is on screen when no scene is. */
export function createWorld() {
  const clock = { value: 0 };
  const sky = createSky();
  const sea = createSea(clock);
  const group = new THREE.Group().add(sky, sea, createClouds());
  return {
    group,
    update(time, camera) {
      clock.value = time;
      sky.position.copy(camera.position);
      // The sea follows the camera so its edge is never reached. Steps of one water patch keep the ripples still.
      sea.position.x = Math.round(camera.position.x / 0.75) * 0.75;
      sea.position.z = Math.round(camera.position.z / 0.75) * 0.75;
    },
  };
}

const GRASS = [0x86cf55, 0x7cc64d, 0x90d75f, 0x74bd47];
const SAND = [0xf6e2a6, 0xf1d995, 0xf9e9b6];
const WET_SAND = [0xdcc686, 0xd5bd7b];
const SOIL = [0xa9743f, 0x9a6836, 0xb47f49];
const FLOWERS = [0xffffff, 0xffd84d, 0xff7aa8, 0xff9e3d, 0xc79bff];

/**
 * A voxel island: a grass plateau at y = 0 stepping down to a beach, with tufts and flowers on the lawn.
 * `rx`/`rz` are its half-sizes in world units. `paint(x, z)` (world units) may return the color of a paved
 * spot; painted ground gets no plants.
 */
export function island({ rx = 21, rz = 15, seed = 1, paint } = {}) {
  const nx = Math.round(rx / V);
  const nz = Math.round(rz / V);
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let count = 0;

  const quad = (corners, n, hex, tone) => {
    const c = linear(hex);
    for (const p of corners) {
      positions.push(p[0] * V, p[1] * V, p[2] * V);
      normals.push(n[0] * 127, n[1] * 127, n[2] * 127);
      colors.push(c[0] * tone, c[1] * tone, c[2] * tone);
    }
    indices.push(count, count + 1, count + 2, count, count + 2, count + 3);
    count += 4;
  };
  const topQuad = (i, k, y, hex, tone, s = 1, o = 0) =>
    quad([[i + o, y, k + o], [i + o, y, k + o + s], [i + o + s, y, k + o + s], [i + o + s, y, k + o]], [0, 1, 0], hex, tone);
  // Side of a one-voxel slab whose top is at `y`, facing direction (di, dk).
  const sideQuad = (i, k, y, di, dk, hex, tone) => {
    const corners =
      di === 1 ? [[i + 1, y - 1, k], [i + 1, y, k], [i + 1, y, k + 1], [i + 1, y - 1, k + 1]]
      : di === -1 ? [[i, y - 1, k + 1], [i, y, k + 1], [i, y, k], [i, y - 1, k]]
      : dk === 1 ? [[i + 1, y - 1, k + 1], [i + 1, y, k + 1], [i, y, k + 1], [i, y - 1, k + 1]]
      : [[i, y - 1, k], [i, y, k], [i + 1, y, k], [i + 1, y - 1, k]];
    quad(corners, [di, 0, dk], hex, tone);
  };

  // Height of the ground at a column, in voxels: 0 on the plateau, down to -3 at the waterline, or
  // undefined in the sea. The shoreline wobbles so the island is not an ellipse.
  const FLOOR = -5;
  const SEA = 127;
  const shape = (i, k) => {
    const x = (i + 0.5) / nx;
    const z = (k + 0.5) / nz;
    const angle = Math.atan2(z, x);
    const edge = 1 + 0.06 * Math.sin(angle * 3 + seed) + 0.04 * Math.sin(angle * 7 + seed * 2.3) + 0.02 * Math.sin(angle * 13 + seed * 5.1);
    const t = Math.hypot(x, z) / edge + (hash(i, k, seed) - 0.5) * 0.012;
    return t > 1 ? SEA : t < 0.86 ? 0 : t < 0.9 ? -1 : t < 0.95 ? -2 : -3;
  };
  // Every column is asked about five times (itself and its four neighbors), so the shape is worked out
  // once per column, on a grid one column wider than the loop below on every side.
  const span = 2 * nz + 14;
  const heights = new Int8Array((2 * nx + 14) * span);
  for (let i = -nx - 7; i < nx + 7; i++) for (let k = -nz - 7; k < nz + 7; k++) heights[(i + nx + 7) * span + k + nz + 7] = shape(i, k);
  const height = (i, k) => {
    const h = heights[(i + nx + 7) * span + k + nz + 7];
    return h === SEA ? undefined : h;
  };

  for (let i = -nx - 6; i < nx + 6; i++) {
    for (let k = -nz - 6; k < nz + 6; k++) {
      const h = height(i, k);
      if (h === undefined) continue;
      const tone = 0.94 + hash(i, k, 7) * 0.12;
      const paved = h === 0 ? paint?.((i + 0.5) * V, (k + 0.5) * V) : undefined;
      const pick = (list, salt) => list[Math.floor(hash(i, k, salt) * list.length)];
      const top = paved ?? (h === 0 ? pick(GRASS, 11) : h === -3 ? pick(WET_SAND, 12) : pick(SAND, 13));
      topQuad(i, k, h, top, tone);
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighbor = height(i + di, k + dk) ?? FLOOR;
        for (let y = h; y > neighbor; y--) {
          // Under the lawn the bank is soil; lower down it is sand like the beach around it.
          sideQuad(i, k, y, di, dk, h === 0 && y > -2 ? pick(SOIL, 14 + y) : pick(SAND, 15), tone * 0.9);
        }
      }
      if (h !== 0 || paved !== undefined) continue;
      const roll = hash(i, k, 21);
      if (roll < 0.03) {
        // A tuft, or more rarely a flower: one small cube standing on the lawn.
        const flower = roll < 0.007;
        const hex = flower ? pick(FLOWERS, 22) : 0x5fae3c;
        const s = flower ? 0.5 : 0.6;
        const o = (1 - s) / 2;
        topQuad(i, k, s, hex, 1, s, o);
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + o, b = k + o;
          const corners =
            di === 1 ? [[a + s, 0, b], [a + s, s, b], [a + s, s, b + s], [a + s, 0, b + s]]
            : di === -1 ? [[a, 0, b + s], [a, s, b + s], [a, s, b], [a, 0, b]]
            : dk === 1 ? [[a + s, 0, b + s], [a + s, s, b + s], [a, s, b + s], [a, 0, b + s]]
            : [[a, 0, b], [a, s, b], [a + s, s, b], [a + s, 0, b]];
          quad(corners, [di, 0, dk], hex, 0.85);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Int8BufferAttribute(normals, 3, true));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, VOXEL);
  mesh.receiveShadow = true;
  return mesh;
}

/** Marks on an island's lawn (roads, plazas), in world units. Later marks cover earlier ones. */
export function paving() {
  const marks = [];
  const color = (c, x, z) => (typeof c === "function" ? c(Math.floor(x / V), Math.floor(z / V)) : c);
  return {
    rect(x0, z0, x1, z1, c) {
      marks.push((x, z) => (x >= x0 && x <= x1 && z >= z0 && z <= z1 ? color(c, x, z) : undefined));
      return this;
    },
    disc(cx, cz, r, c) {
      marks.push((x, z) => (Math.hypot(x - cx, z - cz) <= r ? color(c, x, z) : undefined));
      return this;
    },
    /** A road `width` wide through `points` ({ x, z } each), which should be closer together than that. */
    stroke(points, width, c) {
      const cells = new Set();
      const r = width / 2;
      for (const p of points) {
        for (let i = Math.floor((p.x - r) / V); i <= Math.floor((p.x + r) / V); i++) {
          for (let k = Math.floor((p.z - r) / V); k <= Math.floor((p.z + r) / V); k++) {
            if (Math.hypot((i + 0.5) * V - p.x, (k + 0.5) * V - p.z) <= r) cells.add(i * 4096 + k);
          }
        }
      }
      marks.push((x, z) => (cells.has(Math.floor(x / V) * 4096 + Math.floor(z / V)) ? color(c, x, z) : undefined));
      return this;
    },
    paint: (x, z) => {
      for (let m = marks.length - 1; m >= 0; m--) {
        const c = marks[m](x, z);
        if (c !== undefined) return c;
      }
      return undefined;
    },
  };
}

const LEAVES = [0x3f9e3d, 0x4bb04a, 0x358c36];
const BARK = [0x8b5a2b, 0x7c4f25];

/** Round-topped tree, about 4 units tall. */
export function tree(seed = 0) {
  const v = new Vox();
  const h = 7 + Math.floor(hash(seed, 1) * 4);
  v.box(-1, 0, -1, 0, h, 0, (x, y, z) => BARK[Math.floor(hash(x, y, z) * 2)]);
  const leaf = (x, y, z) => LEAVES[Math.floor(hash(x, y, z + seed) * 3)];
  v.ball(-0.5, h + 3, -0.5, 5, 4, 5, leaf);
  v.ball(2.5, h + 1, 1.5, 3.2, 2.8, 3.2, leaf);
  v.ball(-3.5, h + 1.5, -1.5, 3, 2.6, 3, leaf);
  return v;
}

/** Palm with a leaning trunk and drooping fronds, about 5 units tall. */
export function palm(seed = 0) {
  const v = new Vox();
  const h = 16 + Math.floor(hash(seed, 2) * 6);
  const lean = hash(seed, 3) < 0.5 ? 1 : -1;
  let x = 0;
  for (let y = 0; y < h; y++) {
    if (y > 3 && y % 4 === 0) x += lean;
    v.box(x, y, 0, x + 1, y, 1, y % 3 === 0 ? 0x9a6b3a : 0xb07d47);
  }
  const fronds = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  fronds.forEach(([dx, dz], f) => {
    const len = dx && dz ? 5 : 7;
    for (let s = 1; s <= len; s++) {
      const droop = Math.round((s * s) / (len * 1.6));
      v.box(x + dx * s, h - droop, dz * s, x + dx * s + 1, h - droop, dz * s + 1, (f + s) % 3 === 0 ? 0x4bb04a : 0x3f9e3d);
    }
  });
  v.box(x, h, 0, x + 1, h, 1, 0x358c36);
  v.set(x - 1, h - 1, 0, 0x6b4423).set(x + 2, h - 1, 1, 0x6b4423);
  return v;
}

export function bush(seed = 0) {
  const r = 2 + hash(seed, 4) * 1.5;
  return new Vox().ball(0, r * 0.6, 0, r, r * 0.8, r, (x, y, z) => LEAVES[Math.floor(hash(x, y, z + seed) * 3)]);
}

export function rock(seed = 0) {
  const r = 1.6 + hash(seed, 5) * 1.6;
  return new Vox().ball(0, r * 0.4, 0, r, r * 0.7, r * 0.85, (x, y, z) => (hash(x, y, z + seed) < 0.3 ? 0x8d949c : 0xa3aab2));
}

/**
 * Plants and rocks around a scene, as one mesh. `spots` is a list of [kind, x, z] in world units, with kind
 * one of "tree", "palm", "bush" or "rock".
 */
export function greenery(spots) {
  const kinds = { tree, palm, bush, rock };
  const all = new Vox();
  spots.forEach(([kind, x, z], i) => all.add(kinds[kind](i * 7 + 1), Math.round(x / V), 0, Math.round(z / V), i));
  return all.mesh();
}
