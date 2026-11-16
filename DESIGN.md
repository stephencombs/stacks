# Color Up design system

A ledger you read at a casino table. Light and dark follow the system, and the You sheet can pin either. Grouped cards sit on a quiet ground, ink marks the one thing to do next, felt green means a session is in play, and money is set in steady tabular figures. Floating controls are Liquid Glass on iOS and the web, and solid Material surfaces on Android; everything else is solid and still.

The source of truth is [`docs/design/tokens.json`](docs/design/tokens.json): every color in light and dark, the type styles, spacing, radius and shadows. Before building UI, read the file for what you're touching:

- [docs/design/foundations.md](docs/design/foundations.md): color, type, radius, elevation, glass, motion.
- [docs/design/components.md](docs/design/components.md): which part to use, and which variant.
- [docs/design/mobile-redesign.md](docs/design/mobile-redesign.md): native mobile controls, navigation and chart interaction.

To judge a web change, run `pnpm --filter @stacks/web dev` and open `/design.html`: the shared web parts and their states, glass over a busy backdrop, and every motion timing with a Replay button, under a theme menu. It needs no sign-in or database, and never ships. It says nothing about mobile, so check mobile changes on a device.

## Rules that apply everywhere

1. **Tokens only.** No hex, `rgb()`, `oklch()` or Tailwind palette colors (`text-red-500`) in components. The exceptions are the drawn casino art in `TableMap` and `Chip`, and the primary `Button`'s edge and hover. A raw color breaks in one of the two themes.
2. **A shared part owns its look.** Pass a `variant`, `size` or `tone`, and only layout classes (margin, width, flex). An unlisted variant is a bug, not an option. Add it to the part or don't use it.
3. **One `primary` per view.** It's the ink pill. Two means the screen has no next step.
4. **Money goes through `Money`.** Never format an amount by hand. The exceptions are `boardMoney`, the compact readout on boards, and `formatMoney` where a component can't go: aria labels, string `label` props and table art. Results use `tone="result"`, which adds the sign, so a result still reads correctly without color.
5. **A win or loss is a "Result".** Never "Profit", "P&L" or "Net" in what people read. A result is separate from a balance, which says who owes whom.
6. **Change both palettes together.** `apps/web/src/index.css` and `apps/mobile/global.css` hold the same colors, and `apps/web/src/design/tokens.test.ts` fails if either drifts from `tokens.json`, a color leaves sRGB, or a text color drops below 4.5:1 on the grounds it's used on.
7. **Glass floats; actions don't.** The tab bar, LiveBar, top controls, menus, sheets and the keypad are glass. Bottom actions, toasts, cards and content stay solid. Android has no glass: it draws the same parts as Material does.
8. **Motion comes from the motion tokens.** Named easings and durations, transform and opacity only, and nothing moves under reduced motion. See [Motion](docs/design/foundations.md#motion).
9. **Every state exists.** Hover, focus, pressed, disabled, pending, empty and error. Loading is a `Skeleton` or `<Loaded>`, an in-flight write is `pending`, and an empty list is an `EmptyState` that says what to do next.
10. **Touch targets are 44px.** Web controls grow under `pointer-coarse:`, and mobile controls set `min-h-11` (`44×44px` floor) or more. A control drawn smaller extends its hit area with `hitSlop`.

## Shared and native

The two clients share meaning, and each keeps its own platform's controls. Don't "fix" a difference in the second column.

| Shared: must match                                    | Native: meant to differ                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Palette, and what each color means                    | Button shape: `rounded-lg` on web, pills on mobile                                                       |
| Motion easings, durations and the press scale         | Page titles: condensed uppercase on web, sentence-case system sans on mobile                             |
| Which parts float, and which stay solid               | Floating material: the native iOS 26 glass, a blurred translucent fill on web, solid Material on Android |
| Type role names, where both clients define one        | Navigation chrome: sidebar and bottom bar on web; native tabs on iOS, Android's navigation bar           |
| Variant names on `Button`, tones on `Tag` and `Money` | Sheets and menus: drawn on web; system sheets and menus on mobile, with the system's own motion          |
| Copy, including how a balance is worded               | Press feedback: the shared scale on both, plus haptics on mobile                                         |
| The `pending` and `disabled` props on `Button`        | Pending: web holds the width with a spinner alone, mobile shows the spinner beside the label             |
