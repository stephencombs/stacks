---
status: draft
created: 2026-11-24
priority: medium
tags:
- mobile
- ios
- android
created_at: 2026-11-24T03:28:45.528384700Z
updated_at: 2026-11-24T03:28:45.528384700Z
---

# Pick players from Contacts

## Overview

Every new person is typed by hand today, either as a group guest (`features/AddGuestSheet.tsx`)
or as "Someone new" in `AddPlayerSheet` (`features/RecordingForms.tsx`). Most of these people are
already in the user's address book. Let the user pick a contact to fill in the name, without
asking for any contacts permission.

## Model

- **The picker returns a name and nothing more.** The contact's phone, email and ID never reach
  JS. The name goes into the field the user would type in and stays editable. When the user
  submits, the existing requests (`guests.add`, `join_table`) save it as `displayName`.
  Contracts, the API and the database don't change.
- **A small local Expo module, not `expo-contacts`.** The SDK 58 `expo-contacts` package needs
  permission even for its picker. After the user picks, it looks the contact up again by ID: in
  `CNContactStore` on iOS, and in the Contacts and Data tables on Android, which drops the
  picker's temporary grant. Its config plugin also adds `READ_CONTACTS` and `WRITE_CONTACTS`. A
  module shaped like `apps/mobile/modules/apple-maps-search` avoids all of that:
  - iOS: present `CNContactPickerViewController`, and in `contactPicker(_:didSelect:)` format the
    `CNContact` snapshot it hands back with `CNContactFormatter` (`.fullName`). Don't use
    `CNContactStore`.
  - Android: launch `Intent.ACTION_PICK` on `ContactsContract.Contacts.CONTENT_URI`, then query
    only the returned URI for `Contacts.DISPLAY_NAME`. That temporary grant covers this column.
  - It resolves to `string | null`, where `null` means cancelled or no name.
- **Name.** Trim the name, cut it to 60 characters (`Name(60)`), and trim it again. An empty
  result fills nothing. Duplicate names are already told apart by `tellApart`.

## Requirements

- [ ] **Module.** Add `apps/mobile/modules/contact-name-picker` with iOS and Android code and a
      typed `pickContactName(): Promise<string | null>`. Add no permission, Info.plist key or
      manifest entry.
- [ ] **AddGuestSheet.** Add a "Choose from Contacts" control by the Name field. A pick fills the
      name and clears `nameError`. A cancel changes nothing. A failure shows the field's error
      text and keeps what was typed. Follow `DESIGN.md`.
- [ ] **AddPlayerSheet.** Add the same control to both branches: Android's `TextInput` (near
      `RecordingForms.tsx:1685`) and iOS's `TextField` (near line 1779). It works offline.
- [ ] **Native build.** This adds native code, so it needs a new dev client and a preview build.
- [ ] **Disclosures.** Nothing new leaves the device except a name the user could type anyway.
      Check that the privacy policy and the App Store privacy details still hold.

## Tests

- [ ] Unit: the name rule covers trimming, the 60-character cut landing on whitespace, and an
      empty result.
- [ ] Component: in `AddGuestSheet` and both `AddPlayerSheet` branches, with the module mocked, a
      pick fills the field and clears its error, a cancel leaves it unchanged, and the request's
      `displayName` is the only field that comes from the contact.
- [ ] Device, on a fresh install on iOS and Android: picking fills the name with no permission
      prompt, and the merged Android manifest has neither `READ_CONTACTS` nor `WRITE_CONTACTS`.

## Phase 2: contact photos on this device

Players show as coloured initials (`Chip`) everywhere. Phase 2 lets each person see a friend's
photo from their own address book, the way Flighty puts faces on friends. Phase 1 ships first and
doesn't wait for this.

- **Local only.** Picking a contact for a player also stores its photo thumbnail on this device,
  keyed by player ID. The photo is never uploaded or sent. Each friend sees the photo from their
  own address book, or initials if they never linked one.
- **Linking.** Pick a contact when you add a player, or use "Link contact" on an existing player.
  "Unlink" removes the photo from this device. With no contacts permission, the app can't match
  players to contacts by itself, so each person picks once.
- **Lasts through changes.** The link uses the player ID, so it survives renames, claims, and the
  account deletion in spec 045, which turns a member back into a guest.
- **The module returns `{ name, photo }`.** The photo is a small JPEG written to app storage, or
  `null`. Check on a device whether the picker's grant gives access to the photo: on iOS
  through `thumbnailImageData` on the snapshot, and on Android through the photo for the granted
  URI. Where it doesn't, that platform falls back to initials.
- **Where photos show.** Everywhere a player `Chip` appears, with initials as the fallback when
  there is no photo or it fails to load.
- **Signing out and wiping.** Linked photos are part of the device's local data. Signing out and
  deleting an account (spec 045) clear them.

## Non-goals

- Reading or storing phone numbers or emails, or sending invites by SMS. The share sheet already
  lets the user choose who gets the link.
- Finding friends who already use Color Up from the address book (App Review guideline 5.1.1).
- Full contacts access, searching contacts inside the app, or syncing contacts.
- Sign in with Apple, which is in its own spec.

## Acceptance criteria

- [ ] On iOS and Android, a user adds a group guest and a new table player from Contacts, with no
      permission prompt, seen in the native app.
- [ ] Neither platform's build declares a contacts permission.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
