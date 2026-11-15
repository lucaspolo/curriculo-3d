// Building blocks shared by the voxel scenes: palette, cubes that travel along curves, and small helpers.
// Labels, picking, curves and canvas textures are the same as in the first version of the site.
import * as THREE from "three";
import { Vox, V } from "./voxel.js";

export { label, pickable, path, damp, canvasTexture } from "../../../src/lib/kit.js";
export { Vox, V };

export const COLORS = {
  kafka: 0x17b3a3,
  message: 0xff9a2e,
  privacy: 0xf0508a,
  llm: 0x8a6cf2,
  k8s: 0x3c8cf0,
  ok: 0x3fbf63,
  warn: 0xffc93c,
  danger: 0xe5484d,
  white: 0xfdfbf5,
  cream: 0xf3ead8,
  wall: 0xe9dfc9,
  roof: 0xd9603b,
  wood: 0xb5793f,
  darkWood: 0x8a5a2b,
  stone: 0xb9c0c8,
  darkStone: 0x8e96a0,
  steel: 0x5d6b7c,
  ink: 0x2c3340,
  glass: 0x8fd3f4,
  road: 0x6f7885,
  plaza: 0xe7d9b8,
};

/** Converts world units to whole voxels. */
export const vx = (units) => Math.round(units / V);

/**
 * Places a voxel model in a scene. `at` is where its base center goes, in world units; the model itself
 * is authored around x = z = 0 with its base at y = 0.
 */
export function place(group, vox, at = [0, 0, 0], options) {
  const mesh = vox.mesh(options);
  mesh.position.set(...at);
  group.add(mesh);
  return mesh;
}

const IDENTITY = new THREE.Quaternion();

/**
 * Small cubes that travel along curves (messages, requests, parcels), drawn with one InstancedMesh.
 * `speed` is in world units per second so short and long paths look consistent.
 */
export class Flow {
  constructor(max = 300, size = 0.34) {
    this.max = max;
    this.items = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshLambertMaterial(), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    // Instances wander far from the geometry origin, so the default bounding sphere would cull them.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  emit(curve, { color = COLORS.message, speed = 8, scale = 1, onArrive } = {}) {
    if (this.items.length >= this.max) return false;
    this.items.push({ curve, length: curve.getLength(), t: 0, color: new THREE.Color(color), speed, scale, onArrive });
    return true;
  }

  update(dt) {
    const { items } = this;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += (dt * it.speed) / it.length;
      if (it.t >= 1) {
        items[i] = items[items.length - 1];
        items.pop();
        it.onArrive?.();
      }
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.curve.getPointAt(it.t, this._p);
      // Grow in and shrink out at the ends so the cubes do not pop.
      this._s.setScalar(it.scale * Math.min(1, it.t * 8, (1 - it.t) * 8 + 0.3));
      this.mesh.setMatrixAt(i, this._m.compose(this._p, IDENTITY, this._s));
      this.mesh.setColorAt(i, it.color);
    }
    this.mesh.count = items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Curve that hops from a to b (THREE.Vector3), rising `lift` at the middle. */
export function hop(a, b, lift = 2) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += lift;
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
}

/** A glowing-looking accent that ignores the sun: lamps, LEDs, screens' frames. */
export const lamp = (color) => new THREE.MeshBasicMaterial({ color });
