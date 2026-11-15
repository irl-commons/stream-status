# Send your first snapshot

This guide is for people who make an IRL streaming app, an encoder box, a
receiver, a relay or a hub. In about ten minutes you send a valid
stream-status snapshot from your own code. It doesn't need a server, an
account or a library.

You need Python 3.9 or newer to run the checker. Your own code can be in any
language: a snapshot is just JSON.

## 1. Get the checker

```sh
git clone https://github.com/irl-commons/stream-status
cd stream-status
pip install jsonschema
python3 tools/stream_status.py test
```

`test` runs every fixture. If it ends without errors, the checker works.

## 2. Pick three numbers for your sender

Every snapshot says who sent it, in `source`:

- **`id`**: a random value that your app makes once, on first start, and
  saves. Don't use a serial number, a MAC address, an account name or a
  device name. Those can identify a person.
- **`boot`**: a new random value every time your process starts.
- **`seq`**: a counter. Start at 0 for each `boot` and add one for every
  snapshot you send.

A reader uses `boot` and `seq` to notice restarts and to ignore old
messages that arrive late.

## 3. Build a snapshot with nothing wrong

This is the smallest useful snapshot. The stream is live, nothing is wrong,
and you checked the camera input:

```python
import json, os, secrets, datetime

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

SOURCE_ID = "k3v9q2x7m1"         # make once with secrets.token_hex(5), then save it
BOOT = secrets.token_hex(4)      # new on every start
seq = 0

snapshot = {
    "format": "stream-status",
    "v": 0,
    "source": {"id": SOURCE_ID, "boot": BOOT, "seq": seq, "software": "my-app/0.1.0"},
    "generated": now(),
    "valid_for_ms": 12000,
    "live": {"state": "live", "since": "2026-11-14T20:41:10Z"},
    "findings": [],
    "checked": [
        {"subject": {"kind": "capture", "id": "hdmi"}, "state": "fine", "as_of": now()},
        {"subject": {"kind": "power", "id": "board"}, "state": "unknown", "as_of": None},
    ],
}

with open("my-snapshot.json", "w") as out:
    json.dump(snapshot, out, indent=2)
```

Two things to notice:

- `findings` is empty because nothing is wrong. That's a normal snapshot.
- The power board is listed as `unknown`. If your app can't see a part, say
  so. A reader can then tell the streamer "I can't see your power board"
  instead of showing it as fine.

## 4. Check it

```sh
python3 tools/stream_status.py validate my-snapshot.json
```

You should see `my-snapshot.json: ok`. If not, the checker names the field
and the rule.

## 5. Add a finding

Say your app bonds three modems, and modem 2 has carried almost nothing for
20 seconds. The registry has a code for that: `link.idle_connected`. Look it
up in [`codes/v0.json`](../codes/v0.json) to see its severity and its
evidence keys. Then add it to `findings`:

```python
snapshot["findings"].append({
    "code": "link.idle_connected",
    "subject": {"kind": "link", "id": "wwan1"},
    "status": "active",
    "severity": "info",
    "confidence": "measured",
    "since": now(),
    "still_live": True,
    "evidence": [
        {"key": "link.tx_rate", "value": 640, "unit": "bit/s", "window_ms": 20000},
        {"key": "bond.carrying_links", "value": 2, "unit": "count"},
    ],
    "summary": "Modem 2 is connected but carrying almost nothing. The stream is live on the other links.",
})

# This is a new snapshot, so it gets a new time and the next number.
seq += 1
snapshot["source"]["seq"] = seq
snapshot["generated"] = now()

with open("my-snapshot.json", "w") as out:
    json.dump(snapshot, out, indent=2)
```

Run `validate` again. A few rules the checker enforces:

- No time in the snapshot may be later than `generated`. Set `generated`
  last, just before you send.

- Use a code from the registry, or your own `x_<you>.<area>.<condition>`
  code (see [example 5](examples.md#5-your-own-code)).
- `still_live` says whether the stream still reaches the receiver while
  this problem holds. Most problems don't end the stream.
- Evidence holds numbers or values from a fixed list. No free text, no IP
  addresses, no network names.

## 6. Send it

Pick a channel you already have. stream-status doesn't care which one:

- an HTTP endpoint such as `GET /status.json`;
- a WebSocket message;
- a file that another program reads.

Then follow two timing rules:

- Send the whole snapshot again **every time something changes**.
- Send it **at least every 5 seconds** even when nothing changes. Keep
  `valid_for_ms` at 12000, so a reader marks your data as old if two
  snapshots in a row go missing.

Add one to `seq` for every snapshot, and set `generated` to the current
time. Never send only the changes: each snapshot is complete, so a missed
message costs nothing.

## If you read snapshots

If your app shows stream-status, three rules keep it honest:

1. **Use your own clock.** When a snapshot arrives, note your own time. The
   snapshot is current for `valid_for_ms` after that. Then show everything
   from that sender as unknown, never as fine.
2. **Replace, don't merge.** Each snapshot from a sender replaces the last
   one. A finding that is missing from the new snapshot has ended.
3. **Unknown never looks better.** An unknown value or code is shown, not
   hidden. An unknown severity counts as `warning`.

The cases in [`fixtures/reader/`](../fixtures/reader/) show the expected
answers step by step. `tools/stream_status.py` has a small reference reader
(`Reader`) you can compare yours with.

## Next

- [Worked examples](examples.md): five situations, from the raw numbers to
  the snapshot and what a screen could say.
- [FAQ](faq.md)
- [The full spec](../spec/v0.md)
- Questions or doubts: [Discussions](https://github.com/irl-commons/stream-status/discussions).
