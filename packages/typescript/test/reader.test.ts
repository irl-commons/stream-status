import assert from "node:assert/strict";
import { test } from "node:test";
import { Reader } from "../src/index.js";
import { fixture } from "./helpers.js";

const snapshot = () => structuredClone(fixture("valid/03-camera-lost-and-silence.json").snapshot);

test("a fresh snapshot reads as sent, then goes unknown when stale", () => {
  const reader = new Reader();
  assert.equal(reader.receive(snapshot(), 1000), "accepted");
  const fresh = reader.view(1000 + 11_999);
  assert.equal(fresh.fresh, true);
  assert.equal(fresh.live, "live");
  assert.deepEqual(fresh.findings.map((f) => [f.code, f.status, f.severity]), [
    ["capture.signal_lost", "active", "critical"],
    ["audio.silent", "active", "warning"],
  ]);
  const stale = reader.view(1000 + 12_000);
  assert.equal(stale.fresh, false);
  assert.equal(stale.live, "unknown");
  assert.ok(stale.findings.every((f) => f.status === "unknown"));
  assert.ok(stale.checked.every((c) => c.state === "unknown"));
});

test("freshness ignores the sender's clock", () => {
  const reader = new Reader();
  const old = snapshot();
  old.generated = "2001-01-01T00:00:00Z";
  for (const f of old.findings) f.since = old.generated;
  reader.receive(old, 0);
  assert.equal(reader.view(5000).fresh, true);
});

test("the default clock is monotonic and needs no arguments", () => {
  const reader = new Reader();
  assert.equal(reader.receive(JSON.stringify(snapshot())), "accepted");
  assert.equal(reader.view().fresh, true);
});

test("senders are kept apart, and latest() returns what arrived", () => {
  const reader = new Reader();
  const a = snapshot();
  const b = snapshot();
  b.source.id = "otherbox";
  b.findings = [];
  b.checked = [];
  reader.receive(a, 0);
  reader.receive(b, 0);
  assert.equal(reader.view(1).findings.length, 0);
  assert.equal(reader.view(1, a.source.id).findings.length, 2);
  assert.equal(reader.latest(a.source.id)?.source.id, a.source.id);
  assert.equal(reader.view(1, "nobody").fresh, false);
});

test("out-of-order and restarted snapshots", () => {
  const reader = new Reader();
  const first = snapshot();
  reader.receive(first, 0);
  assert.equal(reader.receive(first, 10), "ignored");
  const later = snapshot();
  later.source.seq += 3;
  assert.equal(reader.receive(later, 20), "accepted");
  const restarted = snapshot();
  restarted.source.boot = "newboot1";
  restarted.source.seq = 0;
  assert.equal(reader.receive(restarted, 30), "accepted");
  const view = reader.view(40);
  assert.equal(view.ignored, 1);
  assert.equal(view.missed, 2);
  assert.equal(view.restarts, 1);
});

test("anything that isn't a v0 snapshot is rejected", () => {
  const reader = new Reader();
  for (const message of ["{", null, [], 7, { format: "stream-status", v: 1 }]) {
    assert.equal(reader.receive(message, 0), "rejected");
  }
  const short = snapshot();
  short.valid_for_ms = 999;
  assert.equal(reader.receive(short, 0), "rejected");
  assert.equal(reader.view(0).rejected, 6);
});
