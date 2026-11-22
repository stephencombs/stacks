---
status: planned
created: 2026-11-22
priority: high
tags:
  - mobile
  - sheets
  - ux
parent: 029-ios-ui-polish
created_at: 2026-11-22T19:22:54.988591300Z
updated_at: 2026-11-22T20:50:19.375549500Z
---

# Prevent amount and form sheets from shifting size while typing

## Overview

In the Rebuy sheet (and other amount/form sheets), entering the first digit mounts a preview line (`"Your buy-in becomes $2,005"`) that was not rendered at `$0`. This shifts the amount, quick-amount chips, keypad, and submit button, and on iOS triggers a native `FormSheet` detent resize mid-entry.

## Root cause

- `KeypadAmount` (`apps/mobile/src/features/RecordingForms.tsx`, lines 139–146) conditionally mounts `amount.error` or `hint`, rendering `null` when both are absent. In `RebuySheet` (lines 837–865), `hint` is `undefined` until a positive amount is typed.
- Other sheets conditionally mount preview or validation elements inside content-sized sheets:
  - `BuyInTotalSheet` (`RecordingForms.tsx:1146-1162`): `preview` toggles between 1-line text and a 2-line error string.
  - `CashOutSheet` (`RecordingForms.tsx:1047-1110`): `—` lacks `type-title` line height matching `<Money className="type-title" />`; inline `amount.error` / `clock.error` mount dynamically.
  - `StartSheet`, `CorrectSheet`, `SitDownSheet` (`RecordingForms.tsx`): `KeypadAmount` error slot mounts only after invalid submit.
  - `PastSessionSheet` (`RecordingForms.tsx:735-750`): on Android, the `"Your result"` preview row mounts only once both buy-in and cash-out are filled.
- `Sheet.ios.tsx` (`NativeFormSheet`, lines 390–400, 466–475) recalculates `detents={[detent, 1]}` on every `onContentSizeChange` for non-`large` sheets, causing even small text/height changes to visibly jump the native sheet frame.

## Design & Requirements

- [ ] Update `KeypadAmount` (`apps/mobile/src/features/RecordingForms.tsx`):
  - Add a reserved feedback/hint slot (enabled by default whenever `reserveHint` or `hint` support is used, including `RebuySheet`, `BuyInTotalSheet`, `StartSheet`, `CorrectSheet`, and `SitDownSheet`) that ALWAYS renders a fixed minimum height (`min-h-5` single-line on iOS; `min-h-10` on Android `RebuySheet` where the two-line `was + added` breakdown appears).
  - When neither error nor hint is active, render an accessibility-hidden placeholder box of the exact same height (or non-shifting single-line helper copy) so `$0 -> $5 -> $500 -> $0` causes zero vertical shift of the figure, preset chips, keypad, or CTA.
- [ ] Audit and stabilize every sibling amount/form sheet in `apps/mobile/src/features/RecordingForms.tsx`:
  - **RebuySheet:** lock vertical rhythm across `$0`, typed amount, preset tap, and validation error.
  - **BuyInTotalSheet:** reserve consistent slot height across `Add`, `Subtract`, `Set total`, empty, valid, and invalid totals (keep invalid message concise so it fits the reserved slot without shifting).
  - **CashOutSheet:** give the empty `—` result placeholder `type-title` so its line box matches `<Money className="type-title" />`; reserve or contain inline validation without jumping the keypad.
  - **PastSessionSheet:** render the Android `"Your result"` preview row persistently with `—` when amounts are incomplete so filling `Total in` / `Total out` never pushes date/time fields downward.
  - **StartSheet / CorrectSheet / SitDownSheet / AddPlayerSheet:** ensure typing digits or toggling errors doesn't jump sheet height or shift the keypad under the user's thumb.
- [ ] Stabilize `apps/mobile/src/components/ui/Sheet.ios.tsx` detent updates:
  - Avoid shrinking or jittering an already-settled non-`large` sheet detent on minor `onContentSizeChange` deltas while typing in the same `slotKey`: once settled, ignore height decreases and small increases (< 24pt), only expanding when content meaningfully exceeds the latched detent, and reset the latched detent whenever `slotKey` changes or the sheet closes. _(Coordination note: 037 also modifies `Sheet.ios.tsx` around `PortaledSheet`/`SheetPortal` sync lag; keep detent logic isolated in `NativeFormSheet`.)_
- [ ] Add unit/component tests covering stable layout slots in `RebuySheet` / `KeypadAmount` and detent stability in `apps/mobile/src/components/ui/Sheet.ios.test.tsx`.

## Non-goals

- Redesigning the keypad itself (`AmountKeypad.tsx`).
- Changing full-height (`large`) sheets like the casino or trip pickers (covered in 033 and 034).

## Acceptance criteria

- [ ] On iOS and Android, typing, clearing, and tapping presets in `RebuySheet` produces zero vertical movement of the header, amount, preset pills, keypad, or `"Add rebuy"` button, and the sheet detent never jumps.
- [ ] `BuyInTotalSheet`, `CashOutSheet`, `StartSheet`, `PastSessionSheet`, `CorrectSheet`, and `SitDownSheet` stay visually steady as numbers are entered and deleted.
- [ ] `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm --filter @stacks/mobile test` pass.
