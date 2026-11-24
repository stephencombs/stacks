---
status: draft
created: 2026-11-24
priority: medium
tags:
- mobile
- ios
- auth
created_at: 2026-11-24T03:28:46.164102100Z
updated_at: 2026-11-24T03:28:46.164102100Z
---

# Sign in with Apple on iOS

## Overview

Sign-in opens Clerk's hosted pages in a browser sheet (`features/SignInButton.tsx`, used by
`Landing.tsx` and `You.tsx`). On iOS, offer the native Apple sheet as well: one tap with Face
ID and no browser. If the hosted pages offer Google, App Review guideline 4.8 expects an
equivalent privacy-preserving option like this.

## Prerequisites

- **Account deletion (App Store guideline 5.1.1(v)).** Any app that creates accounts must let
  users start deleting their account inside the app. `You.tsx` has sign-out only. Spec 045
  covers deletion, including revoking Apple tokens. This
  spec can be built first, but it can't ship to the App Store without deletion.
- **Production Clerk instance.** The EAS `production` profile (`eas.json:51`) points at a Clerk
  test instance. Apple has to be set up in whichever instance each build really uses.

## Model

- **Clerk's native hook.** `useSignInWithApple` comes from `@clerk/expo/apple`, with
  `expo-apple-authentication`; `expo-crypto` is already installed. The hook moves between
  sign-up and sign-in itself. It does **not** activate the session. The caller runs
  `setActive({ session: createdSessionId })`, which leaves the same Clerk session hosted auth
  would, so `lib/account.tsx` and the claim flows don't change.
- **Reading the outcome.** The pinned 4.14.0 hook swallows `ERR_REQUEST_CANCELED` and resolves
  with `createdSessionId: null`. It also resolves `null` when sign-up is incomplete.
  - A session ID means activate it.
  - `null` with `signUp?.status === "missing_requirements"` is an error to show, not a cancel.
  - Any other `null` is a cancel and shows nothing.
  - A thrown waitlist rejection, for a new user while the waitlist is on, shows: "Color Up is
    invite-only for now. Join the waitlist with Create an account."
- **Names are optional in Clerk.** Apple sends the user's name only on the first authorization,
  and the user can leave it out. Color Up already copes with a missing name (`Clerk.ts:59`,
  `You.tsx:49`, `Crew.tsx:664`, `Invites.tsx:91`). Make first and last name optional in every
  instance instead of adding a completion step.
- **Android keeps hosted auth.** With Apple web credentials set up, the hosted pages show Apple
  too. An account made with Apple on an iPhone then signs in on Android as the same Clerk user.
- **Hide My Email can create a second account.** Clerk links accounts only when emails match. An
  existing email or Google user who picks Hide My Email gets a new, empty user, because the API
  keys users by Clerk subject (`apps/api/src/auth/Clerk.ts:52`). This spec doesn't try to merge
  accounts. Existing users go back through their original method.

## Requirements

- [ ] **Config.** Run `pnpm exec expo install expo-apple-authentication` from `apps/mobile`.
      Set `ios.usesAppleSignIn: true` and add the plugin in `app.config.ts`. Build a new dev
      client and a new preview build.
- [ ] **Apple and Clerk setup, per bundle ID** (`app.config.ts:3`). Turn on the Sign in with
      Apple capability for `.dev`, `.preview` and the production ID. Register each ID as a native
      app in the Clerk instance that build uses, and turn on Apple SSO for sign-up and sign-in.
      For the hosted pages, add a Services ID tied to the primary App ID, Clerk's return URL, and
      a Private Email Relay email source. Write a short `docs/internals/` note only for steps
      the code can't show.
- [ ] **Clerk names.** Make first and last name optional in every instance.
- [ ] **AppleSignInButton** (`features/`). Mount it only inside `ClerkProvider` after Clerk has
      loaded, on iOS, when `AppleAuthentication.isAvailableAsync()` is true. It's a native
      `AppleAuthenticationButton` with type `CONTINUE`, a style that follows the resolved theme
      (`useUniwind().theme`: `BLACK` in light, `WHITE` in dark), full width, `height: 52` and
      `cornerRadius: 26`, matching `Button size="lg"`. Ignore taps while a flow is running.
      Handle each outcome as in Model, and show errors with `SignInButton`'s `FormError`.
- [ ] **Landing.** On iOS, put the Apple button above the hosted buttons. Keep one primary
      (`DESIGN.md:15`): demote "Create an account" to `secondary` when the Apple button is
      showing. Check the smallest iPhone height against the layout thresholds
      (`Landing.tsx:127`, `:362`), so nothing clips or needs scrolling.
- [ ] **You.** Put the Apple button above the hosted buttons in the signed-out account actions.
      Signing in moves the open sheet to the signed-in view. Sign-out stays on Clerk's
      `signOut()`; don't use `AppleAuthentication.signOutAsync()`.

## Tests

- [ ] Component: the button renders only on iOS when available. Activation runs on a session. A
      cancel shows nothing. Missing requirements and a waitlist rejection each show their error.
      A double tap starts one flow.
- [ ] Device, iOS: a first sign-up with the name shared, a first sign-up with Hide My Email and
      no name, then sign out and sign back in when Apple sends no name.
- [ ] Device, Android: the same Apple account signs in through the hosted pages, with the same
      Clerk user ID.
- [ ] Maestro: the hosted sign-in flow still passes. The `CONTINUE` label ("Continue with Apple")
      doesn't collide with the `tapOn: "Sign in"` selector. Simulators can't finish the Apple
      sheet without a person, so it stays manual.

## Non-goals

- Account deletion and Apple token revocation, which need their own spec (see Prerequisites).
- Merging duplicate accounts, or linking Apple to an existing account under Hide My Email.
- Native Google sign-in, or replacing the hosted pages.
- Live Activities, widgets, App Intents and Calendar.

## Acceptance criteria

- [ ] On iOS, a new user signs up with Apple, with or without sharing their name or email, and
      lands in the same signed-in state as hosted auth.
- [ ] A returning Apple user signs back in on iOS, and on Android through the hosted pages.
- [ ] The Apple button meets Apple's HIG: the system button, at least as large as the other
      sign-in buttons, and visible without scrolling, seen in the native app in light and dark.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
