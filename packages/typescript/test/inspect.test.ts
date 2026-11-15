import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { duration, inspect, summarize } from "../src/inspect.js";
import { ROOT, fixture } from "./helpers.js";

const dir = mkdtempSync(path.join(tmpdir(), "stream-status-"));
after(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, content: unknown): string {
  const target = path.join(dir, name);
  writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  return target;
}

async function run(where: string): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const code = await inspect(where, (line) => lines.push(line));
  return { code, lines };
}

test("summarizes a valid snapshot", async () => {
  const { code, lines } = await run(file("camera.json", fixture("valid/03-camera-lost-and-silence.json").snapshot));
  assert.equal(code, 0);
  assert.deepEqual(lines, [
    "valid snapshot from k3v9q2x7m1 (boot 7c1e04a2, seq 812)",
    "2 findings: camera feed stopped (capture:hdmi, critical, since 10 s), no sound in the stream (audio:program, warning, since 13 s)",
    "checked: 1 with a finding",
    "still live: yes",
    "fresh: yes, for 12 s after it was read",
  ]);
});

test("says when nothing is wrong and what it can't see", () => {
  const lines = summarize(fixture("valid/01-nothing-wrong.json").snapshot);
  assert.equal(lines[1], "no findings");
  const unknown = summarize(fixture("valid/06-power-board-unknown.json").snapshot);
  assert.match(unknown[1]!, /can't be checked right now/);
});

test("every docs example reads cleanly, and a sender's own summary is quoted as sent", async () => {
  const examples = readdirSync(path.join(ROOT, "docs/examples")).filter((name) => name.endsWith(".json"));
  assert.ok(examples.length > 0);
  for (const name of examples) {
    const { code } = await run(path.join(ROOT, "docs/examples", name));
    assert.equal(code, 0, name);
  }
  const own = await run(path.join(ROOT, "docs/examples/5-own-code.json"));
  assert.match(own.lines[1]!, /^1 finding: "The relay is 1\.8 s behind\. The stream is still live\." \(relay:edge1, warning/);
});

test("exits 1 with the problems when invalid", async () => {
  const { code, lines } = await run(file("bad.json", fixture("invalid/10-still-live-while-not-live.json").snapshot));
  assert.equal(code, 1);
  assert.equal(lines[0], "invalid: 1 problem");
  assert.match(lines[1]!, /still_live is true while live.state is not_live/);
});

test("exits 1 on text that isn't JSON, 2 on a missing file", async () => {
  assert.equal((await run(file("text.json", "{nope"))).code, 1);
  assert.equal((await run(path.join(dir, "missing.json"))).code, 2);
});

test("reads a snapshot from a URL", async () => {
  const body = JSON.stringify(fixture("valid/02-idle-link.json").snapshot);
  const server = createServer((req, res) => {
    if (req.url === "/status") res.writeHead(200, { "content-type": "application/json" }).end(body);
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const ok = await run(`http://127.0.0.1:${port}/status`);
    assert.equal(ok.code, 0);
    assert.match(ok.lines[1]!, /^1 finding: connected, carrying almost nothing \(link:wwan1, info/);
    const missing = await run(`http://127.0.0.1:${port}/other`);
    assert.equal(missing.code, 2);
    assert.match(missing.lines[0]!, /HTTP 404/);
  } finally {
    server.close();
  }
});

test("durations stay short", () => {
  assert.equal(duration(12_400), "12 s");
  assert.equal(duration(240_000), "4 min");
  assert.equal(duration(7_200_000), "2 h");
});
