// A reader that applies the spec's reader rules (section 4). It never shows a
// better picture than the truth: freshness runs on the reader's own clock,
// unknown values read as unknown or warning, and unreadable findings are kept.
// Same behaviour as the reference reader in tools/stream_status.py.
import { REGISTRY } from "./generated/codes.js";
import type { Snapshot } from "./generated/types.js";
import { isObject } from "./schema-check.js";

export type Severity = "info" | "warning" | "critical";
export type FindingStatus = "active" | "cleared" | "unknown";
export type LiveState = "live" | "not_live" | "unknown";
export type CheckState = "fine" | "finding" | "unknown";
export type Outcome = "accepted" | "ignored" | "rejected";

const SEVERITIES: readonly string[] = ["info", "warning", "critical"];
const STATUSES: readonly string[] = ["active", "cleared", "unknown"];
const LIVE_STATES: readonly string[] = ["live", "not_live", "unknown"];
const CHECK_STATES: readonly string[] = ["fine", "finding", "unknown"];
const REQUIRED = ["code", "subject", "status", "severity", "since", "still_live"];

/** One finding as a reader should show it. */
export interface FindingView {
  code: string | null;
  kind: unknown;
  id: unknown;
  /** `unknown` when the snapshot is stale, the value is unknown, or the finding is unreadable. */
  status: FindingStatus;
  /** An unknown severity reads as `warning`. */
  severity: Severity;
  /** Whether the code is in the registry. Absent for an unreadable finding. */
  known?: boolean;
  /** The registry's plain name, else the sender's summary, else "<severity> on <kind>:<id>". "unreadable" when a required field is missing. */
  text: string;
}

export interface CheckView {
  kind: unknown;
  id: unknown;
  /** `unknown` when the snapshot is stale. */
  state: CheckState;
}

/** What a reader shows for one sender at one moment. */
export interface View {
  /** The last accepted snapshot is still within its `valid_for_ms`. */
  fresh: boolean;
  /** `unknown` when stale. */
  live: LiveState;
  findings: FindingView[];
  checked: CheckView[];
  /** Messages rejected so far (not JSON, wrong format, unsupported version). */
  rejected: number;
  /** Snapshots ignored because they were out of order. */
  ignored: number;
  /** Times the sender restarted (a new `boot`). Absent before the first snapshot. */
  restarts?: number;
  /** Snapshots missed, counted from gaps in `seq`. */
  missed?: number;
  /** The `seq` of the snapshot in view. */
  seq?: number;
}

interface SenderState {
  boot: string;
  seq: number;
  rxMs: number;
  validForMs: number;
  snapshot: Record<string, unknown>;
  restarts: number;
  missed: number;
}

/** Milliseconds on a monotonic clock, the default for `receive` and `view`. */
export function monotonicMs(): number {
  return performance.now();
}

/**
 * Holds the latest accepted snapshot per sender. Pass your own clock values
 * (milliseconds, monotonic) to `receive` and `view`, or leave them out to use
 * `performance.now()`. Never pass wall-clock time from the snapshot.
 */
export class Reader {
  private readonly senders = new Map<string, SenderState>();
  private rejected = 0;
  private ignored = 0;
  private lastId: string | undefined;

  /** Take one message: a parsed object or the raw JSON text. */
  receive(message: unknown, rxMs: number = monotonicMs()): Outcome {
    if (typeof message === "string") {
      try {
        message = JSON.parse(message);
      } catch {
        this.rejected += 1;
        return "rejected";
      }
    }
    if (!acceptable(message)) {
      this.rejected += 1;
      return "rejected";
    }
    const source = message.source as { id: string; boot: string; seq: number };
    let state = this.senders.get(source.id);
    if (state !== undefined && state.boot === source.boot) {
      if (source.seq <= state.seq) {
        this.ignored += 1;
        return "ignored";
      }
      state.missed += source.seq - state.seq - 1;
    } else if (state !== undefined) {
      state.restarts += 1;
    }
    if (state === undefined) {
      state = { boot: "", seq: 0, rxMs: 0, validForMs: 0, snapshot: {}, restarts: 0, missed: 0 };
      this.senders.set(source.id, state);
    }
    state.boot = source.boot;
    state.seq = source.seq;
    state.rxMs = rxMs;
    state.validForMs = message.valid_for_ms as number;
    state.snapshot = message;
    this.lastId = source.id;
    return "accepted";
  }

  /** The view of one sender (by default the last one heard) at `atMs`. */
  view(atMs: number = monotonicMs(), sourceId?: string): View {
    const id = sourceId ?? this.lastId;
    const state = id === undefined ? undefined : this.senders.get(id);
    if (state === undefined) {
      return { fresh: false, live: "unknown", findings: [], checked: [], rejected: this.rejected, ignored: this.ignored };
    }
    const fresh = atMs < state.rxMs + state.validForMs;
    const snapshot = state.snapshot;
    const live = isObject(snapshot.live) ? snapshot.live : {};
    const liveState = pick(live.state, LIVE_STATES, "unknown") as LiveState;
    const findings = (snapshot.findings as unknown[]).map((item) => readFinding(item, fresh));
    const checked: CheckView[] = [];
    const items = Array.isArray(snapshot.checked) ? snapshot.checked : [];
    for (const item of items) {
      if (!isObject(item) || !isObject(item.subject)) continue;
      const value = pick(item.state, CHECK_STATES, "unknown") as CheckState;
      checked.push({ kind: get(item.subject, "kind"), id: get(item.subject, "id"), state: fresh ? value : "unknown" });
    }
    return {
      fresh,
      live: fresh ? liveState : "unknown",
      restarts: state.restarts,
      missed: state.missed,
      seq: state.seq,
      rejected: this.rejected,
      ignored: this.ignored,
      findings,
      checked,
    };
  }

  /** The last accepted snapshot of a sender (by default the last one heard), as received. */
  latest(sourceId?: string): Snapshot | undefined {
    const id = sourceId ?? this.lastId;
    return id === undefined ? undefined : (this.senders.get(id)?.snapshot as Snapshot | undefined);
  }
}

function acceptable(message: unknown): message is Record<string, unknown> {
  if (!isObject(message)) return false;
  if (message.format !== "stream-status" || message.v !== 0) return false;
  const source = message.source;
  if (!isObject(source)) return false;
  if (typeof source.id !== "string" || typeof source.boot !== "string") return false;
  if (!isCount(source.seq)) return false;
  if (!isCount(message.valid_for_ms) || message.valid_for_ms < 1000) return false;
  return Array.isArray(message.findings);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function pick(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function get(object: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : null;
}

function readFinding(item: unknown, fresh: boolean): FindingView {
  if (!isObject(item)) {
    return { code: null, kind: null, id: null, status: "unknown", severity: "warning", text: "unreadable" };
  }
  const subject = isObject(item.subject) ? item.subject : {};
  const code = typeof item.code === "string" ? item.code : null;
  const kind = get(subject, "kind");
  const id = get(subject, "id");
  if (REQUIRED.some((key) => !Object.hasOwn(item, key)) || code === null || Object.keys(subject).length === 0) {
    return { code, kind, id, status: "unknown", severity: "warning", text: "unreadable" };
  }
  const status = pick(item.status, STATUSES, "unknown") as FindingStatus;
  const severity = pick(item.severity, SEVERITIES, "warning") as Severity;
  const entry = Object.hasOwn(REGISTRY, code) ? REGISTRY[code as keyof typeof REGISTRY] : undefined;
  let text: string;
  if (entry !== undefined) text = entry.plain_name;
  else if (typeof item.summary === "string") text = item.summary;
  else text = `${severity} on ${String(kind)}:${String(id)}`;
  return { code, kind, id, status: fresh ? status : "unknown", severity, known: entry !== undefined, text };
}
