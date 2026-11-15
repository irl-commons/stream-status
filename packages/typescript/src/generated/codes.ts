// Generated from codes/v0.json by scripts/generate.mjs. Do not edit.
// Run `npm run generate` after changing the source.

/** The parts of the chain a subject kind can name (spec 5.1). */
export const AREAS = ["stream","capture","audio","power","heat","hardware","link","transport","relay","hub","upstream","platform"] as const;
export type Area = (typeof AREAS)[number];

/** Units an evidence value may carry (spec 3.3). */
export const UNITS = ["bit/s","ms","count","dB","V","A","W","Cel"] as const;
export type Unit = (typeof UNITS)[number];

/** Every registered code by name, for example `CODES.CAPTURE_SIGNAL_LOST`. */
export const CODES = {
  "LINK_IDLE_CONNECTED": "link.idle_connected",
  "CAPTURE_SIGNAL_LOST": "capture.signal_lost",
  "AUDIO_SILENT": "audio.silent",
  "STREAM_STANDBY": "stream.standby",
  "POWER_ON_RESERVE": "power.on_reserve",
  "POWER_WEAK_INPUT": "power.weak_input",
  "POWER_INPUT_RESTING": "power.input_resting",
  "POWER_SHUTTING_DOWN": "power.shutting_down",
  "POWER_PROTECTION_REDUCED": "power.protection_reduced",
  "POWER_BOARD_NOT_REPORTING": "power.board_not_reporting"
} as const;
export type RegisteredCode = (typeof CODES)[keyof typeof CODES];

/** The v0 registry, keyed by code. */
export const REGISTRY = {
  "link.idle_connected": {
    "code": "link.idle_connected",
    "added": "0",
    "subject_kinds": [
      "link"
    ],
    "severity": "info",
    "confidence": "measured",
    "plain_name": "Connected, carrying almost nothing",
    "technical_name": "Bonded uplink below keepalive rate while other links carry the stream",
    "evidence": {
      "link.tx_rate": {
        "unit": "bit/s"
      },
      "link.quiet_ms": {
        "unit": "ms"
      },
      "bond.carrying_links": {
        "unit": "count"
      }
    },
    "rule": "Fresh sender samples show this link connected at no more than 1024 bit/s for at least 20 s while another eligible link carries more than 1024 bit/s. Clears once the link sends at least 2048 bit/s, or when it leaves the bond or the stream stops.",
    "note": "Not a fault on its own: a bonding sender may starve a link deliberately when others are better. Show it calmly, per link."
  },
  "capture.signal_lost": {
    "code": "capture.signal_lost",
    "added": "0",
    "subject_kinds": [
      "capture"
    ],
    "severity": "critical",
    "confidence": "measured",
    "plain_name": "Camera feed stopped",
    "technical_name": "Capture input stalled while the encoder keeps streaming",
    "evidence": {
      "capture.stalled_samples": {
        "unit": "count"
      },
      "capture.input": {
        "values": [
          "hdmi",
          "sdi",
          "usb",
          "network",
          "other"
        ]
      }
    },
    "rule": "Two consecutive health samples, 4.5 to 6.5 s apart, show no new frames from the selected input while streaming. Clears after two good samples, at stream stop, or when the selection changes. Not raised for standby or deliberately synthetic sources."
  },
  "audio.silent": {
    "code": "audio.silent",
    "added": "0",
    "subject_kinds": [
      "audio"
    ],
    "severity": "warning",
    "confidence": "likely",
    "plain_name": "No sound in the stream",
    "technical_name": "Digital silence in the program audio",
    "evidence": {
      "audio.silent_ms": {
        "unit": "ms"
      },
      "audio.peak": {
        "unit": "dB"
      }
    },
    "rule": "The program audio meter shows digital silence for 10 s from fresh meter readings while streaming. A stale or missing meter is unknown, not silence. Not raised when the sound was muted or no audio source was chosen.",
    "note": "Likely, not measured: a quiet scene is possible."
  },
  "stream.standby": {
    "code": "stream.standby",
    "added": "0",
    "subject_kinds": [
      "stream"
    ],
    "severity": "info",
    "confidence": "measured",
    "plain_name": "Standby picture on air",
    "technical_name": "Encoder fed by the standby source",
    "evidence": {
      "stream.standby_ms": {
        "unit": "ms"
      }
    },
    "rule": "The encoder is streaming the standby source instead of a camera. Clears when a camera feed returns."
  },
  "power.on_reserve": {
    "code": "power.on_reserve",
    "added": "0",
    "subject_kinds": [
      "power"
    ],
    "severity": "critical",
    "confidence": "measured",
    "plain_name": "Running on reserve power",
    "technical_name": "Hold-up reserve supplying the host; no healthy input",
    "evidence": {
      "power.load": {
        "unit": "W"
      }
    },
    "rule": "The power supervisor reports the reserve supplying the host."
  },
  "power.weak_input": {
    "code": "power.weak_input",
    "added": "0",
    "subject_kinds": [
      "power"
    ],
    "severity": "warning",
    "confidence": "measured",
    "plain_name": "Power is weak",
    "technical_name": "Inputs present, none healthy",
    "evidence": {
      "power.input_voltage": {
        "unit": "V"
      }
    },
    "rule": "The power supervisor reports inputs present but none healthy."
  },
  "power.input_resting": {
    "code": "power.input_resting",
    "added": "0",
    "subject_kinds": [
      "power"
    ],
    "severity": "warning",
    "confidence": "measured",
    "plain_name": "A power input is resting",
    "technical_name": "Input stood down by the power supervisor",
    "evidence": {
      "power.cause": {
        "values": [
          "thermal",
          "sag",
          "holdup",
          "other"
        ]
      }
    },
    "rule": "The power supervisor has stood an input down; another input supplies the host."
  },
  "power.shutting_down": {
    "code": "power.shutting_down",
    "added": "0",
    "subject_kinds": [
      "power"
    ],
    "severity": "critical",
    "confidence": "measured",
    "plain_name": "The box is shutting down",
    "technical_name": "Shutdown requested by the power supervisor",
    "evidence": {
      "power.cause": {
        "values": [
          "pack_overtemp",
          "holdup",
          "other"
        ]
      }
    },
    "rule": "The power supervisor has requested a host shutdown."
  },
  "power.protection_reduced": {
    "code": "power.protection_reduced",
    "added": "0",
    "subject_kinds": [
      "power"
    ],
    "severity": "warning",
    "confidence": "measured",
    "plain_name": "Running with less power protection",
    "technical_name": "Power supervisor reports a protection gap",
    "evidence": {
      "power.gap": {
        "values": [
          "unarmed",
          "probe",
          "uncalibrated",
          "blind",
          "no_alive",
          "storage",
          "watchdog",
          "other"
        ]
      }
    },
    "rule": "The power supervisor reports at least one protection gap. Unknown gap bits count as reduced protection."
  },
  "power.board_not_reporting": {
    "code": "power.board_not_reporting",
    "added": "0",
    "subject_kinds": [
      "power"
    ],
    "severity": "warning",
    "confidence": "measured",
    "plain_name": "The power board isn't reporting",
    "technical_name": "Expected power supervisor silent or absent",
    "evidence": {
      "power.silent_ms": {
        "unit": "ms"
      }
    },
    "rule": "A power supervisor was seen before on this device and has sent no valid status for 5 s. List the power subject as unknown in checked."
  }
} as const;
