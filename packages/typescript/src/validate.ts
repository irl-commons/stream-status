// Sender-side validation (spec section 8): the JSON Schema plus the checks it
// can't express. Same rules and error wording as tools/stream_status.py.
import { REGISTRY, UNITS } from "./generated/codes.js";
import { schema } from "./generated/schema.js";
import type { Evidence, Snapshot } from "./generated/types.js";
import { SchemaChecker } from "./schema-check.js";

/** A cleared finding must be gone 10 minutes after its `since` (spec 3.5). */
const CLEARED_KEEP_MAX_MS = 600_000;

type RegistryEntry = (typeof REGISTRY)[keyof typeof REGISTRY];

let checker: SchemaChecker | undefined;

/** Schema errors only, as `schema: <path>: <message>`. */
export function schemaErrors(value: unknown): string[] {
  checker ??= new SchemaChecker(schema);
  return checker
    .errors(value)
    .sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")))
    .map((error) => `schema: ${error.path.join("/") || "(root)"}: ${error.message}`);
}

/**
 * Every problem with a snapshot, or an empty list when a sender may publish
 * it. Checks the schema first; the other rules run only on a schema-valid
 * snapshot.
 */
export function validate(value: unknown): string[] {
  const errors = schemaErrors(value);
  if (errors.length) return errors;
  return semanticErrors(value as Snapshot);
}

/** True when `value` is a snapshot a sender may publish. */
export function isValidSnapshot(value: unknown): value is Snapshot {
  return validate(value).length === 0;
}

/** Milliseconds since the epoch for an RFC 3339 date-time. */
export function parseTime(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (!m) throw new Error(`not a date-time: ${text}`);
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as number[];
  let ms = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  if (m[7]) ms += Number(m[7]) * 1000;
  if (m[8]) ms -= (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10])) * 60_000;
  return ms;
}

function registryEntry(code: string): RegistryEntry | undefined {
  return Object.hasOwn(REGISTRY, code) ? REGISTRY[code as keyof typeof REGISTRY] : undefined;
}

function semanticErrors(snapshot: Snapshot): string[] {
  const errors: string[] = [];
  const generated = parseTime(snapshot.generated);
  const identities = new Set<string>();
  const activeSubjects = new Set<string>();

  snapshot.findings.forEach((finding, index) => {
    const where = `findings/${index}`;
    const { code, subject } = finding;
    const identity = JSON.stringify([code, subject.kind, subject.id]);
    if (identities.has(identity)) {
      errors.push(`${where}: duplicate identity (${code}, ${subject.kind}, ${subject.id})`);
    }
    identities.add(identity);
    if (finding.status === "active") activeSubjects.add(JSON.stringify([subject.kind, subject.id]));

    const entry = registryEntry(code);
    if (entry === undefined && !code.startsWith("x_")) {
      errors.push(`${where}: code '${code}' is not in the v0 registry`);
    }
    if (entry !== undefined && !(entry.subject_kinds as readonly string[]).includes(subject.kind)) {
      errors.push(`${where}: subject kind '${subject.kind}' is not allowed for ${code}`);
    }

    const since = parseTime(finding.since);
    if (since > generated) errors.push(`${where}: since is later than generated`);
    if (finding.as_of !== undefined && parseTime(finding.as_of) > generated) {
      errors.push(`${where}: as_of is later than generated`);
    }
    if (finding.status === "cleared" && generated - since > CLEARED_KEEP_MAX_MS) {
      errors.push(`${where}: cleared more than 10 minutes ago; remove it`);
    }
    if (snapshot.live.state === "not_live" && finding.still_live === true) {
      errors.push(`${where}: still_live is true while live.state is not_live`);
    }
    (finding.evidence ?? []).forEach((item, i) => {
      const problem = evidenceError(item, entry);
      if (problem) errors.push(`${where}/evidence/${i}: ${problem}`);
    });
  });

  const seen = new Set<string>();
  snapshot.checked.forEach((check, index) => {
    const subject = JSON.stringify([check.subject.kind, check.subject.id]);
    const name = `(${check.subject.kind}, ${check.subject.id})`;
    if (seen.has(subject)) errors.push(`checked/${index}: subject ${name} listed twice`);
    seen.add(subject);
    if (activeSubjects.has(subject) && check.state !== "finding") {
      errors.push(`checked/${index}: subject ${name} has an active finding but is listed as '${check.state}'`);
    }
    if (check.as_of !== null && parseTime(check.as_of) > generated) {
      errors.push(`checked/${index}: as_of is later than generated`);
    }
  });
  return errors;
}

function evidenceError(item: Evidence, entry: RegistryEntry | undefined): string | undefined {
  const { key, value, unit } = item;
  if (key.startsWith("x_")) {
    if (unit !== undefined && !(UNITS as readonly string[]).includes(unit)) {
      return `unit '${unit}' is not a registered unit`;
    }
    return undefined;
  }
  if (entry === undefined) return `'${key}' needs an x_<owner>. prefix on an unregistered code`;
  const evidence = entry.evidence as Record<string, { unit?: string; values?: readonly string[] }>;
  const spec = Object.hasOwn(evidence, key) ? evidence[key] : undefined;
  if (spec === undefined) return `evidence key '${key}' is not registered for ${entry.code}`;
  if (spec.unit !== undefined) {
    if (typeof value !== "number") return `${key} needs a number`;
    if (unit !== spec.unit) return `${key} needs unit '${spec.unit}', got ${unit === undefined ? "no unit" : `'${unit}'`}`;
  }
  if (spec.values !== undefined) {
    if (typeof value !== "string" || !spec.values.includes(value)) {
      return `${key} value ${JSON.stringify(value)} is not one of ${JSON.stringify(spec.values)}`;
    }
    if (unit !== undefined) return `${key} takes no unit`;
  }
  return undefined;
}
