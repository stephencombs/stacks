# Color Up design system

A ledger you read at a casino table. Light and dark follow the system, and the You sheet can pin either. Grouped cards sit on a quiet ground, ink marks the one thing to do next, felt green means a session is in play, and money is set in steady tabular figures. Floating controls are Liquid Glass on iOS, and solid Material surfaces on Android; everything else is solid and still.

The source of truth is [`docs/design/tokens.json`](docs/design/tokens.json): every color in light and dark, the type styles, spacing, radius and shadows. Before building UI, read the file for what you're touching:

- [docs/design/foundations.md](docs/design/foundations.md): color, type, radius, elevation, glass, motion.
- [docs/design/components.md](docs/design/components.md): which part to use, and which variant.
- [docs/design/mobile-redesign.md](docs/design/mobile-redesign.md): native mobile controls, navigation and chart interaction.

## Rules that apply everywhere

1. **Tokens only.** No hex, `rgb()`, `oklch()` or Tailwind palette colors (`text-red-500`) in components. The exceptions are the drawn casino art in `BlackjackTableArc`, and the primary `Button`'s edge and hover. A raw color breaks in one of the two themes.
2. **A shared part owns its look.** Pass a `variant`, `size` or `tone`, and only layout classes (margin, width, flex). An unlisted variant is a bug, not an option. Add it to the part or don't use it.
3. **One `primary` per view.** It's the ink pill. Two means the screen has no next step.
4. **Money goes through `Money`.** Never format an amount by hand. The exceptions are `boardMoney`, the compact readout on boards, and `formatMoney` where a component can't go: aria labels, string `label` props and table art. Results use `tone="result"`, which adds the sign, so a result still reads correctly without color.
5. **A win or loss is a "Result".** Never "Profit", "P&L" or "Net" in what people read. A result is separate from a balance, which says who owes whom.
6. **Use the native palette.** `apps/mobile/global.css` follows the design tokens. Mobile tests check gamut and text contrast.
7. **Glass floats; actions don't.** The tab bar, LiveBar, top controls, menus, sheets and the keypad are glass. Bottom actions, toasts, cards and content stay solid. Android has no glass: it draws the same parts as Material does.
8. **Motion comes from the motion tokens.** Named easings and durations, transform and opacity only, and nothing moves under reduced motion. See [Motion](docs/design/foundations.md#motion).
9. **Every state exists.** Hover, focus, pressed, disabled, pending, empty and error. Loading is a `Skeleton` or `<Loaded>`, an in-flight write is `pending`, and an empty list is an `EmptyState` that says what to do next.
10. **Touch targets are 44px.** Controls set `min-h-11` or more. A smaller icon extends its hit area with `hitSlop`.

Use the same tokens, labels and destinations on iOS and Android. Each platform keeps its own native tabs, pickers, sheets and menus.
