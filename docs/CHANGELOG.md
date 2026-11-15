# Changelog

All changes to the format, the schema, the code registry and the fixtures.
Until v1, a v0 draft can change field names. Each such change is listed
here.

## Unreleased

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
  [stream-session](https://github.com/openstreambox/stream-session) draft.
