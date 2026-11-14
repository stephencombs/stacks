---
status: planned
created: 2026-11-14
priority: high
tags:
- design
- web
- mobile
depends_on:
- '002'
parent: '001'
created_at: 2026-11-14T20:15:30.022549421Z
updated_at: 2026-11-14T21:46:38.323910353Z
---

# Color Up design system: tokens, light and dark, glass and motion

## Overview

The design canvas uses the Color Up design system: felt green for live play, ink and ground neutrals, light and dark values for every color, iOS Liquid Glass on floating controls, and set motion timings. The apps still follow `DESIGN.md`'s gold accent, dark-by-default look. Adopt the canvas system first, so every later screen is built once.

## Design

- **Tokens:** the Color Up design system's `tokens.json`, checked in at `docs/design/tokens.json` (copied from the design system artifact the canvas uses), becomes the palette in `apps/web/src/index.css` and `apps/mobile/global.css`, as OKLCH, light and dark. Keep the token names Tailwind already uses where the meaning matches; rename where it doesn't (our `accent` gold goes).
- **Theme:** follows the system by default; the You sheet's theme setting overrides it. Dark is no longer the default.
- **Type:** the system's money and text styles, with tabular figures for money.
- **Liquid Glass** on top controls, menus, sheets and the keypad; never on bottom actions. Sheets are edge to edge, rounded on top, and join the keypad. On iOS use the native material; elsewhere a blurred translucent fill with the same tokens.
- **Motion:** ease-out `cubic-bezier(0.32, 0.72, 0, 1)` for entering, faster exits, transform and opacity only, press scale 0.96, honor reduced motion. Durations from the motion pages: menus 200ms in / 150ms out, sheets 340ms in / 240ms out, rolls 220ms, toasts 250ms in / 160ms out.
- **Fixes to the tokens before adopting them** (they contradict owner decisions; made in the design system and the canvas copy too, outside this spec's PRs):
  - `timer` (88px clock on felt) becomes `live-amount`: the bought-in amount is the live screen's big number; the clock is small in the LIVE pill.
  - `title-large` is for pushed pages only; tab roots have no large title.
  - The `label` sample `PROFIT` becomes `RESULT`.
  - Usage notes drop the share card (deferred).
- **Docs:** rewrite `DESIGN.md` and `docs/design/foundations.md` and `components.md` for this system, including the glass and motion rules. Update `/design.html` and the mobile primitives.

## Plan

First PR, tokens and theme:

- [x] `docs/design/tokens.json` with the four fixes
- [x] Web tokens, light and dark, and theme following the system
- [x] Mobile tokens, light and dark

Second PR, glass, motion and docs:

- [ ] Glass and motion primitives on web and mobile
- [ ] Rewrite `DESIGN.md` and `docs/design/*`

## Test

- [x] Web and mobile token values match `docs/design/tokens.json` for both themes (a test reads both CSS files)
- [x] Text and money colors pass 4.5:1 on ground and card in both themes
- [ ] Reduced motion turns off every animation
- [ ] Screenshots of each tab in light and dark on web, iOS and Android

## Notes

- Existing screens adopt the tokens as they are; their layouts change in their own specs (005, 006, 008, 010–012).