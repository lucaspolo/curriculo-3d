// Closing shot: no geometry of its own, just a camera that pulls back over the whole journey.
import * as THREE from "three";

export function createOverview() {
  return {
    id: "overview",
    group: new THREE.Group(),
    place: new THREE.Vector3(0, 0, 0),
    pickables: [],
    view: { pos: [-110, 95, 150], target: [300, -25, -30], fogFar: 700 },
    update() {},
  };
}
