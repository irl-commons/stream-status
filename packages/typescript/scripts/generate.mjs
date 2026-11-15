#!/usr/bin/env node
// Regenerates src/generated/ from the repository's schema and code registry.
//
//   node scripts/generate.mjs           write the files
//   node scripts/generate.mjs --check   fail if the committed files differ
//
// The output depends only on schema/, codes/ and the pinned
// json-schema-to-typescript version in package-lock.json.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compile } from "json-schema-to-typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const repo = path.resolve(pkg, "../..");
const outDir = path.join(pkg, "src/generated");
const check = process.argv.includes("--check");

const header = (source) =>
  `// Generated from ${source} by scripts/generate.mjs. Do not edit.\n` +
  `// Run \`npm run generate\` after changing the source.\n`;

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(repo, relative), "utf8"));
}

async function typesFile() {
  const schema = await readJson("schema/stream-status.v0.schema.json");
  // The schema's title is prose; give the root type a short name instead.
  const named = { ...schema, title: "Snapshot" };
  const body = await compile(named, "Snapshot", {
    bannerComment: "",
    unreachableDefinitions: true,
    maxItems: -1,
    additionalProperties: false,
    style: { singleQuote: false, semi: true, printWidth: 100 },
  });
  return header("schema/stream-status.v0.schema.json") + "\n" + body;
}

async function schemaFile() {
  const schema = await readJson("schema/stream-status.v0.schema.json");
  return (
    header("schema/stream-status.v0.schema.json") +
    "\n" +
    "/** The v0 snapshot schema (JSON Schema 2020-12), as published in schema/. */\n" +
    `export const schema = ${JSON.stringify(schema, null, 2)} as const;\n`
  );
}

function constantName(code) {
  return code.replace(/\./g, "_").toUpperCase();
}

async function codesFile() {
  const registry = await readJson("codes/v0.json");
  const byCode = Object.fromEntries(registry.codes.map((entry) => [entry.code, entry]));
  const names = Object.fromEntries(registry.codes.map((entry) => [constantName(entry.code), entry.code]));
  return (
    header("codes/v0.json") +
    "\n" +
    "/** The parts of the chain a subject kind can name (spec 5.1). */\n" +
    `export const AREAS = ${JSON.stringify(registry.areas)} as const;\n` +
    "export type Area = (typeof AREAS)[number];\n\n" +
    "/** Units an evidence value may carry (spec 3.3). */\n" +
    `export const UNITS = ${JSON.stringify(registry.units)} as const;\n` +
    "export type Unit = (typeof UNITS)[number];\n\n" +
    "/** Every registered code by name, for example `CODES.CAPTURE_SIGNAL_LOST`. */\n" +
    `export const CODES = ${JSON.stringify(names, null, 2)} as const;\n` +
    "export type RegisteredCode = (typeof CODES)[keyof typeof CODES];\n\n" +
    "/** The v0 registry, keyed by code. */\n" +
    `export const REGISTRY = ${JSON.stringify(byCode, null, 2)} as const;\n`
  );
}

const files = {
  "types.ts": await typesFile(),
  "schema.ts": await schemaFile(),
  "codes.ts": await codesFile(),
};

let stale = [];
if (!check) await mkdir(outDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const target = path.join(outDir, name);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== content) stale.push(name);
  } else {
    await writeFile(target, content);
    console.log(`wrote src/generated/${name}`);
  }
}
if (stale.length) {
  console.error(`out of date: ${stale.map((n) => "src/generated/" + n).join(", ")}`);
  console.error("run `npm run generate` in packages/typescript and commit the result");
  process.exit(1);
}
if (check) console.log("generated files match schema/ and codes/");
