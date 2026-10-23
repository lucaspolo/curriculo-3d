// Opening: no scene of its own, by choice. The card (name, summary and contact) is the whole opening;
// this station only gives the camera a resting place over the shared starfield before the journey starts.
import * as THREE from "three";

export function createHero() {
  return {
    id: "hero",
    group: new THREE.Group(),
    pickables: [],
    view: { pos: [0, 2, 24], target: [0, 1, 0], fogFar: 90 },
    update() {},
  };
}
