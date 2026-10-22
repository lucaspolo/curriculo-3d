// One stage of the Porto Seguro issuance line: a glass hood over the conveyor, held by brushed-metal arches
// whose inner light rings run from entry to exit while a proposal is processed, and a tilted panel with the
// stage's icon, name and progress bar.
import * as THREE from "three";
import { glow, roundedBox, outline } from "../lib/kit.js";

const HOOD_R = 1.45;
const HOOD_LEN = 2.3;
// Arches face the camera (XY plane), front to back, framing the proposal as it crosses the station.
const RIBS_Z = [0.95, 0, -0.95];

const metal = new THREE.MeshStandardMaterial({ color: 0xaab4c4, metalness: 0.85, roughness: 0.32 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a4458, metalness: 0.7, roughness: 0.4 });

/** Icons drawn on the panel; Risco has none because the live risk gauge sits in that spot. */
const ICONS = {
  document(ctx, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(40, 22);
    ctx.lineTo(102, 22);
    ctx.lineTo(126, 46);
    ctx.lineTo(126, 148);
    ctx.lineTo(40, 148);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(102, 22);
    ctx.lineTo(102, 46);
    ctx.lineTo(126, 46);
    ctx.stroke();
    ctx.lineWidth = 6;
    [72, 94, 116].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(56, y);
      ctx.lineTo(110, y);
      ctx.stroke();
    });
  },
  coin(ctx, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(84, 85, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.font = "800 54px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("R$", 84, 104);
    ctx.textAlign = "left";
  },
  seal(ctx, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? 52 : 64;
      const a = (i / 24) * Math.PI * 2;
      ctx.lineTo(84 + Math.cos(a) * r, 82 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#0c1322";
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(58, 84);
    ctx.lineTo(77, 103);
    ctx.lineTo(112, 64);
    ctx.stroke();
  },
};

function panelTexture(name, color, icon) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 170;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const css = `#${new THREE.Color(color).getHexString()}`;
  const draw = () => {
    ctx.fillStyle = "#0c1322";
    ctx.fillRect(0, 0, 512, 170);
    if (icon) ICONS[icon](ctx, css);
    ctx.fillStyle = "#e6edf7";
    ctx.font = "700 46px 'Space Grotesk', Inter, system-ui, sans-serif";
    ctx.fillText(name, 176, 98);
    texture.needsUpdate = true;
  };
  draw();
  // Repaint once the web fonts are in, since the first paint may have used a fallback.
  document.fonts?.ready.then(draw);
  return texture;
}

/** Light ring whose brightness travels along the arch; `phase` offsets it from the other ribs. */
function lightRing(color) {
  return new THREE.Mesh(
    new THREE.TorusGeometry(HOOD_R - 0.09, 0.03, 8, 64, Math.PI),
    new THREE.ShaderMaterial({
      uniforms: { color: { value: glow(color, 2.2) }, level: { value: 0 }, time: { value: 0 } },
      vertexShader: `
        varying float vU;
        void main() {
          vU = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color;
        uniform float level;
        uniform float time;
        varying float vU;
        void main() {
          // A soft base glow plus a bright spot sweeping over the arch.
          float sweep = smoothstep(0.8, 1.0, 1.0 - abs(fract(vU - time * 0.6) - 0.5) * 2.0);
          float a = 0.18 + level * (0.5 + sweep * 1.2);
          gl_FragColor = vec4(color * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/**
 * Builds a station centered on x = 0 with its base at `baseY` (the conveyor top).
 * Returns { root, hood, slot, panelTop, update(dt, time, activity, progress, hovered) }.
 */
export function makeStation({ name, color, icon }, baseY) {
  const root = new THREE.Group();

  const hood = new THREE.Mesh(
    new THREE.CylinderGeometry(HOOD_R, HOOD_R, HOOD_LEN, 40, 1, true, Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      roughness: 0.1,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: color,
      emissiveIntensity: 0.15,
    }),
  );
  // Cylinder axis along z (toward the camera), keeping the upper half: a glass vault over the belt.
  hood.rotation.x = Math.PI / 2;
  hood.position.y = baseY;
  root.add(hood);

  const ribGeo = new THREE.TorusGeometry(HOOD_R, 0.075, 12, 64, Math.PI);
  const rings = RIBS_Z.map((z) => {
    const rib = new THREE.Mesh(ribGeo, metal);
    rib.position.set(0, baseY, z);
    root.add(rib);
    const ring = lightRing(color);
    ring.position.set(0, baseY, z);
    root.add(ring);
    return ring;
  });
  // Feet under the front and back arches, on both sides of the belt.
  [RIBS_Z[0], RIBS_Z[2]].forEach((z) =>
    [-1, 1].forEach((side) => {
      const foot = new THREE.Mesh(roundedBox(0.3, baseY, 0.3, 0.06, 2), darkMetal);
      foot.position.set(side * HOOD_R, baseY / 2, z);
      root.add(foot);
    }),
  );

  // Panel on top, tilted toward the camera: icon, name and a progress bar.
  const panel = new THREE.Group();
  panel.position.set(0, baseY + HOOD_R + 0.5, 0.95);
  panel.rotation.x = -0.3;
  root.add(panel);
  const plate = new THREE.Mesh(roundedBox(2.6, 0.92, 0.1, 0.09), darkMetal);
  panel.add(plate);
  outline(plate, color, { thickness: 0.03 });
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.78),
    new THREE.MeshBasicMaterial({ map: panelTexture(name, color, icon), toneMapped: false }),
  );
  face.position.z = 0.052;
  panel.add(face);
  const barBack = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.07), new THREE.MeshBasicMaterial({ color: 0x24324a }));
  barBack.position.set(0.38, -0.25, 0.055);
  panel.add(barBack);
  const bar = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.07).translate(0.5, 0, 0),
    new THREE.MeshBasicMaterial({ color: glow(color, 1.8), toneMapped: false }),
  );
  bar.position.set(0.38 - 0.725, -0.25, 0.058);
  bar.scale.x = 0.001;
  bar.userData.max = 1.45;
  panel.add(bar);
  // The icon's spot on the panel, for stages that put a live object there instead (the risk gauge).
  const slot = new THREE.Group();
  slot.position.set(-0.78, 0.02, 0.07);
  panel.add(slot);

  return {
    root,
    hood,
    slot,
    panelTop: new THREE.Vector3(0, baseY + HOOD_R + 1.2, 0.95),
    update(dt, time, activity, progress, hovered) {
      rings.forEach((ring, i) => {
        // Entry, middle and exit arches light up in turn, so the light runs along the station.
        const wave = 0.5 + 0.5 * Math.sin(time * 6 - i * 1.4);
        ring.material.uniforms.level.value = activity * (0.4 + 0.6 * wave);
        ring.material.uniforms.time.value = time + i * 0.3;
      });
      hood.material.opacity = 0.08 + activity * 0.08 + (hovered ? 0.07 : 0);
      bar.scale.x = Math.max(0.001, progress * bar.userData.max);
    },
  };
}
