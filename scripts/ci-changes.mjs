import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Which CI jobs a diff can affect. An unrecognized path runs every job.
// The mobile bundle workflow keeps its own path filter.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "@stacks/api";
const WEB = "@stacks/web";
const MOBILE = "@stacks/mobile";

const SKIP_PREFIXES = [
  ".agents/",
  ".claude/",
  ".codex/",
  ".gemini/",
  ".github/screenshots/",
  ".vite-hooks/",
  "docs/",
  "tools/",
];

const SKIP_EXACT = new Set([
  ".env.example",
  ".gitignore",
  ".mcp.json",
  ".github/dependabot.yml",
  // mobile.yml is the path filter for the bundle workflow.
  ".github/workflows/mobile.yml",
  "docker-compose.yml",
]);

// Repo-wide config. A change here can affect every package.
const TOOLING = new Set([
  ".node-version",
  ".pnpmfile.cjs",
  "knip.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "vite.config.ts",
]);

const JOB_NAMES = ["check", "api", "build", "preview", "e2eWeb", "e2eMobile"];

let workspaces;

function blank(value) {
  return {
    check: value,
    api: value,
    build: value,
    preview: value,
    e2eWeb: value,
    e2eMobile: value,
  };
}

function load() {
  if (workspaces) return workspaces;
  const found = [];
  for (const parent of ["apps", "packages"]) {
    for (const name of readdirSync(join(root, parent))) {
      const dir = `${parent}/${name}`;
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
      } catch (error) {
        if (error && error.code === "ENOENT") continue;
        throw error;
      }
      const deps = new Set();
      for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const [dep, version] of Object.entries(pkg[field] ?? {})) {
          if (String(version).startsWith("workspace:")) deps.add(dep);
        }
      }
      found.push({ dir, name: pkg.name, deps });
    }
  }
  workspaces = found;
  return found;
}

export function dependentsOf(name, packages) {
  const dependers = new Map();
  for (const pkg of packages) {
    for (const dep of pkg.deps) {
      const list = dependers.get(dep) ?? [];
      list.push(pkg.name);
      dependers.set(dep, list);
    }
  }
  const seen = new Set([name]);
  const stack = [name];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const depender of dependers.get(current) ?? []) {
      if (seen.has(depender)) continue;
      seen.add(depender);
      stack.push(depender);
    }
  }
  return seen;
}

function everything() {
  return {
    all: true,
    packages: new Set(load().map((pkg) => pkg.name)),
    jobs: blank(true),
  };
}

function jobsOnly(partial) {
  const jobs = blank(false);
  for (const [name, value] of Object.entries(partial)) jobs[name] = value;
  return { all: false, packages: new Set(), jobs };
}

function affected(name) {
  const packages = dependentsOf(name, load());
  const jobs = blank(false);
  jobs.check = true;
  if (packages.has(API)) jobs.api = true;
  // The worker serves the built web app, so either one needs both builds.
  if (packages.has(WEB) || packages.has(API)) {
    jobs.build = true;
    jobs.preview = true;
    jobs.e2eWeb = true;
  }
  if (packages.has(MOBILE) || packages.has(API)) jobs.e2eMobile = true;
  return { all: false, packages, jobs };
}

function fullCheck() {
  const jobs = blank(false);
  jobs.check = true;
  jobs.api = true;
  jobs.build = true;
  return { all: false, packages: new Set(load().map((pkg) => pkg.name)), jobs };
}

function skipped(path) {
  if (path.endsWith(".md")) return true;
  if (SKIP_EXACT.has(path)) return true;
  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function tooling(path) {
  return TOOLING.has(path) || path.startsWith("patches/");
}

function webSuite(path) {
  // Playwright is not part of the worker bundle.
  return path.startsWith("apps/web/e2e/") || path === "apps/web/playwright.config.ts";
}

function special(path) {
  if (path === ".github/workflows/ci.yml") return fullCheck();
  if (path === ".github/workflows/e2e.yml") return jobsOnly({ e2eWeb: true, e2eMobile: true });
  if (path === ".github/workflows/preview.yml" || path === "scripts/preview.mjs")
    return jobsOnly({ check: true, preview: true });
  if (path === "scripts/ci-changes.mjs" || path === "scripts/ci-changes.test.ts")
    return jobsOnly({ check: true });
  return null;
}

function packageFor(path) {
  let match;
  for (const pkg of load()) {
    if (path === pkg.dir || path.startsWith(`${pkg.dir}/`)) {
      if (!match || pkg.dir.length > match.dir.length) match = pkg;
    }
  }
  return match;
}

function classify(path) {
  if (skipped(path)) return jobsOnly({});
  if (webSuite(path)) return jobsOnly({ check: true, e2eWeb: true });
  if (tooling(path)) return everything();
  const known = special(path);
  if (known) return known;
  const pkg = packageFor(path);
  if (pkg) return affected(pkg.name);
  return everything();
}

export function plan(paths) {
  const jobs = blank(false);
  const packages = new Set();
  for (const raw of paths) {
    const path = raw.trim();
    if (path === "") continue;
    const part = classify(path);
    if (part.all) return part;
    for (const name of JOB_NAMES) if (part.jobs[name]) jobs[name] = true;
    for (const name of part.packages) packages.add(name);
  }
  return { all: false, jobs, packages };
}

export function decide({ event, base, diff }) {
  if (event === "schedule" || event === "workflow_dispatch") return everything();
  if (!base || /^0+$/.test(base)) return everything();
  try {
    return plan(diff());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("Could not diff the changeset; running every job.");
    return everything();
  }
}

function filters(names) {
  return names.map((name) => `--filter ${name}`).join(" ");
}

function samePackages(names) {
  const all = load()
    .map((pkg) => pkg.name)
    .sort();
  return names.length === all.length && names.every((name, index) => name === all[index]);
}

export function output(result) {
  const names = [...result.packages].sort();
  const tested = names.filter((name) => name !== API);
  return {
    check: result.jobs.check ? "true" : "false",
    api: result.jobs.api ? "true" : "false",
    build: result.jobs.build ? "true" : "false",
    preview: result.jobs.preview ? "true" : "false",
    e2e_web: result.jobs.e2eWeb ? "true" : "false",
    e2e_mobile: result.jobs.e2eMobile ? "true" : "false",
    typecheck_args:
      names.length === 0 ? "" : samePackages(names) ? "-r --cache" : `--cache ${filters(names)}`,
    // API tests need Postgres, so they stay on their own job.
    test_args: filters(tested),
  };
}

function githubOutput(result) {
  return `${Object.entries(output(result))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

function main() {
  const text = githubOutput(
    decide({
      event: process.env.EVENT_NAME ?? "",
      base: process.env.BASE_SHA ?? "",
      diff: () =>
        execFileSync("git", ["diff", "--name-only", process.env.BASE_SHA, process.env.HEAD_SHA], {
          encoding: "utf8",
        }).split("\n"),
    }),
  );
  console.error(text.trim().replaceAll("\n", " "));
  process.stdout.write(text);
}

const entry = process.argv[1];
if (entry && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) main();
