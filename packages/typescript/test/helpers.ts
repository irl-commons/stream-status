import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, from dist/test/. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export function readJson(relative: string): any {
  return JSON.parse(readFileSync(path.join(ROOT, relative), "utf8"));
}

export function fixture(name: string): any {
  return readJson(`fixtures/${name}`);
}
