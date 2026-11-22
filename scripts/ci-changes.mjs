import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "@stacks/api";
const MOBILE = "@stacks/mobile";

const SKIP_PREFIXES = [
  ".agents/",
  ".claude/",
  ".codex/",
  ".gemini/",
  ".github/screenshots/",
  ".vite-hooks/",
  "docs/",
  "tools/table-art/",
];

const SKIP_EXACT = new Set([
  ".env.example",
  ".gitignore",
  ".mcp.json",
  ".github/dependabot.yml",
  ".github/workflows/testflight.yml",
  "docker-compose.yml",
]);

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

const JOB_NAMES = ["check", "api", "mobile"];

let workspaces;

function blank(value) {
  return {
    check: value,
    api: value,
    mobile: value,
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

function everything(reasons = []) {
  return {
    all: true,
    packages: new Set(load().map((pkg) => pkg.name)),
    jobs: blank(true),
    reasons,
  };
}

function jobsOnly(partial, reason) {
  const jobs = blank(false);

  for (const [name, value] of Object.entries(partial)) jobs[name] = value;

  return { all: false, packages: new Set(), jobs, reasons: reason ? [reason] : [] };
}

function affected(name) {
  const packages = dependentsOf(name, load());
  const jobs = blank(false);
  jobs.check = true;

  if (packages.has(API)) jobs.api = true;

  if (packages.has(MOBILE)) jobs.mobile = true;

  return { all: false, packages, jobs, reasons: [`package:${name}`] };
}

function fullCheck(reason) {
  return {
    all: false,
    packages: new Set(load().map((pkg) => pkg.name)),
    jobs: blank(true),
    reasons: [reason],
  };
}

function skipped(path) {
  if (path.endsWith(".md")) return true;

  if (SKIP_EXACT.has(path)) return true;

  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function tooling(path) {
  return TOOLING.has(path) || path.startsWith("patches/");
}

function special(path) {
  if (path === ".github/workflows/ci.yml") return fullCheck(`workflow:${path}`);

  if (path === ".github/workflows/preview.yml" || path.startsWith("scripts/preview"))
    return jobsOnly({ check: true }, `preview-script:${path}`);

  if (path === "scripts/ci-changes.mjs" || path === "scripts/ci-changes.test.ts")
    return jobsOnly({ check: true }, `planner:${path}`);

  if (path.startsWith("tools/oxlint/")) return jobsOnly({ check: true }, `lint-plugin:${path}`);

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
  if (skipped(path)) return jobsOnly({}, "skipped");

  if (tooling(path)) return everything([`tooling:${path}`]);
  const known = special(path);

  if (known) return known;
  const pkg = packageFor(path);

  if (pkg) return affected(pkg.name);

  return everything([`unknown:${path}`]);
}

export function plan(paths) {
  const jobs = blank(false);
  const packages = new Set();
  const reasonSet = new Set();
  let all = false;
  let hasPath = false;

  for (const path of paths) {
    if (path === "") continue;
    hasPath = true;
    const part = classify(path);

    if (part.all) all = true;

    for (const name of JOB_NAMES) if (part.jobs[name]) jobs[name] = true;

    for (const name of part.packages) packages.add(name);

    for (const reason of part.reasons) reasonSet.add(reason);
  }

  if (all) {
    for (const pkg of load()) packages.add(pkg.name);
  }

  const anyJob = JOB_NAMES.some((name) => jobs[name]);

  if (anyJob) reasonSet.delete("skipped");

  const reasons = !hasPath ? ["empty-diff"] : !anyJob ? ["all-skipped"] : [...reasonSet];

  return { all, jobs, packages, reasons };
}

export function decide({ event, base, diff, forceFull }) {
  if (forceFull === true || forceFull === "true" || forceFull === "1")
    return everything(["force-full"]);

  if (event === "schedule" || event === "workflow_dispatch") return everything([`event:${event}`]);

  if (!base || /^0+$/.test(base)) return everything(["missing-base"]);

  try {
    return plan(diff());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("Could not diff the changeset; running every check.");

    return everything(["diff-error"]);
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
    mobile: result.jobs.mobile ? "true" : "false",
    typecheck_args:
      names.length === 0 ? "" : samePackages(names) ? "-r --cache" : `--cache ${filters(names)}`,
    test_args: filters(tested),
  };
}

function githubOutput(result) {
  return `${Object.entries(output(result))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

function formatReasons(reasons) {
  const shown = reasons.slice(0, 20);
  const extra = reasons.length - shown.length;

  return extra > 0 ? `${shown.join(", ")} (+${extra} more)` : shown.join(", ");
}

function main() {
  const result = decide({
    event: process.env.EVENT_NAME ?? "",
    base: process.env.BASE_SHA ?? "",
    forceFull: process.env.FORCE_FULL,
    diff: () =>
      execFileSync(
        "git",
        ["diff", "--no-renames", "--name-only", "-z", process.env.BASE_SHA, process.env.HEAD_SHA],
        { encoding: "utf8" },
      ).split("\0"),
  });

  const fields = output(result);
  const text = githubOutput(result);

  console.error(
    `${text.trim().replaceAll("\n", " ")} reasons=${result.reasons.slice(0, 20).join(",")}`,
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      "### CI Plan",
      `- check: \`${fields.check}\`, api: \`${fields.api}\`, mobile: \`${fields.mobile}\``,
      `- typecheck_args: \`${fields.typecheck_args || "(none)"}\``,
      `- test_args: \`${fields.test_args || "(none)"}\``,
      `- reasons: ${formatReasons(result.reasons)}`,
      "",
    ].join("\n");

    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }

  process.stdout.write(text);
}

const entry = process.argv[1];

if (entry && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) main();
