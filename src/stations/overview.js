// Closing: no scene of its own, by choice. The contact card is the whole ending; this station only gives
// the camera a calm resting place over the shared starfield, past the last scene.
import * as THREE from "three";

export function createOverview() {
  return {
    id: "overview",
    group: new THREE.Group(),
    pickables: [],
    view: { pos: [0, 2, 24], target: [0, 1, 0], fogFar: 90 },
    update() {},
  };
}
