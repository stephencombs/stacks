# Components

Parts live in `apps/mobile/src/components/ui`; `Money` sits one level up and `Chip` in `features`. Check here before writing a new `<Pressable>`.

## Button

Use for an action. Floating icon controls use `IconButton`. They own their round surface (glass, or a filled tonal circle on Android) and require an accessible action label.

Variants: `primary`, `tint`, `secondary`, `ghost`, `link`, `danger`. Sizes: `sm`, `md`, `lg`, plus `xl` on mobile. Nothing else exists.

```
Is it the single next step on this screen?
 ├── Yes → variant="primary", the ink pill, one per view
 └── No
      ├── Destructive or hard to undo? → variant="danger"
      ├── A filled action that mustn't compete with the primary? → variant="tint"
      ├── A blue navigation action in an Android section header? → variant="link"
      ├── In a toolbar or section header, repeated down a page? → variant="ghost"
      └── Default → secondary, which is what you get with no variant prop
```

While a request is in flight, pass `pending`. It shows a spinner and blocks presses. Use `disabled` only for an action that isn't available yet. When one request blocks two buttons, only the one the user pressed is `pending`, and the other is `disabled`. The seat dialog is the one exception: its long list of equal choices only disables while a seat saves.

```tsx
// Correct
<Button label="Start session" variant="primary" pending={create.pending} onPress={start} />

// Incorrect: reads as unavailable, not as working, and the swapped label moves the layout
<Button label="Start session" variant="primary" disabled={create.pending} onPress={start} />
```

Labels name the outcome: "Void entry", not "Confirm".

Press feedback is built in throughout the native apps: the shared press scale and timing. Don't add your own `active:scale` to a `Button` or wrap one in another pressable.

A one-tap write, like a rebuy, keeps its button where it was, so a second tap does it again. Taking it back is an Undo somewhere else: a toast on mobile. A button that turns into its own undo makes a double-tap cancel itself. Outside the felt screen, a repeat-amount button reads "Rebuy $300". The felt screen labels the whole row "Rebuy" and uses three equal controls: "+ $100", "+ $200" and "Other". Its undo toast sits above that row.

## Choice and TextField

Use `Choice` for an exclusive value. SwiftUI and Compose use a segmented control when labels fit and a picker otherwise. Use `presentation="menu"` for compact player or counterparty choices. Narrow a page with `FilterChip`.

Give each `TextField` a visible label. A field-specific error goes in `error`. A submission error goes in `FormError`.

## Surface, List, Row

`Surface` is a solid card on the page: `surface` fill, no border, the card shadow. A list of rows is `List` with a `Row` for each, on both clients: `List` draws the card and the hairline dividers, and `Row` the padding. A pressable `Row` takes `onPress`.

A row runs chip, then the text in a `min-w-0 flex-1` column, then the amount at the end. A player's name in a row is plain `font-medium` text, not display type.

Mobile has a few more card parts beside `Surface`: `ProportionalBarRow` for a breakdown (a dot or chip, the name, the amount, a thin bar scaled to its share and a muted footnote), `QuotaCard` for a backing stake's pace, and `SettingsGroup` with `SettingsRow` for grouped settings under a `type-section` header. Reach for these before drawing a card by hand.

Don't put a `Surface` inside a `Surface`. A card on a card is `bg-raised`.

## Share cards: TripCard, SessionCard

A trip or a finished session of yours becomes a 4:5 image for the share sheet. Both cards take a model from `@stacks/client-runtime/shareCard` and draw nothing it doesn't hold, never fetching and never reading preferences. The felt is pinned to the dark theme with `ScopedTheme` and read through the felt tokens, so a card looks the same from either app theme; its figures use `felt-win` and `felt-loss`, which pass AA on it. The Color Up wordmark (`<BrandWordmark felt />`) sits small at the bottom, with no glow or gradient. Players are initials on a `Chip`, never contact photos.

`TripCard` shows the name, dates and venues, up to 8 standings (you are always one, the rest are "+N more"), then your result, place, sessions and nights, and your running line. `SessionCard` shows venue, game, date, duration, result, buy-in, cash-out and hourly, with no curve.

**Hidden is a different card, not a masked one.** `hidden` is privacy mode or the sheet's **Hide amounts**. The model then holds no amounts, so the card has no figure, no `••••`, no line or axis and no win or loss color: ranks, names and chips remain, and for a session the venue, game, date and duration. `Money` takes `hidden` for this, and it defaults to privacy mode elsewhere.

The sheet shows the mounted card, and **Share** captures that same view when pressed, at 1080×1350 physical pixels whatever the screen density (the capture size is in logical pixels, so it is `1080 / PixelRatio`). Nothing is captured ahead of time, so hiding amounts can't be followed by sharing an older image. The card is laid out at 360×450 and scaled down in the sheet by an ancestor, never by the captured view.

## Hero cards: TripHero, BalanceHero

A place can open on one hero card: the figure that place exists to show, big enough to read across a table. A trip has `TripHero` (your trip total, your running line, win rate, best session, your place). A live session opens on `SeatHero`, above its table map and `TableStats` tiles, so Rebuy and Cash out sit on a phone's first screen: your seat's buy-in, or how you finished, with both one tap away. Your own live session is never a card on a page: the LiveBar holds it.

One hero per screen, at the top of what it's about. Don't add a hero to a page that has no single figure.

Hero cards are **glow-free** `rounded-[22px] bg-surface p-4` cards with no border (`emil-unslop-design`: no decorative radial `Glow` blobs behind the figure). An uppercase `type-label text-muted` kicker (`RESULT · ALL TIME`, `TRIP TOTAL`) sits over the `type-hero` `Money` figure (`money-hero`, 44px), followed by a `type-footnote text-muted` subtitle (`Across 14 sessions`), the clean chart (`rx={4}` rounded-cap vertical session bars or running `RaceChart` lines), bottom-corner date range labels (`Oct 11` … `Nov 9`), and an inline color-dot legend along the bottom edge. Color stays on the figure and the chart: labels and tiles are `muted` and `ink`. Its words come from `@stacks/client-runtime/trip` (`tripLines`, `balanceHeadline`, `raceHeadline`).

## Charts

Every chart that compares players draws the same way: lines start at break-even, a dashed `line-strong` rule; the line you're following is `ink`, 3px with a halo on its current point; everyone else is `muted` at 45%; each line ends on a dot and the player's initial, spread apart with `spreadLabels` so none overlap. No chip colors on lines: the chip next to a name is identity, the ink line is focus. Scales come from `@stacks/client-runtime/chart` and draw with `react-native-svg`.

Players at very different stakes would flatten each other, so:

- **A race fits the people near you.** Pass `lineScale` a `focus` from `around(index, count)`. A line far outside that range pins to the edge, and its initial gets an arrow (`J ↓`) from `clipped`.
- **A race can compare stakes fairly.** The running result in Stats has a Money / % of buy-in switch; `raceLines` gives either measure from `@stacks/shared/stats`, and `returnLabel` words a return.
- **Bars beside their amount compress.** `barTrack(values, { compress: true, minimum: 0.06 })` draws lengths by square root with a floor, so $60 shows next to $18,500. Only do this where the exact amount is printed beside the bar.

## Navigation: PlaceTabs and LiveBar

Where content lives is decided in [docs/internals/navigation.md](../internals/navigation.md). Every page sits in the four tabs, Play, Stats, Map and Crew, except the ones that fill the screen: a live session, a shared table's links and an invitation. Those use `PersonalFrame` (`features/Personal.tsx`): the wordmark and You, with nothing read from an account. A full-screen page's main actions go in its `Dock`, pinned above the home indicator on a phone and in the page's flow from `sm` up. Save state is `SaveStatus`, which only ever says "Saved on this device" after the device has it.

On mobile, keep React Navigation native-stack, one stack per tab. Both platforms use native bottom tabs. On iOS they bring their own Liquid Glass, beside grouped native header actions. On Android they're Material's navigation bar, with Material Symbols from `assets/tab-icons` that a config plugin turns into drawables. The `LiveBar`, the You button and an `IconButton` are glass on iOS; on Android they're a solid surface and filled tonal circles. On iOS every screen's navigation bar items come from `<Toolbar>` (`components/ui/Toolbar.ios.tsx`), never a `setOptions({ headerRight })`: native-stack lets `unstable_headerRightItems` override `headerRight`, and the toolbar keeps one set of native items across re-renders so the bar never flickers or shifts between tabs. Both bars sit over the foot of the screens, so screens learn their height from `TabBarHeight` and keep content and docks clear of it: `useScreenFoot` (`components/ui/tabBar.ts`) gives a screen every number at its foot: where its list ends, the footer's inset, and where the FAB and LiveBar sit. Don't redo that arithmetic in a screen. iOS's bar is glass, so a list scrolls under it; Android's is opaque, so a list ends above it and nothing can be tapped through the bar. Screens also reserve the measured LiveBar height. On iOS 26 the tab bar owns the LiveBar: it is the tab bar's bottom accessory (`features/LiveAccessory.tsx`), above the bar and inline beside it when the bar minimizes on scroll, and it exists only while a session is live. The tab screens then skip the pinned bar and read the accessory's room from `LiveAccessoryHeight`. Android, iOS before 26 and pushed screens keep the pinned bar.

See [mobile controls](mobile-redesign.md) for platform selection, native sheet sizing and chart interaction.

Groups, trips and sessions are pushed onto Crew. Use the stack's back button. The back slot only ever goes back.

## PageTitle and SectionHeading

Use one `PageTitle` per page. Section headings have two variants:

1. **Grouped Card Header (`SectionHeading`)**: Sentence-case `type-section text-muted` label over a borderless `rounded-[22px]` `Surface` card (`Recent sessions`, `People`), with its count or a link such as See all at the right. No rule beside it.
2. **Inline-Rule Header (`AccordionSectionHeading`)**: Sentence-case `type-section text-muted` label (with optional count, e.g. `Finished (16)`) followed by a `flex-1 h-[0.5px] bg-line` horizontal separator rule and optional collapse chevron for collapsible feed sections.

A section's action is a `ghost` or `sm` button or a `Choice`.

## Tag vs. Badge

Keep **Tag** and **Badge** distinct (`emil-design-vocabulary`):

- **Tag**: A static categorical label (`BETA`, `NLH $1/$3`, `Closed`). Tones: `neutral` (default) on `fill`, and `live` on `felt` with a dot. Rendered as a compact pill.
- **Badge**: A dynamic status or live count indicator (`Live · 2h 14m` with activity dot/spinner, `Draft`, `+13` diff, or a numeric count in a settings row). A caption that names rather than states ("Biggest winner") is neither: it's plain `text-muted` text.

## Money, BalanceLabel

Every amount goes through `Money`, the hero figures included, except the compact readout on boards, which is `boardMoney`, and places a component can't go (aria labels, string `label` props, table art), which use `formatMoney`. `tone="plain"` is an amount and `tone="result"` is a win or loss. Zero is neither: it stays `muted`. A balance is `BalanceLabel`, which words it ("You're owed $40").

```tsx
// Correct
<Money amount={result.net} currency={currency} tone="result" />

// Incorrect: loses the sign, the figures and the color rule
<Text className="text-win">${result.net / 100}</Text>
```

## Chip

A player's identity: `chip` comes from `chipOf(group, playerId)`. Pair it with the player's name. Use `28×28px` (`rounded-lg` monogram/color badge) in mobile feed and breakdown rows, and smaller in dense lists and awards.

Use `PlayerChip` for a person, so a photo linked to them on this phone shows in a 2px ring in their chip color (1.5px under 26pt) and fails back to their initial. At a table, `TableChip` does the same with a color from `tableChipOf(playerId)`, because a table has no group to number its players: 32pt on iOS, a 36pt ring on Android. A venue's chip, a race-chart endpoint and a share card use plain `Chip` and never get a photo.

## Page actions

On phones, keep a live session's Buy in / Rebuy and Cash out above the places, labeled with the player they affect. Keep Undo separate and above the buttons so a second tap still rebuys.

A long form's submit action stays visible: use `Screen`'s `renderFooter`. Keep the live-session return link above the submit action when it appears on the same screen.

## Sheet

On iOS, `Sheet` is the system's sheet, with its own material and motion. On Android it is a bottom sheet we draw: as tall as its content up to the screen below the status bar, 28dp top corners, a grabber, a scrim above it that closes it, and the keyboard clearing its footer.

Keep a form's submit action and submission errors in `footer`, outside the scrolling fields. Secondary outcomes stay in the body so the keyboard leaves room for inputs.

A picker with a search (casino, trip) is a `SearchablePickerSheet`: full height from the first frame, search bar at the bottom above the keyboard, `PickerRowsSkeleton` while loading, and choosing a row saves and returns with a spinner on that row, so there is no Save button. A failure stays in the sheet for another try.

A screen's main actions go in a `PinnedFooter` (the `dock` of `PersonalScreen`, the `renderFooter` of `Screen`). On Android it is a `canvas` block with a hairline top edge (AndFinished), so nothing scrolled behind it, nor the LiveBar, shows through. A floating action goes through `fab`, which keeps its content's width. Android's extended FAB uses a primary `Button` with `size="fab"` and a leading icon.

On Android, `confirmAction` shows a Material 3 alert dialog from `ConfirmDialogHost`: sentence-case text buttons, the destructive one in `loss`. Every Jetpack Compose control (pickers, the date and time dialogs, the confirmation, the action and filter menus) sits in `ComposeHost`, which sets every Material color role from the tokens so stock Android's teal and lavender never show. Don't theme a control by hand beside it; native controls outside Compose take the same tokens from the `withAndroidTheme` config plugin or a wrapper such as `Switch`. Pickers are exposed dropdowns: a full-width field with a trailing arrow.

Use native action menus for short choices and confirmations for destructive outcomes. iOS Sheet uses native detents and title/close controls; pass `busy` while saving to prevent dismissal. A reason field stays in a form sheet. The title says what's being decided, and a confirmation names the outcome on its button. Keep the safe choice beside it: "Keep it" and "Void entry".

## ActionMenu

Secondary actions behind "…", with destructive items as `tone="danger"`. `ActionMenu` is the system menu (on Android, Material's dropdown drawn from the tokens through `MenuView`). If a section's main action sits in a menu, promote it to a `Button`.

A page-level destructive action, like deleting a trip, goes in the menu and opens `confirmAction`. A `danger` button sitting in the open beside the primary competes with it.

## GlassSurface

The one way to draw glass. Use it only on the parts [Glass](foundations.md#glass) lists. Wrap the content in `GlassSurface`, inside a `PressableScale` when the whole surface is a control, and pass `interactive` so iOS glass answers the touch. On Android `GlassSurface` is a solid `raised` surface with a shadow, and a round icon control's surface is `ControlSurface`, a filled tonal circle.

## Toast

A one-tap write's Undo. Solid, not glass, with the float shadow, entering and leaving on the toast's timing. One shows at a time; a new one replaces it.

## FilterChip

A filter that narrows a page, such as Stats' period, game and casino: a pill naming the current choice that opens the choices. An applied filter fills with `ink` and gains a button that clears it. Use the platform menu. A row of chips scrolls sideways and ends with "Reset all" once any is applied.

## EmptyState

`EmptyState` says what's missing and what to do: "No matching sessions" or "No sessions on this trip yet", then a `text-muted` sentence explaining what appears here or how to start. On mobile it centers vertically in the available viewport (`flex-1 items-center justify-center px-8`) with a bold sentence-case heading, muted body copy, and an optional pill `action`. Never "No data". It's in `Surface.tsx`.

## Loading

A page waits in its own shape, then appears once, whole, and nothing on it moves after.

- **Skeletons are the page, unfilled.** Use the page skeletons in `ScreenSkeletons.tsx`: the same header, cards, rows and gaps as the real page, with `SkeletonText` bars sitting in line boxes the height of the text they replace. Never one tall `Skeleton` block for a whole page; a page that doesn't have a skeleton yet gets one built from those parts.
- **One wait, not a staircase.** A page that needs several queries passes the same skeleton to each stage. Trip pages use `TripLoaded`, which starts the trip and group requests together and paints once they're all in. `Prefetch` starts a query early; `Settled` waits on one without failing the page when it fails.
- **Nothing pops in above content.** Anything the page shows near the top waits with the page (the group does), rather than arriving after it and pushing everything down. Something that loads on its own further down reserves its height (`RowsSkeleton rows={1}` for a single row).
- **Once loaded, never blank again.** Queries behave like TanStack Query's defaults: whatever a page loaded stays cached for five minutes after nothing shows it (`CACHE_MS`, the atom registry's default lifetime), so going back to a page shows it at once. Data older than 30 seconds (`STALE_MS`) refetches in the background when a page mounts, when the window regains focus or comes back online, and on mobile when the app returns to the foreground, while the old copy stays on screen. A refresh or a write's refetch keeps showing the previous data; only a first load ever shows a skeleton. `Loaded` does all of this; don't read a query's result without it unless you mean to.
- **Display type doesn't jump.** Until Barlow Condensed loads, web sets display text in a fallback face scaled to Barlow's width and line box (`Barlow Condensed Fallback` in `index.css`). If the display font changes, recalibrate it.
- **The frame stays put.** `AppShell` renders once and never waits on a page, and page skeletons cover the content column only.
