---
status: planned
created: 2026-11-16
priority: medium
tags:
  - mobile
created_at: 2026-11-16T21:53:45.032441800Z
updated_at: 2026-11-16T21:53:45.032441800Z
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

## Plan

- [ ] Decide where each setting is stored, and write that down here
- [ ] Recording defaults
- [ ] Cents and privacy mode, with every amount display following them
- [ ] Export

## Test

- [ ] Every money display on Play, Stats, Crew and the felt follows cents and privacy mode
- [ ] An exported file opens, and its totals match Stats for the same sessions
