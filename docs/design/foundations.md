# Foundations

## Color

Components name colors as Tailwind colors (`bg-surface`, `text-muted`). Values flip with the theme, so never write `dark:` or `light:` overrides. The code kept Tailwind's names where they mean the same as a token: `canvas` is the tokens' `ground`, `surface` is `card`, `raised` is `card-raised`, `line` is `hairline`, and `live` is `live-text`. Each token's `usage` in `tokens.json` says where it goes; the trees below are the common calls.

```
What is this background?
 ├── The page → bg-canvas
 ├── A card or grouped list → bg-surface
 ├── A card on a card: a field in a sheet, a selected row → bg-raised
 ├── A quiet control at rest: a chip, a segmented track, a keypad key → bg-fill
 ├── The selected segment, or a pressed quiet control → bg-fill-strong
 ├── The primary pill → bg-ink
 ├── A live session's screen → bg-felt, with bg-felt-deep for its lower band
 ├── Something floating over content → glass (see Glass)
 └── Behind a sheet → bg-scrim
```

```
What color is this text?
 ├── Primary content → text-ink
 ├── Supporting content: a meta line, a section title, a label → text-muted
 ├── Text on the primary pill → text-ink-inverse
 ├── A result or balance → text-win / text-loss (through Money)
 ├── Something destructive or a failure → text-loss
 ├── "Live" or a running time on a card or the page → text-live
 ├── The amount, clock and labels on felt → text-felt-ink, and text-felt-soft for large secondary text
 ├── A result on felt → text-felt-win / text-felt-loss (through Money felt)
 └── A placeholder dash, a chevron, a disabled label → text-faint
```

- `ink` is the one next step: the primary pill is an ink fill with `ink-inverse` text. There is no brand accent color.
- `felt` is a fill. Text about a live session on a card uses `live`, which passes 4.5:1 where felt doesn't.
- `faint` is below 4.5:1 on purpose. Never use it for text someone must read.
- `win` means up. Never use it for "success" or "saved"; a saved state needs no color. A result chip sits on `win-tint` or `loss-tint`.
- `loss` is also the destructive color. Show a loss with a minus sign, never by color alone.
- `chip-red` through `chip-grey` are the game colors (and denominations): craps, poker, roulette, blackjack, baccarat, slots, other. `chip-green` is roulette, never a result. `tint-*` are grounds for soft pills paired with their chip color.
- `--color-chip-1` to `-8` belong to a player, the same in both themes. Read them through `chipOf`, and never use them for anything else.
- Disabled text is `text-muted`, filled buttons use `bg-fill`, outlined and ghost buttons stay transparent. Never an opacity.

## Brand

Onboarding and the iOS Play header use `BrandWordmark`, the refreshed four-color Color Up artwork from Figma. Its wordmark ink adapts in dark mode, and `felt` sets it in felt ink for a share card. Android Play uses the felt chip mark next to the app name.

## Type

`tokens.json` names the type styles. Mobile uses Allo for app text, with tabular figures for money. Native controls use their platform typography where the platform owns the text.

| Style         | Use it for                                                                         |
| ------------- | ---------------------------------------------------------------------------------- |
| `live-amount` | The live screen's big number on felt: what you've bought in for. 88px, bold        |
| `money-hero`  | The one figure a screen is about: the month's result, a final result. 44px         |
| `money-lg`    | A stat card's figure. 28px                                                         |
| `money-row`   | The amount at the end of a session or player row. 17px, semibold                   |
| `title-large` | A pushed page's large title, left-aligned. 34px. **Tab roots have no large title** |
| `title`       | A card's heading, a profile name, a sheet with a big subject. 22px                 |
| `headline`    | Row titles, sheet titles, navigation titles. 17px, semibold                        |
| `body`        | Running text and field values. 17px                                                |
| `callout`     | Feed lines, notes under a field, menu items. 15px                                  |
| `footnote`    | A row's meta line, times, helper text. 13px                                        |
| `label`       | Uppercase stat labels over a figure: RESULT, HOURS, SESSIONS, BUY-IN. 11px         |

The clock on a live session stays small, in the LIVE pill; the big number is the amount.

In code, a style is a `type-*` utility in the mobile CSS file, at the token's size, weight and tracking. Mobile's names: `type-hero` is `money-hero`, `type-number-lg` `money-lg`, `type-number` `money-row`, `type-headline` `title-large`, `type-title` `title`, `type-heading` `headline`, and `type-body`, `type-callout`, `type-footnote` and `type-label` keep the token's name. `type-section` is a list's title, 13px medium. The live amount is drawn on the live screen itself.

- Amounts are `Money` with a weight or size beside it. Never give `Money` a text color; its `tone` picks one.
- Don't add `text-*` sizes, `leading-*` or `tracking-*` beside a `type-*` role, because they fight over the same properties. Color is fine, and mobile needs it: `type-title text-ink`.
- New roles are `@utility type-*` in both CSS files, not `--text-*` tokens. `cn` runs tailwind-merge, which reads an unknown `text-foo` as a color and drops it when `text-ink` sits beside it.
- `tabular-nums` on any number that changes.
- Inputs stay at 16px or larger, because iOS zooms or clips smaller input text.
- Keep strings in sentence case. Only `label` is uppercase, and only over a figure.
- Reading text stops at `max-w-[65ch]`.

## Radius

| Token         | Value | Use it for                                                |
| ------------- | ----- | --------------------------------------------------------- |
| `radius-sm`   | 10px  | Inputs, date and time pills, keypad keys                  |
| `radius-md`   | 14px  | Small cards inside a sheet, avatar squares                |
| `radius-lg`   | 22px  | Cards and grouped lists on the page                       |
| `radius-xl`   | 32px  | A sheet's top corners and the floating tab bar            |
| `radius-pill` | 999px | Mobile buttons, chips, segmented controls and the LiveBar |

Nested radii are concentric: inner radius is the outer radius minus the padding. `Menu` is `rounded-xl` with `p-1` around `rounded-lg` items (12 − 4 = 8). Never copy a non-pill parent's radius onto a child.

## Elevation

Depth comes from fills more than shadows: solid `surface` cards on a `canvas` ground, with `line` hairlines between rows and no border on the card itself. In dark, the ground is black and cards are clearly lighter; keep that gap if you retune either.

| Token                          | Use it for                                          |
| ------------------------------ | --------------------------------------------------- |
| `shadow-(--elevation-control)` | An outlined control at rest                         |
| `shadow-(--elevation-card)`    | `Surface`: barely there in light, none in dark      |
| `shadow-(--elevation-float)`   | Something solid floating over content, like a toast |
| `shadow-(--elevation-sheet)`   | A sheet rising from the bottom edge                 |

Write the parentheses form. The tokens sit outside `@theme` so they can flip, and Tailwind inlines `--shadow-*` values, which would freeze them to one theme. Glass surfaces carry their own shadow; don't add one beside them.

## Glass

Liquid Glass is for controls that float over content, so what's behind them still shows through.

```
Is this glass?
 ├── The tab bar, the LiveBar → yes
 ├── A top control floating over the page, like the You button → yes
 ├── A menu or popover → yes
 ├── A sheet, and the keypad it joins → yes, edge to edge and rounded on top only
 ├── A bottom action, a dock, an ActionBar → no, solid
 ├── A toast → no, solid with the float shadow
 └── A card, a row, anything in the page's flow → no
```

- On mobile, glass is `GlassSurface`. iOS 26 draws the native material, and its `interactive` prop lets glass that is itself a control answer a touch. Earlier iOS draws the `glass` token as a translucent fill with an edge and a shadow. With Reduce Transparency on, iOS draws a solid card.
- Android has no glass, so it doesn't imitate it: `GlassSurface` is a solid `raised` surface, a step above the cards, with a shadow, and round icon controls are filled tonal circles, as in Material.
- Give `GlassSurface` its rounding both as a class and as `radius`, which is what the native material uses.
- Don't fade a native glass surface: iOS stops drawing glass at low opacity. Move it with transform instead.
- Mobile sheets and menus are the system's own, which bring their own material.

## Layers

Web stacks fixed parts on four steps of Tailwind's scale. Anything else in a page stays at `z-auto`, or uses `isolate` for its own stacking.

| Class  | Use it for                                          |
| ------ | --------------------------------------------------- |
| `z-10` | `LiveBar`, floating over content                    |
| `z-20` | The bottom bar and the sidebar                      |
| `z-30` | The skip link, above the bars once focused          |
| `z-40` | `Dialog` and `Menu`, over everything, bars included |

## Motion

Motion says what just happened. If it doesn't, cut it. The values live in `@stacks/client-runtime/motion`; the app animates with them through React Native's `Animated`. Don't add an animation library.

| What        | Enter | Exit  | Easing                                                    |
| ----------- | ----- | ----- | --------------------------------------------------------- |
| Menu        | 200ms | 150ms | in on `ease-enter`, out on `ease-exit`                    |
| Sheet       | 340ms | 240ms | in on `ease-enter`, out on `ease-exit`; its scrim matches |
| Toast       | 250ms | 160ms | in on `ease-enter`, out on `ease-exit`                    |
| Number roll | 220ms | none  | `ease-enter`                                              |
| Press       | 100ms | 150ms | scale to 0.96 on `ease-press`, back on `ease-enter`       |

- `ease-enter` is `cubic-bezier(0.32, 0.72, 0, 1)`: a fast start that reads as an instant answer. `ease-exit` accelerates away. An exit is always faster than its enter.
- animate with `animate()` and press with `PressableScale`; `Button` and `IconButton` already do.
- Animate only `transform` and `opacity`, plus colors and shadow on a control's own hover. Name the properties: `transition-[scale,opacity]`, never `transition-all`.
- Menus scale from their trigger with `origin-[var(--transform-origin)]`, from 0.95, never from 0.
- Paired parts share timing: a sheet and its scrim, a dialog and its backdrop.
- A centered dialog on a wide screen uses the menu's timings; on a phone the same dialog is a sheet and uses the sheet's.
- **One reduced-motion switch.** every animation goes through `animate()`, which jumps to the end while Reduce Motion is on, and `useReducedMotion()` covers motion that isn't one animation, like a pager.
- A change animates, a page load doesn't: a result already there when the page opens just sits there. One thing runs on its own, because it says the game is in play: the live dot.
