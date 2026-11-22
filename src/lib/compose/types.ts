/** Normalized, secret-free model of a Docker Compose project. */

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface Diagnostic {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  line?: number;
  service?: string;
}

export interface PortBinding {
  /** Host interface, e.g. "127.0.0.1". Undefined means all interfaces. */
  hostIp?: string;
  /** Host port. Undefined means Docker picks an ephemeral port. */
  published?: string;
  /** Container port. */
  target: string;
  protocol: string;
  /** Original short-syntax string or a rendering of the long syntax (not secret-bearing). */
  raw: string;
  /** True when the entry contains interpolation or a shape we could not resolve. */
  unresolved?: boolean;
}

export interface Dependency {
  service: string;
  condition?: string;
  required: boolean;
}

/** Whether an environment variable is declared, never its value. */
export type EnvState = "set" | "empty" | "passthrough" | "interpolated";

export interface VolumeMount {
  type: "volume" | "bind" | "tmpfs" | "other";
  source?: string;
  target: string;
  readOnly: boolean;
}

export interface NormalizedService {
  name: string;
  image?: string;
  /** Build context only; build args may hold secrets and are not retained. */
  build?: string;
  /** Network keys the service is attached to (implicit "default" when omitted). */
  networks: string[];
  networksExplicit: boolean;
  networkMode?: string;
  ports: PortBinding[];
  expose: string[];
  dependsOn: Dependency[];
  /** Target service names from `links`. */
  links: string[];
  env: Record<string, EnvState>;
  envFiles: string[];
  volumes: VolumeMount[];
  profiles: string[];
  usesExtends: boolean;
}

export interface NetworkDef {
  key: string;
  /**
   * Identity of the real Docker network. Two keys with the same identity are the
   * same network; one key with different identities across versions is a different network.
   */
  identity: string;
  external: boolean;
  /** True when the key is declared at top level (the implicit default is not). */
  declared: boolean;
}

export interface NormalizedCompose {
  services: Record<string, NormalizedService>;
  networks: Record<string, NetworkDef>;
  volumes: string[];
  diagnostics: Diagnostic[];
}

export type ParseResult =
  | { ok: true; compose: NormalizedCompose }
  | { ok: false; diagnostics: Diagnostic[] };

export interface Evidence {
  side: "before" | "after";
  /** Compose path, e.g. services.api.networks */
  path: string;
  /** Already redacted. */
  value: string;
}

export interface Relationship {
  from: string;
  to: string;
  type: "depends_on" | "links" | "network" | "network_mode" | "published_port" | "container_port";
  status: "broken" | "at-risk" | "intact" | "unaffected";
  note?: string;
}

export type RuleId =
  | "network-lost"
  | "dependency-dangling"
  | "network-undefined"
  | "port-removed"
  | "port-host-changed"
  | "port-target-changed"
  | "port-exposure-widened"
  | "env-required-removed";

export interface Finding {
  /** Deterministic id for stable tests and UI keys. */
  id: string;
  ruleId: RuleId;
  severity: Severity;
  service: string;
  title: string;
  /** What changed in the files. A fact. */
  confirmedChange: string;
  /** What this might cause at runtime. Always phrased as a possibility. */
  possibleConsequence: string;
  /** Why this is flagged, citing Compose semantics. */
  reason: string;
  /** compose-validation: Compose would reject the file. inferred: static inference. policy: a provided policy. */
  basis: "compose-validation" | "inferred" | "policy";
  evidence: Evidence[];
  relationships: Relationship[];
  confidence: { level: ConfidenceLevel; uncertainty: string[] };
}

export interface RequiredEnvPolicy {
  /** Service name (or "*" for all services) to env var names that must stay declared. */
  requiredEnv: Record<string, string[]>;
}
