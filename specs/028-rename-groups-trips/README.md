---
status: planned
created: 2026-11-16
priority: low
tags:
  - mobile
  - api
  - contracts
created_at: 2026-11-16T21:53:45.687580400Z
updated_at: 2026-11-16T21:53:45.687580400Z
---

# Rename groups and trips

## Overview

A group or trip keeps the name it was created with, so there's no way to fix a typo. The Android
audit hit this from Group settings and the trip menu.

## Design

- **Contracts:** a rename for a group and one for a trip, typed in `packages/contracts`.
- **API:** owners and admins rename a group. A trip can be renamed by whoever can end it. The API
  enforces this; the client only hides the control.
- **Mobile:** **Name** in Group settings and **Rename** in the trip's ⋯ menu, each opening a sheet
  with one text field.
- Currency stays fixed and isn't editable.

## Plan

- [ ] Contracts and API with permission tests
- [ ] Group settings and trip menu

## Test

- [ ] API tests: an allowed rename succeeds; a member without rights is refused
- [ ] The new name shows on Crew, the trip page and Stats without a reload
