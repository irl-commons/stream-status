# Changelog

All changes to the format, the schema, the code registry and the fixtures.
Until v1, a v0 draft can change field names. Each such change is listed
here.

## Unreleased

- The repository moved to [irl-commons/stream-status](https://github.com/irl-commons/stream-status);
  old links and clones redirect. The initiative that started the format is
  now called IRL Commons, and the README says so.
- The schema's `$id` is now `https://irlcommons.org/schemas/stream-status/v0.json`, an address
  on irlcommons.org that will serve the schema file. The old identifier was used for one day and
  was never a working address; see the [FAQ](faq.md#why-did-the-schemas-id-change).
  No field changed.
- The TypeScript package is now `@irl-commons/stream-status`. It was never
  published under its old name, `@openstreambox/stream-status`.
- Docs for implementers: [Send your first snapshot](getting-started.md),
  [worked examples](examples.md) with snapshots that CI validates, and an
  [FAQ](faq.md). No change to the format.
- The README names the OpenStreamBox Initiative, which started the format.

## v0 draft 1 (November 2026)

- First draft: the snapshot, findings, the `checked` list, reader rules,
  the code registry with 10 codes, versioning and mappings to
  OpenTelemetry, Nagios, the IETF alarm model and CloudEvents.
- The in-band form on paper (SEI in H.264 and HEVC), with test bytes.
- `tools/stream_status.py`: validator, reference reader and in-band codec,
  with fixtures for each.
- Optional `session_id`, linked to the
  [stream-session](https://github.com/irl-commons/stream-session) draft.
