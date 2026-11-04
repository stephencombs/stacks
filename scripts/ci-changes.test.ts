import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { decide, dependentsOf, output, plan } from "./ci-changes.mjs";

const none = {
  check: "false",
  api: "false",
  build: "false",
  preview: "false",
  e2e_web: "false",
  e2e_mobile: "false",
};

const all = {
  check: "true",
  api: "true",
  build: "true",
  preview: "true",
  e2e_web: "true",
  e2e_mobile: "true",
};

const checks = { ...all, preview: "false" };

function jobs(paths: string[]) {
  const { typecheck_args: _typecheck, test_args: _test, ...flags } = output(plan(paths));
  return flags;
}

describe("plan", () => {
  it.each([
    "README.md",
    "docs/internals/navigation.md",
    "apps/web/README.md",
    ".github/workflows/mobile.yml",
    ".github/dependabot.yml",
    "tools/table-art/scene.py",
    "docker-compose.yml",
    ".agents/skills/example/SKILL.md",
  ])("%s runs nothing", (path) => {
    expect(jobs([path])).toEqual(none);
  });

  it.each([
    "package.json",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "patches/example.patch",
    "mystery/new.ts",
  ])("%s runs every check and does not deploy a preview", (path) => {
    expect(jobs([path])).toEqual(checks);
    expect(output(plan([path])).typecheck_args).toBe("-r --cache");
  });

  it("typechecks and tests the web app without the mobile suite or the database", () => {
    const result = output(plan(["apps/web/src/main.tsx"]));
    expect(jobs(["apps/web/src/main.tsx"])).toEqual({
      ...all,
      api: "false",
      e2e_mobile: "false",
    });
    expect(result.typecheck_args).toBe("--cache --filter @stacks/web");
    expect(result.test_args).toBe("--filter @stacks/web");
  });

  it("treats the web Playwright suite as browser coverage, not a worker build", () => {
    expect(jobs(["apps/web/e2e/full-loop.spec.ts"])).toEqual({
      ...none,
      check: "true",
      e2e_web: "true",
    });
    expect(output(plan(["apps/web/playwright.config.ts"])).build).toBe("false");
    expect(output(plan(["apps/web/e2e/full-loop.spec.ts"])).test_args).toBe("");
  });

  it("checks mobile without building the worker", () => {
    const result = output(plan(["apps/mobile/src/App.tsx"]));
    expect(jobs(["apps/mobile/src/App.tsx"])).toEqual({
      ...none,
      check: "true",
      e2e_mobile: "true",
    });
    expect(result.typecheck_args).toBe("--cache --filter @stacks/mobile");
    expect(result.test_args).toBe("--filter @stacks/mobile");
  });

  it("runs API tests for the worker and the packages it builds on", () => {
    expect(jobs(["apps/api/src/worker.ts"])).toEqual(all);
    expect(output(plan(["apps/api/src/worker.ts"])).typecheck_args).toBe(
      "--cache --filter @stacks/api",
    );
    expect(output(plan(["apps/api/src/worker.ts"])).test_args).toBe("");

    const shared = output(plan(["packages/shared/src/money.ts"]));
    expect(shared.api).toBe("true");
    expect(shared.build).toBe("true");
    expect(shared.preview).toBe("true");
    expect(shared.e2e_web).toBe("true");
    expect(shared.e2e_mobile).toBe("true");
    expect(shared.typecheck_args).toContain("--filter @stacks/api");
    expect(shared.test_args).not.toContain("@stacks/api");
    expect(shared.test_args).toContain("--filter @stacks/shared");
    expect(shared.test_args).toContain("--filter @stacks/client-runtime");
    expect(shared.test_args).toContain("--filter @stacks/web");
    expect(shared.test_args).toContain("--filter @stacks/mobile");
    expect(shared.typecheck_args).not.toContain("@stacks/contracts");
  });

  it("rechecks both clients when shared client code changes, and not the API tests", () => {
    const result = output(plan(["packages/client-runtime/src/format.ts"]));
    expect(result.api).toBe("false");
    expect(result.build).toBe("true");
    expect(result.preview).toBe("true");
    expect(result.e2e_web).toBe("true");
    expect(result.e2e_mobile).toBe("true");
    expect(result.test_args).toContain("--filter @stacks/client-runtime");
    expect(result.test_args).toContain("--filter @stacks/web");
    expect(result.test_args).toContain("--filter @stacks/mobile");
    expect(result.test_args).not.toContain("@stacks/api");
  });

  it("checks the workflow that changed and leaves the unrelated ones", () => {
    const ci = output(plan([".github/workflows/ci.yml"]));
    expect(ci.check).toBe("true");
    expect(ci.api).toBe("true");
    expect(ci.build).toBe("true");
    expect(ci.preview).toBe("false");
    expect(ci.e2e_web).toBe("false");
    expect(ci.typecheck_args).toBe("-r --cache");
    expect(ci.test_args).not.toContain("@stacks/api");

    expect(jobs([".github/workflows/e2e.yml"])).toEqual({
      ...none,
      e2e_web: "true",
      e2e_mobile: "true",
    });
    expect(jobs([".github/workflows/preview.yml"])).toEqual({ ...none, check: "true" });
    expect(jobs(["scripts/preview.mjs"])).toEqual({ ...none, check: "true" });
    expect(jobs(["scripts/preview-comment.mjs"])).toEqual({ ...none, check: "true" });
    expect(jobs(["scripts/ci-changes.mjs"])).toEqual({ ...none, check: "true" });
  });

  it("lets a doc sit beside a real change without widening it", () => {
    expect(jobs(["README.md", "apps/mobile/src/App.tsx"])).toEqual({
      ...none,
      check: "true",
      e2e_mobile: "true",
    });
  });

  it("runs every check when any path is unrecognized, without a preview", () => {
    expect(jobs(["README.md", "somewhere/new.ts"])).toEqual(checks);
  });

  it("deploys a preview only when the worker or the web app changed", () => {
    expect(
      jobs([
        "package.json",
        "pnpm-lock.yaml",
        ".github/workflows/preview.yml",
        "scripts/preview.mjs",
        "scripts/ci-changes.mjs",
      ]).preview,
    ).toBe("false");
    expect(jobs(["package.json", "apps/web/src/main.tsx"]).preview).toBe("true");
    expect(jobs(["pnpm-lock.yaml", "apps/api/src/worker.ts"]).preview).toBe("true");
  });

  it("does nothing for an empty diff", () => {
    expect(jobs([])).toEqual(none);
    expect(output(plan([])).typecheck_args).toBe("");
    expect(output(plan([])).test_args).toBe("");
  });
});

describe("decide", () => {
  it("runs every check for a schedule, a new branch, or a diff it cannot read", () => {
    const boom = () => {
      throw new Error("missing");
    };
    expect(output(decide({ event: "schedule", base: "", diff: boom })).check).toBe("true");
    expect(output(decide({ event: "workflow_dispatch", base: "abc", diff: boom })).preview).toBe(
      "false",
    );
    expect(output(decide({ event: "push", base: "0".repeat(40), diff: boom })).build).toBe("true");
    expect(output(decide({ event: "push", base: "abc", diff: boom })).api).toBe("true");
  });

  it("uses the diff on a pull request", () => {
    const result = output(
      decide({
        event: "pull_request",
        base: "abc",
        diff: () => ["apps/web/src/main.tsx"],
      }),
    );
    expect(result.api).toBe("false");
    expect(result.build).toBe("true");
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
    const packages: { name: string; dir: string; deps: Set<string> }[] = [];
    const repo = dirname(fileURLToPath(import.meta.url));
    for (const parent of ["apps", "packages"]) {
      for (const name of readdirSync(join(repo, "..", parent))) {
        const dir = join(repo, "..", parent, name);
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
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
      if (result.build === "true" || result.api === "true") expect(result.check).toBe("true");
    }
  });
});
