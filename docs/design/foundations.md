# Foundations

## Color

Components name these tokens as Tailwind colors (`bg-surface`, `text-muted`). Values flip with the theme, so never write `dark:` or `light:` overrides.

```
What is this background?
 ├── The page → bg-canvas
 ├── A card, sheet or menu → bg-surface
 ├── A well inside a card, a tag, or a hover on a card → bg-sunken
 ├── A mobile control's resting fill → bg-fill
 └── The selected segment in Segmented or Choice → bg-raised
```

`fill` has no use on web today. `raised` is the selected segment on both clients.

```
What color is this text?
 ├── Primary content → text-ink
 ├── Supporting content → text-muted
 ├── Gold text or an icon on a ground → text-accent-text
 ├── Text on a gold fill → text-accent-ink
 ├── A player's result or balance → text-win / text-loss (through Money)
 ├── Something destructive or a failure → text-danger
 ├── A session in play → text-live
 └── A placeholder dash, a list-row chevron, or an empty amount at 24px or larger → text-faint
```

- `accent` is a fill. `accent-text` is for text and icons. They differ in light mode, where `accent` as text fails contrast.
- `faint` is below 4.5:1 on purpose. Never use it for text someone must read. Placeholders use `muted`.
- `win` means up. Never use it for "success" or "saved". A saved state needs no color.
- `live` is gold and matches `accent-text` today, because red already means someone is down. `loss` and `danger` share a red but mean different things. Pick by meaning, so they can separate later.
- Tints use Tailwind's opacity modifier: `bg-accent/15`, `bg-live/15`. Disabled text is `text-muted`, filled buttons use `bg-disabled`, outlined and ghost buttons stay transparent, and inputs use `bg-sunken`. Never an opacity.
- `--color-chip-*` belong to a player. Read them through `chipOf`, and never use them for anything else.

## Brand

The product is Color Up. Its mark is a chip rack seen from above: an `ink` frame around four columns in `chip-2`, `chip-1`, `chip-3` and gold, the gold one tallest. It's `BrandMark` on both clients, beside the uppercase Barlow wordmark at the top of the sidebar and on the sign-in screen. The mark's colors come from the tokens, so it follows the theme; the app icon, favicon and touch icon are fixed renders of the dark version.

## Type

Web has two faces: Barlow Condensed for the page title, the wordmark and a hero card's figure, and the system sans for everything else, other money included, with `tabular-nums` on any changing number. Mobile uses tight-tracked **sentence case** system sans for screen titles (`type-title`), card headings (`type-heading`) and section labels (`type-section`), reserving large tabular display/mono figures (`type-hero`, `type-number`) for numeric readouts inside cards.

| Role            | Use it for                                                        | Web  | Mobile                     |
| --------------- | ----------------------------------------------------------------- | ---- | -------------------------- |
| `type-hero`     | Primary figure inside a hero card (`$196.13*`, `+$1,420`, `87%`)  | none | 36px–40px (`tabular-nums`) |
| `type-title`    | The one title on a page (`PageHeader`, `TopBar` / `PageTitle`)    | 40px | 28px (sentence case, bold) |
| `type-headline` | The "Can't sign in yet" or onboarding screen heading              | none | 32px (sentence case, bold) |
| `type-heading`  | Card title (`Cursor Models`, session row title)                   | none | 17px (sentence case, 600)  |
| `type-body`     | Field text (`>=16px` floor), large button and settings row labels | none | 17px                       |
| `type-callout`  | On mobile, segmented tabs, pill labels and captions               | 15px | 15px                       |
| `type-section`  | Grouped list header (`Connections`, `Providers`, `Unsent`)        | none | 13px (sentence case, 500)  |
| `type-footnote` | Field captions, secondary row metadata (`64.9% of cost`), errors  | none | 13px                       |
| `type-label`    | Compact status or card kicker (`Raw token cost`, `BETA`)          | none | 12px (sentence case, 500)  |

Everything else is Tailwind's scale. Section headings are `text-lg font-semibold` on web and `type-section text-muted` on mobile, names and row titles `font-medium` (`font-semibold` for primary feed rows on mobile) at the inherited size, secondary text `text-sm`, and tags `text-xs font-medium`.

Amounts are `Money` with a weight or size beside it, such as `font-semibold` in a row. Never give `Money` a `type-*` role.

- Don't add `text-*` sizes, `leading-*` or `tracking-*` beside a `type-*` role, because they fight over the same properties. Color is fine, and mobile needs it: `type-title text-ink`.
- New roles are `@utility type-*` in both CSS files, not `--text-*` tokens. `cn` runs tailwind-merge, which reads an unknown `text-foo` as a color and drops it when `text-ink` sits beside it. A test fails if web defines a role mobile doesn't.
- Inputs stay at 16px or larger (`type-body` on mobile), because iOS zooms or clips smaller input text.
- `text-[10px]` appears only on compact static tags (`BETA`, `HOT`). 11px is the floor for general UI.
- Keep source strings in **sentence case**. On mobile, titles (`Usage`, `Settings`), section headers (`Unsent`, `Snoozed`, `Settled (16)`), and card kickers (`Raw token cost`, `Processed tokens`) stay in sentence case with tight **tracking** (`-0.025em` on titles) rather than uppercase shouting.
- Reading text stops at `max-w-[65ch]`.

## Radius

| Class          | Use it for                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `rounded-md`   | Static tags (`BETA`), web selected segment, quota progress bars (`24px` h)                                                             |
| `rounded-lg`   | Web buttons and inputs, menu items, skeletons, mobile row avatar `Chip`                                                                |
| `rounded-xl`   | Web cards and menus, mobile sunken wells inside a `rounded-2xl` `Surface`                                                              |
| `rounded-2xl`  | Mobile `Surface` cards (`20px`), grouped settings lists, hero cards, web dialogs                                                       |
| `rounded-3xl`  | Mobile bottom sheets (`rounded-t-3xl`)                                                                                                 |
| `rounded-full` | Floating capsule tab bar, active tab thumb, pill segmented controls (`Choice`), circular top-bar `IconButton` (`44×44px`), status dots |

Nested radii are concentric (`innerRadius = outerRadius - padding`): `Menu` is `rounded-xl` with `p-1` around `rounded-lg` (12 − 4 = 8); the mobile floating tab bar and `Choice` segmented control are `rounded-full` tracks with `p-1` / `p-1.5` around a `rounded-full` active thumb. Never copy a non-pill parent's radius onto a child without subtracting padding.

## Elevation

On mobile, hierarchy comes from a **tinted neutral** `bg-canvas` (`oklch` lightness separation with low **chroma**) under pure `bg-surface` `rounded-2xl` cards and `0.5px` (`StyleSheet.hairlineWidth`) **alpha** dividers (`border-line`), with no decorative radial `Glow` blobs behind hero cards. Floating chrome (the capsule bottom bar, `LiveBar`, and top-bar `IconButton` circles) pairs `bg-surface` with a `1px` `border-line` edge and a whisper-quiet ambient shadow.

| Token                          | Use it for                                |
| ------------------------------ | ----------------------------------------- |
| `shadow-(--elevation-control)` | An outlined control at rest               |
| `shadow-(--elevation-card)`    | `Surface`                                 |
| `shadow-(--elevation-popover)` | `Menu` and `LiveBar`: floats over content |
| `shadow-(--elevation-sheet)`   | `Dialog`                                  |

- Write the parentheses form. The tokens sit outside `@theme` so they can flip, and Tailwind inlines `--shadow-*` values, which would freeze them to one theme.
- Dark mode has a ring where light mode has depth, because a shadow doesn't show on a dark ground, plus a faint white top edge on cards and menus, the way light catches something raised. Dark overlays keep one black shadow.
- Depth on dark comes mostly from the gap between `canvas` and `surface`: a near-black page under clearly lighter cards. Keep that gap if you retune either.
- Use `border-line` or `divide-line` (`0.5px` hairline on mobile retina) to separate rows, and surface contrast to raise a card. Inputs keep a visible edge.

## Layers

Web stacks fixed parts on four steps of Tailwind's scale. Anything else in a page stays at `z-auto`, or uses `isolate` for its own stacking.

| Class  | Use it for                                          |
| ------ | --------------------------------------------------- |
| `z-10` | `LiveBar`, floating over content                    |
| `z-20` | The bottom bar and the sidebar                      |
| `z-30` | The skip link, above the bars once focused          |
| `z-40` | `Dialog` and `Menu`, over everything, bars included |

## Motion

Motion says what just happened. If it doesn't, cut it. Web uses CSS transitions and keyframes, and mobile uses React Native's `Animated`. Don't add a library.

| What                                 | Enter | Exit  | Easing                    |
| ------------------------------------ | ----- | ----- | ------------------------- |
| Hover, press (`scale(0.97)`), color  | 120ms | 150ms | **ease-out**              |
| Menu                                 | 150ms | 100ms | `ease-snap`               |
| Centered dialog                      | 200ms | 150ms | `ease-snap`               |
| Bottom sheet                         | 250ms | 200ms | `ease-snap`               |
| A result landing (`rack`)            | 320ms | none  | `ease-snap`, 90ms stagger |
| Board rows reordering (`useReorder`) | 450ms | none  | in-out                    |

- Animate only `transform`, `opacity`, colors, and `box-shadow` on a control's own hover or focus. Name the properties: `transition-[scale,opacity]`, never `transition-all`.
- On mobile, every interactive surface (`Button`, `IconButton`, floating tab items, pressable `Card` and `Row`) gives immediate tactile press feedback (`scale(0.97)` on `onPressIn` with **ease-out**, springing back on release) paired with selection/impact haptics where appropriate.
- Signal active selection on tabs and segmented controls with surface (`bg-surface` / `bg-fill`) and color (`text-ink` / `text-felt`) plus **filled vs. outlined** icon swaps—never by changing font weight alone in a way that reflows layout.
- Paired parts share timing: a dialog and its backdrop use the same duration and easing.
- Menus scale from their trigger with `origin-[var(--transform-origin)]`.
- `index.css` cuts all CSS motion under `prefers-reduced-motion`, and transitions stop while the theme switches. JavaScript-driven motion (`TableMap`, the board's `useReorder`) checks the preference itself.
- A change animates, a page load doesn't: a result already there when the page opens just sits there. One thing runs on its own, because it says the game is in play: the live dot.
