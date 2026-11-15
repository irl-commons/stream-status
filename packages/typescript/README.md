# @irl-commons/stream-status (TypeScript)

Types, a validator and a reader for [stream-status v0](../../spec/v0.md)
snapshots, plus the `stream-status inspect` command. No runtime
dependencies. Node 22 or newer, or any bundler for the browser (the CLI
needs Node).

**Not on npm yet.** Build it from this repository:

```sh
cd packages/typescript
npm ci
npm run build      # writes dist/
npm test
```

## Inspect a snapshot

```sh
node dist/src/cli.js inspect snapshot.json
node dist/src/cli.js inspect http://192.168.1.20/status.json
some-sender | node dist/src/cli.js inspect -
```

```text
valid snapshot from k3v9q2x7m1 (boot 7c1e04a2, seq 812)
2 findings: camera feed stopped (capture:hdmi, critical, since 10 s), no sound in the stream (audio:program, warning, since 13 s)
checked: 1 with a finding
still live: yes
fresh: yes, for 12 s after it was read
```

It exits 0 for a valid snapshot, 1 for an invalid one (and lists every
problem), and 2 when it can't read the input. The
[worked examples](../../docs/examples.md) are plain snapshots, so they're a
quick way to try it:

```sh
node dist/src/cli.js inspect ../../docs/examples/2-camera-lost.json
```

[`src/inspect.ts`](src/inspect.ts) is short on purpose: it's the example of
how an app reads a snapshot.

## Read snapshots in an app

```ts
import { Reader } from "@irl-commons/stream-status";

const reader = new Reader();
socket.onmessage = (event) => reader.receive(event.data); // raw JSON text or an object

setInterval(() => {
  const view = reader.view();
  if (!view.fresh) showUnknown(); // the sender went quiet: never keep showing the last good picture
  for (const finding of view.findings) show(finding.text, finding.severity, finding.status);
}, 1000);
```

The reader follows the spec's reader rules (section 4):

- **Freshness on your own clock.** `receive` and `view` default to
  `performance.now()`. A snapshot is fresh for `valid_for_ms` after it
  arrived; after that every finding and check reads `unknown`. The sender's
  `generated` time is never used for this.
- **Each snapshot replaces the last one** from the same `source.id`. Old or
  repeated `seq` values are ignored; a new `boot` counts as a restart.
- **Unknown never reads better.** An unknown `status` reads `unknown`, an
  unknown `severity` reads `warning`, an unknown `live.state` reads
  `unknown`, and a finding missing a required field stays in the list as
  "unreadable" at `warning`.
- **Text:** the registry's plain name for a known code, else the sender's
  `summary`, else "<severity> on <kind>:<id>".

Pass explicit times (`reader.receive(message, rxMs)`, `reader.view(atMs)`)
when you test, or when your app keeps its own monotonic clock.

## Check what you send

```ts
import { validate, type Snapshot } from "@irl-commons/stream-status";

const snapshot: Snapshot = buildSnapshot();
const problems = validate(snapshot); // [] when it may be published
```

`validate` checks the JSON Schema and the rules the schema can't express:
unique finding identities, registered codes, subject kinds and evidence,
`checked` matching the active findings, cleared findings older than
10 minutes, `still_live` against `live.state`, and times later than
`generated`. Its messages match `tools/stream_status.py validate`.

## Codes

```ts
import { CODES, REGISTRY } from "@irl-commons/stream-status";

CODES.CAPTURE_SIGNAL_LOST;                 // "capture.signal_lost"
REGISTRY["capture.signal_lost"].plain_name; // "Camera feed stopped"
```

## What's generated

`src/generated/` comes from `schema/` and `codes/` and is never edited by
hand:

| File | From | With |
| --- | --- | --- |
| `types.ts` | the schema | json-schema-to-typescript 16.0.0 |
| `schema.ts` | the schema, embedded for the validator | the generate script |
| `codes.ts` | the code registry, as typed constants | the generate script |

```sh
npm run generate         # after changing schema/ or codes/
npm run generate:check   # what CI runs: fails if the committed files are out of date
```

The validator is a small JSON Schema checker for the keywords this schema
uses ([`src/schema-check.ts`](src/schema-check.ts)). It refuses a schema with
any other keyword, so a schema change that needs more fails the tests instead
of letting bad snapshots through.

## Conformance

```sh
npm run --silent conformance > typescript.json
python3 ../../tools/stream_status.py report > python.json
python3 ../../tools/conformance.py python.json typescript.json
```

This runs every case in [`fixtures/manifest.json`](../../fixtures/manifest.json)
and checks that this package and the Python tool see the same thing. The
in-band cases are skipped: the in-band form is specified, but nothing in
TypeScript consumes it yet. See [`../README.md`](../README.md) for the
report format the other languages use.

## License

[MIT](../../LICENSE).
