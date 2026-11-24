---
status: draft
created: 2026-11-24
priority: medium
tags:
- api
- mobile
- ios
- android
created_at: 2026-11-24T04:24:14.016967100Z
updated_at: 2026-11-24T04:24:14.016967100Z
---

# Universal links and rich invite cards

## Overview

Invites go out in the app's own scheme today (`appUrl` in `apps/mobile/src/lib/config.ts`). In
Messages that is plain text that can't be tapped and opens nothing where Color Up isn't installed.
Flighty's links open the app when it's installed, fall back to a web page when it isn't, and
show up in Messages as a rich card.

Do the same for the three links people send: `/t/:token` (a shared table), `/invite/:token` (one
player) and the group join and claim links.

`docs/internals/navigation.md` says https links "wait until the apps are listed". This spec
replaces that rule. Universal links and App Links work as soon as the app is installed, and until
the store listings exist, the fallback page says how to get the app.

## Model

- **One https origin.** The Worker serves:
  - `/.well-known/apple-app-site-association` (`applinks` for the app's paths),
  - `/.well-known/assetlinks.json` (the signing certificate fingerprints),
  - and a small HTML page for each link path.

  The app claims the domain with `ios.associatedDomains` and Android `intentFilters` set to
  `autoVerify` in `app.config.ts`, one per build variant.
- **The scheme stays as a fallback.** `appLinkPrefixes` accepts both the https and the scheme
  forms, so links already sent keep working. New shares use https.
- **The card shows context, never money.** Each page has Open Graph tags (`og:title`,
  `og:description` and `og:image`), so Messages, WhatsApp and Slack draw a card. Examples are
  "Join Alex's table at Bellagio · Blackjack" and "Mike invited you to record your play". The
  image is one static branded image per link kind, so no image is rendered per request. Amounts,
  results and balances never appear.
- **A preview never spends a link.** Previews fetch the page with GET. The page reads the token
  through the same lookups the app's preview screens use, and never redeems, joins or claims. A
  revoked or used link gives a neutral card: "This link has expired".
- **The fallback page.** With the app installed, the OS opens the app and the page never shows.
  Without it, the page shows the same context and the store badges, or "Coming soon" until the
  listings exist. It also offers **Open in Color Up**, which uses the scheme link. Keep it to
  static HTML, with no web app (spec 018 retired the web).

## Requirements

- [ ] **Decide the domain** before building. Use a domain we own, not `*.workers.dev`. It goes
      into every link and the stores check it, so changing it later breaks links already sent.
- [ ] **Worker.** Serve the association files and link pages as a thin route module beside the
      API. The routes read through the existing invite, table-share and group-invite services.
- [ ] **App config.** Add associated domains and verified intent filters per variant, and build a
      new dev client and preview build.
- [ ] **Client.** `appUrl` builds https links. `appLinkPrefixes` accepts https and the scheme, and
      navigation handles both the same way. Update `config.test.ts`.
- [ ] **Docs.** Rewrite the https sentence in `navigation.md` to match.

## Tests

- [ ] API: each link page returns 200 with the right OG tags for valid, revoked and used tokens.
      A GET leaves the invite unredeemed. No page body contains an amount.
- [ ] API: both association files are valid JSON and list every variant's app ID and path.
- [ ] Device: with the app installed, a link tapped in Messages opens the right screen on iOS and
      Android. Without the app, it opens the fallback page. Run the Maestro "joining a shared
      table" flow.

## Non-goals

- Deferred deep linking (carrying a link through a fresh install).
- Images rendered per link, for example with a chart or names drawn in.
- A web version of any screen.

## Acceptance criteria

- [ ] Each of the three link kinds, sent in Messages, shows a rich card with no money on it and
      opens the app on iOS and Android.
- [ ] Old scheme links still open.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
