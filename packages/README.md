# Language packages

One package per language, all built the same way:

- **Types are generated** from [`schema/stream-status.v0.schema.json`](../schema/stream-status.v0.schema.json)
  with one pinned generator per language. Nobody edits them by hand. Each
  package has one script that regenerates them and a check mode that fails CI
  when the committed output differs.
- **The code registry** ([`codes/v0.json`](../codes/v0.json)) becomes typed
  constants by the same script.
- **Hand-written code stays small**: a validator (the schema plus the rules it
  can't express, spec section 8) and a reader that applies the reader rules
  (spec section 4). It's only written where someone actually consumes it.
- **Every package passes the same fixtures**, listed in
  [`fixtures/manifest.json`](../fixtures/manifest.json), and must agree with
  the Python reference tool case by case.
- **A tiny CLI**, `stream-status inspect <file|url|->`, is the example an
  integrator reads first. No separate demo apps.

| Language | Status | Generator (pinned) |
| --- | --- | --- |
| TypeScript | [`typescript/`](typescript/README.md) | json-schema-to-typescript 16.0.0 |
| Swift | planned | quicktype 26.0.0 |
| Kotlin | planned | quicktype 26.0.0 (kotlinx.serialization) |
| Rust | planned | cargo-typify 0.8.0 |

## Generated types are the sender's shape

The generated types say what a sender must produce. A reader can't decode
straight into them, because the reader rules require it to cope with values
the types don't allow: a `status` from a newer minor version reads as
`unknown`, an unknown `severity` reads as `warning`, and a finding with a
missing field is shown as unreadable instead of failing the whole snapshot.
Swift and Kotlin enums from quicktype are closed, so decoding
`"status": "flapping"` into them throws.

So every reader works the way the TypeScript one does: parse the message into
the language's generic JSON value, apply the rules field by field, and hand
out a small view type (`fresh`, `live`, `findings`, `checked`, counters). Use
the generated types for building snapshots, for validated input, and for
showing fields after validation.

## Generating the other languages

The commands below are what each package's generate script will run. Pin the
exact version in the package's lock file (`package-lock.json` for the npm
tools, `Cargo.lock` or `cargo install --locked` for typify), and commit the
output.

**Swift** (Codable structs, for an iOS or macOS app):

```sh
npx quicktype@26.0.0 --src-lang schema --lang swift --top-level Snapshot \
  --access-level public --protocol equatable \
  schema/stream-status.v0.schema.json -o Sources/StreamStatus/Generated/Snapshot.swift
```

**Kotlin** (data classes with kotlinx.serialization, for Android):

```sh
npx quicktype@26.0.0 --src-lang schema --lang kotlin --framework kotlinx \
  --package org.irlcommons.streamstatus --top-level Snapshot \
  schema/stream-status.v0.schema.json -o src/main/kotlin/Snapshot.kt
```

**Rust** (serde types, for a receiver, relay or box service):

```sh
cargo install --locked cargo-typify@0.8.0
cargo typify schema/stream-status.v0.schema.json --output src/generated.rs
```

Things to expect, from a first run of quicktype 26.0.0 on the v0 schema:

- `v` (`"const": 0`) becomes a floating-point number in Swift, Kotlin and
  quicktype's Rust output. The validator checks the value; don't rely on the
  type for it.
- The `x_<owner>_` extension fields (`patternProperties`) aren't kept on the
  generated structs. That's fine for readers (unknown fields are ignored), but
  a sender that sets extension fields has to add them to the encoded JSON.
- Date-times become `Date` in Swift and `OffsetDateTime` in Kotlin, which
  kotlinx.serialization needs a small serializer for. Compare them as
  instants, never as text, and remember a reader never uses them for
  freshness.

typify hasn't been tried on this schema yet. The Rust package's first change
confirms it handles the schema (it supports 2020-12 `$defs`); if it doesn't,
quicktype's Rust output is the fallback and already generates cleanly.

The code registry needs no generator: each package's generate script reads
`codes/v0.json` and writes constants (a Swift enum with `String` raw values, a
Kotlin `object`, Rust `pub const` items), as
[`typescript/scripts/generate.mjs`](typescript/scripts/generate.mjs) does.

## Running the shared fixtures

[`fixtures/manifest.json`](../fixtures/manifest.json) lists every fixture
file by suite, with the capability a runner needs for it:

| Suite | Capability | A case passes when |
| --- | --- | --- |
| `valid` | `validate` | the snapshot validates |
| `invalid` | `validate` | validation fails, and one error message contains the case's `error` text |
| `reader` | `reader` | each step's `outcome` and the listed `expect` fields match |
| `in-band` | `in-band` | the encoder's bytes match and decoding gives `expanded`, or decoding rejects |

A runner reads the manifest instead of listing folders (Swift and Android
test bundles can't always list directories), runs every case it has the
capability for, and writes a report:

```json
{
  "format": "stream-status-conformance-report",
  "v": 0,
  "implementation": "swift",
  "capabilities": ["reader", "validate"],
  "results": {
    "valid/01-nothing-wrong.json": { "result": "pass", "observed": { "valid": true } },
    "invalid/13-bad-severity.json": { "result": "pass", "observed": { "valid": false, "error_matched": true } },
    "reader/05-restart.json": { "result": "pass", "observed": { "outcomes": ["accepted", "accepted"], "views": [ ... ] } },
    "in-band/01-frame-tag-minimal.json": { "result": "skip" }
  }
}
```

- `result` is `pass`, `fail` (with a `why` list) or `skip` (only for a
  capability the runner doesn't claim).
- `observed` is what the implementation saw. For `reader` cases it holds the
  outcome of every `receive` step and the **whole** view at every `at_ms`
  step, not only the fields the fixture lists, so the comparison catches
  differences the fixtures don't spell out.
- The views use the fixture's field names (`fresh`, `live`, `restarts`,
  `missed`, `seq`, `rejected`, `ignored`, `findings`, `checked`; per finding
  `code`, `kind`, `id`, `status`, `severity`, `known`, `text`).

Then compare it with the Python tool's report:

```sh
python3 tools/stream_status.py report > python.json
python3 tools/conformance.py python.json swift.json
```

`tools/conformance.py` fails when a report misses a case, when a case fails,
or when two implementations observed different things. Error messages
themselves may differ between languages; only `valid` and `error_matched` are
compared for validation cases.

## Adding a fixture

Add the file under `fixtures/<suite>/`, then run
`python3 tools/stream_status.py manifest` to list it. `stream_status.py test`
fails while the manifest and the folders differ, so a new case can't be
skipped by accident.
