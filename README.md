# stream-status

A small open format for saying what's wrong with a live stream, where it's
wrong, and whether the stream is still live.

Live video from a backpack or a phone passes through a lot of hands: the
camera, an encoder box or phone app, several mobile links, a relay, OBS, the
platform. Each piece knows something about what's going wrong, and each one
says it differently, if it says it at all. A status screen stays green while
viewers watch a frozen picture. A remote app shows "connected" while one modem
carries nothing. A helper on a call has to ask "what does your screen say?"

stream-status is one shape for those verdicts, so that any app can show them
the same way: the box's own screen, a phone app, a hub, a scene switcher, a
support tool. It doesn't replace anyone's statistics or API. It's a small JSON
snapshot of **findings**, such as "the camera feed stopped" or "this link is
connected but carrying almost nothing". Each finding says who it's about, how
much it matters to viewers, how sure the sender is, and whether the stream is
still live.

**Status: v0, a draft.** Field names can still change between v0 drafts. From
v1 on, changes are additive only. No app uses it yet. MIT licensed.

**New here?** [Send your first snapshot](docs/getting-started.md) in about ten
minutes, then read the [worked examples](docs/examples.md) and the
[FAQ](docs/faq.md). What changed is in the [changelog](docs/CHANGELOG.md).
Questions and doubts go to [Discussions](https://github.com/openstreambox/stream-status/discussions).
How this fits with the other open standards for IRL streaming:
[openstreambox.org/open-standards.html](https://openstreambox.org/open-standards.html).

## What's here

| Path | What it is |
| --- | --- |
| [`docs/`](docs/getting-started.md) | A ten-minute guide, worked examples, an FAQ and the changelog |
| [`spec/v0.md`](spec/v0.md) | The format: snapshot, finding, reader rules, codes, versioning |
| [`spec/in-band-v0.md`](spec/in-band-v0.md) | A compact form of the same record carried inside the video (SEI), on paper |
| [`schema/stream-status.v0.schema.json`](schema/stream-status.v0.schema.json) | JSON Schema (2020-12) for a snapshot |
| [`codes/v0.json`](codes/v0.json) | The registry of finding codes |
| [`fixtures/`](fixtures/README.md) | Valid and invalid snapshots, reader cases, in-band bytes |
| [`tools/stream_status.py`](tools/stream_status.py) | Validator, reference reader and in-band codec (Python 3, needs `jsonschema`) |
| [`SECURITY.md`](SECURITY.md) | How to report a security problem |

## Why a shared format

If you make an IRL streaming app, a receiver, a relay or a hub, you've
probably written your own "is everything okay?" logic, and you've probably
read someone else's numbers to do it.

The closest thing the IRL scene has to a shared status contract today is
[NOALBS](https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching)
([docs](https://docs.noalbs.com)), the open-source (MIT) tool many IRL
streamers run to switch OBS scenes when the bitrate drops or the feed
disconnects. It reads the stats of the common ingest servers: BELABOX cloud,
SRT Live Server, MediaMTX, NGINX, Nimble, Node Media Server, RIST, Xiu,
OpenIRL, OpenRTMP, IRLHosting, go-irl and OBS sources. It also takes a pushed
WebSocket stats feed with a stale timeout (3 seconds by default), meant for
relay services that poll their stats once and broadcast updates. Because
NOALBS speaks all of those, a receiver's stats page is already something many
setups depend on.

stream-status builds on that rather than competing with it. NOALBS answers
"how much is arriving, and is the feed there?" from the receiver's numbers.
stream-status carries the next layer: the verdicts that the box, the phone app
or the relay can draw, often from those same receiver stats, plus what only
the sender knows (the camera feed stopped, the sound went silent, a modem is
connected but carrying almost nothing). The two fit together: findings can be
derived from the stats NOALBS reads, and a tool like NOALBS could one day read
or publish findings next to its stats.

What a stats page can't say on its own is "this is bad", "I don't know" or
"this ended a minute ago". That's the gap stream-status fills.

A shared verdict format lets the part that can see a problem say it once, and
lets every other app show it without guessing:

- **Unknown is a real answer.** A part without data is "unknown", never green.
- **Silence isn't "fine".** Every snapshot says how long it stays valid. A
  reader that hears nothing marks the findings stale instead of keeping the
  last good picture.
- **Still live, said out loud.** Most problems don't end the stream. Each
  finding says whether the stream is still reaching the receiver, so an app
  never shows "offline" for a camera hiccup.
- **Calm when it should be calm.** A bonding sender may starve a link on
  purpose. "Connected, carrying almost nothing" is information, not an alarm.
- **Codes, not prose.** The wire carries a stable code. Your app picks its own
  words and language. A one-line `summary` is there for apps without the
  registry.

## A snapshot

```json
{
  "format": "stream-status",
  "v": 0,
  "source": { "id": "k3v9q2x7m1", "boot": "7c1e04a2", "seq": 812 },
  "generated": "2026-11-14T21:03:05.120Z",
  "valid_for_ms": 12000,
  "live": { "state": "live", "since": "2026-11-14T20:41:10Z" },
  "findings": [
    {
      "code": "link.idle_connected",
      "subject": { "kind": "link", "id": "wwan1" },
      "status": "active",
      "severity": "info",
      "confidence": "measured",
      "since": "2026-11-14T21:02:41Z",
      "still_live": true,
      "evidence": [
        { "key": "link.tx_rate", "value": 640, "unit": "bit/s", "window_ms": 20000 }
      ],
      "summary": "Modem 2 is connected but carrying almost nothing. The stream is live on the other links."
    }
  ],
  "checked": [
    { "subject": { "kind": "capture", "id": "hdmi" }, "state": "fine", "as_of": "2026-11-14T21:03:04Z" },
    { "subject": { "kind": "power", "id": "board" }, "state": "unknown", "as_of": null }
  ]
}
```

A sender publishes the whole snapshot on every change and at least every few
seconds, on whatever channel it already has (a WebSocket, an HTTP endpoint, a
local file). A reader replaces its picture with each snapshot. Nothing builds
up from deltas, so a missed message costs nothing.

## Check your output

```sh
pip install jsonschema
python3 tools/stream_status.py validate my-snapshot.json
python3 tools/stream_status.py test        # runs every fixture
```

[Send your first snapshot](docs/getting-started.md) walks through this step by step.

## Adding a code

Open a pull request against `codes/v0.json` with the code, the parts it can be
about, its evidence keys and a sentence on how it's detected. Codes name what
is observed ("link.idle_connected"), not a guessed cause. A code never changes
meaning; a new meaning gets a new code. Your own experimental codes can use
`x_<you>.<area>.<condition>` without asking anyone.

## Prior art

The format borrows on purpose:

- [NOALBS](https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching):
  the receiver stats IRL tools already share, and its pushed WebSocket feed
  with a stale timeout.
- Prometheus Alertmanager: alert identity and re-sending while firing.
- The IETF alarm model (RFC 8632): an alarm is (resource, type), and cleared
  is not a severity.
- Kubernetes conditions and Nagios: true, false and **unknown**.
- AMWA NMOS BCP-008: worse at once, better only after a hold. NMOS IS-07:
  freshness by heartbeat.
- OpenTelemetry and CloudEvents: export mappings.
- OBS's broadcast performance metrics, which already ride in SEI messages: the
  model for the in-band form.

## Related

[stream-session](https://github.com/openstreambox/stream-session) is the
companion format for shows with several devices or several people: which
show a snapshot belongs to (`session_id`), who is in charge, and which
snapshots each person may see.

## License

[MIT](LICENSE).
