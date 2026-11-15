// What `stream-status inspect` does, kept apart from the command line so it
// can be tested and reused.
import { readFile } from "node:fs/promises";
import type { Snapshot } from "./generated/types.js";
import { Reader } from "./reader.js";
import { parseTime, validate } from "./validate.js";

export async function readSource(where: string): Promise<string> {
  if (where === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }
  if (/^https?:\/\//i.test(where)) {
    const response = await fetch(where, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${where}`);
    return await response.text();
  }
  return await readFile(where, "utf8");
}

/** "12 s", "4 min", "2 h". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

/** "Camera feed stopped" reads as "camera feed stopped"; "HDMI …" stays. */
function lowerFirst(text: string): string {
  return /^[A-Z][A-Z]/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/** The lines `inspect` prints for a valid snapshot, as received now. */
export function summarize(snapshot: Snapshot): string[] {
  const reader = new Reader();
  reader.receive(snapshot, 0);
  const view = reader.view(0);
  const generated = parseTime(snapshot.generated);

  const findings = view.findings.map((seen, i) => {
    const finding = snapshot.findings[i]!;
    const age = duration(generated - parseTime(finding.since));
    const when =
      seen.status === "cleared" ? `cleared ${age} ago` : seen.status === "unknown" ? `can't be checked right now, since ${age}` : `since ${age}`;
    // Registry names read as part of the sentence; a sender's own words are quoted as sent.
    const text = seen.known ? lowerFirst(seen.text) : `"${seen.text}"`;
    return `${text} (${seen.kind}:${seen.id}, ${seen.severity}, ${when})`;
  });
  const count = findings.length;
  const findingLine =
    count === 0 ? "no findings" : `${count} finding${count === 1 ? "" : "s"}: ${findings.join(", ")}`;

  const tally = new Map<string, string[]>();
  for (const check of view.checked) {
    const list = tally.get(check.state) ?? [];
    list.push(`${check.kind}:${check.id}`);
    tally.set(check.state, list);
  }
  const parts = ["fine", "finding", "unknown"]
    .filter((state) => tally.has(state))
    .map((state) => {
      const names = tally.get(state)!;
      if (state === "unknown") return `${names.length} unknown (${names.join(", ")})`;
      return state === "finding" ? `${names.length} with a finding` : `${names.length} fine`;
    });
  const checkedLine = parts.length ? `checked: ${parts.join(", ")}` : "checked: nothing listed";

  const live = { live: "yes", not_live: "no, no stream is running", unknown: "unknown" }[view.live];
  const { id, boot, seq } = snapshot.source;
  return [
    `valid snapshot from ${id} (boot ${boot}, seq ${seq})`,
    findingLine,
    checkedLine,
    `still live: ${live}`,
    `fresh: yes, for ${duration(snapshot.valid_for_ms)} after it was read`,
  ];
}

export async function inspect(where: string, out: (line: string) => void = console.log): Promise<number> {
  let text: string;
  try {
    text = await readSource(where);
  } catch (error) {
    out(`can't read ${where}: ${(error as Error).message}`);
    return 2;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    out(`invalid: not JSON (${(error as Error).message})`);
    return 1;
  }
  const errors = validate(value);
  if (errors.length) {
    out(`invalid: ${errors.length} problem${errors.length === 1 ? "" : "s"}`);
    for (const error of errors) out(`  ${error}`);
    return 1;
  }
  for (const line of summarize(value as Snapshot)) out(line);
  return 0;
}
