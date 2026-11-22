import type { PortBinding } from "./types";

const MAX_EXPANSION = 256;

function parseRange(s: string): [number, number] | null {
  const m = /^(\d+)(?:-(\d+))?$/.exec(s);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? a : Number(m[2]);
  if (b < a || a > 65535 || b > 65535) return null;
  return [a, b];
}

function expand(
  hostIp: string | undefined,
  published: string | undefined,
  target: string,
  protocol: string,
  raw: string,
): PortBinding[] {
  const t = parseRange(target);
  const p = published === undefined ? undefined : parseRange(published);
  const unresolved = (): PortBinding[] => [
    { hostIp, published, target, protocol, raw, unresolved: true },
  ];
  if (!t || (published !== undefined && !p)) return unresolved();
  const tCount = t[1] - t[0] + 1;
  if (p && p[1] - p[0] + 1 !== tCount && tCount > 1) return unresolved();
  if (tCount > MAX_EXPANSION) return unresolved();
  if (tCount === 1 && (!p || p[0] === p[1])) {
    return [{ hostIp, published: p ? String(p[0]) : undefined, target: String(t[0]), protocol, raw }];
  }
  const out: PortBinding[] = [];
  for (let i = 0; i < tCount; i++) {
    out.push({
      hostIp,
      published: p ? String(p[0] + i) : undefined,
      target: String(t[0] + i),
      protocol,
      raw,
    });
  }
  return out;
}

/** Parse one entry of a service's `ports` list (short or long syntax). */
export function parsePortEntry(entry: unknown): PortBinding[] {
  if (typeof entry === "number") {
    return expand(undefined, undefined, String(entry), "tcp", String(entry));
  }
  if (typeof entry === "string") return parseShort(entry.trim());
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const e = entry as Record<string, unknown>;
    const target = e.target === undefined ? "" : String(e.target);
    const published = e.published === undefined || e.published === null ? undefined : String(e.published);
    const protocol = typeof e.protocol === "string" ? e.protocol.toLowerCase() : "tcp";
    const hostIp = typeof e.host_ip === "string" ? e.host_ip : undefined;
    const raw = `${hostIp ? `${hostIp}:` : ""}${published ?? ""}:${target}/${protocol}`;
    if (!target || target.includes("$") || (published?.includes("$") ?? false)) {
      return [{ hostIp, published, target: target || "?", protocol, raw, unresolved: true }];
    }
    return expand(hostIp, published, target, protocol, raw);
  }
  return [{ target: "?", protocol: "tcp", raw: String(entry), unresolved: true }];
}

function parseShort(raw: string): PortBinding[] {
  if (raw.includes("$")) {
    return [{ target: raw, protocol: "tcp", raw, unresolved: true }];
  }
  let body = raw;
  let protocol = "tcp";
  const slash = body.lastIndexOf("/");
  if (slash !== -1) {
    protocol = body.slice(slash + 1).toLowerCase() || "tcp";
    body = body.slice(0, slash);
  }
  let hostIp: string | undefined;
  if (body.startsWith("[")) {
    const end = body.indexOf("]");
    if (end === -1) return [{ target: raw, protocol, raw, unresolved: true }];
    hostIp = body.slice(1, end);
    body = body.slice(end + 1).replace(/^:/, "");
    const parts = body.split(":");
    if (parts.length === 2) return expand(hostIp, parts[0] || undefined, parts[1] ?? "", protocol, raw);
    return [{ hostIp, target: raw, protocol, raw, unresolved: true }];
  }
  const parts = body.split(":");
  if (parts.length === 1) return expand(undefined, undefined, parts[0] ?? "", protocol, raw);
  if (parts.length === 2) return expand(undefined, parts[0] || undefined, parts[1] ?? "", protocol, raw);
  if (parts.length === 3) {
    return expand(parts[0] || undefined, parts[1] || undefined, parts[2] ?? "", protocol, raw);
  }
  return [{ target: raw, protocol, raw, unresolved: true }];
}

/** Human-readable label used in evidence. */
export function describeBinding(b: PortBinding): string {
  if (b.unresolved) return `${b.raw} (unresolved)`;
  const host = `${b.hostIp ? `${b.hostIp}:` : ""}${b.published ?? "<ephemeral>"}`;
  return `${host} -> ${b.target}/${b.protocol}`;
}
