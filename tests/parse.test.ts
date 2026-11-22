import { describe, expect, it } from "vitest";
import { parseCompose } from "@/lib/compose/parse";
import { parsePortEntry } from "@/lib/compose/ports";
import { redact } from "@/lib/compose/redact";

function ok(yaml: string) {
  const r = parseCompose(yaml);
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  return r.compose;
}

describe("parseCompose", () => {
  it("normalizes services, default network, ports, deps, volumes", () => {
    const c = ok(`
services:
  api:
    image: acme/api
    ports: ["8080:80", "127.0.0.1:9000:9000/udp"]
    depends_on: { db: { condition: service_healthy, required: false } }
    volumes: ["data:/var/data", "./src:/app:ro"]
  db:
    image: postgres
volumes:
  data:
`);
    expect(c.services.api!.networks).toEqual(["default"]);
    expect(c.networks.default).toMatchObject({ declared: false, identity: "project:default" });
    expect(c.services.api!.ports).toHaveLength(2);
    expect(c.services.api!.dependsOn).toEqual([{ service: "db", condition: "service_healthy", required: false }]);
    expect(c.services.api!.volumes.map((v) => [v.type, v.readOnly])).toEqual([["volume", false], ["bind", true]]);
    expect(c.volumes).toEqual(["data"]);
  });

  it("stores env keys but never values", () => {
    const c = ok(`
services:
  a:
    image: x
    environment:
      TOKEN: super-secret-value
      EMPTY: ""
      PASS:
      URL: "\${HOST}/x"
  b:
    image: x
    environment: ["K=v", "BARE"]
`);
    expect(c.services.a!.env).toEqual({ TOKEN: "set", EMPTY: "empty", PASS: "passthrough", URL: "interpolated" });
    expect(c.services.b!.env).toEqual({ K: "set", BARE: "passthrough" });
    expect(JSON.stringify(c)).not.toContain("super-secret-value");
  });

  it("supports YAML anchors and merge keys", () => {
    const c = ok(`
x-common: &common
  image: acme/base
  networks: [n]
services:
  a: { <<: *common }
networks: { n: {} }
`);
    expect(c.services.a!.image).toBe("acme/base");
    expect(c.services.a!.networks).toEqual(["n"]);
  });

  it("treats explicit network_mode as having no default network", () => {
    const c = ok("services:\n  a:\n    image: x\n    network_mode: host\n");
    expect(c.services.a!.networks).toEqual([]);
  });

  it("resolves external and named network identities", () => {
    const c = ok(`
services: { a: { image: x, networks: [front, ext] } }
networks:
  front: { name: shared-front }
  ext: { external: true }
`);
    expect(c.networks.front!.identity).toBe("named:shared-front");
    expect(c.networks.ext!.identity).toBe("external:ext");
  });

  it("reports malformed YAML without throwing or echoing source", () => {
    const r = parseCompose("services:\n  a:\n    image: [unclosed\n    password: hunter2hunter2\n");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.diagnostics[0]!.level).toBe("error");
      expect(JSON.stringify(r.diagnostics)).not.toContain("hunter2");
    }
  });

  it.each([
    ["empty string", ""],
    ["scalar", "hello"],
    ["list", "- a\n- b"],
    ["no services", "version: '3'\n"],
    ["empty services", "services: {}\n"],
    ["duplicate keys", "services:\n  a: {image: x}\n  a: {image: y}\n"],
  ])("rejects %s", (_n, yaml) => {
    expect(parseCompose(yaml).ok).toBe(false);
  });

  it("rejects alias bombs and oversized input", () => {
    const lines = ["a: &a [x,x,x,x,x,x,x,x,x]"];
    for (let i = 0; i < 10; i++) lines.push(`${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${Array(9).fill("*" + String.fromCharCode(97 + i)).join(",")}]`);
    expect(parseCompose(`services: {s: {image: x}}\nx-bomb:\n  ${lines.join("\n  ")}\n`).ok).toBe(false);
    expect(parseCompose("a".repeat(600 * 1024)).ok).toBe(false);
  });

  it("warns about include and extends instead of silently ignoring them", () => {
    const c = ok("include: [other.yml]\nservices:\n  a:\n    extends: { service: b }\n");
    expect(c.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(["include-unsupported", "extends-unsupported"]));
  });

  it("does not execute or evaluate YAML tags", () => {
    const r = parseCompose("services:\n  a:\n    image: !!js/function 'function(){}'\n");
    // Either rejected or kept inert; it must not throw.
    expect(typeof r.ok).toBe("boolean");
  });
});

describe("parsePortEntry", () => {
  it("parses short forms", () => {
    expect(parsePortEntry("80")[0]).toMatchObject({ published: undefined, target: "80", protocol: "tcp" });
    expect(parsePortEntry("8080:80")[0]).toMatchObject({ published: "8080", target: "80" });
    expect(parsePortEntry("127.0.0.1:8080:80")[0]).toMatchObject({ hostIp: "127.0.0.1", published: "8080", target: "80" });
    expect(parsePortEntry("127.0.0.1::80")[0]).toMatchObject({ hostIp: "127.0.0.1", published: undefined, target: "80" });
    expect(parsePortEntry("[::1]:8080:80")[0]).toMatchObject({ hostIp: "::1", published: "8080", target: "80" });
    expect(parsePortEntry("53:53/udp")[0]).toMatchObject({ protocol: "udp" });
    expect(parsePortEntry(80)[0]).toMatchObject({ target: "80" });
  });
  it("expands equal-length ranges and flags mismatches", () => {
    expect(parsePortEntry("8000-8002:9000-9002").map((p) => [p.published, p.target])).toEqual([
      ["8000", "9000"],
      ["8001", "9001"],
      ["8002", "9002"],
    ]);
    expect(parsePortEntry("8000-8002:9000-9005")[0]!.unresolved).toBe(true);
  });
  it("parses long syntax", () => {
    expect(parsePortEntry({ target: 80, published: 8080, host_ip: "127.0.0.1", protocol: "udp" })[0]).toMatchObject({
      target: "80",
      published: "8080",
      hostIp: "127.0.0.1",
      protocol: "udp",
    });
  });
  it("marks interpolation and garbage unresolved", () => {
    expect(parsePortEntry("${PORT}:80")[0]!.unresolved).toBe(true);
    expect(parsePortEntry("abc:def")[0]!.unresolved).toBe(true);
    expect(parsePortEntry("1:2:3:4")[0]!.unresolved).toBe(true);
    expect(parsePortEntry("99999:80")[0]!.unresolved).toBe(true);
  });
});

describe("redact", () => {
  it("redacts URL credentials, sensitive assignments, and long tokens", () => {
    expect(redact("postgres://app:hunter2@db/x")).not.toContain("hunter2");
    expect(redact("API_KEY=abc123")).not.toContain("abc123");
    expect(redact("token: abcdefghijklmnopqrstuvwxyz0123456789ABCD")).not.toContain("abcdefghijklmnop");
    expect(redact("nginx:1.27")).toBe("nginx:1.27");
  });
});
