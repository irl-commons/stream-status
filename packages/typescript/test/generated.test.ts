import assert from "node:assert/strict";
import { test } from "node:test";
import { AREAS, CODES, REGISTRY, UNITS, schema } from "../src/index.js";
import { readJson } from "./helpers.js";

test("the embedded schema is the published one", () => {
  assert.deepEqual(schema, readJson("schema/stream-status.v0.schema.json"));
});

test("the code constants are the registry", () => {
  const registry = readJson("codes/v0.json");
  assert.deepEqual([...AREAS], registry.areas);
  assert.deepEqual([...UNITS], registry.units);
  assert.deepEqual(Object.values(REGISTRY), registry.codes);
  assert.deepEqual(Object.values(CODES), registry.codes.map((entry: { code: string }) => entry.code));
  assert.equal(CODES.CAPTURE_SIGNAL_LOST, "capture.signal_lost");
  assert.equal(REGISTRY[CODES.CAPTURE_SIGNAL_LOST].severity, "critical");
});
