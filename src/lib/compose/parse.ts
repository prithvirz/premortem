import { parseDocument } from "yaml";
import { parsePortEntry } from "./ports";
import { redact } from "./redact";
import type {
  Dependency,
  Diagnostic,
  EnvState,
  NetworkDef,
  NormalizedCompose,
  NormalizedService,
  ParseResult,
  PortBinding,
  VolumeMount,
} from "./types";

export const MAX_INPUT_BYTES = 512 * 1024;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Parse arbitrary YAML text (data only, nothing is executed). Never throws. */
export function parseYamlSafely(
  text: string,
): { ok: true; value: unknown; warnings: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] } {
  if (text.length > MAX_INPUT_BYTES) {
    return {
      ok: false,
      diagnostics: [{ level: "error", code: "input-too-large", message: `Input exceeds ${MAX_INPUT_BYTES / 1024} KiB.` }],
    };
  }
  try {
    const doc = parseDocument(text, { merge: true, uniqueKeys: true, prettyErrors: false });
    if (doc.errors.length > 0) {
      return {
        ok: false,
        diagnostics: doc.errors.map((e) => ({
          level: "error" as const,
          code: `yaml-${e.code}`,
          // Only the first line: later lines of yaml errors can quote source text.
          message: redact((e.message.split("\n")[0] ?? "Invalid YAML").trim()),
          line: e.linePos?.[0]?.line,
        })),
      };
    }
    const warnings: Diagnostic[] = doc.warnings.map((w) => ({
      level: "warning" as const,
      code: `yaml-${w.code}`,
      message: redact((w.message.split("\n")[0] ?? "").trim()),
      line: w.linePos?.[0]?.line,
    }));
    return { ok: true, value: doc.toJS({ maxAliasCount: 100 }) as unknown, warnings };
  } catch (err) {
    const msg = err instanceof Error ? (err.message.split("\n")[0] ?? "") : "Invalid YAML";
    return { ok: false, diagnostics: [{ level: "error", code: "yaml-exception", message: redact(msg) }] };
  }
}

function envState(value: unknown): EnvState {
  if (value === null || value === undefined) return "passthrough";
  if (value === "") return "empty";
  if (typeof value === "string" && value.includes("${")) return "interpolated";
  return "set";
}

function parseEnvironment(raw: unknown): Record<string, EnvState> {
  const out: Record<string, EnvState> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const eq = item.indexOf("=");
      if (eq === -1) out[item] = "passthrough";
      else out[item.slice(0, eq)] = envState(item.slice(eq + 1));
    }
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) out[k] = envState(v);
  }
  return out;
}

function parseEnvFiles(raw: unknown): string[] {
  if (typeof raw === "string") return [raw];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => (typeof e === "string" ? e : isObj(e) && typeof e.path === "string" ? e.path : ""))
    .filter(Boolean);
}

function parseDependsOn(raw: unknown): Dependency[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string").map((service) => ({ service, required: true }));
  }
  if (isObj(raw)) {
    return Object.entries(raw).map(([service, v]) => ({
      service,
      condition: isObj(v) && typeof v.condition === "string" ? v.condition : undefined,
      required: isObj(v) && v.required === false ? false : true,
    }));
  }
  return [];
}

function parseVolumeEntry(entry: unknown): VolumeMount | null {
  if (typeof entry === "string") {
    let rest = entry;
    let prefix = "";
    const drive = /^[A-Za-z]:[\\/]/.exec(rest);
    if (drive) {
      prefix = rest.slice(0, 2);
      rest = rest.slice(2);
    }
    const parts = rest.split(":");
    if (parts.length === 1) return { type: "volume", target: prefix + parts[0], readOnly: false };
    const source = prefix + parts[0];
    const target = parts[1] ?? "";
    const mode = parts[2] ?? "";
    const isBind = /^(\.|\/|~|[A-Za-z]:[\\/])/.test(source);
    return { type: isBind ? "bind" : "volume", source, target, readOnly: mode.split(",").includes("ro") };
  }
  if (isObj(entry) && typeof entry.target === "string") {
    const t = entry.type;
    return {
      type: t === "volume" || t === "bind" || t === "tmpfs" ? t : "other",
      source: typeof entry.source === "string" ? entry.source : undefined,
      target: entry.target,
      readOnly: entry.read_only === true,
    };
  }
  return null;
}

function networkKeysOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (isObj(raw)) return Object.keys(raw);
  return [];
}

function normalizeService(name: string, raw: unknown, diags: Diagnostic[]): NormalizedService {
  let svc: Obj = {};
  if (isObj(raw)) svc = raw;
  else diags.push({ level: "warning", code: "service-not-mapping", service: name, message: `Service "${name}" is not a mapping; treated as empty.` });

  const networksExplicit = svc.networks !== undefined && svc.networks !== null;
  const networkMode = typeof svc.network_mode === "string" ? svc.network_mode : undefined;
  const keys = networksExplicit ? networkKeysOf(svc.networks) : [];

  const ports: PortBinding[] = Array.isArray(svc.ports) ? svc.ports.flatMap((p) => parsePortEntry(p)) : [];
  for (const p of ports) {
    if (p.unresolved) {
      diags.push({
        level: "warning",
        code: "port-unresolved",
        service: name,
        message: `Port entry "${redact(p.raw)}" on "${name}" contains interpolation or an unsupported form and was not compared.`,
      });
    }
  }

  const links = Array.isArray(svc.links)
    ? svc.links.filter((x): x is string => typeof x === "string").map((l) => l.split(":")[0] ?? l)
    : [];

  let build: string | undefined;
  if (typeof svc.build === "string") build = svc.build;
  else if (isObj(svc.build) && typeof svc.build.context === "string") build = svc.build.context;

  return {
    name,
    image: typeof svc.image === "string" ? svc.image : undefined,
    build,
    // A service with network_mode has no `networks`; otherwise Compose attaches it to "default".
    networks: networkMode ? keys : keys.length > 0 || networksExplicit ? keys : ["default"],
    networksExplicit,
    networkMode,
    ports,
    expose: Array.isArray(svc.expose) ? svc.expose.map(String) : [],
    dependsOn: parseDependsOn(svc.depends_on),
    links,
    env: parseEnvironment(svc.environment),
    envFiles: parseEnvFiles(svc.env_file),
    volumes: Array.isArray(svc.volumes)
      ? svc.volumes.map(parseVolumeEntry).filter((v): v is VolumeMount => v !== null)
      : [],
    profiles: Array.isArray(svc.profiles) ? svc.profiles.map(String) : [],
    usesExtends: svc.extends !== undefined,
  };
}

function networkIdentity(key: string, def: Obj | null): { identity: string; external: boolean } {
  const external = def?.external === true || isObj(def?.external);
  const name = typeof def?.name === "string" ? def.name : isObj(def?.external) && typeof def.external.name === "string" ? def.external.name : undefined;
  if (external) return { identity: `external:${name ?? key}`, external: true };
  if (name) return { identity: `named:${name}`, external: false };
  return { identity: `project:${key}`, external: false };
}

/** Normalize an already-parsed YAML value into the PreMortem model. */
export function normalizeCompose(value: unknown, warnings: Diagnostic[] = []): ParseResult {
  const diagnostics: Diagnostic[] = [...warnings];
  if (!isObj(value)) {
    return {
      ok: false,
      diagnostics: [...diagnostics, { level: "error", code: "not-a-mapping", message: "A Compose file must be a YAML mapping with a top-level `services` key." }],
    };
  }
  if (!isObj(value.services) || Object.keys(value.services).length === 0) {
    return {
      ok: false,
      diagnostics: [...diagnostics, { level: "error", code: "no-services", message: "No services found. Expected a non-empty `services` mapping." }],
    };
  }
  if (value.include !== undefined) {
    diagnostics.push({ level: "warning", code: "include-unsupported", message: "`include` is not followed. Only this single file is analyzed, so results may be incomplete." });
  }

  const services: Record<string, NormalizedService> = {};
  for (const [name, raw] of Object.entries(value.services)) {
    const svc = normalizeService(name, raw, diagnostics);
    if (svc.usesExtends) {
      diagnostics.push({ level: "warning", code: "extends-unsupported", service: name, message: `"${name}" uses \`extends\`; inherited settings are not resolved.` });
    }
    services[name] = svc;
  }

  const networks: Record<string, NetworkDef> = {};
  const declared = isObj(value.networks) ? value.networks : {};
  for (const [key, def] of Object.entries(declared)) {
    networks[key] = { key, declared: true, ...networkIdentity(key, isObj(def) ? def : null) };
  }
  // The implicit default network exists whenever a service relies on it.
  if (!networks.default && Object.values(services).some((s) => s.networks.includes("default"))) {
    networks.default = { key: "default", declared: false, ...networkIdentity("default", null) };
  }

  const volumes = isObj(value.volumes) ? Object.keys(value.volumes) : [];
  return { ok: true, compose: { services, networks, volumes, diagnostics } };
}

/** Parse Compose YAML text into the normalized model. Never throws. */
export function parseCompose(text: string): ParseResult {
  const parsed = parseYamlSafely(text);
  if (!parsed.ok) return parsed;
  return normalizeCompose(parsed.value, parsed.warnings);
}

