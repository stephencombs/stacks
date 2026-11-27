---
status: planned
created: 2026-11-27
tags:
- mobile
- api
- contracts
- privacy
created_at: 2026-11-27T03:56:58.306802900Z
updated_at: 2026-11-27T03:56:58.306802900Z
---

# Your own profile photo

## Overview

A signed-in member can't set their own photo, and nobody else ever sees it. Today `UserAvatar` shows the Clerk photo on the member's own phone (Google sign-in brings one, Apple sign-in doesn't), and the API saves `users.avatar_url` from the token's `picture` claim but never sends it out. Everyone else sees initials, or a contact photo they linked on their own phone.

Flighty's model: you set your own photo and your friends see it. Do the same. Clerk hosts the image (`user.setProfileImage`), so we add no storage.

## Requirements

### Mobile: change your photo

- [ ] In the You sheet (`apps/mobile/src/features/Personal.tsx`), tapping your avatar opens a native menu: **Choose Photo**, **Take Photo**, and **Remove Photo** when you have one. Use the same menu pattern as the seat sheet's photo menu (`useContactPhotoLink`) so both feel the same on iOS and Android.
- [ ] Choose/Take use `expo-image-picker` (add it with `pnpm exec expo install`; config plugin strings for camera and library in `app.config.ts`, worded for Color Up). Square crop, compressed JPEG, small enough for Clerk's upload limit.
- [ ] Upload with Clerk's `user.setProfileImage({ file })`; remove with `setProfileImage({ file: null })`. Show progress on the avatar while it uploads; on failure show a plain alert and keep the old photo.
- [ ] Builds without Clerk (`useAccount().available === false`) show no menu.

### Server and contracts: let the crew see it

- [ ] Find out what our Clerk session token carries. `Clerk.ts` reads `claims.picture`; check (dev instance, via the Backend API: create a session and mint a token) whether the claim exists and whether it is Clerk's generated default image for users without a photo. Only a real uploaded/OAuth photo may be stored: a user with no photo must store `null`, so other phones fall back to initials.
- [ ] If the claim is missing or can't tell a real photo from the default, say exactly what to add to the session token in the Clerk dashboard (e.g. `"picture": "{{user.has_image ? user.image_url : null}}"` or a separate has-image claim), apply it on the dev instance, and list it for the user to apply on production. Don't add a Backend API call per request.
- [ ] After a change, force a fresh token (`getToken({ skipCache: true })`) and make one API request so `users.avatar_url` updates right away, then refetch group data.
- [ ] `packages/contracts/src/views.ts`: add the photo to `Player` as an optional key (`avatarUrl`), filled from `users.avatar_url` for players with a `userId`. Optional so an app talking to an older API still decodes.
- [ ] API tests cover: member photo is returned; guest has none; removing it returns null; a former member's photo isn't returned (they left; show initials).

### Mobile: show it

- [ ] `PlayerAvatar`'s image list becomes: contact photo linked on this phone → the member's own photo → initials. Your own avatar keeps contact photo → Clerk photo → initials.
- [ ] Everywhere a player avatar renders (live table, people, activity feed, seat sheet) picks this up through `PlayerAvatar`; no screen-specific code.

### Reverse states and privacy

- [ ] Remove Photo clears it for everyone on their next fetch.
- [ ] Account deletion already deletes the Clerk user (and its image); make sure it also nulls `users.avatar_url` so no stale URL is served. Update `docs/internals/account-deletion.md` only if that changes what it says.
- [ ] Guests stay contact-photo-only.

## Non-goals

- Our own image storage (R2) or moderation.
- Changing your display name here.
- Photos for guests.

## Acceptance criteria

- Member A sets a photo on Android; member B sees it on their phone after a refresh, in the live table and the feed.
- A removes it; B sees A's initials.
- A contact photo B linked for A still wins on B's phone.
- `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass; seen on the Android emulator. iOS checked on TestFlight by the user.
