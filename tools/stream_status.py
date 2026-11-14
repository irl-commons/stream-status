#!/usr/bin/env python3
"""stream-status v0: validator, reference reader and in-band codec.

Usage:
  stream_status.py validate FILE...      check snapshots (JSON files)
  stream_status.py test                  run every fixture
  stream_status.py inband-decode HEX     decode an in-band CBOR payload
  stream_status.py inband-fixtures       rewrite fixtures/in-band/*.json bytes

Needs Python 3.9+ and the `jsonschema` package for `validate` and `test`.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "schema" / "stream-status.v0.schema.json"
CODES_PATH = ROOT / "codes" / "v0.json"
FIXTURES = ROOT / "fixtures"

INBAND_UUID = bytes.fromhex("8e9bc50184474a47adc32e36cd0859f4")
CLEARED_KEEP_MAX_S = 600
X_FIELD = re.compile(r"^x_[a-z0-9]+_[a-z0-9_]+$")


# --------------------------------------------------------------------------
# Loading

def load_json(path: pathlib.Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_registry() -> dict[str, dict]:
    registry = load_json(CODES_PATH)
    return {entry["code"]: entry for entry in registry["codes"]}


def load_units() -> set[str]:
    return set(load_json(CODES_PATH)["units"])


def parse_time(text: str) -> dt.datetime:
    return dt.datetime.fromisoformat(text.replace("Z", "+00:00"))


# --------------------------------------------------------------------------
# Sender validation: the schema plus the checks it can't express

def schema_errors(snapshot: Any) -> list[str]:
    try:
        import jsonschema
    except ImportError:  # pragma: no cover
        sys.exit("validate needs the jsonschema package: pip install jsonschema")
    validator = jsonschema.Draft202012Validator(
        load_json(SCHEMA_PATH),
        format_checker=jsonschema.Draft202012Validator.FORMAT_CHECKER,
    )
    errors = []
    for error in sorted(validator.iter_errors(snapshot), key=lambda e: list(e.path)):
        where = "/".join(str(part) for part in error.path) or "(root)"
        errors.append(f"schema: {where}: {error.message}")
    return errors


def semantic_errors(snapshot: dict) -> list[str]:
    registry = load_registry()
    units = load_units()
    errors: list[str] = []
    generated = parse_time(snapshot["generated"])
    identities = set()
    active_subjects = set()

    for index, finding in enumerate(snapshot["findings"]):
        where = f"findings/{index}"
        code = finding["code"]
        subject = finding["subject"]
        identity = (code, subject["kind"], subject["id"])
        if identity in identities:
            errors.append(f"{where}: duplicate identity {identity}")
        identities.add(identity)
        if finding["status"] == "active":
            active_subjects.add((subject["kind"], subject["id"]))

        entry = registry.get(code)
        if entry is None and not code.startswith("x_"):
            errors.append(f"{where}: code {code!r} is not in the v0 registry")
        if entry is not None and subject["kind"] not in entry["subject_kinds"]:
            errors.append(
                f"{where}: subject kind {subject['kind']!r} is not allowed for {code}"
            )

        since = parse_time(finding["since"])
        if since > generated:
            errors.append(f"{where}: since is later than generated")
        if "as_of" in finding and parse_time(finding["as_of"]) > generated:
            errors.append(f"{where}: as_of is later than generated")
        if finding["status"] == "cleared" and (
            generated - since
        ).total_seconds() > CLEARED_KEEP_MAX_S:
            errors.append(f"{where}: cleared more than 10 minutes ago; remove it")
        if snapshot["live"]["state"] == "not_live" and finding["still_live"] is True:
            errors.append(f"{where}: still_live is true while live.state is not_live")

        for e_index, item in enumerate(finding.get("evidence", [])):
            errors.extend(
                evidence_errors(f"{where}/evidence/{e_index}", item, entry, units)
            )

    seen = set()
    for index, check in enumerate(snapshot["checked"]):
        subject = (check["subject"]["kind"], check["subject"]["id"])
        if subject in seen:
            errors.append(f"checked/{index}: subject {subject} listed twice")
        seen.add(subject)
        if subject in active_subjects and check["state"] != "finding":
            errors.append(
                f"checked/{index}: subject {subject} has an active finding"
                f" but is listed as {check['state']!r}"
            )
        if check["as_of"] is not None and parse_time(check["as_of"]) > generated:
            errors.append(f"checked/{index}: as_of is later than generated")
    return errors


def evidence_errors(where: str, item: dict, entry: dict | None, units: set[str]) -> list[str]:
    key, value, unit = item["key"], item["value"], item.get("unit")
    if key.startswith("x_"):
        if unit is not None and unit not in units:
            return [f"{where}: unit {unit!r} is not a registered unit"]
        return []
    if entry is None:
        return [f"{where}: {key!r} needs an x_<owner>. prefix on an unregistered code"]
    spec = entry["evidence"].get(key)
    if spec is None:
        return [f"{where}: evidence key {key!r} is not registered for {entry['code']}"]
    if "unit" in spec:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return [f"{where}: {key} needs a number"]
        if unit != spec["unit"]:
            return [f"{where}: {key} needs unit {spec['unit']!r}, got {unit!r}"]
    if "values" in spec:
        if value not in spec["values"]:
            return [f"{where}: {key} value {value!r} is not one of {spec['values']}"]
        if unit is not None:
            return [f"{where}: {key} takes no unit"]
    return []


def validate(snapshot: Any) -> list[str]:
    errors = schema_errors(snapshot)
    if errors:
        return errors
    return semantic_errors(snapshot)


# --------------------------------------------------------------------------
# Reference reader (spec section 4)

SEVERITIES = ("info", "warning", "critical")
STATUSES = ("active", "cleared", "unknown")
LIVE_STATES = ("live", "not_live", "unknown")


class Reader:
    """Holds the latest accepted snapshot per sender, judged on receipt time."""

    def __init__(self) -> None:
        self.registry = load_registry()
        self.senders: dict[str, dict] = {}
        self.rejected = 0
        self.ignored = 0
        self.last_id: str | None = None

    def receive(self, rx_ms: int, message: Any) -> str:
        if isinstance(message, str):
            try:
                message = json.loads(message)
            except ValueError:
                self.rejected += 1
                return "rejected"
        if not self._acceptable(message):
            self.rejected += 1
            return "rejected"
        source = message["source"]
        state = self.senders.get(source["id"])
        if state is not None and state["boot"] == source["boot"]:
            if source["seq"] <= state["seq"]:
                self.ignored += 1
                return "ignored"
            state["missed"] += source["seq"] - state["seq"] - 1
        elif state is not None:
            state["restarts"] += 1
        if state is None:
            state = {"restarts": 0, "missed": 0}
            self.senders[source["id"]] = state
        state.update(
            boot=source["boot"],
            seq=source["seq"],
            rx_ms=rx_ms,
            valid_for_ms=message["valid_for_ms"],
            snapshot=message,
        )
        self.last_id = source["id"]
        return "accepted"

    @staticmethod
    def _acceptable(message: Any) -> bool:
        if not isinstance(message, dict):
            return False
        if message.get("format") != "stream-status" or message.get("v") != 0:
            return False
        source = message.get("source")
        if not isinstance(source, dict):
            return False
        if not isinstance(source.get("id"), str) or not isinstance(source.get("boot"), str):
            return False
        seq = source.get("seq")
        if isinstance(seq, bool) or not isinstance(seq, int) or seq < 0:
            return False
        valid = message.get("valid_for_ms")
        if isinstance(valid, bool) or not isinstance(valid, int) or valid < 1000:
            return False
        return isinstance(message.get("findings"), list)

    def view(self, at_ms: int, source_id: str | None = None) -> dict:
        source_id = source_id or self.last_id
        state = self.senders.get(source_id) if source_id else None
        if state is None:
            return {"fresh": False, "live": "unknown", "findings": [], "checked": [],
                    "rejected": self.rejected, "ignored": self.ignored}
        fresh = at_ms < state["rx_ms"] + state["valid_for_ms"]
        snapshot = state["snapshot"]
        live = snapshot.get("live") if isinstance(snapshot.get("live"), dict) else {}
        live_state = live.get("state") if live.get("state") in LIVE_STATES else "unknown"
        findings = [self._read_finding(item, fresh) for item in snapshot["findings"]]
        checked = []
        for item in snapshot.get("checked") or []:
            if not isinstance(item, dict) or not isinstance(item.get("subject"), dict):
                continue
            value = item.get("state") if item.get("state") in ("fine", "finding", "unknown") else "unknown"
            checked.append({
                "kind": item["subject"].get("kind"),
                "id": item["subject"].get("id"),
                "state": value if fresh else "unknown",
            })
        return {
            "fresh": fresh,
            "live": live_state if fresh else "unknown",
            "restarts": state["restarts"],
            "missed": state["missed"],
            "seq": state["seq"],
            "rejected": self.rejected,
            "ignored": self.ignored,
            "findings": findings,
            "checked": checked,
        }

    def _read_finding(self, item: Any, fresh: bool) -> dict:
        if not isinstance(item, dict):
            return {"code": None, "kind": None, "id": None, "status": "unknown",
                    "severity": "warning", "text": "unreadable"}
        subject = item.get("subject") if isinstance(item.get("subject"), dict) else {}
        code = item.get("code") if isinstance(item.get("code"), str) else None
        result = {"code": code, "kind": subject.get("kind"), "id": subject.get("id")}
        required = ("code", "subject", "status", "severity", "since", "still_live")
        if any(key not in item for key in required) or code is None or not subject:
            result.update(status="unknown", severity="warning", text="unreadable")
            return result
        status = item["status"] if item["status"] in STATUSES else "unknown"
        severity = item["severity"] if item["severity"] in SEVERITIES else "warning"
        entry = self.registry.get(code)
        if entry is not None:
            text = entry["plain_name"]
        elif isinstance(item.get("summary"), str):
            text = item["summary"]
        else:
            text = f"{severity} on {subject.get('kind')}:{subject.get('id')}"
        result.update(
            status=status if fresh else "unknown",
            severity=severity,
            known=entry is not None,
            text=text,
        )
        return result


# --------------------------------------------------------------------------
# Minimal deterministic CBOR (RFC 8949): the subset in-band v0 allows

class CborError(ValueError):
    pass


def _head(major: int, value: int) -> bytes:
    if value < 24:
        return bytes([major << 5 | value])
    for extra, size in ((24, 1), (25, 2), (26, 4), (27, 8)):
        if value < 1 << (8 * size):
            return bytes([major << 5 | extra]) + value.to_bytes(size, "big")
    raise CborError("integer too large")


def cbor_encode(item: Any) -> bytes:
    if item is False:
        return b"\xf4"
    if item is True:
        return b"\xf5"
    if item is None:
        return b"\xf6"
    if isinstance(item, int):
        return _head(0, item) if item >= 0 else _head(1, -1 - item)
    if isinstance(item, str):
        data = item.encode("utf-8")
        return _head(3, len(data)) + data
    if isinstance(item, list):
        return _head(4, len(item)) + b"".join(cbor_encode(x) for x in item)
    if isinstance(item, dict):
        pairs = sorted((cbor_encode(k), cbor_encode(v)) for k, v in item.items())
        return _head(5, len(pairs)) + b"".join(k + v for k, v in pairs)
    raise CborError(f"type {type(item).__name__} is not allowed in-band")


def cbor_decode(data: bytes) -> Any:
    item, end = _decode(data, 0)
    if end != len(data):
        raise CborError("trailing bytes")
    return item


def _decode(data: bytes, pos: int) -> tuple[Any, int]:
    if pos >= len(data):
        raise CborError("truncated")
    initial = data[pos]
    major, info = initial >> 5, initial & 0x1F
    pos += 1
    if major == 7:
        if info == 20:
            return False, pos
        if info == 21:
            return True, pos
        if info == 22:
            return None, pos
        raise CborError("floats and other simple values are not allowed in-band")
    if info < 24:
        value = info
    elif info in (24, 25, 26, 27):
        size = 1 << (info - 24)
        if pos + size > len(data):
            raise CborError("truncated")
        value = int.from_bytes(data[pos:pos + size], "big")
        pos += size
    else:
        raise CborError("indefinite lengths are not allowed in-band")
    if major == 0:
        return value, pos
    if major == 1:
        return -1 - value, pos
    if major == 3:
        if pos + value > len(data):
            raise CborError("truncated")
        return data[pos:pos + value].decode("utf-8"), pos + value
    if major == 4:
        items = []
        for _ in range(value):
            item, pos = _decode(data, pos)
            items.append(item)
        return items, pos
    if major == 5:
        result = {}
        for _ in range(value):
            key, pos = _decode(data, pos)
            if not isinstance(key, str):
                raise CborError("map keys must be text")
            result[key], pos = _decode(data, pos)
        return result, pos
    raise CborError("byte strings and tags are not allowed in-band")


# --------------------------------------------------------------------------
# In-band projection

CLOCK = {"s": "synced", "f": "free", "u": "unknown"}
CONTENT = {"cam": "camera", "stb": "standby", "cov": "cover", "brb": "brb",
           "pat": "pattern", "unk": "unknown"}
SEVERITY_SHORT = {"i": "info", "w": "warning", "c": "critical"}
HIGHEST = {"n": "none", "u": "unknown", **SEVERITY_SHORT}


def _uint(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _text(value: Any, low: int = 1, high: int = 64) -> bool:
    return isinstance(value, str) and low <= len(value) <= high


def iso_ms(ms: int) -> str:
    moment = dt.datetime.fromtimestamp(ms / 1000, tz=dt.timezone.utc)
    text = moment.strftime("%Y-%m-%dT%H:%M:%S")
    return text + (f".{ms % 1000:03d}Z" if ms % 1000 else "Z")


def inband_expand(payload: bytes) -> dict:
    """Decode one CBOR payload (the bytes after the UUID); raise on reject."""
    message = cbor_decode(payload)
    if not isinstance(message, dict):
        raise CborError("not a map")
    if message.get("v") != 0:
        raise CborError("missing or unsupported v")
    for key in ("b", "t", "f"):
        if key not in message:
            raise CborError(f"missing {key}")
    if not _text(message["b"]) or not _uint(message["t"]) or not _uint(message["f"]):
        raise CborError("wrong type in b, t or f")

    source: dict[str, Any] = {"boot": message["b"]}
    if "id" in message:
        if not _text(message["id"], 4, 64):
            raise CborError("wrong type in id")
        source["id"] = message["id"]
    if "s" in message:
        if not _uint(message["s"]):
            raise CborError("wrong type in s")
        source["seq"] = message["s"]

    frame: dict[str, Any] = {"wall_ms": message["t"], "number": message["f"]}
    for key, name, table in (("ck", "clock", CLOCK), ("c", "content", CONTENT)):
        if key in message:
            if message[key] not in table:
                raise CborError(f"wrong value in {key}")
            frame[name] = table[message[key]]
    for key, name in (("rep", "repeated"), ("drp", "dropped")):
        if key in message:
            if not _uint(message[key]):
                raise CborError(f"wrong type in {key}")
            frame[name] = message[key]

    out: dict[str, Any] = {"via": "in-band", "v": 0, "source": source, "frame": frame}
    if "sev" in message:
        if message["sev"] not in HIGHEST:
            raise CborError("wrong value in sev")
        out["highest_severity"] = HIGHEST[message["sev"]]
    if "fd" in message:
        if not isinstance(message["fd"], list):
            raise CborError("fd must be an array")
        findings = []
        for row in message["fd"]:
            if (not isinstance(row, list) or len(row) != 5 or not _text(row[0], 3, 96)
                    or not _text(row[1]) or not _text(row[2])
                    or row[3] not in SEVERITY_SHORT or not _uint(row[4])):
                raise CborError("malformed fd entry")
            findings.append({
                "code": row[0],
                "subject": {"kind": row[1], "id": row[2]},
                "status": "active",
                "severity": SEVERITY_SHORT[row[3]],
                "since": iso_ms(row[4]),
                "still_live": None,
            })
        out["findings"] = findings
        more = message.get("more", False)
        if not isinstance(more, bool):
            raise CborError("wrong type in more")
        out["findings_complete"] = not more
    ttl = message.get("ttl", 6000)
    if not _uint(ttl) or not 1000 <= ttl <= 60000:
        raise CborError("ttl out of range")
    out["valid_for_ms"] = ttl
    return out


def _escape(rbsp: bytes) -> bytes:
    """Insert emulation-prevention bytes (H.264 7.4.1 / HEVC 7.4.2)."""
    out, zeros = bytearray(), 0
    for byte in rbsp:
        if zeros >= 2 and byte <= 3:
            out.append(3)
            zeros = 0
        out.append(byte)
        zeros = zeros + 1 if byte == 0 else 0
    return bytes(out)


def sei_nal(payload: bytes, codec: str) -> bytes:
    """One SEI NAL unit (no start code) carrying UUID + payload."""
    body = INBAND_UUID + payload
    size = len(body)
    message = bytearray([5])  # payloadType 5: user_data_unregistered
    while size >= 255:
        message.append(255)
        size -= 255
    message.append(size)
    message += body
    message.append(0x80)  # rbsp_trailing_bits
    header = b"\x06" if codec == "h264" else b"\x4e\x01"
    return header + _escape(bytes(message))


def inband_bytes(message: dict) -> dict:
    payload = cbor_encode(message)
    return {
        "cbor_hex": payload.hex(),
        "cbor_bytes": len(payload),
        "nal_h264_hex": sei_nal(payload, "h264").hex(),
        "nal_hevc_hex": sei_nal(payload, "hevc").hex(),
    }


# --------------------------------------------------------------------------
# Fixture runner

def run_tests() -> int:
    failures = 0

    def fail(name: str, why: str) -> None:
        nonlocal failures
        failures += 1
        print(f"FAIL {name}: {why}")

    count = 0
    for path in sorted((FIXTURES / "valid").glob("*.json")):
        count += 1
        errors = validate(load_json(path)["snapshot"])
        if errors:
            fail(path.name, "; ".join(errors))
    for path in sorted((FIXTURES / "invalid").glob("*.json")):
        count += 1
        case = load_json(path)
        errors = validate(case["snapshot"])
        if not errors:
            fail(path.name, "expected an error, got none")
        elif not any(case["error"] in error for error in errors):
            fail(path.name, f"expected {case['error']!r}, got {errors}")
    for path in sorted((FIXTURES / "reader").glob("*.json")):
        count += 1
        reader = Reader()
        for step_no, step in enumerate(load_json(path)["steps"]):
            if "receive" in step:
                outcome = reader.receive(step["rx_ms"], step["receive"])
                if "outcome" in step and outcome != step["outcome"]:
                    fail(path.name, f"step {step_no}: {outcome} != {step['outcome']}")
            else:
                view = reader.view(step["at_ms"])
                for key, expected in step["expect"].items():
                    if view.get(key) != expected:
                        fail(path.name, f"step {step_no}: {key} = {view.get(key)!r},"
                                        f" expected {expected!r}")
    for path in sorted((FIXTURES / "in-band").glob("*.json")):
        count += 1
        case = load_json(path)
        if "message" in case:
            produced = inband_bytes(case["message"])
            for key, value in produced.items():
                if case.get(key) != value:
                    fail(path.name, f"{key} differs from the encoder output")
        payload = bytes.fromhex(case["cbor_hex"])
        try:
            expanded = inband_expand(payload)
        except CborError as error:
            if case.get("expect") != "reject":
                fail(path.name, f"rejected: {error}")
            continue
        if case.get("expect") == "reject":
            fail(path.name, "expected a reject")
        elif expanded != case["expanded"]:
            fail(path.name, f"expanded differs: {json.dumps(expanded)}")
    print(f"{count} fixtures, {failures} failures")
    return 1 if failures else 0


def write_inband_fixtures() -> None:
    for path in sorted((FIXTURES / "in-band").glob("*.json")):
        case = load_json(path)
        if "message" not in case:
            continue
        case.update(inband_bytes(case["message"]))
        case["expanded"] = inband_expand(bytes.fromhex(case["cbor_hex"]))
        path.write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    command, args = argv[1], argv[2:]
    if command == "validate" and args:
        status = 0
        for name in args:
            errors = validate(load_json(pathlib.Path(name)))
            print(f"{name}: {'ok' if not errors else 'invalid'}")
            for error in errors:
                print(f"  {error}")
            status |= bool(errors)
        return status
    if command == "test":
        return run_tests()
    if command == "inband-decode" and len(args) == 1:
        try:
            print(json.dumps(inband_expand(bytes.fromhex(args[0])), indent=2))
        except CborError as error:
            print(f"rejected: {error}")
            return 1
        return 0
    if command == "inband-fixtures":
        write_inband_fixtures()
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
