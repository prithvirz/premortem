import type { RequiredEnvPolicy, RuleId, Severity } from "../compose/types";

export interface ExpectedFinding {
  ruleId: RuleId;
  service: string;
  severity: Severity;
}

export interface Scenario {
  id: string;
  name: string;
  story: string;
  before: string;
  after: string;
  policy?: RequiredEnvPolicy;
  /** The exact set of findings the engine must produce. Verified by tests. */
  expected: ExpectedFinding[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "severed-cache",
    name: "The Severed Cache",
    story:
      "A team splits one flat network into frontend, backend, and cache tiers. The api is never attached to the cache network, so its declared dependency on redis has no path.",
    before: `services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    depends_on: [api]
  api:
    image: acme/api:2.4
    depends_on: [db, redis]
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
  redis:
    image: redis:7
volumes:
  pgdata:
`,
    after: `services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    depends_on: [api]
    networks: [frontend]
  api:
    image: acme/api:2.4
    depends_on: [db, redis]
    networks: [frontend, backend]
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks: [backend]
  redis:
    image: redis:7
    networks: [cache]
networks:
  frontend:
  backend:
  cache:
volumes:
  pgdata:
`,
    expected: [
      { ruleId: "network-lost", service: "api", severity: "high" },
      { ruleId: "network-lost", service: "db", severity: "info" },
      { ruleId: "network-lost", service: "redis", severity: "info" },
    ],
  },
  {
    id: "renamed-database",
    name: "The Renamed Database",
    story:
      "The postgres service is renamed to database, but two services still depend on the old name.",
    before: `services:
  app:
    build: .
    depends_on:
      - postgres
    ports:
      - "3000:3000"
  worker:
    image: acme/worker:1.9
    depends_on:
      postgres:
        condition: service_healthy
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
`,
    after: `services:
  app:
    build: .
    depends_on:
      - postgres
    ports:
      - "3000:3000"
  worker:
    image: acme/worker:1.9
    depends_on:
      postgres:
        condition: service_healthy
  database:
    image: postgres:16
    ports:
      - "5432:5432"
`,
    expected: [
      { ruleId: "dependency-dangling", service: "app", severity: "critical" },
      { ruleId: "dependency-dangling", service: "worker", severity: "critical" },
    ],
  },
  {
    id: "quiet-config-drift",
    name: "The Quiet Config Drift",
    story:
      "A cleanup commit drops a port, shifts another, opens a debug port to every interface, and removes variables that the team policy requires.",
    before: `services:
  proxy:
    image: nginx:1.27
    ports:
      - "80:80"
      - "443:443"
    depends_on: [api]
  api:
    image: acme/api:3.1
    ports:
      - "8080:3000"
      - "127.0.0.1:9229:9229"
    environment:
      DATABASE_URL: postgres://app:change-me@db:5432/app
      JWT_SECRET: change-me
      LOG_LEVEL: info
    depends_on: [db]
  worker:
    image: acme/worker:3.1
    environment:
      - REDIS_URL=redis://cache:6379
      - LOG_LEVEL=info
    depends_on: [cache]
  db:
    image: postgres:16
  cache:
    image: redis:7
`,
    after: `services:
  proxy:
    image: nginx:1.27
    ports:
      - "80:80"
    depends_on: [api]
  api:
    image: acme/api:3.1
    ports:
      - "8081:3000"
      - "9229:9229"
    environment:
      DATABASE_URL: postgres://app:change-me@db:5432/app
      LOG_LEVEL: info
    depends_on: [db]
  worker:
    image: acme/worker:3.1
    env_file: .env.worker
    environment:
      - LOG_LEVEL=info
    depends_on: [cache]
  db:
    image: postgres:16
  cache:
    image: redis:7
`,
    policy: {
      requiredEnv: {
        api: ["DATABASE_URL", "JWT_SECRET"],
        worker: ["REDIS_URL"],
      },
    },
    expected: [
      { ruleId: "env-required-removed", service: "api", severity: "high" },
      { ruleId: "env-required-removed", service: "worker", severity: "medium" },
      { ruleId: "port-exposure-widened", service: "api", severity: "medium" },
      { ruleId: "port-host-changed", service: "api", severity: "medium" },
      { ruleId: "port-removed", service: "proxy", severity: "medium" },
    ],
  },
];
