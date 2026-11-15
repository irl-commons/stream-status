# Worked examples

Each example starts with what your app sees, then shows the snapshot it
sends, and ends with what a screen could say. The snapshots are in
[`examples/`](examples/), and each one passes:

```sh
python3 tools/stream_status.py validate docs/examples/*.json
```

The wording on screen is up to each app. The lines below are only
suggestions. The code carries the meaning, so every app can say it in its
own words and language.

## 1. One modem is idle while you bond

**What your app sees:** you bond three modems. For 20 seconds, modem 2
(`wwan1`) has sent only 640 bit/s. The other two carry the stream.

**What to send:** `link.idle_connected`, severity `info`, `still_live: true`.
This isn't an alarm. A bonding sender often puts less traffic on a weak
link on purpose. The two links that carry the stream are in `checked` as
`fine`. → [`1-modem-idle.json`](examples/1-modem-idle.json)

**What a screen could say:** "Modem 2 is idle. You're live on 2 links."

## 2. The camera cable came loose

**What your app sees:** two health checks in a row, about 5 seconds apart,
show no new frames from the HDMI input. The encoder still sends, so the
stream still reaches the receiver.

**What to send:** `capture.signal_lost`, severity `critical`,
`still_live: true`, and `recovery.by: "guide"`, because a person has to fix
the cable. → [`2-camera-lost.json`](examples/2-camera-lost.json)

**What a screen could say:** "Camera feed stopped. You're still live. Check
the HDMI cable."

Viewers can't see the picture, so this is critical. But the stream didn't
stop, and the screen should not say "offline".

## 3. The BRB screen is on, on purpose

**What your app sees:** the streamer turned on the BRB screen a minute ago.

**What to send:** `stream.standby`, severity `info`, `still_live: true`.
`live.state` stays `live`: a BRB or privacy screen is still a live stream.
→ [`3-brb-on-purpose.json`](examples/3-brb-on-purpose.json)

**What a screen could say:** "Live. Viewers see your BRB screen."

Don't say "not live" or "offline" here. The streamer is still on air, and
chat is still watching.

## 4. The camera is back

**What your app sees:** 40 seconds after example 2, frames arrive again,
and two good checks in a row confirm it.

**What to send:** the same finding with `status: "cleared"`. It keeps its
severity: cleared is a status, not a severity. Keep it in your snapshots for
5 minutes, and remove it after 10 at the latest. A reader that connects now
can still see what just happened. The camera is `fine` again in `checked`.
→ [`4-camera-back.json`](examples/4-camera-back.json)

**What a screen could say:** "The camera feed is back."

## 5. Your own code

**What your app sees:** you run a relay. Your relay knows something the
registry has no code for yet: its queue is 1.8 seconds behind.

**What to send:** a code of your own, `x_myrelay.relay.backlog`, with your
own evidence key `x_myrelay.relay.queue_ms`. You don't have to ask anyone.
The middle part (`relay`) must be one of the areas in the spec, so readers
know which part of the chain it's about. A reader that doesn't know your
code shows your `summary`, or "warning on relay edge1".
→ [`5-own-code.json`](examples/5-own-code.json)

**What a screen could say:** "The relay is 1.8 s behind. You're still live."

If other apps could use the same code, open a pull request against
[`codes/v0.json`](../codes/v0.json). The [README](../README.md#adding-a-code)
says what to include.

## 6. The snapshots stop

This one is about reading. Say your app received example 1 and then nothing
more, because the phone lost its connection to the box.

| Time on your clock | What arrived | What to show |
| --- | --- | --- |
| 0 s | Example 1, `valid_for_ms` 12000 | "Modem 2 is idle. You're live on 2 links." |
| 5 s | nothing | the same |
| 12 s | nothing | Everything from this sender is now **unknown**: "Can't reach the box. The last news is 12 s old." |
| 15 s | a new snapshot with a new `boot` | The box restarted. Accept it and show its new picture. |

Two mistakes to avoid at 12 s: showing the last picture as if it were still
true, and showing "offline". You don't know either of those. The reader
cases in [`fixtures/reader/`](../fixtures/reader/) test exactly this.
