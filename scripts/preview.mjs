import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const number = process.argv[3];
if (!/^[1-9]\d*$/.test(number ?? "")) throw new Error("Expected a PR number");
const name = `pr-${number}`;
const project = process.env.NEON_PROJECT_ID;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!project || !account || !process.env.NEON_PREVIEW_PARENT_ID)
  throw new Error("Missing preview project or Cloudflare account");
const scratch = mkdtempSync(join(tmpdir(), "colorup-preview-"));

async function api(provider, path, method = "GET", body) {
  const neon = provider === "neon";
  const response = await fetch(
    `${neon ? "https://console.neon.tech/api/v2" : "https://api.cloudflare.com/client/v4"}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${neon ? process.env.NEON_API_KEY : process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  if (!response.ok) throw new Error(`${provider} ${method} failed (${response.status})`);
  if (response.status === 204) return;
  const result = await response.json();
  return neon ? result : result.result;
}
const run = (args, env = {}) =>
  execFileSync("pnpm", args, { stdio: "inherit", env: { ...process.env, ...env } });
const cfPath = `/accounts/${account}/hyperdrive/configs`;
const neonPath = `/projects/${project}`;

try {
  const { branches } = await api("neon", `${neonPath}/branches`);
  let branch = branches.find((value) => value.name === name);
  const configs = await api("cloudflare", cfPath);
  let hyperdrive = configs.find((value) => value.name === `colorup-${name}`);
  if (process.argv[2] === "delete") {
    const previewsPath = `/accounts/${account}/workers/workers/colorup/previews`;
    const previews = await api("cloudflare", `${previewsPath}?name=${name}&per_page=100`);
    const preview = previews.find((value) => value.name === name);
    if (preview) await api("cloudflare", `${previewsPath}/${preview.id}`, "DELETE");
    if (hyperdrive) await api("cloudflare", `${cfPath}/${hyperdrive.id}`, "DELETE");
    if (branch) await api("neon", `${neonPath}/branches/${branch.id}`, "DELETE");
    console.log(`Removed ${name}`);
  } else if (process.argv[2] === "deploy") {
    if (!branch) {
      if (branches.filter((value) => /^pr-\d+$/.test(value.name)).length >= 5)
        throw new Error("Five previews already exist; close one before deploying another");
      ({ branch } = await api("neon", `${neonPath}/branches`, "POST", {
        branch: { name, parent_id: process.env.NEON_PREVIEW_PARENT_ID },
        endpoints: [
          { type: "read_write", autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 0.25 },
        ],
      }));
    }
    const database = await api(
      "neon",
      `${neonPath}/connection_uri?${new URLSearchParams({
        branch_id: branch.id,
        database_name: "neondb",
        role_name: "neondb_owner",
      })}`,
    );
    const uri = database.uri;
    if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${uri}`);
    run(["--filter", "@stacks/api", "db:migrate"], { DATABASE_URL: uri });
    if (!hyperdrive) {
      const connection = new URL(uri);
      hyperdrive = await api("cloudflare", cfPath, "POST", {
        name: `colorup-${name}`,
        origin: {
          scheme: "postgresql",
          host: connection.hostname,
          port: Number(connection.port || 5432),
          database: connection.pathname.slice(1),
          user: decodeURIComponent(connection.username),
          password: decodeURIComponent(connection.password),
        },
        caching: { disabled: true },
      });
    }
    const url = `https://${name}-colorup.stephen-jcombs.workers.dev`;
    const config = {
      name: "colorup",
      main: join(process.cwd(), "apps/api/src/worker.ts"),
      compatibility_date: "2026-10-01",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        directory: join(process.cwd(), "apps/web/dist"),
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*"],
      },
      previews: {
        vars: {
          CLERK_AUTHORIZED_PARTIES: `${url},https://${name}.colorup.stephencodes.dev`,
        },
        hyperdrive: [{ binding: "HYPERDRIVE", id: hyperdrive.id }],
      },
    };
    const configPath = join(scratch, "wrangler.json");
    const secretsPath = join(scratch, "secrets.json");
    if (!process.env.CLERK_SECRET_KEY && !process.env.CLERK_JWT_KEY)
      throw new Error("Missing Clerk verification key");
    writeFileSync(configPath, JSON.stringify(config));
    writeFileSync(
      secretsPath,
      JSON.stringify(
        process.env.CLERK_JWT_KEY
          ? { CLERK_JWT_KEY: process.env.CLERK_JWT_KEY }
          : { CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY },
      ),
      {
        mode: 0o600,
      },
    );
    run(["--filter", "@stacks/web", "build"]);
    run([
      "--filter",
      "@stacks/api",
      "exec",
      "wrangler",
      "preview",
      "--config",
      configPath,
      "--name",
      name,
      "--secrets-file",
      secretsPath,
      "--ignore-base-config",
    ]);
    const health = await fetch(`${url}/api/health`);
    if (!health.ok) throw new Error(`Preview health check failed (${health.status})`);
    console.log(`Preview: ${url}`);
  } else throw new Error("Expected deploy or delete");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
