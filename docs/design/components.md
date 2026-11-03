# Components

Parts live in `apps/web/src/components/ui` and `apps/mobile/src/components/ui`; `Money` sits one level up and `Chip` in `features`. Check here before writing a `<button>`, `<Pressable>` or a styled `<div>`.

## Button

Use for an action. Going to another page on web is a `ButtonLink`, which takes the same variants. A row of tabs is `Tabs`.

Variants: `primary`, `tint`, `secondary`, `ghost`, `danger`. Sizes: `sm`, `md`, `lg`, plus `xl` on mobile. Nothing else exists.

```
Is it the single next step on this screen?
 ├── Yes → variant="primary", one per view
 └── No
      ├── Destructive or hard to undo? → variant="danger"
      ├── A gold-led action sitting beside a primary elsewhere on screen? → variant="tint"
      ├── In a toolbar or section header, repeated down a page? → variant="ghost"
      └── Default → secondary, which is what you get with no variant prop
```

While a request is in flight, pass `pending`. It shows a spinner and blocks presses. On web it also holds the button's width. Use `disabled` only for an action that isn't available yet. When one request blocks two buttons, only the one the user pressed is `pending`, and the other is `disabled`. The seat dialog is the one exception: its long list of equal choices only disables while a seat saves.

```tsx
// Correct
<Button type="submit" variant="primary" pending={create.pending}>Start session</Button>

// Incorrect: reads as unavailable, not as working, and the swapped label moves the layout
<Button type="submit" variant="primary" disabled={create.pending}>
  {create.pending ? "Starting…" : "Start session"}
</Button>
```

Labels name the outcome: "Void entry", not "Confirm".

## Segmented (web), Choice (mobile)

Pick one of a few options, all in sight. Web `Segmented` lives in its own file, `Segmented.tsx`.

```
How many options?
 ├── Up to 4 → web Segmented; mobile Choice, which draws a segmented control
 └── 5 or more → web Select; mobile Choice, which draws a checked list
```

```tsx
// Correct
<Segmented label="Show" options={views} value={view} onChange={setView} />

// Incorrect: a hand-built toggle row repeats the look and drifts from the others
<div role="group">{views.map((v) => <button aria-pressed={v.key === view}>…</button>)}</div>
```

A form value from a few short options, where the choice deserves weight, is `RadioCards` on web: `kind` of an entry or venue, the game of a session. Set columns with `className`.

Switching between pages is `Tabs` on web and `TripTabs` on mobile, not `Segmented`. The same data shown another way on one page is `Segmented`.

## Field, Input, Select (web), TextField (mobile)

Every input has a visible label. A placeholder is an example, not a label.

```tsx
// Correct: Field wires the label, hint and error to the input
<Field label="Amount" error={error}>{(props) => <Input {...props} inputMode="decimal" />}</Field>

// Incorrect: nothing connects this label, and the error is color alone
<label>Amount</label>
<Input className="border-red-500" />
```

A yes-or-no option on web is `Checkbox`, wrapped in a `<label>` with its text: the label gives it a name and a bigger target.

An error beside one field goes in `error`. A failure of the whole form, such as the API refusing it, is `FormError`.

## Surface, List and Row

`Surface` is a card. A list of rows is `List` with a `Row` for each, on both clients: `List` draws the card and the dividers, and `Row` the padding. On web, a row that goes somewhere is `RowLink`, which adds the pressed state and a chevron, and a row's main text is `RowText`: a `title`, a quieter `meta` line, and `struck` for something voided. On mobile, a pressable `Row` takes `onPress`.

A row runs chip, then the text in a `min-w-0 flex-1` column, then the amount at the end. A player's name in a row is plain `font-medium` text, not display type.

Don't put a `Surface` inside a `Surface`. Use `bg-sunken` for a well.

## Hero cards: TripHero, BalanceHero, RaceHero

A tab can open on one hero card: the figure that tab exists to show, big enough to read across a table. Sessions opens on `TripHero` (your trip total, your running line, win rate, best session, board place), Settle up on `BalanceHero` (your balance), and Results on `RaceHero` (your gap to the player just ahead, or just behind when you lead, with everyone's running totals and yours in gold). The group's Stats page opens on the same `TripHero` across every trip ("All time with …"). A live session has `SeatHero` under its table map and `TableStats` tiles: your seat's buy-in, or how you finished, with Rebuy and Cash out one tap away. When you're seated at a live session, the Sessions tab shows `LiveSessionCard` under the hero, with "Back to the table" as the screen's primary action.

One hero per screen, at the top of what it's about. Don't add a hero to a page that has no single figure. A venue name inside a card can take `font-display uppercase` like a page title; nothing else borrows display type.

A hero is a `Surface` on web and a `rounded-xl bg-surface` view on mobile, inset `p-4` like the rows around it, with `Glow` first inside it in the tone of the figure: `win` up or ahead, `loss` down or behind, `accent` level or tied. A sentence-case `text-sm font-medium text-muted` label sits over the figure, which is `Money` in `font-display text-6xl` (`text-5xl` below `sm` on web), then one `text-sm text-muted` comparison. Color stays on the figure and the chart: labels and tiles are `muted` and `ink`, never gold. Its words come from `@stacks/client-runtime/trip` (`tripLines`, `balanceHeadline`, `raceHeadline`) so both clients say the same thing.

## Charts

Every chart that compares players draws the same way: lines start at break-even, a dashed `line-strong` rule; the line you're following is `accent`, 3px with a halo on its current point; everyone else is `muted` at 45%; each line ends on a dot and the player's initial, spread apart with `spreadLabels` so none overlap. No chip colors on lines: the chip next to a name is identity, the gold line is focus. Scales come from `@stacks/client-runtime/chart` and draw per platform, SVG on web and `react-native-svg` on mobile.

Players at very different stakes would flatten each other, so:

- **A race fits the people near you.** Pass `lineScale` a `focus` from `around(index, count)`. A line far outside that range pins to the edge, and its initial gets an arrow (`J ↓`) from `clipped`.
- **A race can compare stakes fairly.** The Stats race has a Money / % of buy-in switch; `raceLines` gives either measure from `@stacks/shared/stats`, and `returnLabel` words a return.
- **Bars beside their amount compress.** `barTrack(values, { compress: true, minimum: 0.06 })` draws lengths by square root with a floor, so $60 shows next to $18,500. Only do this where the exact amount is printed beside the bar.

## Wide screens: TripLayout, TripRail (web)

From `lg` up, a trip's pages widen to 1200px and take a 340px rail on the right through `TripLayout`. `TripRail` holds the rest of the trip you'd otherwise tab to: your live table, the board, and your balance with Settle up, leaving out whichever one the current tab already shows. Below `lg` the rail drops away and the page is the phone layout, so anything moved into the rail stays in the page there (`lg:hidden`). Past sessions read as `SessionTable` on a wide screen, a row per session that links as one.

Chosen over three other directions for the desktop trip page: one wide reading column (leaves most of a laptop empty), a sessions-by-players ledger table (no charts, scrolls sideways past six players) and a sidebar app shell (every screen would need rebuilding around it). Other pages keep the 672px reading column until they have their own wide layout.

## PageHeader, Section, Note (web); PageTitle, SectionHeading (mobile)

One page title per page. On web that's `PageHeader`, which also takes the `back` link, an `options` menu, a `tag`, an `action` and `tabs`, and sets the browser tab's title. `context` is the line saying where the page sits, or what it covers: "Poker · Sat 12 Oct". A trip's table, board and money tabs sit under `TripHeader`, not their own page title.

Each group of content is a `Section` on web (`title`, plus an `action` or a quiet `aside`) and a `SectionHeading` on mobile. A section's action is a `ghost` or `sm` button or a `Segmented`. Supporting text on web is `Note`.

## Tag

A short state something is in: "Live", "Closed". Tones: `neutral` (default), `live`. Nothing else exists. A "live" tag is only for something in play: a session or a running trip. A caption that names rather than states ("Biggest winner") is not a tag: it's plain muted text.

## Money, BalanceLabel

Every amount goes through `Money`, the hero figures included, except the compact readout on boards, which is `boardMoney`, and places a component can't go (aria labels, string `label` props, table art), which use `formatMoney`. `tone="plain"` is an amount and `tone="result"` is a win or loss. Zero is neither: it stays `muted`. A balance is `BalanceLabel`, which words it ("You're owed $40").

```tsx
// Correct
<Money amount={result.net} currency={currency} tone="result" />

// Incorrect: loses the sign, the figures and the color rule
<span className="text-win">${result.net / 100}</span>
```

## Chip

A player's identity: `chip` comes from `chipOf(group, playerId)`. Pair it with the player's name. Size 28 in web rows, 30 in mobile rows, and smaller in dense lists and awards.

## Dialog (web), Sheet (mobile)

A focused task or a confirmation. The title says what's being decided, and a confirmation names the outcome on its button. Keep the safe choice beside it: "Keep it" and "Void entry".

## Menu, MenuItem, MenuChoice (web)

Secondary actions behind "…", with destructive items as `tone="danger"`. If a section's main action sits in a menu, promote it to a `Button`.

A page-level destructive action, like deleting a trip, goes in the menu and opens a `Dialog`, where the confirming button is `danger`. A `danger` button sitting in the open beside the primary competes with it.

## CopyButton (web)

Copies a link or code and confirms it. Use it instead of writing to the clipboard from a screen.

## EmptyState, Skeleton

`EmptyState` says what's missing and what to do: "No sessions on this trip yet", then a line on how to start. On mobile it takes an `action`; on web it sits beside the page's own action. Never "No data". It's in `Page.tsx` on web and `Surface.tsx` on mobile. `Skeleton` holds the shape of content while it loads; `<Loaded>` already handles this for a query.
