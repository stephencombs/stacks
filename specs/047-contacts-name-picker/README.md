---
status: in-progress
created: 2026-11-24
priority: medium
tags:
  - mobile
  - ios
  - android
created_at: 2026-11-24T03:28:45.528384700Z
updated_at: 2026-11-24T04:56:28.882348500Z
transitions:
  - status: planned
    at: 2026-11-24T04:56:28.196786600Z
  - status: in-progress
    at: 2026-11-24T04:56:28.882348500Z
---

# Pick players from Contacts

## Overview

Every new person is typed by hand today, either as a group guest (`features/AddGuestSheet.tsx`)
or as "Someone new" in `AddPlayerSheet` (`features/RecordingForms.tsx`). Most of these people are
already in the user's address book. Phase 1 lets the user pick a contact to fill in the name, with
no contacts permission. Phase 2 puts the friend's photo on their avatar on this phone, the way
Flighty puts faces on friends.

## Phase 1: the name

### Model

- **The picker returns a name and nothing more.** The contact's phone, email and ID never reach
  JS. The name goes into the field the user would type in and stays editable. When the user
  submits, the existing requests (`guests.add`, `join_table`) save it as `displayName`.
  Contracts, the API and the database don't change.
- **A small local Expo module, not `expo-contacts`.** The SDK 58 `expo-contacts` package needs
  permission even for its picker. After the user picks, it looks the contact up again by ID: in
  `CNContactStore` on iOS, and in the Contacts and Data tables on Android, which drops the
  picker's temporary grant. Its config plugin also adds `READ_CONTACTS` and `WRITE_CONTACTS`.
  Model the module on `apps/mobile/modules/apple-maps-search` (iOS) and
  `modules/live-session-updates` (Android):
  - iOS: present `CNContactPickerViewController`, and in `contactPicker(_:didSelect:)` format the
    `CNContact` snapshot it hands back with `CNContactFormatter` (`.fullName`). Don't use
    `CNContactStore`.
  - Android: launch `Intent.ACTION_PICK` on `ContactsContract.Contacts.CONTENT_URI`, then query
    only the returned URI for `Contacts.DISPLAY_NAME`. That temporary grant covers this column.
  - It resolves to `string | null`, where `null` means cancelled or no name.
- **Name.** Trim the name, cut it to 60 characters (`Name(60)`), and trim it again. An empty
  result fills nothing. Duplicate names are already told apart by `tellApart`.

### Requirements

- [ ] **Module.** Add `apps/mobile/modules/contact-picker` with iOS and Android code and a typed
      `pickContact()`. Add no permission, Info.plist key or manifest entry.
- [ ] **AddGuestSheet.** Add a "Choose from Contacts" button by the Name field: `secondary`,
      `min-h-11`. Keep the field's `autoFocus`. A pick fills the name and clears `nameError`. A
      cancel changes nothing. A failure shows the field's error text and keeps what was typed.
- [ ] **AddPlayerSheet.** Add the same control to both branches: Android's `TextInput` (near
      `RecordingForms.tsx:1685`) and iOS's `TextField` (near line 1779). It works offline.
- [ ] **Native build.** This adds native code, so it needs a new dev client and a preview build.
- [ ] **Disclosures.** Nothing new leaves the device except a name the user could type anyway.
      Check that the privacy policy still holds.

### Tests

- [ ] Unit: the name rule covers trimming, the 60-character cut landing on whitespace, and an
      empty result.
- [ ] Component: in `AddGuestSheet` and both `AddPlayerSheet` branches, with the module mocked, a
      pick fills the field and clears its error, a cancel leaves it unchanged, and the request's
      `displayName` is the only field that comes from the contact.
- [ ] Device, on a fresh install on iOS and Android: picking fills the name with no permission
      prompt, and the merged Android manifest has neither `READ_CONTACTS` nor `WRITE_CONTACTS`.

## Phase 2: photos on this phone, and avatars at iOS tables

Phase 1 ships first and doesn't wait for this. The iOS table avatars can ship on their own, before
the photos.

### Model

- **Never leaves the phone.** A photo is never uploaded, synced, logged or sent. It is left out of
  shared images (spec 051 draws initials), and out of cloud backups: on iOS
  `isExcludedFromBackup`, on Android a `<cloud-backup>` exclude. Each friend sees the photo from
  their own address book, or initials. Data that stays on the device doesn't count as
  "collected" for Apple's privacy details or Play's Data safety.
- **One photo per player.** The key is the player ID. Nothing else is shared across groups: no
  matching by account, and never by name.
  - A friend in two groups is two players, and is linked twice. That keeps Change and Remove
    simple: they act on one player, with no fallback that could bring back an old photo.
  - Renames, claims, and account deletion (spec 049, which keeps the player ID) don't affect it.
  - Linking across groups by account needs `userId` on table and stats views. That belongs in a
    later spec, if people ask for it.
- **A snapshot, not a sync.** Without the contacts permission the app can't see later changes to
  the contact, so re-pick to update. Don't store contact identifiers.
- **Storage.** `expo-file-system` under `Paths.document`, because the cache can be purged and a
  photo can't be fetched again:
  - `contact-photos/<photoId>.jpg`. The photo is 192×192, cropped to centre with orientation
    applied first, and saved as JPEG with EXIF stripped. Each is about 10–20 KB, and the random
    file name defeats image caching on change.
  - `contact-photos/index.json` maps player ID to `photoId`. It is read into a store at startup
    the way `lib/preferences.ts` does, so an avatar never flickers.
  - The picker writes temporary files to `Paths.cache`. They are deleted on save or cancel, and
    swept at startup.
- **Lifecycle.**
  - Change writes the new file and then removes the old one. Remove deletes both the file and
    the key.
  - Signing out keeps photos, like the device's recording ledger (`lib/recording.ts:6`), which
    also stays.
  - Deleting an account (spec 049) deletes the folder.

### Native module

- **`pickContact()` returns `{ name, photo }`.** `photo` is `{ uri }`, or `"none"` (the contact
  has no photo), or `"unavailable"` (the platform wouldn't share it). Cropping and scaling happen
  natively; no base64 crosses the bridge.
- **iOS.** Read `thumbnailImageData`, or `imageData` as a fallback, from the picker's snapshot.
  Check `isKeyAvailable` first: an unfetched key throws an Objective-C exception that Swift can't
  catch. Never touch `CNContactStore`, and don't use iOS 18's `ContactAccessButton`, which needs
  the permission.
- **Android.** The pick grants only the exact URI it returns, and photo sub-URIs often fall
  outside that grant, especially in Samsung's and Xiaomi's Contacts apps. Try
  `openContactPhotoInputStream(cr, uri, false)` and map `SecurityException` to `"unavailable"`.
  Never add `READ_CONTACTS`.
  - **Decided (2026-11-24):** a Pixel on Android 17 refuses the photo sub-URI without
    `READ_CONTACTS`. So Android never shows the photo controls, and photos are iOS-only. Android
    still picks names.

### UI

- **Avatar.** `Avatar` takes the photos to try and draws the platform's Contacts-style default
  when there are none or one won't load: iOS's grey monogram, or Android's letter tile. A
  `PlayerAvatar` wrapper looks a photo up by player ID. A venue or game is never an avatar: it's
  a disc or bar in its game colour, with no photo.
  - A share card uses the plain `Avatar` with initials, so a photo never leaves the phone.
  - Race-chart endpoints use `PlayerAvatar`.
- **Player avatars use `PlayerAvatar`:** `GroupPeople`, `Crew.tsx`, `Trips.tsx`, `GroupStats.tsx`,
  `RecordingForms.tsx`, and the table rows below. `SessionList.tsx` (`play.others`) has no player ID
  and has no avatar.
- **iOS tables get avatars.** `features/SharedTable.tsx` and `LiveTable.tsx` draw the avatar on
  both platforms, at 32pt on iOS and 36pt on Android, and are checked in the native app.
  - `screens/SharedTable.tsx` (the `/t/:token` preview) stays without avatars.
- **On add.** In `AddGuestSheet` and `AddPlayerSheet`, a picked photo previews beside the Name
  field, with a way to drop it. It is saved under the new player's ID on submit
  (`AddGuestSheet`'s `id`, or the receipt's `command.playerId`).
- **Existing players.**
  - In `GroupPeople`, every other member and guest row opens a **Player sheet** for every role.
    It is generalized from `ManageMemberSheet`: guard `player.userId` and keep the admin controls
    behind `canManage`. Move the guest's "Send claim link" into the sheet, so a row is one press
    target.
  - The sheet offers "Link contact photo", or "Change" and "Remove", with the footnote "Only on
    this phone." There is no confirmation, since a photo is local and quick to re-pick.
  - At a table, linking is in `SeatSheet`, which only recorders can open. That's acceptable for
    now.
  - A "This contact has no photo" message covers `"none"`.

### Tests

- [x] Unit: the index (link, change and remove), the temporary-file sweep, and that sign-out keeps
      photos while account deletion wipes them.
- [x] Component: `Avatar` falls back to the platform default, and a share card never shows a photo.
- [ ] Device: iOS shows a photo with no permission prompt. On Android, a Pixel and a Samsung each
      show either a photo or no photo controls. Photos aren't in an iCloud backup or an Android
      cloud backup.

## Non-goals

- Reading or storing phone numbers or emails, or sending invites by SMS. The share sheet already
  lets the user choose who gets the link.
- Finding friends who already use Color Up from the address book (App Review guideline 5.1.1).
- Full contacts access, searching contacts inside the app, or syncing contacts.
- Opening the system contact card from a player, which needs the contacts permission.
- Sign in with Apple, which is in its own spec.

## Acceptance criteria

- [ ] On iOS and Android, a user adds a group guest and a new table player from Contacts with no
      permission prompt, seen in the native app.
- [ ] Neither platform's build declares a contacts permission.
- [ ] Phase 2: a linked photo shows on that player's avatars on this phone only, and iOS table rows
      show avatars.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
