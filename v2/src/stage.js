// Renderer, sunlight, the scroll-driven camera rig and pointer picking for the voxel version. The rig and the
// picking follow src/stage.js line by line (its pitfalls in AGENTS.md apply here too); what differs is how
// the picture is made: no bloom, a sun that casts shadows, and a sky and sea instead of the starfield.
import * as THREE from "three";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { travel, focusOf } from "../../src/lib/progress.js";
import { damp, flushCanvasTextures } from "../../src/lib/kit.js";
import { createWorld, SKY, SUNLIGHT } from "./world.js";

const SPACING = 110;
const ZERO = new THREE.Vector3();
// Aspect ratios the station views were framed for: the free area beside the card on a 1920×927 screen,
// and the free area above the card on a phone. Narrower free areas pull the camera back.
const DESKTOP_ASPECT = 1.25;
const PHONE_ASPECT = 1.1;
// Half-width of the ground the sun's shadow map covers, and the grid its center snaps to.
const SHADOW_REACH = 34;
const SHADOW_STEP = 4;

export class Stage {
  constructor({ canvas, labels, tooltip, stations, reducedMotion, freeArea }) {
    this.freeArea = freeArea;
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.stations = stations;
    this.timeScale = reducedMotion ? 0.35 : 1;
    this.reducedMotion = reducedMotion;
    this.progress = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.labelRenderer = new CSS2DRenderer({ element: labels });

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.horizon, 80, 300);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 2000);

    // Sky light from above and warm light bounced off the sand from below, then the sun itself.
    this.scene.add(new THREE.HemisphereLight(0xd6ecff, 0xf2d9a2, 1.55));
    this.sun = new THREE.DirectionalLight(0xfff1d8, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 1, far: 220 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.world = createWorld();
    this.scene.add(this.world.group);

    stations.forEach((s, i) => {
      s.group.position.copy(s.place ?? new THREE.Vector3(i * SPACING, 0, 0));
      this.scene.add(s.group);
      s.labels = [];
      s.group.traverse((o) => o.isCSS2DObject && s.labels.push(o.element));
      s.labelsShown = true;
      const narrowView = s.view.narrow ?? s.view;
      s.views = {
        pos: s.group.position.clone().add(new THREE.Vector3(...s.view.pos)),
        target: s.group.position.clone().add(new THREE.Vector3(...s.view.target)),
        // Optional phone framing, for scenes whose focal point is not their center.
        narrowPos: s.group.position.clone().add(new THREE.Vector3(...narrowView.pos)),
        narrowTarget: s.group.position.clone().add(new THREE.Vector3(...narrowView.target)),
        fogFar: s.view.fogFar ?? 300,
        // Extra pull-back on phones for scenes wider than the default framing.
        narrowScale: s.view.narrowScale ?? 1,
      };
    });

    this.camPos = stations[0].views.pos.clone();
    this.camTarget = stations[0].views.target.clone();
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerSmooth = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;

    this.bindPointer();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.clock = new THREE.Timer();
    this.time = 0;
    this.renderer.setAnimationLoop((now) => this.frame(now));
    // After the first frame, so its own shaders do not queue behind the ones compiled ahead of time.
    requestAnimationFrame(() => this.warmUp());
  }

  /**
   * Gets every station ready to draw while the visitor is still reading. Left alone, three.js compiles a
   * shader and uploads a buffer the first time each object is drawn, which is in the middle of the camera's
   * flight to a new scene: the picture freezes for tens to hundreds of milliseconds.
   */
  async warmUp() {
    const pending = this.stations.filter((s) => s.group.children.length > 0);
    while (pending.length > 0) {
      // Nearest to where the visitor is now: the next stop is always the first one ready.
      const distance = (s) => Math.abs(this.stations.indexOf(s) - this.progress);
      pending.sort((a, b) => distance(a) - distance(b));
      const station = pending.shift();
      // Shaders compile on the driver's threads; the page keeps running meanwhile.
      await this.renderer.compileAsync(station.group, this.camera, this.scene);
      // The first draw still takes a few milliseconds: frame() does it, on a frame with the camera at rest.
      await new Promise((done) => (this.rehearsal = { station, done }));
    }
  }

  /**
   * Draws everything in one station once, so its first real frame has nothing left to set up. It goes to
   * the canvas itself (a few pixels of it, painted over by the real frame right after): shaders are
   * compiled for a particular kind of output, and another buffer would warm up the wrong ones.
   */
  drawOnce(station) {
    const restore = [];
    const set = (object, key, value) => {
      restore.push([object, key, object[key]]);
      object[key] = value;
    };
    this.stations.forEach((s) => set(s.group, "visible", s === station));
    station.group.traverse((o) => {
      // Objects still hidden or out of the camera's view count too: they show up later, mid-animation.
      set(o, "visible", true);
      set(o, "frustumCulled", false);
      if (o.isInstancedMesh && o.count === 0) set(o, "count", 1);
    });
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setViewport(0, 0, 8, 8);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setViewport(0, 0, size.x, size.y);
    restore.reverse().forEach(([object, key, value]) => (object[key] = value));
  }

  bindPointer() {
    const toNdc = (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.pointerPx = { x: e.clientX, y: e.clientY };
    };
    this.canvas.addEventListener("pointermove", (e) => {
      toNdc(e);
      this.pick();
    });
    this.canvas.addEventListener("pointerleave", () => this.setHovered(null));
    this.canvas.addEventListener("click", (e) => {
      toNdc(e);
      const hit = this.pick();
      hit?.userData.onClick?.();
    });
  }

  pick() {
    const candidates = [];
    this.stations.forEach((s, i) => {
      if (focusOf(this.progress, i) > 0.5) candidates.push(...s.pickables.filter((o) => o.visible));
    });
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(candidates, false)[0];
    // Hits on child meshes resolve to the registered pickable.
    let obj = hit?.object ?? null;
    while (obj && !obj.userData.info && !obj.userData.infoAt) obj = obj.parent;
    // infoAt lets a single mesh (e.g. a page of text) describe whatever is under the pointer.
    const info = obj?.userData.infoAt ? obj.userData.infoAt(hit) : obj?.userData.info;
    this.setHovered(info ? obj : null, info);
    return obj;
  }

  setHovered(obj, info = obj?.userData.info) {
    if (this.hovered && this.hovered !== obj) this.hovered.userData.hovered = false;
    this.hovered = obj;
    document.body.classList.toggle("pointer", !!obj?.userData.onClick);
    if (!obj) {
      this.tooltip.hidden = true;
      return;
    }
    obj.userData.hovered = true;
    const { title, text } = info;
    this.tooltip.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = title;
    this.tooltip.append(strong, document.createTextNode(text ?? ""));
    this.tooltip.hidden = false;
    const x = Math.min(this.pointerPx.x + 16, window.innerWidth - 300);
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${this.pointerPx.y + 16}px`;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.narrow = w <= 800;
    // Shift the projection so the scene sits beside (desktop) or above (phone) the text card.
    if (this.narrow) {
      this.camera.setViewOffset(w, h, 0, h * 0.18, w, h);
      // Only the top ~58% of the screen is free above the card.
      this.distanceScale = Math.max(1, PHONE_ASPECT / Math.min((w / h) * 0.95, 0.6));
    } else {
      // Center the scene in the real gap between the card and the section dots.
      const { left, right } = this.freeArea();
      this.camera.setViewOffset(w, h, -w * ((left + right) / 2 - 0.5), 0, w, h);
      this.distanceScale = Math.max(1, DESKTOP_ASPECT / (((right - left) * w) / h));
    }
    this.camera.updateProjectionMatrix();
  }

  setProgress(p) {
    // The scene moves under a still pointer while scrolling, so the old hover no longer applies.
    if (Math.abs(p - this.progress) > 0.02) this.setHovered(null);
    this.progress = p;
  }

  frame(now) {
    this.clock.update(now);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const sdt = dt * this.timeScale;
    this.time += sdt;

    const { from, to, t } = travel(this.progress);
    this.flying = t > 0 && t < 1;
    const a = this.stations[from].views;
    const b = (this.stations[to] ?? this.stations[from]).views;
    const [posKey, targetKey] = this.narrow ? ["narrowPos", "narrowTarget"] : ["pos", "target"];
    // A station may slide its own framing (e.g. between tabs) through a `shift` vector.
    const sa = this.stations[from].shift;
    const sb = (this.stations[to] ?? this.stations[from]).shift;
    const goalTarget = a[targetKey].clone().add(sa ?? ZERO).lerp(b[targetKey].clone().add(sb ?? ZERO), t);
    const goalPos = a[posKey].clone().add(sa ?? ZERO).lerp(b[posKey].clone().add(sb ?? ZERO), t);
    goalPos.y += Math.sin(t * Math.PI) * 14; // lift between islands, like a flyover
    const narrowScale = this.narrow ? THREE.MathUtils.lerp(a.narrowScale, b.narrowScale, t) : 1;
    goalPos.sub(goalTarget).multiplyScalar(this.distanceScale * narrowScale).add(goalTarget);

    if (!this.reducedMotion) {
      this.pointerSmooth.x = damp(this.pointerSmooth.x, this.pointer.x, 3, dt);
      this.pointerSmooth.y = damp(this.pointerSmooth.y, this.pointer.y, 3, dt);
      goalPos.x += this.pointerSmooth.x * 1.6;
      goalPos.y += this.pointerSmooth.y * 0.9;
    }

    const lambda = this.reducedMotion ? 20 : 4;
    this.camPos.set(
      damp(this.camPos.x, goalPos.x, lambda, dt),
      damp(this.camPos.y, goalPos.y, lambda, dt),
      damp(this.camPos.z, goalPos.z, lambda, dt),
    );
    this.camTarget.set(
      damp(this.camTarget.x, goalTarget.x, lambda, dt),
      damp(this.camTarget.y, goalTarget.y, lambda, dt),
      damp(this.camTarget.z, goalTarget.z, lambda, dt),
    );
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    const fogFar = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t) * this.distanceScale;
    this.scene.fog.far = damp(this.scene.fog.far, fogFar, 3, dt);
    this.scene.fog.near = this.scene.fog.far * 0.3;

    // The shadow map covers the ground around what the camera looks at. Its center moves in whole steps:
    // following the camera continuously would make every shadow edge crawl.
    this.sun.target.position.set(Math.round(this.camTarget.x / SHADOW_STEP) * SHADOW_STEP, 0, Math.round(this.camTarget.z / SHADOW_STEP) * SHADOW_STEP);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUNLIGHT, 110);
    this.world.update(this.time, this.camera);

    this.stations.forEach((s, i) => {
      const focus = focusOf(this.progress, i);
      const visible = focus > 0;
      s.group.visible = visible;
      if (visible) s.update(sdt, this.time, focus);
      // Labels show only on the station in focus, so a passing neighbour does not leave text behind.
      const showLabels = focus > 0.45;
      if (showLabels !== s.labelsShown) {
        s.labelsShown = showLabels;
        s.labels.forEach((el) => el.classList.toggle("muted-by-stage", !showLabels));
      }
    });

    flushCanvasTextures(this.renderer);
    if (this.rehearsal && !this.flying) {
      this.drawOnce(this.rehearsal.station);
      this.rehearsal.done();
      this.rehearsal = null;
    }
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
