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

### Model

- **Local only.** A photo is never uploaded, synced, logged or sent. Each friend sees the photo
  from their own address book, or initials if they never linked one. On-device data doesn't count
  as "collected" for Apple's privacy details or Play's Data safety, so there's no new label.
- **Keyed by player and by account.** One friend can be a different player row in each group.
  - A small index maps `p:<playerId>` (always written) and `u:<userId>` (written when the player
    has an account) to a random `photoId`.
  - Lookup tries `p:` and then `u:`, so one link shows that friend in every shared group.
  - It works offline for table guests and survives renames. A claim writes `u:` the next time
    the group loads. Account deletion (spec 045) clears `userId` and keeps `p:`.
  - Never match players by name.
- **A snapshot, not a sync.** Without the contacts permission the app can't see later changes to
  the contact, so re-pick to update. Don't store contact identifiers, since they're useless without
  the permission.
- **Storage.** Use `expo-file-system` under `Paths.document`, because the cache can be purged and
  a photo can't be fetched again:
  - `contact-photos/<photoId>.jpg`, 192×192 JPEG with EXIF stripped, about 10–20 KB.
  - `contact-photos/index.json`, read into a store at startup the way `lib/preferences.ts` does,
    so a `Chip` never flickers.
  - Ordinary device backups and phone transfers carry the photos. A second device starts with
    initials.
- **Wiping.** "Unlink" removes every key that points at the `photoId`, and the file. Signing out
  (`You.tsx`) and deleting an account (spec 045) delete the whole folder.

### Native module

- **It returns `{ name, photoUri }`.** `photoUri` is a normalized temporary JPEG, or `null`.
  Cropping and scaling happen natively; no base64 crosses the bridge.
- **iOS.** Read `thumbnailImageData`, or `imageData` as a fallback, from the picker's snapshot.
  Check `isKeyAvailable` first: an unfetched key throws an Objective-C exception that Swift can't
  catch. Never touch `CNContactStore`, and don't use iOS 18's `ContactAccessButton`, which needs
  the permission.
- **Android, the risky part.** The pick only grants access to the exact URI it returns, and photo
  URIs are separate sub-URIs. Try `openContactPhotoInputStream(cr, uri, false)` and catch
  `SecurityException`. If device testing shows Android blocks this, hide the photo controls on
  Android rather than add `READ_CONTACTS`.

### UI

- **On add.** In `AddGuestSheet` and `AddPlayerSheet`, a picked photo previews beside the Name
  field, with a way to drop it. It is saved under the new player's ID on submit, and the temporary
  file is deleted on cancel.
- **Existing players.**
  - In `GroupPeople`, any other member or guest opens a player sheet, generalized from
    `ManageMemberSheet`, for every role. It offers "Link contact photo", or "Change" and "Remove",
    with "Only on this phone." No confirmation is needed, since a photo is local and quick to
    re-pick.
  - The same action appears in the standings `StatSheet` and the table's `SeatSheet`.
- **Chip.** `Chip` takes an explicit `photoUri`. Venue chips (for example `SessionList.tsx:199`)
  must never get a player photo.
  - With a photo, it draws the photo inside a 2px ring in the player's chip colour, 1.5px below
    26pt, with no stripes. It falls back to initials when loading fails.
  - Race-chart endpoints stay initials.
  - Your own rows use your Clerk avatar (`UserAvatar`) when you have one.
- **Open decision: iOS tables.** iOS live and shared table rows show no `Chip` today
  (`SharedTable.tsx:75`, `LiveTable.tsx:163`), so a linked photo wouldn't show there. Decide whether
  to add one for parity with Android.

### Phase 2 tests

- [ ] Unit: index lookup order, `u:` filled in after a claim, unlink removes every key, and the
      folder is wiped on sign-out.
- [ ] Device: on iOS and Android, a photo appears with no permission prompt, or Android falls back
      to hiding the controls as described above.

## Non-goals

- Reading or storing phone numbers or emails, or sending invites by SMS. The share sheet already
  lets the user choose who gets the link.
- Finding friends who already use Color Up from the address book (App Review guideline 5.1.1).
- Full contacts access, searching contacts inside the app, or syncing contacts.
- Sign in with Apple, which is in its own spec.
- Opening the system contact card from a player, which needs the contacts permission.

## Acceptance criteria

- [ ] On iOS and Android, a user adds a group guest and a new table player from Contacts, with no
      permission prompt, seen in the native app.
- [ ] Neither platform's build declares a contacts permission.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, `pnpm test` pass.
