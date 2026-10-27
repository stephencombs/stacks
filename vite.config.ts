import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

const GENERATED = [
  "dist",
  "node_modules",
  "pnpm-lock.yaml",
  "*.tsbuildinfo",
  ".wrangler",
  ".alchemy",
  "**/routeTree.gen.ts",
  "apps/mobile/ios/**",
  "apps/mobile/android/**",
  "apps/mobile/.expo/**",
  "apps/mobile/uniwind-types.d.ts",
];

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    allowOnly: !process.env.CI,
    // Flaky tests are fixed, not retried.
    retry: 0,
  },
  staged: {
    "*": "vp fmt --no-error-on-unmatched-pattern",
  },
  fmt: {
    ignorePatterns: GENERATED,
    sortPackageJson: {},
  },
  lint: {
    ignorePatterns: GENERATED,
    plugins: ["eslint", "oxc", "react", "unicorn", "typescript"],
    categories: {
      correctness: "warn",
      suspicious: "warn",
      perf: "warn",
    },
    rules: {
      "oxc/no-accumulating-spread": "error",
      "react/exhaustive-effect-dependencies": "error",
      "react/set-state-in-effect": "error",
      "react/no-array-index-key": "error",
      "react/no-unstable-nested-components": "error",
      // expo-status-bar takes a string `style`.
      "react/style-prop-object": ["warn", { allow: ["StatusBar"] }],
      "react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "off",
      "eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "eslint/no-shadow": "off",
      "eslint/no-await-in-loop": "off",
      "unicorn/consistent-function-scoping": "off",
      "unicorn/no-array-sort": "off",
      "oxc/no-map-spread": "off",
      "eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@stacks/client-runtime",
              message: "Import from an explicit @stacks/client-runtime/* subpath.",
            },
          ],
        },
      ],
    },
  },
});
