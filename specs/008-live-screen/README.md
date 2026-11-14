---
status: planned
created: 2026-11-14
priority: high
tags:
  - recording
  - web
  - mobile
depends_on:
  - "003"
  - "007"
  - "009"
parent: "001"
created_at: 2026-11-14T20:21:32.890857232Z
updated_at: 2026-11-14T20:21:32.890857232Z
---

# Live screen: felt and Finished

## Overview

Build the live session as designed on the canvas, for a player alone at a table: the felt screen, its sheets and the Finished screen. Spec 003's data layer stays; this replaces its interim screen. Deleting a session is spec 017; the shared table roster is spec 010.

## Design

- **Live `/play/:visitId`:** one continuous felt surface. Top row: back, a glass **LIVE 1:48:22** pill with the table's elapsed time, and the action slot. The big number is the amount bought in; under it game · casino and "Started 9:12 PM · 2 buy-ins". At the bottom, three equal rebuy buttons (+ $100, + $200, Other) above **Cash out**.
- **Action slot (top right):** nothing when there are no actions, one icon button when there is one (for example Edit), the ⋯ menu when there are several. The menu is a glass platter that grows from the button, icons on the left. Never label a role.
- **Rebuy:** a preset records at once and shows a toast with **Undo** above the rebuy row. Other opens a keypad sheet: amount, "Your buy-in becomes $450.00", **Add rebuy**.
- **Edit my session:** buy-in total, start time, game and casino (the Casino row comes from spec 009), and **Delete session** (spec 017).
- **Buy-in sheet:** Add, Subtract or Set total, the new total, "Was $300.00. Earlier buy-ins are voided and stay in history."
- **Cash out sheet:** cash-out amount on the keypad, finished time, your result; **Busted · $0** and **End session**.
- **Finished:** result, bought in, cashed out, duration, hourly; who was at the table; your entries with voided ones struck through; **Undo cash-out** and **Back at the table**.
- Motion and glass follow spec 007. Designs: the 003 · Live session page (`Live`, `LiveMenu`, `LiveEdit`, `BuyIn`, `Rebuy`, `CashOut`, `Finished`).

## Plan

- [ ] Live screen, rebuy toast and sheets on mobile
- [ ] Live screen, rebuy toast and sheets on web
- [ ] Finished screen on web and mobile

## Test

- [ ] Rebuy undo removes only that rebuy
- [ ] The `PLAN.md` phase 2 milestone still passes on the new screen, offline, web and mobile
