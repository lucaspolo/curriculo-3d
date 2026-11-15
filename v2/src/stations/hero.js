// Opening: no scene of its own, by choice (see AGENTS.md). The card is the whole opening; this station only
// rests the camera over the sea, looking at the horizon and the sun.
import * as THREE from "three";

export function createHero() {
  return {
    id: "hero",
    group: new THREE.Group(),
    pickables: [],
    view: { pos: [0, 5, 30], target: [0, 8.5, 0], fogFar: 420 },
    update() {},
  };
}
