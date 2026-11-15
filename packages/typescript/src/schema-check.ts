// A small JSON Schema 2020-12 checker for the keywords the stream-status
// schema uses, so the package needs no runtime dependencies. It refuses a
// schema with any other keyword instead of silently skipping it, so a schema
// change that needs more support fails the tests rather than passing
// snapshots it should reject.
//
// Messages follow the wording of Python's `jsonschema`, so both tools point at
// the same thing.

type SchemaObject = { readonly [keyword: string]: unknown };
type Schema = boolean | SchemaObject;

const SUPPORTED = new Set([
  "$schema", "$id", "title", "description", "$defs",
  "$ref", "type", "const", "enum", "oneOf", "anyOf",
  "required", "properties", "patternProperties", "additionalProperties",
  "items", "maxItems",
  "minLength", "maxLength", "pattern", "format",
  "minimum", "maximum",
]);

export interface SchemaError {
  /** JSON path of the offending value, as segments. */
  path: (string | number)[];
  message: string;
}

export class SchemaChecker {
  private readonly root: SchemaObject;
  private readonly patterns = new Map<string, RegExp>();

  constructor(schema: SchemaObject) {
    this.root = schema;
    this.audit(schema, "#");
  }

  errors(value: unknown): SchemaError[] {
    const out: SchemaError[] = [];
    this.check(this.root, value, [], out);
    return out;
  }

  private audit(schema: unknown, where: string): void {
    if (typeof schema === "boolean") return;
    if (!isObject(schema)) throw new Error(`${where}: not a schema`);
    for (const [keyword, sub] of Object.entries(schema)) {
      if (!SUPPORTED.has(keyword)) throw new Error(`${where}: unsupported keyword ${keyword}`);
      if (keyword === "format" && sub !== "date-time") {
        throw new Error(`${where}: unsupported format ${String(sub)}`);
      }
      if (keyword === "$ref" && !(typeof sub === "string" && sub.startsWith("#/$defs/"))) {
        throw new Error(`${where}: only local #/$defs/ references are supported`);
      }
      if (keyword === "$defs" || keyword === "properties" || keyword === "patternProperties") {
        for (const [name, child] of Object.entries(sub as SchemaObject)) {
          this.audit(child, `${where}/${keyword}/${name}`);
        }
      } else if (keyword === "oneOf" || keyword === "anyOf") {
        (sub as unknown[]).forEach((child, i) => this.audit(child, `${where}/${keyword}/${i}`));
      } else if (keyword === "items" || keyword === "additionalProperties") {
        this.audit(sub, `${where}/${keyword}`);
      }
    }
  }

  private regex(pattern: string): RegExp {
    let compiled = this.patterns.get(pattern);
    if (!compiled) {
      compiled = new RegExp(pattern, "u");
      this.patterns.set(pattern, compiled);
    }
    return compiled;
  }

  private resolve(ref: string): Schema {
    const name = ref.slice("#/$defs/".length);
    const defs = this.root.$defs as SchemaObject | undefined;
    const target = defs?.[name];
    if (target === undefined) throw new Error(`unresolved reference ${ref}`);
    return target as Schema;
  }

  private valid(schema: Schema, value: unknown): boolean {
    const out: SchemaError[] = [];
    this.check(schema, value, [], out);
    return out.length === 0;
  }

  private check(schema: Schema, value: unknown, path: (string | number)[], out: SchemaError[]): void {
    if (schema === true) return;
    if (schema === false) {
      out.push({ path, message: `False schema does not allow ${repr(value)}` });
      return;
    }
    const fail = (message: string) => out.push({ path, message });

    if (typeof schema.$ref === "string") this.check(this.resolve(schema.$ref), value, path, out);

    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
      if (!types.some((type) => hasType(value, type))) {
        fail(`${repr(value)} is not of type ${types.map((t) => repr(t)).join(", ")}`);
        return;
      }
    }
    if ("const" in schema && !jsonEqual(value, schema.const)) {
      fail(`${repr(schema.const)} was expected`);
    }
    if (Array.isArray(schema.enum) && !schema.enum.some((option) => jsonEqual(value, option))) {
      fail(`${repr(value)} is not one of ${repr(schema.enum)}`);
    }
    if (Array.isArray(schema.anyOf)) {
      if (!schema.anyOf.some((sub) => this.valid(sub as Schema, value))) {
        fail(`${repr(value)} is not valid under any of the given schemas`);
      }
    }
    if (Array.isArray(schema.oneOf)) {
      const matches = schema.oneOf.filter((sub) => this.valid(sub as Schema, value)).length;
      if (matches === 0) fail(`${repr(value)} is not valid under any of the given schemas`);
      else if (matches > 1) fail(`${repr(value)} is valid under more than one of the given schemas`);
    }

    if (typeof value === "string") {
      const length = [...value].length;
      if (typeof schema.minLength === "number" && length < schema.minLength) {
        fail(`${repr(value)} is too short`);
      }
      if (typeof schema.maxLength === "number" && length > schema.maxLength) {
        fail(`${repr(value)} is too long`);
      }
      if (typeof schema.pattern === "string" && !this.regex(schema.pattern).test(value)) {
        fail(`${repr(value)} does not match ${repr(schema.pattern)}`);
      }
      if (schema.format === "date-time" && !isDateTime(value)) {
        fail(`${repr(value)} is not a 'date-time'`);
      }
    }

    if (typeof value === "number") {
      if (typeof schema.minimum === "number" && value < schema.minimum) {
        fail(`${value} is less than the minimum of ${schema.minimum}`);
      }
      if (typeof schema.maximum === "number" && value > schema.maximum) {
        fail(`${value} is greater than the maximum of ${schema.maximum}`);
      }
    }

    if (Array.isArray(value)) {
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
        fail(`${repr(value)} is too long`);
      }
      if (schema.items !== undefined) {
        value.forEach((item, i) => this.check(schema.items as Schema, item, [...path, i], out));
      }
    }

    if (isObject(value)) {
      if (Array.isArray(schema.required)) {
        for (const name of schema.required as string[]) {
          if (!(name in value)) fail(`${repr(name)} is a required property`);
        }
      }
      const properties = (schema.properties ?? {}) as SchemaObject;
      const patterns = (schema.patternProperties ?? {}) as SchemaObject;
      const extra: string[] = [];
      for (const [name, item] of Object.entries(value)) {
        let matched = false;
        if (Object.hasOwn(properties, name)) {
          matched = true;
          this.check(properties[name] as Schema, item, [...path, name], out);
        }
        for (const [pattern, sub] of Object.entries(patterns)) {
          if (this.regex(pattern).test(name)) {
            matched = true;
            this.check(sub as Schema, item, [...path, name], out);
          }
        }
        if (!matched) extra.push(name);
      }
      if (extra.length && schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false) {
          const names = Object.keys(patterns);
          if (names.length) {
            const verb = extra.length === 1 ? "does" : "do";
            fail(`${extra.map((n) => repr(n)).join(", ")} ${verb} not match any of the regexes: ${names.map((n) => repr(n)).join(", ")}`);
          } else {
            const verb = extra.length === 1 ? "was" : "were";
            fail(`Additional properties are not allowed (${extra.map((n) => repr(n)).join(", ")} ${verb} unexpected)`);
          }
        } else {
          for (const name of extra) {
            this.check(schema.additionalProperties as Schema, value[name], [...path, name], out);
          }
        }
      }
    }
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case "null": return value === null;
    case "boolean": return typeof value === "boolean";
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "array": return Array.isArray(value);
    case "object": return isObject(value);
    default: throw new Error(`unsupported type ${type}`);
  }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
  }
  return false;
}

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|([+-])(\d{2}):(\d{2}))$/;

/** RFC 3339 date-time with real calendar limits (month lengths, leap years). */
export function isDateTime(text: string): boolean {
  const m = DATE_TIME.exec(text);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]!) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (m[9] !== undefined && (Number(m[10]) > 23 || Number(m[11]) > 59)) return false;
  return true;
}

function repr(value: unknown): string {
  if (typeof value === "string") return `'${value}'`;
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 80 ? text.slice(0, 77) + "..." : text;
}
