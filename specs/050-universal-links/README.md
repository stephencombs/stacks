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
updated_at: 2026-11-24T04:38:26.736924Z
---

# Universal links and rich invite cards

## Overview

Invites go out in the app's own scheme today (`appUrl` in `apps/mobile/src/lib/config.ts`). In
Messages that is plain text that can't be tapped, and it opens nothing where Color Up isn't
installed. Flighty's links open the app when it's installed, fall back to a web page when it
isn't, and show up in Messages as a rich card.

Do the same for the four links people send: `/t` (a shared table), `/invite` (one player),
`/join` (a group) and `/claim` (a guest's history).

`docs/internals/navigation.md` (lines 34 and 68) says https links wait until the apps are listed.
This spec replaces that rule. Universal links and App Links work as soon as the app is installed,
and until the listings exist the fallback page says how to get the app.

## Model

- **The token goes in the fragment: `https://<host>/t#<token>`.** A fragment never reaches the
  server. So tokens stay out of Worker logs, previews never spend or read a link, and there is no
  token in referrers. Universal links and App Links match on the path, and the app reads the
  fragment. In the scheme, links keep the path form (`stacks://t/<token>`), so links already sent
  still open.
- **Cards are static and generic.** Each of the four paths is a static HTML page. Its Open Graph
  tags describe the kind of link, such as "Join a table on Color Up" or "Record your play on
  Color Up", and its `og:image` is a branded 1200×630 image for that kind. Pages show no names,
  venues or amounts, and do no database lookup. Richer cards would need server-side lookups that
  run without sign-in, and today's preview services need `CurrentUser` and load money. If
  wanted, that's a separate spec with its own privacy review.
- **A host per build.**
  - Production uses the product domain. Preview builds use `preview.<domain>`.
  - Dev builds get no verified links and keep the scheme only.
  - Each host's `apple-app-site-association` lists only its own build's app ID, and its
    `assetlinks.json` only its own package. So production and preview, installed together, never
    open each other's links.
- **Only invite links change.** A new `inviteUrl` builds the https form. `appUrl` stays on the
  scheme for Live Activity and Live Update links (`liveSessionAdapter.ts:152`).

## Requirements

- [ ] **The domain.** It is a product domain we own, never `*.workers.dev`. Production uses the
      domain itself and preview builds use `preview.<domain>`. It goes into every link, so it
      can't change once links are out. Spec 049's Play page and its `support@<domain>` use it
      too. The domain isn't registered yet, and that doesn't block building: the host is
      configuration (`EXPO_PUBLIC_LINK_HOST` per EAS profile, plus a Worker var). Until it's
      set, `inviteUrl` falls back to the scheme and the Worker doesn't serve link routes. Before
      the first release that sends https links, register the domain and set it.
- [ ] **Worker routes**, served before `Database.layer` is built (`worker.ts:48`), with no database
      access:
  - `/.well-known/apple-app-site-association`, served as `application/json` with HTTP 200 and no
    redirect. It uses `components` for `/t`, `/invite`, `/join` and `/claim` only, and the build's
    `<TeamID>.<bundleId>`.
  - `/.well-known/assetlinks.json`, with that build's package and every SHA-256 it is signed with.
    For production, that includes the Play App Signing key.
  - The four link pages and `/og/*.png`, each answering GET and HEAD.
  - Headers on link pages: `Cache-Control: no-store`, `X-Robots-Tag: noindex`,
    `Referrer-Policy: no-referrer`, and a strict CSP. Static images are cached for a long time.
  - Add `routes` or `custom_domains` in `wrangler.jsonc`.
- [ ] **The fallback page** has the same copy, store badges (or "Coming soon" until the apps are
      listed), and **Open in Color Up**. That button builds the scheme link from the fragment in
      a few lines of inline script. It is not a web app (spec 018 retired the web).
- [ ] **App config** per variant (`app.config.ts:3`):
  - `ios.associatedDomains`: `applinks:<host>`.
  - Android `intentFilters`: `autoVerify`, `VIEW`, `BROWSABLE` and `DEFAULT`, restricted to the
    four paths and never `/`, so `/api` and other pages stay in the browser.
  - Build a new preview build, and a production build when one is due.
- [ ] **Client.**
  - `inviteUrl(kind, token)` builds the https form on preview and production, and the scheme on
    dev.
  - Linking accepts both forms. The https form maps `/t#token` to the same route as
    `stacks://t/token` (`App.tsx:180`).
  - `shareLink` passes `url` on iOS (`Share.share({ url, message })`), so the share sheet treats
    it as a link.
- [ ] **Maestro.** `shared-table.yaml:43` matches `stacks-preview://t/.+`. Update it to the
      preview host's https link.
- [ ] **Docs.** Rewrite `navigation.md` lines 34 and 68 to match.

## Tests

- [ ] API: each link page and both association files return 200 with the right content type and
      headers, and no page contains a token or a name.
- [ ] Unit: `inviteUrl` for each variant, and linking parses all four paths in both forms.
- [ ] Device: with the app installed, a link tapped in Messages opens the right screen on iOS and
      Android. Check:
  - a cold and a warm launch, and continuing a join or a claim while signed out,
  - production and preview installed side by side,
  - without the app, the fallback page and its **Open in Color Up**,
  - old scheme links.

  Run the Maestro "joining a shared table" flow.

## Non-goals

- Cards with names, venues or amounts, or images rendered for each link.
- Deferred deep linking (carrying a link through a fresh install).
- A web version of any screen.

## Acceptance criteria

- [ ] All four link kinds, sent in Messages, show a branded card and open the app on iOS and
      Android.
- [ ] No link page, log line or preview receives a token.
- [ ] Old scheme links still open.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
