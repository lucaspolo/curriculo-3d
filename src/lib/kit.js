// Small building blocks shared by every station: colors, labels, outlined boxes, tubes and flowing messages.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const COLORS = {
  kafka: 0x2de2c5,
  message: 0xffb347,
  privacy: 0xff4f8b,
  llm: 0xa48bff,
  k8s: 0x4d9bff,
  ok: 0x4ade80,
  warn: 0xffd166,
  danger: 0xff4d4d,
  steel: 0x1a2436,
  dim: 0x2b3a55,
  text: 0xe6edf7,
};

/** A color pushed above 1.0 so the bloom pass picks it up. */
export const glow = (hex, intensity = 2) => new THREE.Color(hex).multiplyScalar(intensity);

export function label(text, className = "") {
  const el = document.createElement("div");
  el.className = `label ${className}`.trim();
  el.textContent = text;
  return new CSS2DObject(el);
}

const roundedCache = new Map();
/**
 * Box with rounded corners. Geometries are cached because many objects share a size, so never
 * translate or otherwise mutate the result in place: clone() it first.
 */
export function roundedBox(w, h, d, radius = Math.min(w, h, d) * 0.18, segments = 3) {
  const key = `${w}|${h}|${d}|${radius}|${segments}`;
  if (!roundedCache.has(key)) roundedCache.set(key, new RoundedBoxGeometry(w, h, d, segments, radius));
  return roundedCache.get(key);
}

const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
/**
 * Glowing silhouette for rounded shapes, which have no hard edges for EdgesGeometry to draw: a slightly
 * larger copy of the mesh rendered from the inside (inverted hull). Returns the hull, whose
 * material.color can be changed like the old edge lines.
 */
export function outline(mesh, color, { thickness = 0.045, material } = {}) {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  geo.boundingBox.getSize(_size);
  geo.boundingBox.getCenter(_center);
  const hull = new THREE.Mesh(
    geo,
    material ?? new THREE.MeshBasicMaterial({ color: glow(color, 1.6), side: THREE.BackSide, toneMapped: false }),
  );
  const sx = 1 + (2 * thickness) / _size.x;
  const sy = 1 + (2 * thickness) / _size.y;
  const sz = 1 + (2 * thickness) / _size.z;
  hull.scale.set(sx, sy, sz);
  // Scale around the geometry's center, not its origin, so off-center geometries stay aligned.
  hull.position.set(_center.x * (1 - sx), _center.y * (1 - sy), _center.z * (1 - sz));
  mesh.add(hull);
  return hull;
}

/** Hull material for objects that share one outline color (e.g. a car's body and cabin). */
export const outlineMaterial = (color) =>
  new THREE.MeshBasicMaterial({ color: glow(color, 1.6), side: THREE.BackSide, toneMapped: false });

const panelMat = new THREE.MeshStandardMaterial({ color: 0x0b111d, roughness: 0.4, metalness: 0.5 });
const ventMat = new THREE.MeshBasicMaterial({ color: 0x24324a });

/** Front of an appliance: an inset panel, a row of status LEDs and vent slits. */
function frontPanel(body, w, h, d, color) {
  const panel = new THREE.Mesh(roundedBox(w * 0.86, h * 0.62, 0.04, Math.min(w, h) * 0.06, 2), panelMat);
  panel.position.z = d / 2 + 0.005;
  body.add(panel);
  const r = Math.min(w, h) * 0.045;
  const led = new THREE.SphereGeometry(r, 10, 8);
  const ledMat = new THREE.MeshBasicMaterial({ color: glow(color, 2.4), toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(led, ledMat);
    l.position.set(w * 0.34 - i * r * 3.2, h * 0.16, d / 2 + 0.03);
    body.add(l);
  }
  const slit = new THREE.PlaneGeometry(w * 0.32, Math.max(0.025, h * 0.025));
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(slit, ventMat);
    v.position.set(-w * 0.2, h * 0.18 - i * h * 0.1, d / 2 + 0.026);
    body.add(v);
  }
  body.userData.leds = ledMat;
}

/**
 * Dark rounded box with a glowing silhouette: the default look for services and nodes. With
 * `details` it also gets a front panel with LEDs, so it reads as a machine rather than a block.
 */
export function outlinedBox(w, h, d, color, { fill = COLORS.steel, opacity = 1, details = true, radius } = {}) {
  const body = new THREE.Mesh(
    roundedBox(w, h, d, radius),
    new THREE.MeshStandardMaterial({
      color: fill,
      roughness: 0.45,
      metalness: 0.35,
      emissive: color,
      emissiveIntensity: 0.08,
      transparent: opacity < 1,
      opacity,
    }),
  );
  body.userData.edges = outline(body, color);
  if (details) frontPanel(body, w, h, d, color);
  return body;
}

export function tube(curve, color, { radius = 0.1, opacity = 0.22, segments = 64 } = {}) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, segments, radius, 8, false),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/** Smooth path through the given points, all in the station's local space. */
export const path = (...pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));

/**
 * Marks a mesh as hoverable/clickable; the stage shows `info` in the tooltip. `info` can also be a
 * function of the raycast hit (uv, point) returning the info, or null for no tooltip there.
 */
export function pickable(list, mesh, info, onClick) {
  if (typeof info === "function") mesh.userData.infoAt = info;
  else mesh.userData.info = info;
  if (onClick) mesh.userData.onClick = onClick;
  list.push(mesh);
  return mesh;
}

const lengths = new WeakMap();
const curveLength = (curve) => {
  if (!lengths.has(curve)) lengths.set(curve, curve.getLength());
  return lengths.get(curve);
};

/**
 * Glowing spheres that travel along curves, drawn with a single InstancedMesh.
 * `speed` is in world units per second so short and long tubes look consistent.
 */
export class Flow {
  constructor(max = 300, radius = 0.2) {
    this.max = max;
    this.items = [];
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      max,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    // Instances wander far from the geometry origin, so the default bounding sphere would cull them.
    this.mesh.frustumCulled = false;
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  emit(curve, { color = COLORS.message, intensity = 2.4, speed = 8, scale = 1, onArrive } = {}) {
    if (this.items.length >= this.max) return false;
    this.items.push({ curve, t: 0, color: glow(color, intensity), speed, scale, onArrive });
    return true;
  }

  update(dt) {
    const { items } = this;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += (dt * it.speed) / curveLength(it.curve);
      if (it.t >= 1) {
        items[i] = items[items.length - 1];
        items.pop();
        it.onArrive?.();
      }
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.curve.getPointAt(it.t, this._p);
      // Grow in and shrink out at the tube ends so messages do not pop.
      const s = it.scale * Math.min(1, it.t * 8, (1 - it.t) * 8 + 0.3);
      this._s.setScalar(s);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, it.color);
    }
    this.mesh.count = items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Exponential approach that behaves the same at any frame rate. */
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
