# stream-status in-band v0

Draft, November 2026. MIT licensed. **Specified only; no reference emitter
exists yet.** The fixtures in [`fixtures/in-band/`](../fixtures/in-band/) show the
exact bytes.

## Why there's an in-band form

Snapshots ([v0.md](v0.md)) travel on a channel next to the video. That's the
only way to reach apps that aren't on the stream path: a remote app, a hub
dashboard, a support tool. But some facts are about **frames**, and only the
video itself keeps them exactly in step:

- **Delay per hop.** If each frame carries the sender's wall clock, every hop
  that decodes it (a receiver, a relay, a recorder, an analyser) can subtract
  that from its own synced clock.
- **"This frame isn't the camera."** A standby picture, a privacy cover or a
  BRB scene is deliberate. A frozen-picture detector downstream needs to know
  that, frame by frame.
- **Repeated and dropped frames at the source.** "Frozen at the sender" and
  "frozen later" look the same at the far end unless the sender counts.
- **A digest of the findings,** so a receiver sees that something is wrong and
  which snapshot to fetch, even when it has no side channel.

The in-band form is a lossy projection of the same record: the same codes,
severities and subject kinds, with short keys. Anything it doesn't carry is
**unknown** after decoding, never a default.

## What survives where

In-band data rides inside the video bitstream, so a hop that forwards packets
or remuxes the stream keeps it. A hop that decodes and re-encodes drops it
unless that encoder copies it on purpose. In practice, as far as checked in
November 2026: bonding receivers and SRT relays forward it, a remuxing media
server keeps it, OBS's media inputs discard it, and platforms are not known to
pass it on to viewers. So the in-band form is for the hops on the stream path.
It never replaces snapshots.

## Carriage

An H.264 or HEVC **SEI message of payload type 5** (`user_data_unregistered`):

| Part | Bytes |
| --- | --- |
| UUID | `8e9bc501-8447-4a47-adc3-2e36cd0859f4`, 16 bytes: `8e9bc50184474a47adc32e36cd0859f4` |
| Payload | one CBOR data item (RFC 8949), a map, as below |

- **H.264:** a NAL unit of type 6 (header byte `0x06`), placed in the access unit
  before the first slice of the frame it describes.
- **HEVC:** a prefix SEI NAL unit, type 39 (header bytes `0x4e 0x01`), placed the
  same way.
- **AV1:** reserved for a later draft (a metadata OBU of type
  `METADATA_TYPE_ITUT_T35` or an unregistered-style payload).
- The SEI payload size uses the usual `0xff` chain. Emulation-prevention bytes
  (`0x03`) are inserted by the NAL writer as for any NAL unit; the CBOR bytes
  are the unescaped payload.
- Readers that don't know this UUID skip the message, as for any unregistered
  SEI.

## The CBOR map

CBOR core deterministic encoding (RFC 8949 section 4.2.1): shortest integer
forms, definite lengths, map keys sorted by their encoded bytes. Allowed
types: unsigned and negative integers, text strings, arrays, maps, `true`,
`false`, `null`. **No floats, no byte strings, no tags.**

| Key | Required | Type | Meaning | Expands to |
| --- | --- | --- | --- | --- |
| `v` | yes | uint, `0` | Version | `v` |
| `b` | yes | text, 1–64 | The sender's `source.boot` | `source.boot` |
| `t` | yes | uint | Sender wall clock when the frame was captured, milliseconds since the Unix epoch | `frame.wall_ms` |
| `f` | yes | uint | Frame counter since the sender's start | `frame.number` |
| `ck` | no | text | Sender clock: `s` synced (NTP or better), `f` free-running, `u` unknown | `frame.clock`: `synced`, `free`, `unknown` |
| `c` | no | text | What this frame shows: `cam` camera, `stb` standby, `cov` privacy cover, `brb`, `pat` test pattern, `unk` unknown | `frame.content`: `camera`, `standby`, `cover`, `brb`, `pattern`, `unknown` |
| `rep` | no | uint | Frames repeated by the sender since its previous in-band message | `frame.repeated` |
| `drp` | no | uint | Frames dropped by the sender since its previous in-band message | `frame.dropped` |
| `id` | no | text, 4–64 | The sender's `source.id` | `source.id` |
| `s` | no | uint | `seq` of the sender's latest snapshot | `source.seq` |
| `sev` | no | text | Highest severity among active findings: `n` none, `i` info, `w` warning, `c` critical, `u` unknown | `highest_severity`: `none`, `info`, `warning`, `critical`, `unknown` |
| `fd` | no | array | Active findings, each `[code, kind, id, sev, since_ms]` (sev as above without `n`; `since_ms` like `t`) | `findings[]` with `status: "active"`, `still_live: null` |
| `more` | no | bool | `true` when `fd` was cut short | `findings_complete: false` |
| `ttl` | no | uint, 1000–60000 | How long the `fd` and `sev` facts stay valid after receipt | `valid_for_ms`; default 6000 |

**Unknown keys are ignored. Missing keys are unknown.** A message without `v`,
`b`, `t` or `f`, with a wrong type in a known key, or with a float, is
rejected as a whole.

### Expanded form

A decoder produces this JSON object. This one is the keyframe message in
[`fixtures/in-band/03-keyframe-digest.json`](../fixtures/in-band/03-keyframe-digest.json)
(148 bytes of CBOR):

```json
{
  "via": "in-band",
  "v": 0,
  "source": {
    "boot": "7c1e04a2",
    "seq": 812
  },
  "frame": {
    "wall_ms": 1794690185120,
    "number": 54000,
    "clock": "synced",
    "content": "camera"
  },
  "highest_severity": "critical",
  "findings": [
    {
      "code": "capture.signal_lost",
      "subject": {
        "kind": "capture",
        "id": "hdmi"
      },
      "status": "active",
      "severity": "critical",
      "since": "2026-11-14T21:02:55Z",
      "still_live": null
    },
    {
      "code": "audio.silent",
      "subject": {
        "kind": "audio",
        "id": "program"
      },
      "status": "active",
      "severity": "warning",
      "since": "2026-11-14T21:02:52Z",
      "still_live": null
    }
  ],
  "findings_complete": true,
  "valid_for_ms": 6000
}
```

Fields that weren't in the message are absent from `source` and `frame`.
`findings` and `findings_complete` appear only when `fd` was present (and
`findings_complete` is `true` unless `more` was `true`). `still_live` is always
`null`: the in-band form doesn't carry it.

## Sizes and cadence

- A message SHOULD go with **every keyframe**, and MAY go with every frame.
  `fd` SHOULD go only with keyframes.
- A message without `fd` SHOULD be at most 64 bytes of CBOR, and SHOULD
  leave `id` and `s` to keyframe messages. A typical per-frame tag (`v`, `b`,
  `t`, `f`, `ck`, `c`, `rep`, `drp`, `sev`) is 58 bytes. With `fd`, the CBOR
  item MUST be at most 240 bytes, so the whole SEI payload stays at or under
  256 bytes. Findings that don't fit are left out and `more` is set.
- At 30 frames per second, that 58-byte tag on every frame, with its UUID and
  SEI header, costs about 18 kbit/s: tiny next to a 2–15 Mbit/s stream.

## Privacy

Anyone downstream can record and re-publish a stream. In-band data therefore
carries **no labels, no summaries and no evidence**: only codes, subject kinds,
subject ids, severities, counters and times. Subject ids MUST follow the
snapshot rules (no network names or identifiers of people or devices).

## Using it as a reader

- **Delay at this hop** = own wall clock at the moment the frame is decoded
  minus `t`, only when `ck` is `s` and the reader's own clock is synced too.
  Report it with its uncertainty (clock sync plus one frame).
- **Frozen picture:** if `c` is anything but `cam`, the sender showed it on
  purpose; don't call it a freeze. If `rep` grows while `c` is `cam`, the
  sender is repeating frames itself.
- **Digest:** `sev` and `fd` are hints with a `ttl`. Fetch the snapshot for
  details where a side channel exists.
