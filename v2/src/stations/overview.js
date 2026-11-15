// Closing: no scene of its own, by choice (see AGENTS.md). The contact card is the whole ending; this station
// only rests the camera over the sea again, past the last island.
import * as THREE from "three";

export function createOverview() {
  return {
    id: "overview",
    group: new THREE.Group(),
    pickables: [],
    view: { pos: [0, 5, 30], target: [0, 8.5, 0], fogFar: 420 },
    update() {},
  };
}
