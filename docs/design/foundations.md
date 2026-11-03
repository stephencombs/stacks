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

## Type

Web has two faces: Barlow Condensed for the page title, the wordmark and a hero card's figure, and the system sans for everything else, other money included, with `tabular-nums` on any changing number. Mobile adds JetBrains Mono for amounts and board captions.

| Role            | Use it for                                          | Web  | Mobile |
| --------------- | --------------------------------------------------- | ---- | ------ |
| `type-title`    | The one title on a page (`PageHeader`, `PageTitle`) | 40px | 40px   |
| `type-headline` | The "Can't sign in yet" screen heading              | none | 36px   |
| `type-callout`  | Tabs; on mobile, small button labels and captions   | 15px | 15px   |
| `type-label`    | Mono caps on mobile: "Live", the high-limit toggle  | none | 11px   |
| `type-body`     | Field text, large button labels                     | none | 17px   |
| `type-footnote` | Field captions, hints, errors                       | none | 13px   |

Everything else is Tailwind's scale. Section headings are `text-lg font-semibold`, names and row titles `font-medium` at the inherited size, secondary text `text-sm`, and tags `text-xs font-medium`.

Amounts are `Money` with a weight or size beside it, such as `font-semibold` in a row. Never give `Money` a `type-*` role.

- Don't add `text-*` sizes, `leading-*` or `tracking-*` beside a `type-*` role, because they fight over the same properties. Color is fine, and mobile needs it: `type-title text-ink`.
- New roles are `@utility type-*` in both CSS files, not `--text-*` tokens. `cn` runs tailwind-merge, which reads an unknown `text-foo` as a color and drops it when `text-ink` sits beside it. A test fails if web defines a role mobile doesn't.
- Web inputs stay at 16px or larger, because iOS Safari zooms the page into anything smaller.
- `text-[10px]` appears only on the HOT badge in mobile `TripBoard`. 11px is the floor for new UI.
- Keep source strings in sentence case and let `type-*` or `uppercase` do the shouting.
- Reading text stops at `max-w-[65ch]`.

## Radius

| Class          | Use it for                                    |
| -------------- | --------------------------------------------- |
| `rounded-md`   | Tags, a selected segment                      |
| `rounded-lg`   | Web buttons and inputs, menu items, skeletons |
| `rounded-xl`   | Cards, menus, mobile fields                   |
| `rounded-2xl`  | Dialogs and sheets                            |
| `rounded-full` | Chips, status dots, mobile buttons            |

Nested radii subtract: inner radius is outer radius minus padding. `Menu` is `rounded-xl` with `p-1` around `rounded-lg` (12 − 4 = 8). Never copy the parent's radius onto a child.

## Elevation

Web only. Mobile surfaces are flat: a `surface` on a `canvas` is enough, as in iOS grouped lists.

| Token                          | Use it for                                |
| ------------------------------ | ----------------------------------------- |
| `shadow-(--elevation-control)` | An outlined control at rest               |
| `shadow-(--elevation-card)`    | `Surface`                                 |
| `shadow-(--elevation-popover)` | `Menu` and `LiveBar`: floats over content |
| `shadow-(--elevation-sheet)`   | `Dialog`                                  |

- Write the parentheses form. The tokens sit outside `@theme` so they can flip, and Tailwind inlines `--shadow-*` values, which would freeze them to one theme.
- Dark mode has a ring where light mode has depth, because a shadow doesn't show on a dark ground, plus a faint white top edge on cards and menus, the way light catches something raised. Dark overlays keep one black shadow.
- Depth on dark comes mostly from the gap between `canvas` and `surface`: a near-black page under clearly lighter cards. Keep that gap if you retune either.
- Use `border-line` or `divide-line` to separate rows, and a shadow to raise something. Inputs keep a visible edge.

## Motion

Motion says what just happened. If it doesn't, cut it. Web uses CSS transitions and keyframes, and mobile uses React Native's `Animated`. Don't add a library.

| What                                 | Enter | Exit  | Easing                    |
| ------------------------------------ | ----- | ----- | ------------------------- |
| Hover, press, color                  | 150ms | 150ms | default                   |
| Menu                                 | 150ms | 100ms | `ease-snap`               |
| Centered dialog                      | 200ms | 150ms | `ease-snap`               |
| Bottom sheet                         | 250ms | 200ms | `ease-snap`               |
| A result landing (`rack`)            | 320ms | none  | `ease-snap`, 90ms stagger |
| Board rows reordering (`useReorder`) | 450ms | none  | in-out                    |

- Animate only `transform`, `opacity`, colors, and `box-shadow` on a control's own hover or focus. Name the properties: `transition-[scale,opacity]`, never `transition-all`.
- Paired parts share timing: a dialog and its backdrop use the same duration and easing.
- Menus scale from their trigger with `origin-[var(--transform-origin)]`.
- `index.css` cuts all CSS motion under `prefers-reduced-motion`, and transitions stop while the theme switches. JavaScript-driven motion (`TableMap`, the board's `useReorder`) checks the preference itself.
- A change animates, a page load doesn't: a result already there when the page opens just sits there. One thing runs on its own, because it says the game is in play: the live dot.
