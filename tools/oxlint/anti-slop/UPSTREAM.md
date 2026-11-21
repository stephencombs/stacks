# anti-slop

Source: https://github.com/dmmulroy/anti-slop
Commit: `63dbb09f73438e550a6991dc6d778f979ffbf183`

Copied from `skills/install-anti-slop/assets/anti-slop` at that commit. The vendored tree matches those assets, including `vendor/eslint-stylistic/LICENSE` and `vendor/eslint-stylistic/UPSTREAM.md`.

Installed paths:

- `tools/oxlint/anti-slop/index.ts` — generic plugin, registered as `anti-slop`
- `tools/oxlint/anti-slop/effect/index.ts` — Effect plugin, registered as `anti-slop-effect`

The only local edit is the import specifier. Every `from "@oxlint/plugins"` import now reads `from "vite-plus/lint/plugins"`. Vite+ bundles Oxlint, and a plugin file under `tools/` cannot resolve a second `@oxlint/plugins` copy through pnpm. The Vite+ entry stays on the Oxlint that `vp lint` actually runs.

Configuration is in `vite.config.ts`. `@interfere/landmines@0.1.1` is a root dev dependency. `landmines-style/no-comments` allows the `SAFETY` prefix so `require-safety-comment-for-type-assertion` can keep its marker.

Effect rules are on because workspace packages depend on `effect` directly. `no-service-constructor-imports` only sees relative project imports. Package-alias imports are outside that rule.
