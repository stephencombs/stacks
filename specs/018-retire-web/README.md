---
status: in-progress
created: 2026-11-16
priority: high
tags:
  - mobile
  - api
  - ci
  - cleanup
depends_on:
  - "006"
  - "011"
created_at: 2026-11-16T00:36:42.059214140Z
updated_at: 2026-11-16T03:54:18.264048438Z
transitions:
  - status: in-progress
    at: 2026-11-16T03:54:18.264048438Z
---

# Retire web implementations and focus on iOS and Android

## Overview

Remove both `apps/web` and `apps/mobile`'s Expo web / `react-native-web` target so Color Up focuses solely on the native iOS and Android apps backed by the Cloudflare Worker API (`apps/api`).

Executing after PRs `#101` (spec `006`, Crew tab) and `#102` (spec `011`, group stats) land prevents merge conflicts across those active web+mobile branches.

## Design

### Sequencing & prerequisites

- Merge or resolve PRs `#101` and `#102` first.
- Drop web deliverables from remaining specs (`012-map`, `016-retire-group-sessions`, `017-delete-session`).
- Ship Phase 1 (mobile deep-link parity and test migration) before deleting `apps/web` or Playwright suites in Phase 2.

### Phase 1A — Mobile deep-link parity (`t/:token` and `invite/:token`)

- **Routes & auth placement:** Register `SharedTableScreen` (`linking: "t/:token"`) and `RedeemInviteScreen` (`linking: "invite/:token"`) on `RootStack` in `apps/mobile/src/App.tsx` alongside `Play`, **outside** `AccountGate` (both work signed out via `RecordingSyncContext`). Post-action navigation opens `Play` (`visitId`) after seating or `Tabs -> PlayTab -> Home` after redeeming an invite.
- **Missing sheets in `apps/mobile/src/features/RecordingForms.tsx`:**
  - Add `JoinSheet` (mirroring `JoinDialog` in `apps/web`), calling `useJoinTable(token)` and transitioning directly into `SitDownSheet`.
  - Add `returning?: boolean` (default `true` for `Play.tsx`) to `SitDownSheet` so first-time table joiners see `"Buy in"` instead of `"Back at the table"` / `"Sit back down"`.
- **Custom-scheme links:** Replace `webUrl` (`EXPO_PUBLIC_WEB_URL`) in `apps/mobile/src/lib/config.ts` with `appUrl(path)` using `ExpoLinking.createURL(path.replace(/^\/+/, ""))` (`stacks://`, `stacks-preview://`, `stacks-dev://` per `apps/mobile/app.config.ts`). Update callers in `apps/mobile/src/features/SharedTable.tsx`, `apps/mobile/src/screens/Group.tsx`, and `apps/mobile/src/screens/People.tsx` (if present post-`#101`), and remove `EXPO_PUBLIC_WEB_URL` from `apps/mobile/eas.json`. Update `expo-linking`'s mock in `apps/mobile/src/App.test.tsx` and tests in `apps/mobile/src/lib/config.test.ts`.
  - _Tradeoff:_ Custom-scheme links require Color Up to be installed; Universal Links / App Links (`https://` AASA + `assetlinks.json` + store fallback) are deferred until App Store / Play Store URLs exist.

### Phase 1B — Migrate design tests & backfill E2E coverage

- **Design & motion invariants:** Move `apps/mobile/global.css` vs `docs/design/tokens.json` (gamut + WCAG AA contrast) assertions from `apps/web/src/design/tokens.test.ts` and runtime checks from `apps/web/src/design/motion.test.ts` into `apps/mobile` / `packages/client-runtime`.
- **SQLite & picker integration tests:**
  - Port `"Current casino unavailable"` cached-venue preservation tests from `apps/web/src/features/VenuePicker.test.tsx` to `apps/mobile/src/features/VenuePicker.test.tsx`.
  - Expand `apps/mobile/src/lib/recordingStorageSqlite.test.ts` with error-rollback, `store.retry()`, `version: 99` refusal, and `edit_visit` venue-cache cases from `apps/web/recording-storage/e2e/recording.spec.ts`.
  - Preserve the `hermesLike` global-deletion test helper from `apps/mobile/e2e/full-loop.spec.ts` in mobile Vitest tests.
- **Native simulator E2E:** Replace Playwright E2E (`apps/web/e2e`, `apps/web/offline`, `apps/mobile/e2e`, `apps/mobile/solo`) with native simulator E2E (Maestro / EAS simulator workflow) covering signed-out solo recording, sign-in + Crew loop, and shared table joins.

### Phase 2 — Remove web code, tooling, and Worker assets

- **Delete `apps/web/` and web-only assets/skills:** Remove `apps/web/`, `.agents/skills/preview-color-up` plus its `.claude/skills/preview-color-up` and `.codex/skills/preview-color-up` symlinks, the 11 web-only chip sprite sheets (`packages/client-runtime/table-art/chips-*.webp`, keeping `tools/table-art/package.py` mobile-only), and update `.env.example`.
- **Strip `react-native-web` from `apps/mobile`:**
  - Delete `apps/mobile/src/lib/{fonts,recordingStorage,actorKeys}.web.ts`, `recordingStorage.web.test.ts`, `apps/mobile/src/features/{SignInButton,TripRoute,PlaceTabs}.web.tsx`, `apps/mobile/playwright.config.ts`, `apps/mobile/e2e/`, and `apps/mobile/solo/`.
  - Remove `Platform.OS === "web"` / `!== "web"` branches in `apps/mobile/src/lib/{tripStorage,theme,share,outbox,stacks}.ts*`, `apps/mobile/src/components/ui/{confirmAction.ts,Field.tsx,Surface.tsx,Button.tsx}` (removing the ~65-line web fallback JSX in `Choice`), `apps/mobile/src/components/ui/DateTimeField.tsx` (keep shared types/minimal stub), `apps/mobile/src/features/{Landing,AmountKeypad}.tsx`, `apps/mobile/src/screens/{Play,Session}.tsx`, `apps/mobile/src/StartupBoundary.tsx`, and simplify `shareLink` `copied` state in `Group.tsx` / `People.tsx`.
  - Remove `web` config in `apps/mobile/app.config.ts` and `dist-web` in `apps/mobile/tsconfig.json`.
  - In `apps/mobile/package.json`, drop scripts `web`, `test:e2e`, `test:solo` and deps `react-native-web`, `@expo/metro-runtime`, `expo-clipboard`, `@playwright/test`, `serve`, `@clerk/backend`, `@clerk/testing`. **Keep `react-dom` (move to `devDependencies`), `@types/react-dom`, and `happy-dom`** — mobile Vitest specs import `createRoot` from `react-dom/client`.
- **Clean `packages/client-runtime`:** Delete `src/actorKeysIndexedDB.ts` and `src/recordingStorageIndexedDB.ts`, drop their `exports` entries in `packages/client-runtime/package.json`, and clean web references in `src/{api,motion,outbox}.ts` and `apps/mobile/global.css`.
- **API, Worker & PR previews:**
  - Remove `assets` from `apps/api/wrangler.jsonc`.
  - Harden `apps/api/src/auth/Clerk.ts` (`fromAuthorizedParty`): because `authorizedParties = []` currently accepts _any_ `azp` origin, explicitly reject tokens carrying an `azp` claim when no web client is configured (and clean up `CLERK_AUTHORIZED_PARTIES` in `apps/api/wrangler.jsonc`, `apps/api/src/config.ts`, and `Clerk.test.ts` if retiring it).
  - Keep API-only PR previews (Neon branch + Hyperdrive + Worker): remove `assets`, `CLERK_AUTHORIZED_PARTIES`, and `@stacks/web` build from `scripts/preview.mjs`; drop `VITE_CLERK_PUBLISHABLE_KEY` from `.github/workflows/preview.yml`; update `scripts/preview-comment.mjs` to point to `${url}/api/health` / `EXPO_PUBLIC_API_URL`.
- **CI, workspace & docs:**
  - Update `.github/workflows/ci.yml`: remove `@stacks/web build`, drop the `recording-storage` job, and remove `recording-storage` from `deploy.needs` and `deploy.if`. Replace or retire `.github/workflows/e2e.yml`.
  - Update `scripts/ci-changes.mjs` and `scripts/ci-changes.test.ts`: remove `WEB`, `e2eWeb`, and `webSuite()`; trigger `preview` only on `API`-affecting changes.
  - Update root `package.json`, `pnpm-workspace.yaml` (remove `@clerk/backend`, `@clerk/react`, `@clerk/testing`, `@playwright/test`, `@tailwindcss/vite`, `posthog-js`, `serve`, and `serve>compression` override), `knip.json` (drop `apps/web` and `"serve"` ignore), `vite.config.ts`, `.gitignore`, and docs (`AGENTS.md`, `README.md`, `PLAN.md`, `DESIGN.md`, `docs/design/*`, `docs/internals/navigation.md`).

## Non-goals

- Implementing `https://` Universal Links / App Links (`apple-app-site-association` / `assetlinks.json`) before store URLs exist.
- Removing shared packages (`packages/contracts`, `packages/shared`, `packages/client-runtime`) used by `apps/api` and `apps/mobile`.

## Plan

- [x] Merge or resolve `#101` and `#102`; remove web items from specs `012`, `016`, and `017`
- [x] Phase 1A: Add `JoinSheet`, `SitDownSheet.returning`, `t/:token`, and `invite/:token` on `RootStack`; switch shared links to `appUrl()` (`Linking.createURL`) and drop `EXPO_PUBLIC_WEB_URL` from `eas.json`
- [x] Phase 1B: Migrate `tokens.test.ts`, `motion.test.ts`, `VenuePicker.test.tsx`, SQLite rollback/`retry()`/`version: 99` tests, and `hermesLike` checks; write the native simulator E2E (Maestro flows and `apps/mobile/.eas/workflows/e2e.yml`), not yet run
- [x] Run the native simulator E2E against a test API and fix what it finds
- [x] Phase 2: Delete `apps/web`, `*.web.*`, Playwright harnesses, IndexedDB runtime files, `chips-*.webp`, and `preview-color-up` skill + symlinks; clean `Platform.OS` branches and mobile/workspace deps (keeping `react-dom` in mobile `devDependencies`)
- [x] Update `wrangler.jsonc`, `Clerk.ts`, `preview.mjs`, `preview-comment.mjs`, `ci-changes.mjs`, CI workflows, `knip.json`, `vite.config.ts`, `.gitignore`, and docs

## Test

- [x] Deep links `stacks://t/:token`, `stacks://invite/:token`, `stacks://join/:code`, and `stacks://claim/:code` open and complete signed-out/signed-in flows on Android
- [x] `pnpm fmt:check && pnpm lint && pnpm knip && pnpm typecheck && pnpm test` passes with zero web workspaces or Playwright deps
- [x] `pnpm --filter @stacks/api test` (Postgres) and `pnpm --filter @stacks/api build` pass without `apps/web/dist`
- [x] `pnpm --filter @stacks/mobile build` (`expo export --platform ios --platform android`) succeeds and native simulator E2E passes
- [x] PR preview workflow deploys an API-only Worker + Neon branch and `/api/health` responds 200

iOS device verification was waived. Both native exports and the API dry run pass. The isolated
API Worker returns 200 for `/api/health` and 404 for `/`. Android passed the solo recording,
shared table, and signed-in Crew flows against an isolated test API. Crew also opened a guest
claim link and verified the existing-member guard. A second test account joined a group from
its invite link. A fresh install redeemed a personal table invite and showed the player's live
session. The [hosted preview](https://github.com/stephencombs/stacks/actions/runs/44613921877)
deployed an API-only Worker and Neon branch for PR #111. Its `/api/health` returned 200 and its
root returned 404.
