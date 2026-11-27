# Components

Parts live in `apps/mobile/src/components/ui`; `Money` sits one level up and `Avatar` in `features`. Check here before writing a new `<Pressable>`.

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

## Blackjack tabletop arc and seat picker

`BlackjackTableArc` (`apps/mobile/src/features/BlackjackTableArc.tsx`) draws a flat top-down blackjack table with `react-native-svg`, in felt tokens only (a rail, the felt, a `Dealer` label and numbered spots; no casino props, printed rules, gradients or glow) (`5`, `6`, or `7` spots ordered right-to-left: `Seat 1` / First base on the dealer's left, `Seat N` / Third base on the dealer's right), used exclusively inside seat selection (`SeatPickerSheet`). Each spot keeps a minimum 44pt target (`size-11`) and uses `seatLabel(seat, seats)` for accessibility alongside occupant names; live session, table, and shared views show each player's seat directly on their row (`TableSeats`, `SharedTable`) and live felt seat pill without repeating the table map or total seat count.

`SeatPickerSheet` (`apps/mobile/src/features/SeatPickerSheet.tsx`) saves an open spot with one tap (no Save button) on both draft forms and live visits, guards shrinking `5 / 6 / 7` seats below any live occupied spot, atomically replaces single-seat finished records, and routes multi-seat finished sessions to visit History instead of rewriting history.

## Choice and TextField

Use `Choice` for an exclusive value. SwiftUI and Compose use a segmented control when labels fit and a picker otherwise. Use `presentation="menu"` for compact player or counterparty choices. Narrow a page with `FilterChip`.

Give each `TextField` a visible label. A field-specific error goes in `error`. A submission error goes in `FormError`.

## Surface, List, Row

`Surface` is a solid card on the page: `surface` fill, no border, the card shadow. A list of rows is `List` with a `Row` for each, on both clients: `List` draws the card and the hairline dividers, and `Row` the padding. A pressable `Row` takes `onPress`.

A row with quick actions is a `SwipeRow`, as in Messages: `trailing` actions show behind a swipe left, `leading` ones behind a swipe right. The destructive action goes trailing, in `chip-red`; the others go in `chip-blue`. A swipe only shortens a path, so each action must also be reachable from the row's sheet. Removing someone still asks first. VoiceOver and TalkBack offer the same actions on the row.

A row runs avatar, then the text in a `min-w-0 flex-1` column, then the amount at the end. A player's name in a row is plain `font-medium` text, not display type.

Mobile has a few more card parts beside `Surface`: `ProportionalBarRow` for a breakdown (a dot or avatar, the name, the amount, a thin bar scaled to its share and a muted footnote), `QuotaCard` for a backing stake's pace, and `SettingsGroup` with `SettingsRow` for grouped settings under a `type-section` header. Reach for these before drawing a card by hand.

Don't put a `Surface` inside a `Surface`. A card on a card is `bg-raised`.

## Share cards: TripCard, SessionCard

A trip or a finished session of yours becomes a 4:5 image for the share sheet. Both cards take a model from `@stacks/client-runtime/shareCard` and draw nothing it doesn't hold, never fetching and never reading preferences. The felt is pinned to the dark theme with `ScopedTheme` and read through the felt tokens, so a card looks the same from either app theme; its figures use `felt-win` and `felt-loss`, which pass AA on it. The Color Up wordmark (`<BrandWordmark felt />`) sits small at the bottom, with no glow or gradient. Players are a plain `Avatar` with initials, never contact photos.

`TripCard` shows the name, dates and venues, up to 8 standings (you are always one, the rest are "+N more"), then your result, place, sessions and nights, and your running line. `SessionCard` shows venue, game, date, duration, result, buy-in, cash-out and hourly, with no curve.

**Hidden is a different card, not a masked one.** `hidden` is privacy mode or the sheet's **Hide amounts**. The model then holds no amounts, so the card has no figure, no `••••`, no line or axis and no win or loss color: ranks, names and avatars remain, and for a session the venue, game, date and duration. `Money` takes `hidden` for this, and it defaults to privacy mode elsewhere.

The sheet shows the mounted card, and **Share** captures that same view when pressed, at 1080×1350 physical pixels whatever the screen density (the capture size is in logical pixels, so it is `1080 / PixelRatio`). Nothing is captured ahead of time, so hiding amounts can't be followed by sharing an older image. The card is laid out at 360×450 and scaled down in the sheet by an ancestor, never by the captured view.

## Crew activity posts

Each Crew activity item is a post in its own `List` card, not a log row. A person leads: a 40pt `PlayerAvatar` of the one member who stands out, then a `type-callout` headline that names them ("Bruce won $90,000 at Fontainebleau", "You won …"), a `type-footnote` line with when and the trip ("2h ago · Vegas 2027"), and, for a finished table, one wrapping `type-footnote` line of the others with their results in `Money tone="result"` ("You +$19,000 · Nick +$9,000 · Brad +$3,000"), ending in "+N more" past four. Names, not faces, tell the others apart. Lists put "You" first ("You, Bruce and Nick").

The words come from `@stacks/client-runtime/crewStory`, which only says what the numbers support and only about group members, so a post agrees with the hero's "N playing". The largest result, a win or a loss, is the headline, and a face leads only when one member has it alone; a tie, an even table, or a table where no one won and several lost ("The table lost $1,950 at Wynn") gets the neutral disc and no one is singled out. Privacy mode swaps the headline for "You, Bruce and Nick played at Fontainebleau" with no results, so no direction leaks. A table with no casino names its game. A live post is "Bruce, Nick and 2 others are playing at Caesars Palace" with the hero's still green dot and "● Live 1h 18m". Times are relative (`relativeWhen`), read from one minute clock held at the top of the list. A post has no confetti, emoji, gradient or motion.

## Hero cards: TripHero, BalanceHero

A place can open on one hero card: the figure that place exists to show, big enough to read across a table. A trip has `TripHero` (your trip total, your running line, win rate, best session, your place). A live session opens on `SeatHero`, above its table map and `TableStats` tiles, so Rebuy and Cash out sit on a phone's first screen: your seat's buy-in, or how you finished, with both one tap away. Your own live session is never a card on a page: the LiveBar holds it.

One hero per screen, at the top of what it's about. Don't add a hero to a page that has no single figure.

Hero cards are **glow-free** `rounded-[22px] bg-surface p-4` cards with no border (`emil-unslop-design`: no decorative radial `Glow` blobs behind the figure). An uppercase `type-label text-muted` kicker (`RESULT · ALL TIME`, `TRIP TOTAL`) sits over the `type-hero` `Money` figure (`money-hero`, 44px), followed by a `type-footnote text-muted` subtitle (`Across 14 sessions`), the clean chart (`rx={4}` rounded-cap vertical bars, or a running line), bottom-corner date range labels (`Oct 11` … `Nov 9`), and an inline color-dot legend along the bottom edge. Color stays on the figure and the chart: labels and tiles are `muted` and `ink`. Its words come from `@stacks/client-runtime/trip` (`tripLines`).

## Charts

A chart draws only what has a shape: a running line, or results by month, night or trip. Everything else in Stats is a figure or a sentence. Charts start at break-even, a dashed zero line, take their scales from `@stacks/client-runtime/chart` and draw with `react-native-svg` and plain views.

- **A chart has a summary and a path.** The chart is one `image` with a plain-language summary, and every amount in it goes through the privacy-aware formatter. What it lets you open is also a 44pt row or column.
- **Privacy mode makes a chart neutral.** Bars are `fill-strong`, with no win or loss color and no printed value.
- **Results by month or night are bars around break-even.** `PeriodSection` draws rounded-cap vertical bars on a dashed zero line. The best and worst are solid and the rest 35%; a month that was played and broke even is a muted dot, and one that wasn't played is only its `faint` label. Every bar has an accessible label with its exact signed amount, "even" or "no play". In privacy mode every bar is `fill-strong`.
- **Result by trip is the same bar with the trip's leader at its end.** `ResultBars` (`GroupStatsParts.tsx`) draws one rounded-cap bar for each trip with play in scope, oldest to newest, the latest eight, around a dashed zero. A 20px `PlayerAvatar` for the trip's leader sits at the end of its bar, and is left out when two or more players share the lead. A trip that broke even is a muted marker, not a bar. With a trip picked it becomes By night, with the same leaders and ties. A column opens its trip only when it's 44pt wide or more, and the Trips list is the path to every trip. Its avatars are decoration, hidden from assistive tech, and the summary names each trip with its Result and leader.
- **Bars beside their amount compress.** `barTrack(values, { compress: true, minimum: 0.06 })` draws lengths by square root with a floor, so $60 shows next to $18,500. Only do this where the exact amount is printed beside the bar.

## Navigation: PlaceTabs and LiveBar

Where content lives is decided in [docs/internals/navigation.md](../internals/navigation.md). Every page sits in the four tabs, Play, Stats, Map and Crew, except the ones that fill the screen: a live session, a shared table's links and an invitation. Those use `PersonalFrame` (`features/Personal.tsx`): the wordmark and You, with nothing read from an account. A full-screen page's main actions go in its `Dock`, pinned above the home indicator on a phone and in the page's flow from `sm` up. Save state is `SaveStatus`, which only ever says "Saved on this device" after the device has it.

On mobile, keep React Navigation native-stack, one stack per tab. Both platforms use native bottom tabs. On iOS they bring their own Liquid Glass, beside grouped native header actions. On Android they're Material's navigation bar, with Material Symbols from `assets/tab-icons` that a config plugin turns into drawables. The `LiveBar`, the You button and an `IconButton` are glass on iOS; on Android they're a solid surface and filled tonal circles. On iOS every screen's navigation bar items come from `<Toolbar>` (`components/ui/Toolbar.ios.tsx`), never a `setOptions({ headerRight })`: native-stack lets `unstable_headerRightItems` override `headerRight`, and the toolbar keeps one set of native items across re-renders so the bar never flickers or shifts between tabs. On iOS 26 the scroll-edge blur behind the header items attaches to the first ScrollView found by walking a screen's first children (`react-native-screens` and UIKit both do it), so `PersonalScreen` and `Screen` render their ScrollView before the header's You sheet, which stays mounted once opened. Both bars sit over the foot of the screens, so screens learn their height from `TabBarHeight` and keep content and docks clear of it: `useScreenFoot` (`components/ui/tabBar.ts`) gives a screen every number at its foot: where its list ends, the footer's inset, and where the FAB and LiveBar sit. Don't redo that arithmetic in a screen. iOS's bar is glass, so a list scrolls under it; Android's is opaque, so a list ends above it and nothing can be tapped through the bar. Screens also reserve the measured LiveBar height. On iOS 26 the tab bar owns the LiveBar: it is the tab bar's bottom accessory (`features/LiveAccessory.tsx`), above the bar and inline beside it when the bar minimizes on scroll, and it exists only while a session is live. The tab screens then skip the pinned bar and read the accessory's room from `LiveAccessoryHeight`. Android, iOS before 26 and pushed screens keep the pinned bar.

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

## Avatar

A person is drawn the way the phone's Contacts app draws them, never as a casino chip. Pair it with the player's name, and keep it decoration: it's hidden from assistive tech, and the name beside it is the label. Use 28pt in feed and breakdown rows, and smaller in dense lists and awards.

`PlayerAvatar` is the part for a person. It shows the photo linked to them on this phone when there is one, and a photo that won't load goes back to the default. `you` marks the signed-in user's own player, who tries their linked photo, then their Clerk profile photo, then the default avatar with their own initials, never "Y". Their Android tile color comes from their Clerk user ID, so it matches in the You button and in every group. Without Clerk in a build, `you` keeps the name it was given. A table passes `TABLE_AVATAR_SIZE`: 32pt on iOS, 36pt on Android. `Avatar` is the same face with no lookup; a share card uses it, so a contact photo never leaves the phone in a shared image. `UserAvatar` is the You button's, where there's no player.

With no photo, each platform draws its own default, split in `AvatarFace.ios.tsx` and `AvatarFace.android.tsx`. iOS is a **monogram**: a circle with a soft grey vertical gradient (`avatar-top` to `avatar-bottom`) and white initials, the first letters of the first and last name, or just the first below 28pt. Android is a **letter tile**: a circle in one of six tonal colors (`avatar-1` to `avatar-6`, each with its `-ink`) that `avatarToneOf(playerId)` picks, with one initial, so a player keeps their color. Initials are set in the system font, not Allo, so they look like the phone's own Contacts. A name with no letter or number, such as an emoji, draws a person silhouette. `initialsOf` (`@stacks/client-runtime/avatar`) decides the letters.

The **pair avatar** (`PairAvatar`) overlaps two players' avatars, the second ringed in the surface color. It stands for two players together: the pair who've shared the most tables, or the two who tied for a trip. Three or more tied show their count in a neutral disc instead, and the chart shows no avatar, so a tie never picks one player.

A venue or game is never an avatar. It's a disc or bar in its game color (`chip-red` to `chip-grey`).

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
