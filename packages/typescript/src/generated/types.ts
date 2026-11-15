// Generated from schema/stream-status.v0.schema.json by scripts/generate.mjs. Do not edit.
// Run `npm run generate` after changing the source.

/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "datetime".
 */
export type Datetime = string;
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "code".
 */
export type Code = string;

/**
 * A sender's complete current findings. Producer schema: extension fields must start with x_<owner>_. Readers must also accept unknown fields (spec section 4).
 */
export interface Snapshot {
  format: "stream-status";
  v: 0;
  source: Source;
  generated: Datetime;
  valid_for_ms: number;
  live: Live;
  /**
   * @maxItems 64
   */
  findings: Finding[];
  /**
   * @maxItems 64
   */
  checked: Check[];
  /**
   * Draft hook: shared id across one stream's senders. Rules not specified in v0.
   */
  session_id?: string;
  /**
   * This interface was referenced by `Snapshot`'s JSON-Schema definition
   * via the `patternProperty` "^x_[a-z0-9]+_[a-z0-9_]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "source".
 */
export interface Source {
  id: string;
  boot: string;
  seq: number;
  software?: string;
  /**
   * This interface was referenced by `Source`'s JSON-Schema definition
   * via the `patternProperty` "^x_[a-z0-9]+_[a-z0-9_]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "live".
 */
export interface Live {
  state: "live" | "not_live" | "unknown";
  since: Datetime | null;
  /**
   * This interface was referenced by `Live`'s JSON-Schema definition
   * via the `patternProperty` "^x_[a-z0-9]+_[a-z0-9_]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "finding".
 */
export interface Finding {
  code: Code;
  subject: Subject;
  status: "active" | "cleared" | "unknown";
  severity: "info" | "warning" | "critical";
  confidence?: "measured" | "likely" | "possible";
  since: Datetime;
  as_of?: Datetime;
  still_live: boolean | null;
  /**
   * @maxItems 8
   */
  evidence?: Evidence[];
  recovery?: Recovery;
  worsened?: number;
  summary?: string;
  /**
   * This interface was referenced by `Finding`'s JSON-Schema definition
   * via the `patternProperty` "^x_[a-z0-9]+_[a-z0-9_]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "subject".
 */
export interface Subject {
  kind:
    | (
        | "stream"
        | "capture"
        | "audio"
        | "power"
        | "heat"
        | "hardware"
        | "link"
        | "transport"
        | "relay"
        | "hub"
        | "upstream"
        | "platform"
      )
    | string;
  id: string;
  label?: string;
  /**
   * This interface was referenced by `Subject`'s JSON-Schema definition
   * via the `patternProperty` "^x_[a-z0-9]+_[a-z0-9_]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "evidence".
 */
export interface Evidence {
  key: string;
  value: number | boolean | string;
  unit?: string;
  window_ms?: number;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "recovery".
 */
export interface Recovery {
  by: "auto" | "ask" | "guide" | "none";
  action?: Code;
  state?: "pending" | "running" | "done" | "failed";
  /**
   * This interface was referenced by `Recovery`'s JSON-Schema definition
   * via the `patternProperty` "^x_[a-z0-9]+_[a-z0-9_]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Snapshot`'s JSON-Schema
 * via the `definition` "check".
 */
export interface Check {
  subject: Subject;
  state: "fine" | "finding" | "unknown";
  as_of: Datetime | null;
  /**
   * This interface was referenced by `Check`'s JSON-Schema definition
   * via the `patternProperty` "^x_[a-z0-9]+_[a-z0-9_]+$".
   */
  [k: string]: unknown;
}
