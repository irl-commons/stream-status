// Runs the shared fixtures (fixtures/manifest.json) against this package and
// prints a conformance report on stdout. tools/conformance.py compares it
// with the other implementations' reports.
//
//   node dist/conformance/run.js [--root <repo>] [--quiet]
//
// Exits 1 when any case fails.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Reader, validate } from "../src/index.js";

/** What this package implements. The in-band form is specified but has no TypeScript consumer yet. */
export const CAPABILITIES = ["reader", "validate"] as const;

interface Manifest {
  format: string;
  v: number;
  suites: Record<string, { capability: string; files: string[] }>;
}

interface Result {
  result: "pass" | "fail" | "skip";
  observed?: unknown;
  why?: string[];
}

export function runCase(suite: string, testCase: Record<string, unknown>): { failures: string[]; observed: unknown } {
  const failures: string[] = [];
  if (suite === "valid" || suite === "invalid") {
    const errors = validate(testCase.snapshot);
    if (suite === "valid") {
      if (errors.length) failures.push(errors.join("; "));
      return { failures, observed: { valid: errors.length === 0 } };
    }
    const expected = testCase.error as string;
    const matched = errors.some((error) => error.includes(expected));
    if (!errors.length) failures.push("expected an error, got none");
    else if (!matched) failures.push(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(errors)}`);
    return { failures, observed: { valid: errors.length === 0, error_matched: matched } };
  }
  if (suite === "reader") {
    const reader = new Reader();
    const outcomes: string[] = [];
    const views: unknown[] = [];
    (testCase.steps as Record<string, unknown>[]).forEach((step, n) => {
      if ("receive" in step) {
        const outcome = reader.receive(step.receive, step.rx_ms as number);
        outcomes.push(outcome);
        if ("outcome" in step && outcome !== step.outcome) failures.push(`step ${n}: ${outcome} != ${String(step.outcome)}`);
      } else {
        const view = reader.view(step.at_ms as number) as unknown as Record<string, unknown>;
        views.push(view);
        for (const [key, expected] of Object.entries(step.expect as Record<string, unknown>)) {
          if (!isDeepStrictEqual(view[key], expected)) {
            failures.push(`step ${n}: ${key} = ${JSON.stringify(view[key])}, expected ${JSON.stringify(expected)}`);
          }
        }
      }
    });
    return { failures, observed: { outcomes, views } };
  }
  throw new Error(`no runner for suite ${suite}`);
}

export function report(root: string): { report: unknown; failed: number } {
  const fixtures = path.join(root, "fixtures");
  const manifest = JSON.parse(readFileSync(path.join(fixtures, "manifest.json"), "utf8")) as Manifest;
  if (manifest.format !== "stream-status-fixtures" || manifest.v !== 0) throw new Error("not a v0 fixture manifest");
  const results: Record<string, Result> = {};
  let failed = 0;
  for (const [suite, entry] of Object.entries(manifest.suites)) {
    for (const file of entry.files) {
      if (!(CAPABILITIES as readonly string[]).includes(entry.capability)) {
        results[file] = { result: "skip" };
        continue;
      }
      const testCase = JSON.parse(readFileSync(path.join(fixtures, file), "utf8")) as Record<string, unknown>;
      const { failures, observed } = runCase(suite, testCase);
      results[file] = failures.length ? { result: "fail", observed, why: failures } : { result: "pass", observed };
      if (failures.length) failed += 1;
    }
  }
  return {
    report: {
      format: "stream-status-conformance-report",
      v: 0,
      implementation: "typescript",
      capabilities: [...CAPABILITIES],
      results,
    },
    failed,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--root");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = at >= 0 ? path.resolve(args[at + 1]!) : path.resolve(here, "../../../..");
  const { report: out, failed } = report(root);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  if (failed) {
    process.stderr.write(`${failed} fixtures failed\n`);
    process.exitCode = 1;
  }
}
