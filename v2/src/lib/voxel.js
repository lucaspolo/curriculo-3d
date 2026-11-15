// Voxel models: a sparse grid of colored cells, and the mesher that turns it into one shaded mesh.
import * as THREE from "three";

/** World units per voxel. One size everywhere, so every scene has the same grain. */
export const V = 0.25;

// Cells live in [-512, 511] on each axis, packed into one number so a Map can hold them.
const BIAS = 512;
const key = (x, y, z) => x + BIAS + (y + BIAS) * 1024 + (z + BIAS) * 1048576;

/** Stable pseudo-random in [0, 1) from integer coordinates: the same voxel always gets the same shade. */
export function hash(x, y, z = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const linearCache = new Map();
/** sRGB hex → linear [r, g, b], which is what vertex colors are expected to hold. */
export function linear(hex) {
  let c = linearCache.get(hex);
  if (!c) {
    const color = new THREE.Color(hex);
    c = [color.r, color.g, color.b];
    linearCache.set(hex, c);
  }
  return c;
}

/** The one material every voxel mesh shares: colors and shading are baked into the vertices. */
export const VOXEL = new THREE.MeshLambertMaterial({ vertexColors: true });

// Each face: outward normal and two in-plane axes with u × v = normal, so the corners below run
// counter-clockwise seen from outside.
const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
// Brightness by how open a corner is: 0 = wedged between two neighbors, 3 = nothing around it.
const OCCLUSION = [0.5, 0.67, 0.84, 1];

export class Vox {
  constructor() {
    this.cells = new Map();
  }

  set(x, y, z, color) {
    this.cells.set(key(x, y, z), color);
    return this;
  }

  has(x, y, z) {
    return this.cells.has(key(x, y, z));
  }

  /**
   * Fills a box, bounds included. `color` is a hex or (x, y, z) => hex; returning undefined leaves that
   * cell as it was, and returning null empties it.
   */
  box(x0, y0, z0, x1, y1, z1, color) {
    const pick = typeof color === "function" ? color : null;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const c = pick ? pick(x, y, z) : color;
          if (c === null) this.cells.delete(key(x, y, z));
          else if (c !== undefined) this.cells.set(key(x, y, z), c);
        }
      }
    }
    return this;
  }

  /** Empties a box, bounds included. */
  cut(x0, y0, z0, x1, y1, z1) {
    return this.box(x0, y0, z0, x1, y1, z1, null);
  }

  /** Ellipsoid around a center (which may sit between cells, e.g. 3.5). */
  ball(cx, cy, cz, rx, ry, rz, color) {
    return this.box(Math.floor(cx - rx), Math.floor(cy - ry), Math.floor(cz - rz), Math.ceil(cx + rx), Math.ceil(cy + ry), Math.ceil(cz + rz), (x, y, z) => {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
      if (d > 1) return undefined;
      return typeof color === "function" ? color(x, y, z) : color;
    });
  }

  /** Cylinder along `axis` ("x", "y" or "z") from `lo` to `hi`, centered at (a, b) on the other two. */
  rod(axis, a, b, lo, hi, r, color) {
    const r2 = r * r;
    for (let i = Math.floor(a - r); i <= Math.ceil(a + r); i++) {
      for (let j = Math.floor(b - r); j <= Math.ceil(b + r); j++) {
        if ((i - a) ** 2 + (j - b) ** 2 > r2) continue;
        for (let k = lo; k <= hi; k++) {
          const [x, y, z] = axis === "x" ? [k, i, j] : axis === "y" ? [i, k, j] : [i, j, k];
          const c = typeof color === "function" ? color(x, y, z) : color;
          if (c !== undefined) this.set(x, y, z, c);
        }
      }
    }
    return this;
  }

  /** Copies another model in, shifted. `turns` rotates it by quarter turns around the vertical axis first. */
  add(other, dx = 0, dy = 0, dz = 0, turns = 0) {
    other.each((x, y, z, color) => {
      let [rx, rz] = [x, z];
      for (let t = 0; t < (turns & 3); t++) [rx, rz] = [-rz, rx];
      this.set(rx + dx, y + dy, rz + dz, color);
    });
    return this;
  }

  each(fn) {
    for (const [k, color] of this.cells) {
      fn((k % 1024) - BIAS, (Math.floor(k / 1024) % 1024) - BIAS, Math.floor(k / 1048576) - BIAS, color);
    }
  }

  /**
   * Only faces that touch empty space, each vertex darkened by the neighbors crowding its corner (the baked
   * ambient occlusion that makes voxel models read as solid) and each voxel with a slight shade of its own.
   * `origin` is the voxel coordinate that ends up at the mesh's own origin.
   */
  geometry({ size = V, origin = [0, 0, 0], jitter = 0.05 } = {}) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    const { cells } = this;
    let count = 0;
    this.each((x, y, z, hex) => {
      const base = linear(hex);
      const tone = 1 + (hash(x, y, z) - 0.5) * 2 * jitter;
      for (const { n, u, v } of FACES) {
        if (cells.has(key(x + n[0], y + n[1], z + n[2]))) continue;
        const open = [];
        for (const [cu, cv] of CORNERS) {
          const ux = u[0] * cu, uy = u[1] * cu, uz = u[2] * cu;
          const vx = v[0] * cv, vy = v[1] * cv, vz = v[2] * cv;
          const ax = x + n[0], ay = y + n[1], az = z + n[2];
          const side1 = cells.has(key(ax + ux, ay + uy, az + uz)) ? 1 : 0;
          const side2 = cells.has(key(ax + vx, ay + vy, az + vz)) ? 1 : 0;
          const corner = cells.has(key(ax + ux + vx, ay + uy + vy, az + uz + vz)) ? 1 : 0;
          const level = side1 && side2 ? 0 : 3 - side1 - side2 - corner;
          open.push(level);
          positions.push(
            (x + 0.5 + (n[0] + ux + vx) * 0.5 - origin[0]) * size,
            (y + 0.5 + (n[1] + uy + vy) * 0.5 - origin[1]) * size,
            (z + 0.5 + (n[2] + uz + vz) * 0.5 - origin[2]) * size,
          );
          normals.push(n[0] * 127, n[1] * 127, n[2] * 127);
          const m = tone * OCCLUSION[level];
          colors.push(base[0] * m, base[1] * m, base[2] * m);
        }
        // Split the quad along its brighter diagonal; the other way the shading leaks across the face.
        if (open[0] + open[2] > open[1] + open[3]) indices.push(count, count + 1, count + 2, count, count + 2, count + 3);
        else indices.push(count + 1, count + 2, count + 3, count + 1, count + 3, count);
        count += 4;
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Int8BufferAttribute(normals, 3, true));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  /** The model as a mesh that casts and receives shadows. Options are those of geometry(). */
  mesh(options) {
    const mesh = new THREE.Mesh(this.geometry(options), VOXEL);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Shorthand for patterned fills: bricks, planks, stripes. Each returns a color function for Vox.box(). */
export const pattern = {
  /** Mostly `a`, with `b` scattered at the given share. */
  speckle: (a, b, share = 0.2) => (x, y, z) => (hash(x, y, z) < share ? b : a),
  /** Brick courses two voxels tall, with mortar lines in `b`. */
  bricks: (a, b) => (x, y, z) => (y % 3 === 0 || (x + z + (Math.floor(y / 3) % 2) * 2) % 4 === 0 ? b : a),
  /** Bands along one axis, `width` voxels each. */
  bands: (axis, width, a, b) => (x, y, z) => (Math.floor((axis === "x" ? x : axis === "y" ? y : z) / width) % 2 === 0 ? a : b),
};
