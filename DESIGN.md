# Stacks design system

A ledger you read at a casino table, often at night. Dark by default with a crisp daylight counterpart, gold (`accent`) for the one thing to do next and what's in play, tight-tracked sentence-case titles on mobile (`40px` condensed display on web), and steady `tabular-nums` figures for money. Tinted neutral canvases (`bg-canvas`) elevate clean, glow-free `bg-surface` cards (`rounded-2xl` on mobile, `rounded-xl` on web). Everything else recedes.

Before building UI, read the file for what you're touching:

- [docs/design/foundations.md](docs/design/foundations.md): color, type, radius, elevation, motion.
- [docs/design/components.md](docs/design/components.md): which part to use, and which variant.
- [docs/design/mobile-redesign.md](docs/design/mobile-redesign.md): T3 Code-inspired mobile redesign architecture and implementation phases.

To judge a change, run `pnpm --filter @stacks/web dev` and open `/design.html`: the shared web parts and their states, with a theme menu. It needs no sign-in or database, and never ships. It says nothing about mobile, so check mobile changes on a device.

## Rules that apply everywhere

1. **Tokens only.** No hex, `rgb()`, `oklch()` or Tailwind palette colors (`text-red-500`) in components. The exceptions are the drawn casino art in `TableMap` and `Chip`, `bg-black/60` under a dialog, and the primary `Button`'s edge and hover. A raw color breaks in one of the two themes.
2. **A shared part owns its look.** Pass a `variant`, `size` or `tone`, and only layout classes (margin, width, flex). An unlisted variant is a bug, not an option. Add it to the part or don't use it.
3. **One `primary` per view.** Two means the screen has no next step.
4. **Money goes through `Money`.** Never format an amount by hand. The exceptions are `boardMoney`, the compact readout on boards, and `formatMoney` where a component can't go: aria labels, string `label` props and table art. Results use `tone="result"`, which adds the sign, so a result still reads correctly without color.
5. **Change both palettes together.** `apps/web/src/index.css` and `apps/mobile/global.css` hold the same colors, and `apps/web/src/design/tokens.test.ts` fails if they drift, a color leaves sRGB, or a tested pair drops below 4.5:1: each text color on `canvas`, `surface`, `sunken` and `fill`, `accent-ink` on `accent`, and the `live` and `accent` tints. Disabled text is exempt, as in WCAG.
6. **Every state exists.** Hover, focus, pressed, disabled, pending, empty and error. Loading is a `Skeleton` or `<Loaded>`, an in-flight write is `pending`, and an empty list is an `EmptyState` that says what to do next.
7. **Touch targets are 44px.** Web controls grow under `pointer-coarse:`, and mobile controls set `min-h-11` (`44×44px` floor) or more. A control drawn smaller, like the mobile high-limit toggle, extends its hit area with `hitSlop`.

## Shared and native

The two clients share meaning, and each keeps its own platform's controls. Don't "fix" a difference in the second column.

| Shared: must match                                    | Native: meant to differ                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Palette, and what each color means                    | Button & pill shape: `rounded-lg` on web, `rounded-full` on mobile (`IconButton` is a `44×44px` circular surface button)       |
| Type role names, where both clients define one        | Page titles & headings: condensed uppercase on web, tight-tracked **sentence case** system sans on mobile                      |
| Variant names on `Button`, tones on `Tag` and `Money` | Cards & heroes: `rounded-xl` on web, glow-free `rounded-2xl` (`20px`) on mobile with concentric inner radii                    |
| Copy, including how a balance is worded               | Navigation chrome: sidebar/bottom bar on web, floating capsule bottom bar (`rounded-full`) + horizontal filter pills on mobile |
| The `pending` and `disabled` props on `Button`        | Press feedback: scale on web, tactile `scale(0.97)` + opacity and haptics on mobile                                            |
|                                                       | `type-body`, `type-section` and `type-footnote` exist on mobile for iOS hierarchy; a Sheet title is `type-body`                |
|                                                       | Pending: web holds the width with a spinner alone, mobile shows the spinner beside the label                                   |
