/**
 * Minimal, verified text edits to a Compose file.
 *
 * Edits are spliced into the original text at node positions reported by the YAML parser, so
 * comments, quoting, and unrelated lines stay byte-identical. Every patch is then re-parsed and
 * compared semantically with the intended change; any difference beyond it rejects the patch.
 * Nothing here executes YAML or touches anything outside the given string.
 */
import { isAlias, isMap, isPair, isScalar, isSeq, parseAllDocuments, type Document, type Node, type Pair, type YAMLMap } from "yaml";

export type PatchResult = { ok: true; text: string } | { ok: false; reason: string };

type Obj = Record<string, unknown>;
interface Edit {
  start: number;
  end: number;
  insert: string;
}
interface Loaded {
  text: string;
  doc: Document.Parsed;
  services: YAMLMap;
  nl: string;
}

const SERVICE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function load(text: string): Loaded | { ok: false; reason: string } {
  const docs = parseAllDocuments(text);
  if (!Array.isArray(docs) || docs.length !== 1) return fail("The file contains more than one YAML document.");
  const doc = docs[0]!;
  if (doc.errors.length) return fail("The file does not parse cleanly.");
  if (!isMap(doc.contents)) return fail("The file is not a Compose mapping.");
  if (doc.contents.has("include")) return fail("The file uses `include`; services or networks may be defined in other files.");
  const services = doc.contents.get("services", true);
  if (!isMap(services) || services.anchor) return fail("`services` is not a plain mapping.");
  return { text, doc, services, nl: text.includes("\r\n") ? "\r\n" : "\n" };
}

function pairOf(map: YAMLMap, key: string): Pair<unknown, unknown> | undefined {
  return map.items.find((p): p is Pair<unknown, unknown> => isPair(p) && isScalar(p.key) && p.key.value === key);
}

/** Find a service mapping that is safe to edit, or explain why not. */
function serviceNode(l: Loaded, name: string): YAMLMap | { ok: false; reason: string } {
  const pair = pairOf(l.services, name);
  if (!pair) return fail(`Service "${name}" is not defined in this file.`);
  const node = pair.value;
  if (isAlias(node)) return fail(`"${name}" is defined through a YAML alias; editing it would change shared configuration.`);
  if (!isMap(node)) return fail(`"${name}" is not a mapping.`);
  if (node.anchor) return fail(`"${name}" has a YAML anchor that other services may reuse; editing it could change them too.`);
  if (node.items.some((p) => isPair(p) && isScalar(p.key) && p.key.value === "<<")) return fail(`"${name}" uses a YAML merge key (<<); its inherited settings cannot be edited safely.`);
  if (node.has("extends")) return fail(`"${name}" uses \`extends\`; inherited settings live elsewhere.`);
  return node;
}

/** A field node must be plain data we can see: no alias, no anchor, no interpolation. */
function checkField(l: Loaded, svc: string, field: string, node: unknown): string | null {
  if (node === undefined || node === null) return null;
  if (isAlias(node)) return `services.${svc}.${field} is a YAML alias.`;
  const n = node as Node;
  if (n.anchor) return `services.${svc}.${field} has a YAML anchor that may be reused elsewhere.`;
  const r = n.range;
  if (r && /\$/.test(l.text.slice(r[0], r[1]))) return `services.${svc}.${field} uses variable interpolation, so its final value is unknown.`;
  if (isMap(n) || isSeq(n)) {
    let bad: string | null = null;
    const visit = (x: unknown) => {
      if (bad) return;
      if (isAlias(x)) bad = `services.${svc}.${field} contains a YAML alias.`;
      else if (isMap(x) || isSeq(x)) {
        if ((x as Node).anchor) bad = `services.${svc}.${field} contains a YAML anchor.`;
        for (const it of x.items) visit(isPair(it) ? it.value : it);
        if (isMap(x)) for (const it of x.items) if (isPair(it) && isAlias(it.key)) bad = `services.${svc}.${field} contains a YAML alias key.`;
      }
    };
    visit(n);
    return bad;
  }
  return null;
}

const lineStart = (t: string, pos: number) => t.lastIndexOf("\n", pos - 1) + 1;
/** End of the line holding the content that ends at `pos`. Block nodes report an end after their newline. */
const lineEnd = (t: string, pos: number) => {
  let p = pos;
  while (p > 0 && /\s/.test(t[p - 1]!)) p--;
  const i = t.indexOf("\n", p);
  const end = i === -1 ? t.length : i;
  return t[end - 1] === "\r" ? end - 1 : end;
};
function indentAt(t: string, pos: number): string | null {
  const lead = t.slice(lineStart(t, pos), pos);
  if (/^[ ]*$/.test(lead)) return lead;
  // Block sequence items can sit after "- " on their line; we only need pure-space indentation.
  return null;
}

function renderScalar(original: unknown, value: string): string {
  const type = isScalar(original) ? original.type : "PLAIN";
  if (type === "QUOTE_DOUBLE") return JSON.stringify(value);
  if (type === "QUOTE_SINGLE") return `'${value.replace(/'/g, "''")}'`;
  return value;
}

function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.insert + out.slice(e.end);
  return out;
}

/** Append an item to a flow or block sequence. */
function appendToSeq(l: Loaded, seq: Node & { items: unknown[]; flow?: boolean }, item: string): Edit | string {
  const r = seq.range!;
  if (seq.flow) {
    const close = l.text.lastIndexOf("]", r[1]);
    if (close < r[0]) return "Could not locate the end of the list.";
    return { start: close, end: close, insert: seq.items.length ? `, ${item}` : item };
  }
  const last = seq.items[seq.items.length - 1] as Node | undefined;
  if (!last?.range) return "Could not locate the last list item.";
  const indent = indentAt(l.text, r[0]);
  if (indent === null) return "The list is not laid out on its own lines.";
  const at = lineEnd(l.text, last.range[1]);
  return { start: at, end: at, insert: `${l.nl}${indent}- ${item}` };
}

/** Append `key` (null or {}) to a flow or block mapping. Returns the inserted value for verification. */
function appendToMap(l: Loaded, map: YAMLMap, keyText: string): { edit: Edit; value: unknown } | string {
  const r = map.range!;
  if (map.flow) {
    const close = l.text.lastIndexOf("}", r[1]);
    if (close < r[0]) return "Could not locate the end of the mapping.";
    return { edit: { start: close, end: close, insert: `${map.items.length ? ", " : ""}${keyText}: {}` }, value: {} };
  }
  const last = map.items[map.items.length - 1];
  if (!isPair(last)) return "Could not locate the last entry.";
  const end = (isScalar(last.value) || isMap(last.value) || isSeq(last.value) ? (last.value as Node).range?.[1] : undefined) ?? (last.key as Node).range?.[1];
  const indent = indentAt(l.text, r[0]);
  if (end === undefined || indent === null) return "The mapping layout is not supported.";
  const at = lineEnd(l.text, end);
  return { edit: { start: at, end: at, insert: `${l.nl}${indent}${keyText}:` }, value: null };
}

/** Append a `key: valueText` pair to a service mapping (flow or block). */
function appendPair(l: Loaded, map: YAMLMap, key: string, valueText: string): Edit | string {
  const r = map.range!;
  if (map.flow) {
    const close = l.text.lastIndexOf("}", r[1]);
    if (close < r[0]) return "Could not locate the end of the service definition.";
    return { start: close, end: close, insert: `${map.items.length ? ", " : ""}${key}: ${valueText}` };
  }
  const first = map.items[0];
  const last = map.items[map.items.length - 1];
  if (!isPair(first) || !isPair(last)) return "The service definition layout is not supported.";
  const firstKey = (first.key as Node).range?.[0];
  const end = (last.value as Node | null)?.range?.[1] ?? (last.key as Node).range?.[1];
  if (firstKey === undefined || end === undefined) return "The service definition layout is not supported.";
  const indent = indentAt(l.text, firstKey);
  if (indent === null) return "The service definition is not laid out on its own lines.";
  const at = lineEnd(l.text, end);
  return { start: at, end: at, insert: `${l.nl}${indent}${key}: ${valueText}` };
}

// ---------- semantic verification ----------

function toJS(text: string): unknown {
  const docs = parseAllDocuments(text);
  if (!Array.isArray(docs) || docs.length !== 1 || docs[0]!.errors.length) return undefined;
  return docs[0]!.toJS({ maxAliasCount: 100 });
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => deepEqual(x, (b as unknown[])[i]));
  const ka = Object.keys(a as Obj);
  const kb = Object.keys(b as Obj);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as Obj)[k], (b as Obj)[k]));
}

function verify(original: string, patched: string, mutate: (js: Obj) => void): PatchResult {
  const before = toJS(original);
  const after = toJS(patched);
  if (!before || !after || typeof before !== "object") return fail("The proposed file did not re-parse cleanly, so no change is offered.");
  const expected = structuredClone(before) as Obj;
  mutate(expected);
  if (!deepEqual(expected, after)) return fail("The edit could not be made without touching other configuration, so no change is offered.");
  return { ok: true, text: patched };
}

const svcJS = (js: Obj, name: string) => (js.services as Obj)[name] as Obj;

// ---------- public patch operations ----------

/** Attach `service` to network `network` (a top-level key, or the implicit `default`). */
export function attachNetwork(text: string, service: string, network: string): PatchResult {
  if (!SERVICE_NAME.test(service) || !SERVICE_NAME.test(network)) return fail("Unexpected service or network name.");
  const l = load(text);
  if ("ok" in l) return l;
  const svc = serviceNode(l, service);
  if ("ok" in svc) return svc;
  if (svc.has("network_mode")) return fail(`"${service}" uses network_mode, which cannot be combined with networks.`);

  const top = l.doc.contents as YAMLMap;
  const nets = top.get("networks", true);
  if (network !== "default") {
    if (!isMap(nets) || !pairOf(nets, network)) return fail(`Network "${network}" is not declared at the top level.`);
    const def = pairOf(nets, network)!.value;
    if (isAlias(def)) return fail(`Network "${network}" is defined through a YAML alias.`);
  }

  const field = svc.get("networks", true);
  const why = checkField(l, service, "networks", field);
  if (why) return fail(why);

  let edit: Edit | string;
  let mutate: (js: Obj) => void;
  if (field === undefined) {
    // No `networks` key means the implicit default network. Keep it, or the service would lose it.
    const list = network === "default" ? "[default]" : `[default, ${network}]`;
    edit = appendPair(l, svc, "networks", list);
    mutate = (js) => {
      svcJS(js, service).networks = network === "default" ? ["default"] : ["default", network];
    };
  } else if (isSeq(field)) {
    if (field.items.some((x) => isScalar(x) && x.value === network)) return fail(`"${service}" is already attached to "${network}".`);
    edit = appendToSeq(l, field, network);
    mutate = (js) => {
      (svcJS(js, service).networks as unknown[]).push(network);
    };
  } else if (isMap(field)) {
    if (pairOf(field, network)) return fail(`"${service}" is already attached to "${network}".`);
    const r = appendToMap(l, field, network);
    if (typeof r === "string") return fail(r);
    edit = r.edit;
    mutate = (js) => {
      (svcJS(js, service).networks as Obj)[network] = r.value;
    };
  } else {
    return fail(`services.${service}.networks has an unsupported shape.`);
  }
  if (typeof edit === "string") return fail(edit);
  return verify(text, applyEdits(text, [edit]), mutate);
}

/** Replace references to `from` with `to` in depends_on (list or map) and links of `services`. */
export function retargetDependency(text: string, services: string[], from: string, to: string): PatchResult {
  if (!SERVICE_NAME.test(from) || !SERVICE_NAME.test(to) || !services.every((s) => SERVICE_NAME.test(s))) return fail("Unexpected service name.");
  const l = load(text);
  if ("ok" in l) return l;
  if (!pairOf(l.services, to)) return fail(`Service "${to}" is not defined in this file.`);

  const edits: Edit[] = [];
  const mutations: ((js: Obj) => void)[] = [];

  for (const name of services) {
    const svc = serviceNode(l, name);
    if ("ok" in svc) return svc;
    const nm = svc.get("network_mode");
    if (typeof nm === "string" && nm === `service:${from}`) return fail(`"${name}" also uses network_mode: service:${from}; change that by hand.`);
    let touched = false;

    const dep = svc.get("depends_on", true);
    const whyDep = checkField(l, name, "depends_on", dep);
    if (whyDep) return fail(whyDep);
    if (isSeq(dep)) {
      if (dep.items.some((x) => isScalar(x) && x.value === to)) return fail(`"${name}" already depends on "${to}"; remove the "${from}" reference by hand.`);
      dep.items.forEach((x) => {
        if (isScalar(x) && x.value === from && x.range) {
          edits.push({ start: x.range[0], end: x.range[1], insert: renderScalar(x, to) });
          touched = true;
        }
      });
      if (touched) mutations.push((js) => {
        const s = svcJS(js, name);
        s.depends_on = (s.depends_on as unknown[]).map((x) => (x === from ? to : x));
      });
    } else if (isMap(dep)) {
      if (pairOf(dep, to)) return fail(`"${name}" already depends on "${to}"; remove the "${from}" reference by hand.`);
      const p = pairOf(dep, from);
      const k = p?.key as Node | undefined;
      if (p && k?.range) {
        edits.push({ start: k.range[0], end: k.range[1], insert: renderScalar(p.key, to) });
        touched = true;
        mutations.push((js) => {
          const d = svcJS(js, name).depends_on as Obj;
          const v = d[from];
          delete d[from];
          d[to] = v;
        });
      }
    }

    const links = svc.get("links", true);
    const whyLinks = checkField(l, name, "links", links);
    if (whyLinks) return fail(whyLinks);
    if (isSeq(links)) {
      let linkTouched = false;
      links.items.forEach((x) => {
        if (!isScalar(x) || typeof x.value !== "string" || !x.range) return;
        const [target, alias] = x.value.split(":");
        if (target !== from) return;
        // Keep the old name as the alias so code that used "postgres" as a hostname keeps resolving.
        edits.push({ start: x.range[0], end: x.range[1], insert: renderScalar(x, `${to}:${alias ?? from}`) });
        linkTouched = true;
      });
      if (linkTouched) {
        touched = true;
        mutations.push((js) => {
          const s = svcJS(js, name);
          s.links = (s.links as string[]).map((v) => {
            const [t, a] = v.split(":");
            return t === from ? `${to}:${a ?? from}` : v;
          });
        });
      }
    }
    if (!touched) return fail(`No reference to "${from}" was found in "${name}".`);
  }
  return verify(text, applyEdits(text, edits), (js) => mutations.forEach((m) => m(js)));
}
