# FAQ

## Does anyone use this yet?

No. stream-status is a v0 draft. No app uses it today. That's why feedback
now matters most: field names can still change, and it's cheap to fix things
before anyone depends on them.

## Does it replace my stats API, or NOALBS?

No. Keep your statistics and your API. NOALBS keeps reading receiver stats
to switch scenes. stream-status sits next to them and carries the verdicts:
"this is bad", "this is fine", "I can't see this part", "this ended a minute
ago". You can derive findings from the same stats NOALBS reads.

## Why are there so few codes?

Because each code must mean one observed thing, forever. The registry starts
small on purpose: links, the camera input, sound, standby and the power
board. Use your own `x_<you>.<area>.<condition>` codes for everything else,
and propose a shared code once a second app could use it.

## Why does a code name what's observed, and not the cause?

Because the sender usually can't be sure of the cause. "Connected but
carrying almost nothing" is a fact. "The modem is broken" is a guess, and it
may be wrong: a bonding sender may slow a link down on purpose. If you do
know the cause, put it in the evidence.

## What does `still_live` mean, exactly?

Whether the stream still reaches the receiver while this problem holds. A
frozen camera is critical for viewers, but the stream is still running, so
`still_live` is `true` and no app should say "offline". Use `null` when you
don't know.

## Is a BRB screen "not live"?

No. A BRB, standby or privacy screen is still a live stream. Viewers see it.
Send `stream.standby` with `still_live: true`, and keep `live.state` at
`live`.

## Why send the whole snapshot every time?

So a lost message costs nothing. A reader never has to rebuild state from
small changes. Snapshots are small, and you send one every few seconds.

## Why can't a reader trust the `generated` time?

Because the sender's clock and the reader's clock can be minutes apart. A
phone that was offline, or a box without network time, can be very wrong.
The reader decides what is current with its own clock: when it received the
snapshot, plus `valid_for_ms`.

## Which channel should I use?

The one you already have. A WebSocket, an HTTP endpoint, a local file and a
message queue all work. The format doesn't say how to log in or how to
encrypt. That belongs to the channel.

## Can I put a Wi-Fi name or a label in a snapshot?

`subject.label` may hold a name the user chose. Leave it out when the
snapshot leaves the local network, because a label can be private.
Evidence and `summary` must never hold free text, IP addresses, network
names, phone numbers, serial numbers or stream keys. The checker rejects
evidence text that isn't on the key's list of values. It can't check what
you write in `summary`, so that part is up to you.

## What is the in-band form?

A compact copy of some of the same facts, carried inside the video itself
(SEI messages in H.264 or HEVC). It helps hops on the stream path, such as a
receiver or a relay, to see the delay per hop and to know that a picture is
a standby screen on purpose. It's [specified on paper](../spec/in-band-v0.md)
with test bytes, but no app sends it yet.

## How does this relate to stream-session?

[stream-session](https://github.com/irl-commons/stream-session) is the
companion draft for shows with several devices or several people. It says
which show a snapshot belongs to (`session_id`), who is in charge, and who
may see which snapshot. A single device doesn't need it.

## Why did the schema's `$id` change?

The first v0 draft used `https://github.com/openstreambox/stream-status/schema/stream-status.v0.schema.json`
as its `$id`. That was a name, not an address you could open, and it tied the
format to one GitHub organisation. Since the move to IRL Commons the `$id` is
`https://irlcommons.org/schemas/stream-status/v0.json`, an address on
irlcommons.org that will serve the schema file. If you pinned the old identifier during its one day, replace it; the
schema is otherwise the same.

## What happens when v1 comes?

Until v1, fields can still change between drafts, and each change gets a
line in the [changelog](CHANGELOG.md) and updated fixtures. From v1 on,
changes are additive only: new optional fields, new codes, new values.
The reader rules keep older readers safe.

## How do I add a code?

Open a pull request against `codes/v0.json` with the code, the parts it can be
about, its evidence keys and a sentence on how it's detected. Codes name what
is observed ("link.idle_connected"), not a guessed cause. A code never changes
meaning; a new meaning gets a new code. Your own experimental codes can use
`x_<you>.<area>.<condition>` without asking anyone.

## What does it borrow from?

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

## Where do I ask, or say what's missing?

In [Discussions](https://github.com/irl-commons/stream-status/discussions).
If you'd rather not post in public, write to hello@irlcommons.org or ask
[on Discord](https://discord.gg/KChVwU6fjk).
