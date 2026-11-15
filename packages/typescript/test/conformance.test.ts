import assert from "node:assert/strict";
import { test } from "node:test";
import { report } from "../conformance/run.js";
import { ROOT } from "./helpers.js";

test("every shared fixture this package supports passes", () => {
  const { report: out, failed } = report(ROOT);
  const results = (out as { results: Record<string, { result: string; why?: string[] }> }).results;
  const failures = Object.entries(results).filter(([, r]) => r.result === "fail");
  assert.deepEqual(failures, []);
  assert.equal(failed, 0);
  const ran = Object.values(results).filter((r) => r.result === "pass").length;
  assert.ok(ran >= 37, `ran ${ran} cases`);
});

test("only the in-band cases are skipped", () => {
  const { report: out } = report(ROOT);
  const results = (out as { results: Record<string, { result: string }> }).results;
  const skipped = Object.entries(results).filter(([, r]) => r.result === "skip").map(([name]) => name);
  assert.ok(skipped.length > 0);
  assert.ok(skipped.every((name) => name.startsWith("in-band/")), skipped.join(", "));
});
