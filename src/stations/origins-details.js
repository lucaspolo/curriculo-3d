// Extra details for the objects on the origins workbench. Each function decorates an object's root group
// (in that object's local space) and may return { play(k, dt, time), idle() } for its own animation.
import * as THREE from "three";
import { COLORS, glow, roundedBox } from "../lib/kit.js";
import { tr } from "../i18n.js";

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...extra });
const rbox = (w, h, d, material, r = Math.min(w, h, d) * 0.22) => new THREE.Mesh(roundedBox(w, h, d, r, 2), material);
const cyl = (rt, rb, h, material, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
const font = (w, s, mono) => `${w} ${s}px ${mono ? "'JetBrains Mono', monospace" : "Inter, system-ui, sans-serif"}`;
const glass = mat(0x0b1424, { roughness: 0.15, metalness: 0.8, emissive: 0x16304f });

/** Plane with a canvas texture; `draw(ctx, w, h)` paints it and can be called again through redraw(). */
function painted(pxW, pxH, w, h, draw, { basic = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = basic
    ? new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  const redraw = (...args) => {
    draw(ctx, pxW, pxH, ...args);
    texture.needsUpdate = true;
  };
  redraw();
  // Text drawn before the web fonts load uses a fallback; paint again once they are in.
  document.fonts?.ready.then(() => redraw());
  return { mesh, redraw };
}

const flat = (mesh, y) => {
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
};

// ---------------------------------------------------------------------------------------------------

export function booksDetails(root) {
  const titles = tr(["LÓGICA DE PROGRAMAÇÃO", "ALGORITMOS", "ESTRUTURAS DE DADOS"], ["PROGRAMMING LOGIC", "ALGORITHMS", "DATA STRUCTURES"]);
  const inks = ["#e9d9a6", "#f3e3c3", "#e6e0ff"];
  root.children.slice(0, 3).forEach((book, i) => {
    // Spine facing the camera, with a title and two gilt bands.
    const spine = painted(512, 80, 1.9, 0.28, (ctx, w, h) => {
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = inks[i];
      ctx.fillRect(14, 8, 6, h - 16);
      ctx.fillRect(w - 20, 8, 6, h - 16);
      ctx.font = font(700, 30);
      ctx.textAlign = "center";
      ctx.fillText(titles[i], w / 2, h / 2 + 11);
    });
    spine.mesh.material.transparent = true;
    spine.mesh.position.set(0, 0, 0.705);
    book.add(spine.mesh);
  });
  const pencil = new THREE.Group();
  pencil.position.set(1.3, 0.06, 0.55);
  pencil.rotation.y = -0.5;
  root.add(pencil);
  const wood = cyl(0.05, 0.05, 1.1, mat(0xe0a526), 6);
  wood.rotation.z = Math.PI / 2;
  pencil.add(wood);
  const tip = cyl(0.002, 0.05, 0.16, mat(0xd9b88a), 6);
  tip.rotation.z = Math.PI / 2;
  tip.position.x = -0.63;
  pencil.add(tip);
  const eraser = cyl(0.05, 0.05, 0.12, mat(0xe07a8a), 6);
  eraser.rotation.z = Math.PI / 2;
  eraser.position.x = 0.61;
  pencil.add(eraser);
}

export function solderingDetails(root) {
  // Components on the board: resistors with colour bands, electrolytic capacitors, LEDs and a pin header.
  const bandColors = [0x8b4513, 0x111111, 0xff3b30, 0xd4af37];
  [
    [0.15, 0.45],
    [0.15, 0.62],
    [-0.75, -0.5],
  ].forEach(([x, z]) => {
    const r = new THREE.Group();
    r.position.set(x, 0.14, z);
    root.add(r);
    const body = cyl(0.05, 0.05, 0.32, mat(0xd8c49a), 10);
    body.rotation.z = Math.PI / 2;
    r.add(body);
    bandColors.forEach((c, i) => {
      const band = cyl(0.053, 0.053, 0.03, mat(c), 10);
      band.rotation.z = Math.PI / 2;
      band.position.x = -0.1 + i * 0.065;
      r.add(band);
    });
  });
  [
    [0.85, -0.45, 0x1e3a8a],
    [-0.2, -0.55, 0x1e3a8a],
  ].forEach(([x, z, c]) => {
    const cap = cyl(0.11, 0.11, 0.3, mat(c, { metalness: 0.4 }), 16);
    cap.position.set(x, 0.23, z);
    root.add(cap);
    const top = cyl(0.11, 0.11, 0.01, mat(0x9aa4b8, { metalness: 0.8 }), 16);
    top.position.y = 0.155;
    cap.add(top);
  });
  [0xff3b30, 0xffd166].forEach((c, i) => {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: glow(c, 1.4), toneMapped: false }));
    led.position.set(0.7 - i * 0.18, 0.15, 0.45);
    root.add(led);
  });
  const header = rbox(0.6, 0.08, 0.12, mat(0x111111));
  header.position.set(-0.4, 0.12, 0.6);
  root.add(header);
  for (let i = 0; i < 6; i++) {
    const pin = cyl(0.012, 0.012, 0.2, mat(0xd4af37, { metalness: 0.9, roughness: 0.2 }), 6);
    pin.position.set(-0.65 + i * 0.1, 0.22, 0.6);
    root.add(pin);
  }

  // Solder spool and the soldering station with its temperature display, wired to the iron.
  const spool = new THREE.Group();
  spool.position.set(-1.45, 0, 0.55);
  root.add(spool);
  const reel = cyl(0.22, 0.22, 0.2, mat(0x2b2b33), 20);
  reel.rotation.x = Math.PI / 2;
  reel.position.y = 0.22;
  spool.add(reel);
  const wire = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 24), mat(0xc8ccd4, { metalness: 0.9, roughness: 0.25 }));
  wire.position.y = 0.22;
  spool.add(wire);

  const station = rbox(0.9, 0.5, 0.6, mat(0x1d2433, { metalness: 0.3 }));
  station.position.set(-1.15, 0.25, -0.95);
  station.rotation.y = 0.3;
  root.add(station);
  const display = painted(200, 90, 0.5, 0.22, (ctx, w, h, temp = 25) => {
    ctx.fillStyle = "#180808";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = temp > 300 ? "#ff6b4a" : "#ffb347";
    ctx.font = font(700, 54, true);
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(temp)}°`, w / 2, h / 2 + 19);
  });
  display.mesh.position.set(-0.1, 0.06, 0.305);
  station.add(display.mesh);
  const knob = cyl(0.08, 0.08, 0.08, mat(0x8a95a8, { metalness: 0.7 }), 14);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0.28, 0.06, 0.32);
  station.add(knob);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.85, 0.3, -0.75),
        new THREE.Vector3(0, 0.05, -1.1),
        new THREE.Vector3(1.2, 0.15, -0.95),
        new THREE.Vector3(1.85, 1.05, -0.7),
      ]),
      40,
      0.025,
      6,
    ),
    mat(0x1a1a1f),
  );
  root.add(cable);

  let shown = -1;
  return {
    play(k) {
      const temp = 25 + 325 * Math.min(1, k * 3);
      if (Math.round(temp) !== shown) {
        shown = Math.round(temp);
        display.redraw(temp);
      }
    },
    idle() {
      shown = -1;
      display.redraw(25);
    },
  };
}

export function clipboardDetails(root) {
  // Pen on the form and the PDA used in the 2010 census to collect the interviews.
  const pen = new THREE.Group();
  pen.position.set(0.55, 0.12, 0.7);
  pen.rotation.y = 0.6;
  root.add(pen);
  const barrel = cyl(0.04, 0.04, 0.9, mat(0x1f4f8f, { metalness: 0.3 }), 10);
  barrel.rotation.z = Math.PI / 2;
  pen.add(barrel);
  const capPen = cyl(0.045, 0.045, 0.25, mat(0xdfe5ee, { metalness: 0.6 }), 10);
  capPen.rotation.z = Math.PI / 2;
  capPen.position.x = 0.4;
  pen.add(capPen);

  const pda = new THREE.Group();
  pda.position.set(1.45, 0, 0.35);
  pda.rotation.y = -0.35;
  root.add(pda);
  const pdaBody = rbox(0.62, 0.1, 1.05, mat(0x2a2f3a, { metalness: 0.4, roughness: 0.35 }));
  pdaBody.position.y = 0.05;
  pda.add(pdaBody);
  const screen = painted(220, 280, 0.5, 0.64, (ctx, w, h, done = 6, house = 313) => {
    ctx.fillStyle = "#cfe0f2";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1f4f8f";
    ctx.fillRect(0, 0, w, 44);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(700, 22);
    ctx.fillText(tr("Censo 2010", "Census 2010"), 14, 30);
    ctx.fillStyle = "#1a2236";
    ctx.font = font(400, 18);
    ctx.fillText(`${tr("Domicílio", "Household")} ${house}`, 14, 78);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < done ? "#1f8f4f" : "#9fb0c8";
      ctx.fillRect(14, 100 + i * 26, 18, 18);
      ctx.fillStyle = "#4a5570";
      ctx.fillRect(40, 106 + i * 26, 120 + ((i * 37) % 40), 6);
    }
    ctx.fillStyle = "#1f8f4f";
    ctx.fillRect(14, h - 26, (w - 28) * (done / 6), 10);
  });
  flat(screen.mesh, 0.105);
  screen.mesh.position.z = -0.12;
  pda.add(screen.mesh);
  [-0.15, 0, 0.15].forEach((x) => {
    const b = cyl(0.045, 0.045, 0.03, mat(0x5c6475), 12);
    b.position.set(x, 0.11, 0.38);
    pda.add(b);
  });
  const stylus = cyl(0.015, 0.015, 0.8, mat(0xaab4c4, { metalness: 0.8 }), 6);
  stylus.rotation.z = Math.PI / 2;
  stylus.rotation.y = 0.2;
  stylus.position.set(0.05, 0.03, 0.75);
  pda.add(stylus);

  let shown = "";
  let house = 313;
  let counted = false;
  return {
    play(k) {
      const done = Math.min(6, Math.floor(k * 1.4 * 7));
      if (done === 6 && !counted) {
        house++;
        counted = true;
      }
      const key = `${done}|${house}`;
      if (key !== shown) {
        shown = key;
        screen.redraw(done, house);
      }
    },
    idle() {
      counted = false;
      shown = "";
      screen.redraw(6, house);
    },
  };
}

export function phoneDetails(root) {
  // Digits on the existing 4×3 keys (built in origins.js at the same positions).
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  digits.forEach((d, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const key = painted(64, 40, 0.18, 0.11, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#e6edf7";
      ctx.font = font(700, 30);
      ctx.textAlign = "center";
      ctx.fillText(d, w / 2, h / 2 + 11);
    });
    key.mesh.material.transparent = true;
    flat(key.mesh, 0.185);
    key.mesh.position.x = (c - 1) * 0.26;
    key.mesh.position.z = 0.2 + r * 0.19;
    root.add(key.mesh);
  });
  // Navigation ring, call and end keys, speaker slit and the little antenna stub.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 20), mat(0x8a95a8, { metalness: 0.7 }));
  flat(ring, 0.16).position.z = 0.0;
  root.add(ring);
  [
    [-0.32, 0x2bbf5a],
    [0.32, 0xd9383a],
  ].forEach(([x, c]) => {
    const k = rbox(0.18, 0.04, 0.1, mat(c));
    k.position.set(x, 0.16, 0);
    root.add(k);
  });
  const speaker = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.04), new THREE.MeshBasicMaterial({ color: 0x0b0d12 }));
  flat(speaker, 0.145).position.z = -0.85;
  root.add(speaker);
  const antenna = cyl(0.05, 0.06, 0.18, mat(0x1a1d24), 10);
  antenna.rotation.x = Math.PI / 2;
  antenna.position.set(0.3, 0.1, -1.02);
  root.add(antenna);
}

export function carDetails(root) {
  // Windows, headlights and a stretch of road under the miniature.
  const body = root.children[0];
  const cabin = root.children[1];
  [-1, 1].forEach((s) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.24), glass);
    w.position.set(0, 0.02, s * 0.405);
    if (s < 0) w.rotation.y = Math.PI;
    cabin.add(w);
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), glass);
  front.position.set(0.455, 0.02, 0);
  front.rotation.y = Math.PI / 2;
  cabin.add(front);
  const lightMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.warn, 2), toneMapped: false });
  [-0.28, 0.28].forEach((z) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.16), lightMat);
    l.position.set(0.86, 0.05, z);
    body.add(l);
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), mat(0x1b2a44, { roughness: 0.9 }));
  flat(road, 0.012);
  root.add(road);
  for (let x = -1.3; x <= 1.3; x += 0.65) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.04), new THREE.MeshBasicMaterial({ color: 0x5c6f91 }));
    flat(dash, 0.016).position.set(x, 0.016, 0.58);
    root.add(dash);
  }
}

export function diplomaDetails(root) {
  // A graduation cap next to the scroll, tassel included.
  const cap = new THREE.Group();
  cap.position.set(-0.75, 0, 0.75);
  cap.rotation.y = 0.6;
  root.add(cap);
  const black = mat(0x15171c, { roughness: 0.8 });
  const base = cyl(0.32, 0.34, 0.28, black, 24);
  base.position.y = 0.14;
  cap.add(base);
  const board = rbox(0.95, 0.05, 0.95, black, 0.02);
  board.position.y = 0.3;
  board.rotation.x = -0.08;
  cap.add(board);
  const button = cyl(0.04, 0.04, 0.03, mat(0xd4af37, { metalness: 0.8 }), 10);
  button.position.y = 0.34;
  cap.add(button);
  const cord = cyl(0.012, 0.012, 0.5, mat(0xd4af37), 6);
  cord.rotation.z = Math.PI / 2;
  cord.position.set(0.25, 0.335, 0);
  cap.add(cord);
  const tassel = cyl(0.03, 0.05, 0.22, mat(0xd4af37), 8);
  tassel.position.set(0.48, 0.22, 0);
  cap.add(tassel);
}

export function boardDetails(root) {
  // The whiteboard gets a grid, axes and a couple of handwritten formulas; a tray with markers below.
  const board = root.children[0];
  const surface = painted(680, 440, 3.3, 2.1, (ctx, w, h) => {
    ctx.fillStyle = "#d3d8e1";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#bfc6d2";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#2a3446";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(70, 380);
    ctx.lineTo(640, 380);
    ctx.moveTo(70, 380);
    ctx.lineTo(70, 150);
    ctx.stroke();
    ctx.fillStyle = "#1f4f8f";
    ctx.font = "italic 600 34px Georgia, serif";
    ctx.fillText("N(μ, σ²)", 40, 60);
    ctx.fillStyle = "#a3242e";
    ctx.font = "italic 400 28px Georgia, serif";
    ctx.fillText("x̄ = Σxᵢ / n", 430, 60);
    ctx.fillStyle = "#4a5570";
    ctx.font = "italic 400 24px Georgia, serif";
    ctx.fillText("μ", 352, 412);
    // Lit like the rest of the desk: an unlit white board would blow out in the bloom pass.
  }, { basic: false });
  surface.mesh.position.z = 0.045;
  board.add(surface.mesh);
  const tray = rbox(2.2, 0.06, 0.22, mat(0xaab4c4, { metalness: 0.6, roughness: 0.35 }));
  tray.position.set(0, -1.12, 0.12);
  board.add(tray);
  [0x1f4f8f, 0xa3242e, 0x1f8f4f].forEach((c, i) => {
    const marker = cyl(0.04, 0.04, 0.38, mat(c), 10);
    marker.rotation.z = Math.PI / 2;
    marker.position.set(-0.6 + i * 0.45, -1.06, 0.14);
    board.add(marker);
  });
  const eraser = rbox(0.4, 0.1, 0.16, mat(0x2a2f3a));
  eraser.position.set(0.85, -1.05, 0.14);
  board.add(eraser);
}

export function truckDetails(root) {
  const cab = root.children[0];
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.3), glass);
  windshield.position.set(0.405, 0.15, 0);
  windshield.rotation.y = Math.PI / 2;
  cab.add(windshield);
  const lightMat = new THREE.MeshBasicMaterial({ color: glow(COLORS.warn, 2), toneMapped: false });
  [-0.3, 0.3].forEach((z) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.16), lightMat);
    l.position.set(0.405, -0.2, z);
    cab.add(l);
  });
}

export function scaleDetails(root) {
  // A judge's gavel on its sound block, which strikes once the scale settles.
  const block = cyl(0.3, 0.32, 0.12, mat(0x5c3a1e, { roughness: 0.5 }), 24);
  block.position.set(1.05, 0.06, 0.75);
  root.add(block);
  const gavel = new THREE.Group();
  gavel.position.set(1.55, 0.1, 0.75);
  root.add(gavel);
  const handle = cyl(0.035, 0.04, 0.85, mat(0x6b4226), 10);
  handle.rotation.z = Math.PI / 2;
  handle.position.x = 0;
  gavel.add(handle);
  const head = cyl(0.11, 0.11, 0.42, mat(0x6b4226, { roughness: 0.45 }), 16);
  head.position.set(-0.45, 0.06, 0);
  gavel.add(head);
  [-0.2, 0.2].forEach((y) => {
    const band = cyl(0.115, 0.115, 0.03, mat(0xd4af37, { metalness: 0.8 }), 16);
    band.position.y = y;
    head.add(band);
  });
  return {
    play(k) {
      // Lift and strike: a quick tap near the end of the turn.
      const t = THREE.MathUtils.clamp((k - 0.6) / 0.25, 0, 1);
      gavel.rotation.z = -Math.sin(t * Math.PI) * 0.7;
    },
    idle() {
      gavel.rotation.z = 0;
    },
  };
}

export function radioDetails(root) {
  // Speaker grille, keypad and push-to-talk on the handheld; an Anatel mock exam sheet beside it.
  const body = root.children[0];
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x07080b });
  const hole = new THREE.CircleGeometry(0.022, 8);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const h = new THREE.Mesh(hole, holeMat);
      h.position.set(-0.2 + c * 0.1, -0.6 + r * 0.07, 0.193);
      body.add(h);
    }
  }
  const keyMat = mat(0x3a404c);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const k = rbox(0.12, 0.07, 0.03, keyMat, 0.01);
      k.position.set(-0.15 + c * 0.15, -0.1 - r * 0.1, 0.2);
      body.add(k);
    }
  }
  const ptt = rbox(0.06, 0.32, 0.18, mat(0x2b2f38), 0.025);
  ptt.position.set(-0.35, 0.2, 0);
  body.add(ptt);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 6, 16), mat(0x0b0d12));
  coil.rotation.x = Math.PI / 2;
  coil.position.set(0.18, 1.6, 0);
  root.add(coil);

  const sheet = painted(300, 400, 1, 1.33, (ctx, w, h) => {
    // Off-white on purpose: lit paper close to the lamp would otherwise blow out in the bloom.
    ctx.fillStyle = "#c9cfd9";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1a2236";
    ctx.font = font(700, 26);
    ctx.fillText(tr("Simulado", "Practice test"), 22, 44);
    ctx.font = font(400, 18);
    ctx.fillStyle = "#4a5570";
    ctx.fillText(tr("Radioamador · Anatel", "Ham radio · Anatel"), 22, 72);
    for (let q = 0; q < 8; q++) {
      const y = 112 + q * 34;
      ctx.fillStyle = "#4a5570";
      ctx.fillText(`${q + 1}.`, 22, y + 6);
      for (let o = 0; o < 4; o++) {
        ctx.beginPath();
        ctx.arc(80 + o * 50, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = "#7d8aa3";
        ctx.lineWidth = 2;
        ctx.stroke();
        if ((q * 3 + 1) % 4 === o) {
          ctx.fillStyle = "#1f4f8f";
          ctx.fill();
        }
      }
    }
  }, { basic: false });
  flat(sheet.mesh, 0.012);
  sheet.mesh.position.set(1.05, 0.012, 0.45);
  sheet.mesh.rotation.z = 0.35;
  root.add(sheet.mesh);
}

export function laptopDetails(root) {
  // Keyboard keys, trackpad and webcam on the laptop; a coffee mug beside it.
  const keys = root.children[1];
  const keyboard = painted(520, 220, 2.6, 1.1, (ctx, w, h) => {
    ctx.fillStyle = "#1c2029";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a404c";
    const rows = [13, 12, 11, 10];
    rows.forEach((n, r) => {
      const kw = (w - 20) / 13.5;
      const offset = 10 + r * kw * 0.25;
      for (let i = 0; i < n; i++) ctx.fillRect(offset + i * kw, 10 + r * 42, kw - 6, 34);
    });
    ctx.fillRect(10 + ((w - 20) / 13.5) * 3, 10 + 4 * 42, ((w - 20) / 13.5) * 6, 30);
  });
  flat(keyboard.mesh, 0.012);
  keys.add(keyboard.mesh);
  const pad = rbox(1, 0.012, 0.55, mat(0x737d90, { metalness: 0.5, roughness: 0.3 }), 0.004);
  pad.position.set(0, 0.105, 0.8);
  root.add(pad);
  const lid = root.children.find((c) => c.isGroup);
  const cam = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), new THREE.MeshBasicMaterial({ color: 0x050608 }));
  cam.position.set(0, 1.92, 0.006);
  lid?.add(cam);

  const mug = new THREE.Group();
  mug.position.set(2, 0, 0.75);
  root.add(mug);
  const cup = cyl(0.26, 0.22, 0.5, mat(0xd9dee8, { roughness: 0.35 }), 24);
  cup.position.y = 0.25;
  mug.add(cup);
  const coffee = cyl(0.24, 0.24, 0.01, mat(0x3b2416, { roughness: 0.2 }), 24);
  coffee.position.y = 0.47;
  mug.add(coffee);
  const handleRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 16, Math.PI * 1.2), mat(0xd9dee8, { roughness: 0.35 }));
  handleRing.position.set(0.26, 0.27, 0);
  handleRing.rotation.z = -Math.PI * 0.6;
  mug.add(handleRing);
  const steam = Array.from({ length: 3 }, (_, i) => {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xe6edf7, transparent: true, opacity: 0, depthWrite: false }),
    );
    s.userData.phase = i / 3;
    mug.add(s);
    return s;
  });
  return {
    play(k, dt, time) {
      steam.forEach((s) => {
        const p = (time * 0.4 + s.userData.phase) % 1;
        s.position.set(Math.sin(p * 7) * 0.06, 0.55 + p * 0.9, 0);
        s.scale.setScalar(0.6 + p * 1.6);
        s.material.opacity = (1 - p) * 0.25;
      });
    },
    idle() {
      steam.forEach((s) => (s.material.opacity = 0));
    },
  };
}

/** Wood grain on the desk top and an articulated lamp in the back corner. */
export function decorateDesk(top, group, deskW, deskD) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2a1f18";
  ctx.fillRect(0, 0, 1024, 1024);
  // Deterministic grain, so the desk looks the same on every visit.
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const y = rnd() * 1024;
    ctx.strokeStyle = `rgba(${rnd() > 0.5 ? "70,50,36" : "22,16,12"},${0.25 + rnd() * 0.35})`;
    ctx.lineWidth = 1 + rnd() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x / 140 + i) * 6 + (rnd() - 0.5) * 4);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  top.material.map = texture;
  top.material.color.set(0xffffff);
  top.material.needsUpdate = true;

  const lamp = new THREE.Group();
  lamp.position.set(-deskW / 2 + 0.9, 0, -deskD / 2 + 0.9);
  // The arm reaches toward the middle of the desk.
  lamp.rotation.y = -0.65;
  group.add(lamp);
  const metal = mat(0x4a5468, { metalness: 0.7, roughness: 0.35 });
  const base = cyl(0.45, 0.5, 0.12, metal, 24);
  base.position.y = 0.06;
  lamp.add(base);
  const lower = cyl(0.05, 0.05, 2, metal, 10);
  lower.position.set(0, 1, 0);
  lower.rotation.z = 0.25;
  lamp.add(lower);
  const upper = cyl(0.05, 0.05, 1.6, metal, 10);
  upper.position.set(0.55, 2.25, 0);
  upper.rotation.z = -1.05;
  lamp.add(upper);
  const head = cyl(0.12, 0.38, 0.45, metal, 20);
  head.position.set(1.3, 2.45, 0);
  head.rotation.z = 0.6;
  lamp.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: glow(0xffd9a0, 2), toneMapped: false }));
  bulb.position.set(1.36, 2.3, 0);
  lamp.add(bulb);
}
