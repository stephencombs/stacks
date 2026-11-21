---
status: complete
created: 2026-11-16
priority: medium
tags:
  - mobile
created_at: 2026-11-16T21:53:45.032441800Z
updated_at: 2026-11-20T18:36:02.454821600Z
completed_at: 2026-11-20T18:36:02.454821600Z
transitions:
  - status: in-progress
    at: 2026-11-20T17:46:59.143516200Z
  - status: complete
    at: 2026-11-20T18:36:02.454821600Z
---

# You sheet settings

## Overview

`docs/internals/navigation.md` puts account, recording defaults, display (cents, privacy mode,
theme) and export in the You sheet. Today the sheet has account and appearance only.

## Design

- **Recording defaults:** the game and casino a new session starts with.
- **Display:**
  - Show cents.
  - Privacy mode, which hides amounts across the app until it's turned off.
  - Theme, which already exists.
- **Export:** your own sessions as a file you can share. History is never capped or paywalled
  (PLAN.md).
- Each setting is stored per device unless it's signed-in data. The first PR records which is which
  here.

## Storage

- **Per device (`expo-secure-store`)**:
  - `theme` (`stacks-theme`): appearance override (`system`, `light`, `dark`), stored locally so opening the app never flashes the wrong theme before sign-in loads.
  - `showCents` (`stacks-pref-show-cents`, default `false`): formats whole currency amounts with trailing cents (e.g. `.00`) across the app when enabled; off keeps cents only when non-zero.
  - `privacyMode` (`stacks-pref-privacy-mode`, default `false`): replaces shown amounts across Play, Stats, Crew, shared tables, and the live felt with `••••` until turned off on this device.
  - `defaultGame` (`stacks-pref-default-game`, default unset): pre-fills the Game picker when starting a session or adding a past session, even offline or signed out.
  - `defaultVenue` (`stacks-pref-default-venue`, default unset): pre-fills the Casino picker from a cached venue JSON payload so offline recording needs no network lookup.
- **Account / server**: signed-in profile identity (`name`, `email`) from Clerk, synced personal ledger and venue history (`RecordingSync`), and shared group settings / group CSV export on the server API.

## Plan

- [x] Decide where each setting is stored, and write that down here
- [x] Recording defaults
- [x] Cents and privacy mode, with every amount display following them
- [x] Export

## Test

- [x] Every money display on Play, Stats, Crew and the felt follows cents and privacy mode
- [x] An exported file opens, and its totals match Stats for the same sessions
