---
status: draft
created: 2026-11-24
priority: medium
tags:
- mobile
- ios
- android
- design
created_at: 2026-11-24T04:24:14.684704500Z
updated_at: 2026-11-24T04:24:14.684704500Z
---

# Share a trip or session as a card

## Overview

After a weekend in Vegas the group screenshots standings by hand. Flighty turns a trip into a
card you can share. Do the same: one tap makes an image of a trip or a session, ready for the
share sheet.

## Model

- **Drawn on the device from data it already has.** The card is a React Native view rendered off
  screen and captured to PNG. It uses the same shaped data the screens use (`tripStandings` and
  `playerTrip` from `@stacks/shared/trips`, the session result, and scales from
  `@stacks/client-runtime/chart`). It works offline and needs no server.
- **Two kinds.**
  - **Trip:** the trip name, dates and venues, the standings with chips (and contact photos from
    spec 043 phase 2 on this phone), plus your own result and hours.
  - **Session:** venue, game, duration, your result, and the race curve.
- **Amounts follow privacy.** With privacy mode on, the card opens with amounts hidden
  (`HIDDEN_AMOUNT`). Either way the share sheet has a **Hide amounts** toggle, so standings can go
  out as ranks only.
- **Your money only, unless it's a group trip.** A session card shows only your play, even at a
  shared table. A trip card shows the group's standings, which every member can already see.
- **Branded but quiet.** It follows `DESIGN.md`: felt colours and chips, the Color Up wordmark
  small at the bottom, with no glow or gradient. The image is a fixed 1080×1350 PNG for Stories
  and Messages, and isn't saved to the phone.

## Requirements

- [ ] **Capture.** Add `react-native-view-shot` with `pnpm exec expo install`. A helper in
      `apps/mobile/src/lib/share.ts` captures a view and shares it through `expo-sharing`, beside
      `shareCsv`.
- [ ] **Card components.** Add `TripCard` and `SessionCard` in `features/`. They take plain props
      and never fetch, so tests can render them.
- [ ] **Entry points.** On a trip, add **Share card** to `TripOptions`. On a closed session, add
      it to that session's actions. A live session gets no card until it ends.
- [ ] **Preview sheet.** Show the card at its real proportions, with the **Hide amounts** toggle
      and **Share**.
- [ ] **Design.** Add the cards to `docs/design/` and check them in light and dark. The card
      always renders in the felt theme, whatever the app's theme.

## Tests

- [ ] Component: each card renders from fixture data. Hidden amounts show nothing but
      `HIDDEN_AMOUNT`, and a session card never lists other players' money.
- [ ] Device: share from iOS and Android to Messages and to Photos, then check the image is sharp
      and not cropped.

## Non-goals

- Server-rendered images, or putting the card in invite links (spec 046 uses static images).
- Video or animated cards.
- A year-in-review or "wrapped" summary.

## Acceptance criteria

- [ ] On iOS and Android, a user shares a trip card and a session card through the share sheet,
      seen in the native app.
- [ ] With privacy mode on, or **Hide amounts** on, no amount appears anywhere on the image.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
