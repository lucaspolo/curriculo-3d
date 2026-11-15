// Renderer, post-processing, the scroll-driven camera rig and pointer picking.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { travel, focusOf } from "./lib/progress.js";
import { damp, flushCanvasTextures } from "./lib/kit.js";

const SPACING = 80;
const ZERO = new THREE.Vector3();
const BG = 0x060a13;
// Aspect ratios the station views were framed for: the free area beside the card on a 1920×927 screen,
// and the free area above the card on a phone. Narrower free areas pull the camera back.
const DESKTOP_ASPECT = 1.25;
const PHONE_ASPECT = 1.1;

export class Stage {
  constructor({ canvas, labels, tooltip, stations, reducedMotion, freeArea }) {
    this.freeArea = freeArea;
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.stations = stations;
    this.timeScale = reducedMotion ? 0.35 : 1;
    this.reducedMotion = reducedMotion;
    this.progress = 0;

    // No antialias on the canvas: the scene is drawn into the composer's buffers, so it would only
    // multisample the final full-screen copy, for nothing.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.labelRenderer = new CSS2DRenderer({ element: labels });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 40, 120);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x0a0f1c, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(20, 40, 30);
    this.scene.add(sun);
    this.addBackdrop();

    stations.forEach((s, i) => {
      s.group.position.copy(s.place ?? new THREE.Vector3(i * SPACING, 0, 0));
      this.scene.add(s.group);
      // A station's lights stay lit while it is hidden. Every lit shader is compiled for an exact number of
      // lights, so a lamp that came and went with its station would recompile them all in mid-scroll.
      const lights = s.group.children.filter((o) => o.isLight);
      if (lights.length > 0) {
        const always = new THREE.Group();
        always.position.copy(s.group.position);
        always.add(...lights);
        this.scene.add(always);
      }
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
        fogFar: s.view.fogFar ?? 120,
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
    this.clock = new THREE.Clock();
    this.time = 0;
    this.renderer.setAnimationLoop(() => this.frame());
    // After the first frame, so its own shaders do not queue behind the ones compiled ahead of time.
    requestAnimationFrame(() => this.warmUp());
  }

  /**
   * Gets every station ready to draw while the visitor is still reading. Left alone, three.js compiles a
   * shader and uploads a buffer the first time each object is drawn, which is in the middle of the camera's
   * flight to a new scene: the picture freezes for tens to hundreds of milliseconds.
   */
  async warmUp() {
    // Same kind of buffer as the composer's, so the shader variants are the ones the real frames use.
    const scratch = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const pending = this.stations.filter((s) => s.group.children.length > 0);
    while (pending.length > 0) {
      // Nearest to where the visitor is now: the next stop is always the first one ready.
      const distance = (s) => Math.abs(this.stations.indexOf(s) - this.progress);
      pending.sort((a, b) => distance(a) - distance(b));
      const station = pending.shift();
      // Shaders compile on the driver's threads; the page keeps running meanwhile.
      this.renderer.setRenderTarget(scratch);
      const compiled = this.renderer.compileAsync(station.group, this.camera, this.scene);
      this.renderer.setRenderTarget(null);
      await compiled;
      // The first draw still takes a few milliseconds, so it waits for a frame with the camera at rest.
      do {
        await new Promise(requestAnimationFrame);
      } while (this.flying);
      this.drawOnce(station, scratch);
    }
    scratch.dispose();
  }

  /** Draws everything in one station into a throwaway buffer, so its first real frame has nothing to set up. */
  drawOnce(station, buffer) {
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
    this.renderer.setRenderTarget(buffer);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    restore.reverse().forEach(([object, key, value]) => (object[key] = value));
  }

  addBackdrop() {
    const count = 2500;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -200 + Math.random() * 1100;
      pos[i * 3 + 1] = -60 + Math.random() * 260;
      pos[i * 3 + 2] = -300 + Math.random() * 260;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x6f86b0, size: 0.6, sizeAttenuation: true, fog: false }),
    );
    this.scene.add(stars);

    const grid = new THREE.GridHelper(1400, 280, 0x15305a, 0x0c1a30);
    grid.position.set(320, -12, 0);
    this.scene.add(grid);
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
    // Hits on child edges or meshes resolve to the registered pickable.
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
    this.composer.setSize(w, h);
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

  frame() {
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
    goalPos.y += Math.sin(t * Math.PI) * 10; // lift between stations, like a flyover
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
    this.scene.fog.near = this.scene.fog.far * 0.35;

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
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}
