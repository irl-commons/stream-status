# stream-status

An open format for live-stream problems: what's wrong, where, how sure, and whether the stream is still live.

**Draft (v0).** Field names can change until v1; after that, changes only add. MIT licensed.

## Why

Live video from a backpack or a phone goes through the camera, an encoder or phone app, several mobile links, a relay, OBS and the platform. Each part knows something about what's wrong, and each says it differently, if at all. A status screen stays green while viewers see a frozen picture. A remote app shows "connected" while one modem carries nothing. A helper on a call has to ask "what does your screen say?"

stream-status lets each part say it once, in one shape, so any app can show it: the box's screen, a phone app, a hub, a scene switcher, a support tool. It doesn't replace anyone's stats or API. A sender publishes a small JSON snapshot of **findings**, such as "the camera feed stopped" or "this link is connected but carrying almost nothing".

- **Unknown is an answer.** A part without data is unknown, never green.
- **No news is not good news.** Each snapshot says how long it is valid. After that, readers mark it stale.
- **Still live, said out loud.** Each finding says whether the stream still reaches the receiver, so an app never shows "offline" for a camera hiccup.
- **Not every problem is an alarm.** A bonding sender may starve a link on purpose; that's information.
- **Codes, not prose.** A finding carries a stable code, and each app picks its own words and language.

## Works with NOALBS

[NOALBS](https://github.com/NOALBS/nginx-obs-automatic-low-bitrate-switching) is the open-source tool many IRL streamers use to switch OBS scenes when the bitrate drops. It reads the stats of the common ingest servers. It answers "how much is arriving?"; stream-status adds what only the sender knows (the camera stopped, the sound went silent, a modem carries nothing) and verdicts like "bad", "unknown" or "ended a minute ago". Findings can come from the same stats NOALBS reads, and NOALBS could one day read or publish them.

## Where to start

- **App makers:** [Send your first snapshot](docs/getting-started.md), then the [examples](docs/examples.md) and the [spec](spec/v0.md). There's a Python validator and a [TypeScript package](packages/typescript/README.md).
- **Questions, doubts, ideas:** [Discussions](https://github.com/irl-commons/stream-status/discussions) and the [FAQ](docs/faq.md).
- **Other IRL Commons standards:** [stream-session](https://github.com/irl-commons/stream-session), for shows with several devices or people; the overview is at [irlcommons.org/open-standards.html](https://irlcommons.org/open-standards.html).

## What's here

| Path | What it is |
| --- | --- |
| [`docs/`](docs/getting-started.md) | A getting-started guide, worked examples, an FAQ and the changelog |
| [`spec/v0.md`](spec/v0.md) | The format: snapshot, finding, reader rules, codes, versioning |
| [`spec/in-band-v0.md`](spec/in-band-v0.md) | A compact form of the same record carried inside the video (SEI), on paper |
| [`schema/stream-status.v0.schema.json`](schema/stream-status.v0.schema.json) | JSON Schema (2020-12) for a snapshot |
| [`codes/v0.json`](codes/v0.json) | The registry of finding codes |
| [`fixtures/`](fixtures/README.md) | Valid and invalid snapshots, reader cases, in-band bytes |
| [`tools/stream_status.py`](tools/stream_status.py) | Validator, reference reader and in-band codec (Python 3, needs `jsonschema`) |
| [`packages/`](packages/README.md) | Language packages built from the schema: [TypeScript](packages/typescript/README.md) now, Swift, Kotlin and Rust planned |
| [`tools/conformance.py`](tools/conformance.py) | Checks that every implementation passes the fixtures and agrees with the others |
| [`SECURITY.md`](SECURITY.md) | How to report a security problem |
