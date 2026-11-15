import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidSnapshot, parseTime, schema, validate } from "../src/index.js";
import { SchemaChecker, isDateTime } from "../src/schema-check.js";
import { fixture } from "./helpers.js";

const base = () => structuredClone(fixture("valid/03-camera-lost-and-silence.json").snapshot);

test("a valid snapshot has no errors", () => {
  assert.deepEqual(validate(base()), []);
  assert.equal(isValidSnapshot(base()), true);
});

test("schema errors name the path", () => {
  const snapshot = base();
  snapshot.valid_for_ms = 10;
  assert.deepEqual(validate(snapshot), ["schema: valid_for_ms: 10 is less than the minimum of 1000"]);
});

test("the checker refuses keywords it doesn't implement", () => {
  assert.doesNotThrow(() => new SchemaChecker(schema));
  assert.throws(() => new SchemaChecker({ type: "object", minProperties: 1 }), /unsupported keyword minProperties/);
  assert.throws(() => new SchemaChecker({ type: "string", format: "uri" }), /unsupported format/);
});

test("date-times follow the calendar", () => {
  assert.equal(isDateTime("2028-02-29T00:00:00Z"), true);
  assert.equal(isDateTime("2026-02-29T00:00:00Z"), false);
  assert.equal(isDateTime("2026-13-01T00:00:00Z"), false);
  assert.equal(isDateTime("2026-11-14T24:00:00Z"), false);
  assert.equal(isDateTime("2026-11-14T23:59:60Z"), false);
  assert.equal(isDateTime("2026-11-14T21:03:05.123456789+01:00"), true);
  const snapshot = base();
  snapshot.generated = "2026-11-31T21:03:05Z";
  assert.match(validate(snapshot).join("\n"), /generated: '2026-11-31T21:03:05Z' is not a 'date-time'/);
});

test("lengths count characters, not UTF-16 units", () => {
  const snapshot = base();
  snapshot.findings[0].summary = "🎥".repeat(160);
  assert.deepEqual(validate(snapshot), []);
  snapshot.findings[0].summary = "🎥".repeat(161);
  assert.match(validate(snapshot).join("\n"), /summary: .* is too long/);
});

test("times compare across offsets", () => {
  assert.equal(parseTime("2026-11-14T22:03:05+01:00"), parseTime("2026-11-14T21:03:05Z"));
  assert.equal(parseTime("2026-11-14T21:03:05.120Z") - parseTime("2026-11-14T21:03:05Z"), 120);
  const snapshot = base();
  snapshot.findings[0].since = "2026-11-14T22:03:06+01:00";
  assert.deepEqual(validate(snapshot), ["findings/0: since is later than generated"]);
});

test("owner-prefixed codes and evidence pass without the registry", () => {
  const snapshot = base();
  snapshot.findings[0] = {
    code: "x_acme.relay.backlog",
    subject: { kind: "relay", id: "edge1" },
    status: "active",
    severity: "warning",
    since: snapshot.generated,
    still_live: true,
    evidence: [{ key: "x_acme.relay.queue", value: 3, unit: "count" }],
  };
  snapshot.checked = [];
  assert.deepEqual(validate(snapshot), []);
  snapshot.findings[0].evidence[0].unit = "frames";
  assert.deepEqual(validate(snapshot), ["findings/0/evidence/0: unit 'frames' is not a registered unit"]);
});
