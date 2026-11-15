---
status: in-progress
created: 2026-11-14
priority: medium
tags:
  - venues
  - api
  - web
  - mobile
depends_on:
  - "003"
parent: "001"
created_at: 2026-11-14T20:15:30.759235709Z
updated_at: 2026-11-15T02:53:45.670023640Z
transitions:
  - status: in-progress
    at: 2026-11-14T21:28:45.380575121Z
---

# Venues for personal play

## Overview

Every design shows a venue, but venue search needs an account today, so signed-out play can't set one, and Stats' By casino and Map come up empty. Make venue search public and read-only, cache the venues a player uses on the device, and add the venue to the live session's edit sheet.

## Design

- **Search without an account:** a new public endpoint group beside `VenuesGroup` in `packages/contracts/src/api.ts`, with search by name and by `lat`/`lng` and a read by id, returning only public venues (`group_id` null), never a group's home venue. `VenuesGroup` stays as it is: its search checks group membership when given a `groupId`, and group screens use it.
- **Other readers:** a `/t/:token` viewer, a joiner or a second device gets the venue by id from the public read.
- **Recording API:** refuses a table `venueId` that is a group's home venue (`apps/api/src/features/Recording.ts` checks nothing today).
- Recent venues and creating a venue stay behind sign-in.
- **Cache:** the recording store keeps each venue it uses (name, city, region, country, lat, lng) so Play, Stats and Map show it offline. `packages/client-runtime/src/recordingStorage.ts` and `recordingState.ts`.
- **Picker:** a Casino row on the edit sheet (on spec 003's interim sheet now, kept by spec 008) opens a search: nearby first when location is allowed, then by name. "Not listed" keeps the session without a venue.
- Our own catalog over Apple Maps or Google Places search: no API keys or per-search cost, results stay cacheable on the device, and the catalog already knows which places are casinos.

## Plan

- [x] Public venue search and read-by-id endpoints, with tests
- [x] Recording API refuses a home venue on a table
- [x] Venue cache in the recording store
- [x] Venue picker on web and mobile; set and change a session's venue offline

## Test

- [x] Signed out, search and read return public venues and never a group's home venue (API test)
- [x] Group venue search still checks membership
- [x] A venue set offline shows after relaunch and syncs later
