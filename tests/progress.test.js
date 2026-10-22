import { test } from "node:test";
import assert from "node:assert/strict";
import { stationProgress, travel, focusOf, smootherstep } from "../src/lib/progress.js";

const centers = [500, 1500, 2500, 3500];

test("progress is clamped to the first and last station", () => {
  assert.equal(stationProgress(centers, 0), 0);
  assert.equal(stationProgress(centers, 9999), 3);
});

test("progress interpolates between section centers", () => {
  assert.equal(stationProgress(centers, 1500), 1);
  assert.equal(stationProgress(centers, 2000), 1.5);
  assert.equal(stationProgress([0, 100, 400], 250), 1.5);
});

test("progress handles an empty page", () => {
  assert.equal(stationProgress([], 100), 0);
});

test("travel holds the camera near each section and moves in between", () => {
  assert.equal(travel(1.1).t, 0);
  assert.equal(travel(1.9).t, 1);
  assert.equal(travel(1.5).t, 0.5);
  assert.deepEqual([travel(1.5).from, travel(1.5).to], [1, 2]);
});

test("smootherstep is monotonic and bounded", () => {
  let prev = -1;
  for (let x = -0.5; x <= 1.5; x += 0.05) {
    const y = smootherstep(x);
    assert.ok(y >= prev && y >= 0 && y <= 1);
    prev = y;
  }
});

test("focus fades out one station away", () => {
  assert.equal(focusOf(2, 2), 1);
  assert.equal(focusOf(2.5, 2), 0.5);
  assert.equal(focusOf(4, 2), 0);
});
