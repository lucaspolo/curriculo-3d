// Trust & Privacy scene. Foreground: a readable (and entirely fictional) court filing, the Creature suing
// Dr. Victor Frankenstein for child support, goes through classification, NER, LLM disambiguation and
// anonymization. Background: the same pipeline at scale (privacy-cascade.js).
import * as THREE from "three";
import { COLORS, glow, label } from "../lib/kit.js";
import { createCascade } from "./privacy-cascade.js";
import { createFiling } from "./privacy-filing.js";
import { PAGE_W, PAGE_H } from "./privacy-page.js";

const PAGE_POS = new THREE.Vector3(-3.4, 4.6, 0);

export function createPrivacy() {
  const group = new THREE.Group();
  const pickables = [];
  const cascade = createCascade(group, pickables);

  // The LLM beside the page, in the page's coordinates
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 16),
    new THREE.MeshStandardMaterial({ color: COLORS.llm, emissive: COLORS.llm, emissiveIntensity: 0.6, roughness: 0.4 }),
  );
  orb.add(
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({ color: glow(COLORS.llm, 1.2), wireframe: true, toneMapped: false }),
    ),
  );
  orb.position.set(PAGE_W / 2 + 1.4, PAGE_H / 2 - 0.8, 0.4);
  const orbLabel = label("LLM");
  orbLabel.position.set(0, 0.75, 0);
  orb.add(orbLabel);
  const filing = createFiling({ group, pickables, at: PAGE_POS, cascade, orb, bright: glow });

  return {
    id: "privacy",
    group,
    pickables,
    view: {
      pos: [3.2, 5.2, 18.5],
      target: [3.2, 4.4, -2.5],
      fogFar: 90,
      // On phones the page is the story; frame it and let the cascade peek in from the side.
      narrow: { pos: [-1.6, 5, 15], target: [-1.6, 4.5, -2.5] },
    },
    actions: { compare: filing.compare },
    update(dt, time, focus) {
      cascade.update(dt, time, focus);
      orb.rotation.y += dt;
      filing.update(dt, time, focus);
    },
  };
}
