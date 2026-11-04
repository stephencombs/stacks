# Components

Parts live in `apps/web/src/components/ui` and `apps/mobile/src/components/ui`; `Money` sits one level up and `Chip` in `features`. Check here before writing a `<button>`, `<Pressable>` or a styled `<div>`.

## Button

Use for an action. Going to another page on web is a `ButtonLink`, which takes the same variants.

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

Moving between places is the app's navigation (see Navigation below; `PlaceTabs` on mobile), never `Segmented` or `Choice`. The same data at another scope or measure is `Segmented`: the Board's This trip / All time, the race's Money / % of buy-in.

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

A place can open on one hero card: the figure that place exists to show, big enough to read across a table. Sessions has `TripHero` (your trip total, your running line, win rate, best session, board place), Settle up `BalanceHero` (your balance), and the Board's This trip `RaceHero` (your gap to the player just ahead, or just behind when you lead, with everyone's running totals and yours in gold). The Board's All time opens on the same `TripHero` across every trip ("All time with …"). A live session has `SeatHero` under its table map and `TableStats` tiles: your seat's buy-in, or how you finished, with Rebuy and Cash out one tap away. When you're seated at a live session, Sessions opens on `LiveSessionCard`, above the hero, with "Back to the table" as the screen's primary action.

One hero per screen, at the top of what it's about. Don't add a hero to a page that has no single figure. A venue name inside a card can take `font-display uppercase` like a page title; nothing else borrows display type.

A hero is a `Surface` on web and a `rounded-xl bg-surface` view on mobile, inset `p-4` like the rows around it, with `Glow` first inside it in the tone of the figure: `win` up or ahead, `loss` down or behind, `accent` level or tied. A sentence-case `text-sm font-medium text-muted` label sits over the figure, which is `Money` in `font-display text-6xl` (`text-5xl` below `sm` on web), then one `text-sm text-muted` comparison. Color stays on the figure and the chart: labels and tiles are `muted` and `ink`, never gold. Its words come from `@stacks/client-runtime/trip` (`tripLines`, `balanceHeadline`, `raceHeadline`) so both clients say the same thing.

## Charts

Every chart that compares players draws the same way: lines start at break-even, a dashed `line-strong` rule; the line you're following is `accent`, 3px with a halo on its current point; everyone else is `muted` at 45%; each line ends on a dot and the player's initial, spread apart with `spreadLabels` so none overlap. No chip colors on lines: the chip next to a name is identity, the gold line is focus. Scales come from `@stacks/client-runtime/chart` and draw per platform, SVG on web and `react-native-svg` on mobile.

Players at very different stakes would flatten each other, so:

- **A race fits the people near you.** Pass `lineScale` a `focus` from `around(index, count)`. A line far outside that range pins to the edge, and its initial gets an arrow (`J ↓`) from `clipped`.
- **A race can compare stakes fairly.** The All time race has a Money / % of buy-in switch; `raceLines` gives either measure from `@stacks/shared/stats`, and `returnLabel` words a return.
- **Bars beside their amount compress.** `barTrack(values, { compress: true, minimum: 0.06 })` draws lengths by square root with a floor, so $60 shows next to $18,500. Only do this where the exact amount is printed beside the bar.

## Navigation: AppShell, ScopeButton, PlaceLink (web)

Where content lives is decided in [docs/internals/navigation.md](../internals/navigation.md). On web, every signed-in page except an invite or claim link sits in `AppShell` (`features/Shell.tsx`), which draws it from two parts in `ui/Nav.tsx`:

- **`ScopeButton`** says where you are: the trip in scope, its group small above it, and a chevron. It's a real button, outlined like a secondary one, and opens the scope sheet (trips, New trip, the group, your other groups). A group with no trips shows its name alone.
- **`PlaceLink`** is one of the four places, Sessions, Board, Settle up and Group, with a lucide icon. `layout="bar"` stacks icon over label in the bottom bar; `layout="side"` is a sidebar row. The current place is gold. A group with no trips offers only Group.

Your avatar opens **You**: play limits for the trip in scope, appearance, and account. Nothing personal goes in a place.

```
How wide is the window?
 ├── Below lg → a top bar (ScopeButton, avatar) and a bottom bar of PlaceLinks, with the LiveBar floating just above it
 └── lg and up → a 240px sidebar: wordmark, ScopeButton, PlaceLinks, your live table, this group's trips, You at the foot
```

The sheets are `Dialog`, so they slide up from the bottom on a phone and sit centered on a wide screen. `Dialog` and `Menu` layer above the bars.

Pages pushed onto a place, like a session onto Sessions or People onto Group, take a `BackLink` in `PageHeader`'s `back`. The back slot only ever goes back; it never switches scope.

## Wide screens: TripLayout, TripRail (web)

Pages keep the 672px reading column beside the sidebar. Sessions is the one exception: from `xl` it widens to take a 320px rail through `TripLayout`, where `TripRail` shows the board and your balance with Settle up, a glance before going to either place. Below `xl` the rail drops away, and nothing moves into it that isn't also elsewhere.

## PageHeader, Section, Note (web); PageTitle, SectionHeading (mobile)

One page title per page. On web that's `PageHeader`, which also takes the `back` link, an `options` menu, a `tag`, an `action` and `children` for what sits under the title (a session's notes, the Board's `Segmented`), and sets the browser tab's title. `context` is the line saying where the page sits, or what it covers: "Poker · Sat 12 Oct". A trip place's title is the place, through `TripHeader`, since the scope button already names the trip; Sessions carries the trip's ⋯ menu.

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

## EmptyState

`EmptyState` says what's missing and what to do: "No sessions on this trip yet", then a line on how to start. On mobile it takes an `action`; on web it sits beside the page's own action. Never "No data". It's in `Page.tsx` on web and `Surface.tsx` on mobile.

## Loading

A page waits in its own shape, then appears once, whole, and nothing on it moves after.

- **Skeletons are the page, unfilled.** Use the page skeletons in `PageSkeletons.tsx` (web) and `ScreenSkeletons.tsx` (mobile): the same header, cards, rows and gaps as the real page, with `SkeletonText` bars sitting in line boxes the height of the text they replace. Never one tall `Skeleton` block for a whole page; a page that doesn't have a skeleton yet gets one built from those parts.
- **One wait, not a staircase.** A page that needs several queries passes the same skeleton to each stage. Trip pages use `TripLoaded`, which starts the trip, group and limits requests together and paints once they're all in. `Prefetch` starts a query early; `Settled` waits on one without failing the page when it fails.
- **Nothing pops in above content.** Anything the page shows near the top waits with the page (limits do), rather than arriving after it and pushing everything down. Something that loads on its own further down reserves its height (`RowsSkeleton rows={1}` for a single row).
- **Once loaded, never blank again.** Queries behave like TanStack Query's defaults: whatever a page loaded stays cached for five minutes after nothing shows it (`CACHE_MS`, the atom registry's default lifetime), so going back to a page shows it at once. Data older than 30 seconds (`STALE_MS`) refetches in the background when a page mounts, when the window regains focus or comes back online, and on mobile when the app returns to the foreground, while the old copy stays on screen. A refresh or a write's refetch keeps showing the previous data; only a first load ever shows a skeleton. `Loaded` does all of this; don't read a query's result without it unless you mean to.
- **Slow loads only.** Web skeletons fade in after 300ms measured from the navigation, so a quick load goes straight from the last page to this one with no grey flash.
- **Display type doesn't jump.** Until Barlow Condensed loads, web sets display text in a fallback face scaled to Barlow's width and line box (`Barlow Condensed Fallback` in `index.css`). If the display font changes, recalibrate it.
- **The frame stays put.** `AppShell` renders once and never waits on a page: the scope button holds its place with a skeleton until your groups arrive, and page skeletons cover the content column only.
