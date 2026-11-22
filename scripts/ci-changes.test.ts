import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { decide, dependentsOf, output, plan } from "./ci-changes.mjs";

const none = {
  check: "false",
  api: "false",
  mobile: "false",
};

const all = {
  check: "true",
  api: "true",
  mobile: "true",
};

function jobs(paths: string[]) {
  const { typecheck_args: _typecheck, test_args: _test, ...flags } = output(plan(paths));

  return flags;
}

function workspacePackages() {
  const packages: { name: string; dir: string; deps: Set<string> }[] = [];
  const repo = dirname(fileURLToPath(import.meta.url));

  for (const parent of ["apps", "packages"]) {
    for (const name of readdirSync(join(repo, "..", parent))) {
      const dir = join(repo, "..", parent, name);
      const manifest = join(dir, "package.json");

      if (!existsSync(manifest)) continue;

      // SAFETY: these files are workspace package.json manifests with a string name and string dependency maps.
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
        name: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };

      const deps = new Set<string>();

      for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
        for (const [dep, version] of Object.entries(pkg[field] ?? {})) {
          if (version.startsWith("workspace:")) deps.add(dep);
        }
      }

      packages.push({ name: pkg.name, dir: `${parent}/${name}`, deps });
    }
  }

  return packages;
}

function yamlLists(content: string, key: string) {
  const lists: string[][] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]!.match(/^(\s*)([\w-]+):\s*$/);

    if (!match || match[2] !== key) continue;
    const baseIndent = match[1]!.length;
    const items: string[] = [];

    for (let next = index + 1; next < lines.length; next++) {
      const line = lines[next]!;

      if (/^\s*(#.*)?$/.test(line)) continue;
      const item = line.match(/^(\s*)-\s+(.*?)\s*$/);

      if (!item || item[1]!.length <= baseIndent) break;
      items.push(item[2]!.replace(/^["']|["']$/g, ""));
    }

    lists.push(items);
  }

  return lists;
}

describe("plan", () => {
  it.each([
    "README.md",
    "docs/internals/navigation.md",
    ".github/workflows/testflight.yml",
    ".github/dependabot.yml",
    "tools/table-art/scene.py",
    "docker-compose.yml",
    ".agents/skills/example/SKILL.md",
    "apps/mobile/README.md",
    "packages/shared/README.md",
    "tools/oxlint/anti-slop/UPSTREAM.md",
  ])("%s runs nothing", (path) => {
    const result = plan([path]);
    expect(jobs([path])).toEqual(none);
    expect(result.reasons).toEqual(["all-skipped"]);
  });

  it("checks the repo when oxlint plugins change", () => {
    const result = plan(["tools/oxlint/anti-slop/index.ts"]);
    expect(jobs(["tools/oxlint/anti-slop/index.ts"])).toEqual({
      ...none,
      check: "true",
    });
    expect(result.reasons).toEqual(["lint-plugin:tools/oxlint/anti-slop/index.ts"]);
  });

  it.each([
    "package.json",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "patches/example.patch",
    "tools/other/script.ts",
    "mystery/new.ts",
  ])("%s runs every check", (path) => {
    expect(jobs([path])).toEqual(all);
    expect(output(plan([path])).typecheck_args).toBe("-r --cache");
  });

  it("checks mobile without running API tests", () => {
    const result = output(plan(["apps/mobile/src/App.tsx"]));
    expect(jobs(["apps/mobile/src/App.tsx"])).toEqual({
      ...none,
      check: "true",
      mobile: "true",
    });
    expect(result.typecheck_args).toBe("--cache --filter @stacks/mobile");
    expect(result.test_args).toBe("--filter @stacks/mobile");
  });

  it("runs API tests without mobile export for API-only changes, and widens for shared packages", () => {
    expect(jobs(["apps/api/src/worker.ts"])).toEqual({
      check: "true",
      api: "true",
      mobile: "false",
    });
    expect(output(plan(["apps/api/src/worker.ts"])).typecheck_args).toBe(
      "--cache --filter @stacks/api",
    );
    expect(output(plan(["apps/api/src/worker.ts"])).test_args).toBe("");

    const shared = output(plan(["packages/shared/src/money.ts"]));
    expect(shared.api).toBe("true");
    expect(shared.mobile).toBe("true");
    expect(shared.typecheck_args).toContain("--filter @stacks/api");
    expect(shared.typecheck_args).toContain("--filter @stacks/mobile");
    expect(shared.test_args).not.toContain("@stacks/api");
    expect(shared.test_args).toContain("--filter @stacks/shared");
    expect(shared.test_args).toContain("--filter @stacks/client-runtime");
    expect(shared.test_args).toContain("--filter @stacks/mobile");
    expect(shared.typecheck_args).not.toContain("@stacks/contracts");

    expect(jobs(["packages/contracts/src/index.ts"])).toEqual(all);
  });

  it("checks shared client code and mobile without running API tests", () => {
    const result = output(plan(["packages/client-runtime/src/format.ts"]));
    expect(result.api).toBe("false");
    expect(result.mobile).toBe("true");
    expect(result.test_args).toContain("--filter @stacks/client-runtime");
    expect(result.test_args).toContain("--filter @stacks/mobile");
    expect(result.test_args).not.toContain("@stacks/api");
  });

  it("checks the workflow that changed and leaves the unrelated ones", () => {
    const ci = output(plan([".github/workflows/ci.yml"]));
    expect(ci.check).toBe("true");
    expect(ci.api).toBe("true");
    expect(ci.mobile).toBe("true");
    expect(ci.typecheck_args).toBe("-r --cache");
    expect(ci.test_args).not.toContain("@stacks/api");

    expect(jobs([".github/workflows/preview.yml"])).toEqual({ ...none, check: "true" });
    expect(jobs(["scripts/preview.mjs"])).toEqual({ ...none, check: "true" });
    expect(jobs(["scripts/preview-comment.mjs"])).toEqual({ ...none, check: "true" });
    expect(jobs(["scripts/ci-changes.mjs"])).toEqual({ ...none, check: "true" });
  });

  it("lets a doc sit beside a real change without widening it or keeping skipped reasons", () => {
    const result = plan(["README.md", "apps/mobile/src/App.tsx"]);
    expect(output(result)).toMatchObject({
      ...none,
      check: "true",
      mobile: "true",
    });
    expect(result.reasons).toEqual(["package:@stacks/mobile"]);
  });

  it("runs every check when any path is unrecognized", () => {
    expect(jobs(["README.md", "somewhere/new.ts"])).toEqual(all);
  });

  it("does nothing for an empty diff", () => {
    const result = plan([]);
    expect(jobs([])).toEqual(none);
    expect(result.reasons).toEqual(["empty-diff"]);
    expect(output(result).typecheck_args).toBe("");
    expect(output(result).test_args).toBe("");
  });
});

describe("decide", () => {
  it("runs every check for a schedule, a new branch, a force flag, or a diff it cannot read", () => {
    const boom = () => {
      throw new Error("missing");
    };

    const scheduled = decide({ event: "schedule", base: "", diff: boom });
    expect(output(scheduled).check).toBe("true");
    expect(scheduled.reasons).toEqual(["event:schedule"]);

    const manual = decide({ event: "workflow_dispatch", base: "abc", diff: boom });
    expect(output(manual).mobile).toBe("true");
    expect(output(manual).typecheck_args).toBe("-r --cache");
    expect(manual.reasons).toEqual(["event:workflow_dispatch"]);

    const forcedTrue = decide({
      event: "pull_request",
      base: "abc",
      diff: boom,
      forceFull: "true",
    });

    expect(output(forcedTrue)).toMatchObject(all);
    expect(forcedTrue.reasons).toEqual(["force-full"]);

    const forcedOne = decide({ event: "pull_request", base: "abc", diff: boom, forceFull: "1" });
    expect(output(forcedOne)).toMatchObject(all);
    expect(forcedOne.reasons).toEqual(["force-full"]);

    const newBranch = decide({ event: "push", base: "0".repeat(40), diff: boom });
    expect(output(newBranch)).toMatchObject(all);
    expect(newBranch.reasons).toEqual(["missing-base"]);

    const brokenDiff = decide({ event: "push", base: "abc", diff: boom });
    expect(output(brokenDiff).api).toBe("true");
    expect(brokenDiff.reasons).toEqual(["diff-error"]);
  });

  it("uses the diff on a pull request", () => {
    const result = output(
      decide({
        event: "pull_request",
        base: "abc",
        diff: () => ["apps/mobile/src/App.tsx"],
      }),
    );

    expect(result.api).toBe("false");
    expect(result.mobile).toBe("true");
  });

  it("keeps API checks when an API file is renamed into docs", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "ci-changes-git-"));

    try {
      const git = (args: string[]) => execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });

      git(["init"]);
      git(["config", "user.name", "Test"]);
      git(["config", "user.email", "test@example.com"]);
      mkdirSync(join(repoDir, "apps/api/src"), { recursive: true });
      const body = Array.from({ length: 20 }, (_, i) => `export const line${i} = ${i};`).join("\n");
      writeFileSync(join(repoDir, "apps/api/src/worker.ts"), body);
      git(["add", "."]);
      git(["commit", "-m", "initial"]);
      const base = git(["rev-parse", "HEAD"]).trim();

      mkdirSync(join(repoDir, "docs"), { recursive: true });
      git(["mv", "apps/api/src/worker.ts", "docs/moved.md"]);
      git(["commit", "-m", "move"]);
      const head = git(["rev-parse", "HEAD"]).trim();

      const result = decide({
        event: "pull_request",
        base,
        diff: () => git(["diff", "--no-renames", "--name-only", "-z", base, head]).split("\0"),
      });

      expect(result.jobs).toEqual({ check: true, api: true, mobile: false });
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe("dependents", () => {
  it("includes packages that depend on a change through another package", () => {
    const packages = [
      { name: "contracts", deps: new Set<string>() },
      { name: "shared", deps: new Set(["contracts"]) },
      { name: "web", deps: new Set(["shared"]) },
    ];

    expect([...dependentsOf("contracts", packages)].sort()).toEqual(["contracts", "shared", "web"]);
    expect([...dependentsOf("web", packages)].sort()).toEqual(["web"]);
  });

  it("matches the workspace dependency graph", () => {
    const packages = workspacePackages();

    for (const pkg of packages) {
      const result = output(plan([`${pkg.dir}/src/marker.ts`]));

      const listed =
        result.typecheck_args === "-r --cache"
          ? packages.map((item) => item.name)
          : [...result.typecheck_args.matchAll(/@[\w/-]+/g)].map((match) => match[0]);

      expect(listed, pkg.name).toContain(pkg.name);

      for (const other of packages) {
        if (other.deps.has(pkg.name))
          expect(listed, `${other.name} depends on ${pkg.name}`).toContain(other.name);
      }

      if (result.api === "true") expect(result.check).toBe("true");
    }
  });
});

describe("workflow filters", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

  it("keeps preview workflow paths aligned with @stacks/api workspace dependencies", () => {
    const content = readFileSync(join(repoRoot, ".github/workflows/preview.yml"), "utf8");
    const lists = yamlLists(content, "paths");
    expect(lists).toHaveLength(1);
    const previewPaths = lists[0]!;
    const packages = workspacePackages();

    for (const pkg of packages) {
      if (!dependentsOf(pkg.name, packages).has("@stacks/api")) continue;
      expect(previewPaths, pkg.dir).toContain(`${pkg.dir}/**`);
      expect(previewPaths, pkg.dir).toContain(`!${pkg.dir}/**/*.md`);
    }
  });

  it("keeps CI workflow paths-ignore aligned with skipped planner inputs", () => {
    const content = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    const lists = yamlLists(content, "paths-ignore");
    expect(lists).toHaveLength(2);
    expect(lists[0]).toEqual(lists[1]);

    const ignored = lists[0]!;

    for (const target of [
      "tools/oxlint/anti-slop/index.ts",
      "apps/api/src/worker.ts",
      "apps/mobile/src/App.tsx",
      "scripts/ci-changes.mjs",
      "pnpm-lock.yaml",
    ]) {
      for (const pattern of ignored) {
        expect(posix.matchesGlob(target, pattern), `${target} vs ${pattern}`).toBe(false);
      }
    }

    for (const pattern of ignored) {
      const sample =
        pattern === "**/*.md"
          ? "nested/example.md"
          : pattern.endsWith("/**")
            ? `${pattern.slice(0, -3)}/example.ts`
            : pattern;

      expect(jobs([sample]), pattern).toEqual(none);
    }
  });
});
