# Fixtures

`python3 tools/stream_status.py test` runs all of them.

| Folder | Each file | Passes when |
| --- | --- | --- |
| `valid/` | `description`, `snapshot` | the snapshot validates |
| `invalid/` | `description`, `error`, `snapshot` | validation fails with an error containing `error` |
| `reader/` | `description`, `steps` | a reader gives the `expect`ed view at each `at_ms` (spec section 4) |
| `in-band/` | `description`, then either `message` with its encoded bytes and `expanded` form, or `cbor_hex` with `"expect": "reject"` | the bytes match the encoder and decode to `expanded`, or decoding rejects |

Reader steps are `{ "rx_ms", "receive", "outcome"? }` (the reader receives a
snapshot, or a raw string, at its own clock time) or `{ "at_ms", "expect" }`
(the fields listed in `expect` must match the reader's view).

In-band `nal_h264_hex` and `nal_hevc_hex` are complete SEI NAL units without
a start code. Inserted before the first slice of a real H.264 or HEVC frame,
FFmpeg's `trace_headers` bitstream filter reads them as `user_data_unregistered`
with this format's UUID, and the stream still decodes.
