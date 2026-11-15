#!/usr/bin/env node
// stream-status inspect <file|url|->
//
// Reads one snapshot, checks it the way a sender must (spec section 8), and
// prints what a reader would show. Exits 1 when the snapshot is invalid and
// 2 when it can't be read at all.
import { inspect } from "./inspect.js";

const USAGE = `usage: stream-status inspect <file|url|->

Checks one stream-status v0 snapshot and prints a plain summary.
  <file>  a JSON file
  <url>   an http(s) address that returns a snapshot
  -       read from standard input

Exit status: 0 valid, 1 invalid, 2 could not read it.`;

const argv = process.argv.slice(2);
if (argv[0] === "inspect" && argv.length === 2) {
  process.exitCode = await inspect(argv[1]!);
} else if (argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
  console.log(USAGE);
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
