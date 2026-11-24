---
status: in-progress
created: 2026-11-24
priority: medium
tags:
  - mobile
  - ios
  - android
  - design
created_at: 2026-11-24T04:24:14.684704500Z
updated_at: 2026-11-24T07:27:12.868846700Z
transitions:
  - status: planned
    at: 2026-11-24T07:27:12.186444200Z
  - status: in-progress
    at: 2026-11-24T07:27:12.868846700Z
---

# Share a trip or session as a card

## Overview

After a weekend in Vegas the group screenshots standings by hand. Flighty turns a trip into a
card you can share. Do the same: one tap makes an image of a trip or a session, ready for the
share sheet.

## Model

- **Drawn on the device from data already loaded.** The card is a React Native view captured to
  PNG. It uses the same shaped data the screens use: `tripStandings`, `playerTrip` and
  `tripNights` from `@stacks/shared/trips`, the session's own result, and scales from
  `@stacks/client-runtime/chart`. It needs no server and no contract change. Offline, it works for
  local sessions and for trips the app already loaded.
- **Two kinds.**
  - **Trip:** the trip name, dates and venues, then standings with chips, capped at 8 rows. You
    are always included, and the rest go under "+N more". Then your result, your sessions and
    nights, and your running line (`playerTrip(...).line`, as in `TripHero`).
  - **Session:** venue, game, date, duration, result, buy-in and cash-out, and hourly. A single
    session has no curve.
- **One redacted model.** `hidden = privacyMode || hideAmounts`.
  - Hidden removes every amount, rather than showing `••••`: the amount labels, buy-in and
    cash-out, hourly, `climb` copy, the running line and its axes, and win/loss colours. What's
    left is ranks, names and chips, and for a session the venue, game, date and duration.
  - Preview and capture render from the same redacted model.
  - Toggling throws away any earlier capture, so an unredacted image can't be shared after
    hiding.
- **Initials only.** The card never shows contact photos (spec 047 keeps them on the phone).
- **Your money only, unless it's a group trip.** A session card is offered only for your own
  visit, closed and not deleted (`Play.tsx` can open other players' visits). A trip card shows
  the group's standings, which every member already sees.
- **Felt, whatever the app's theme.** It is pinned to the dark felt token values, with felt ink.
  - `BrandWordmark` gains a `felt` prop, since it is navy in light mode today.
  - `Money` gains a `hidden` prop that defaults to privacy mode, so the card controls hiding.
  - Win and loss colours must reach AA contrast on felt, using tokens rather than raw hex.
  - The Color Up wordmark sits small at the bottom, with no glow or gradient.
- **Size.** A fixed 1080×1350 physical-pixel PNG, for Stories and Messages. It isn't saved to the
  phone.

## Requirements

- [ ] **Capture.** Run `pnpm exec expo install react-native-view-shot`, then build a new dev client
      and preview build.
  - Capture the mounted preview view: `collapsable={false}`, with a logical size chosen so the
    capture is 1080×1350 on every pixel density.
  - Wait for layout and a frame before capturing.
  - On Android, check that `react-native-svg` (`Chip`, the wordmark, the line) appears in the
    PNG.
  - Write to a private temporary file, delete it once sharing finishes, and show a retryable
    `FormError` on failure.
  - The helper lives in `apps/mobile/src/lib/share.ts`, beside `shareCsv`.
- [ ] **Card components.** `TripCard` and `SessionCard` in `features/` take the redacted model as
      plain props and never fetch.
- [ ] **Entry points.**
  - **Share card** goes in `TripOptionsButton` for trips that have at least one finished session.
  - On a closed, own, non-deleted visit in `Play.tsx`, the action slot becomes a `⋯` menu with
    Edit and **Share card**.
  - The legacy `SessionScreen` and live sessions get no card.
- [ ] **Preview sheet.** It shows the card at its real proportions, with a **Hide amounts** toggle
      (on by default in privacy mode) and **Share**, which shows a pending state.
- [ ] **Design.** Add both cards to `docs/design/`, plus the felt token values in `tokens.json`
      and their contrast tests.

## Tests

- [ ] Unit: the redacted model hides every amount field, every line and every win/loss tint when
      hidden. The 8-row cap always includes you.
- [ ] Component: each card renders from fixture data, and a hidden card contains no digits for
      money.
- [ ] Device, on iOS and Android: share to Messages and to an image app. The image is 1080×1350
      and sharp, the SVG renders, and toggling Hide amounts before sharing never sends the earlier
      image.

## Non-goals

- Server-rendered images, or putting the card in invite links (spec 050 uses static cards).
- Contact photos on cards.
- Video, animation, or a year-in-review summary.

## Acceptance criteria

- [ ] On iOS and Android, a user shares a trip card and a session card through the share sheet,
      seen in the native app.
- [ ] With privacy mode on or **Hide amounts** on, the image has no amount, curve or win/loss
      colour.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
