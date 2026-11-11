# Mobile Redesign Plan (T3 Code iOS Inspiration)

This document specifies the full mobile UI/UX redesign for `@stacks/mobile` (`apps/mobile`), inspired by the T3 Code iOS app and grounded in the `emil-*` design skills (especially `emil-design-vocabulary`, `emil-mobile-native`, `emil-surfaces`, `emil-typography`, `emil-animations`, and `emil-unslop-design`).

## 1. Design Vocabulary & Core Shifts

1. **Navigation vs. Tabs (Wayfinding Split)**:
   - **Navigation** moves the user between top-level places (`Sessions`, `Board`, `Settle up`, `Group`). On mobile, peer navigation sits in a **floating capsule bottom bar** (`rounded-full`, `p-1.5`, `bg-surface/95`, `1px` `border-line` **alpha** edge) above the safe-area home indicator. Each of the 4 items is an icon-only **touch target** (`>= 44×44px`) with an explicit `accessibilityRole="tab"` and `accessibilityLabel` (`"Sessions"`, `"Board"`, `"Settle up"`, `"Group"`). The active place uses a concentric `rounded-full` pill thumb (`innerRadius = outerRadius - padding`, `bg-fill`) and a **filled vs. outlined** icon swap (`components/ui/Icon.ios.tsx` / `components/ui/Icon.tsx`)—never a font-weight shift or cramped text label.
   - **Tabs** switch views of the same data in place (`This trip | All time`, `Money | % of buy-in`, `24h | 7d | 30d | All`). In-page tabs use full-width **pill segmented controls** (`Choice` in `apps/mobile/src/components/ui/Field.tsx`: `rounded-full bg-fill p-1` track with an elevated `rounded-full bg-surface` active thumb).
2. **Tinted Neutral Canvas & Whisper-Quiet Elevation (`emil-surfaces`, `emil-color`)**:
   - Cards (`rounded-2xl` / `20px`) sit on the **tinted neutral** `bg-canvas` (`oklch` **lightness** separation with low **chroma**—not **saturation**—tinted toward cool slate hue `260`).
   - **Subtract Decorative Glows (`emil-unslop-design`)**: Remove radial `Glow` (`apps/mobile/src/components/ui/Glow.tsx`) from `TripHero`, `RaceHero`, and `SeatHero`. Hero cards earn their hierarchy through crisp **tabular nums** typography, generous **padding**, and clean chart geometry.
3. **Sentence Case & Tight Tracking over Uppercase Shouting (`emil-typography`, `emil-ui-polish`)**:
   - Replace `40px` uppercase condensed `BarlowCondensed-Bold` screen titles (`type-title`) and uppercase `0.08em`-tracked `type-label` kickers with **sentence case** system sans-serif headers (`28px` bold, tight **tracking** `-0.025em`, tight **leading** `1.15`).
   - Reserve large display sizes (`36px–40px`, `tabular-nums`, `-0.03em` tracking) strictly for numeric figures inside hero and quota cards.
4. **Badge vs. Tag Disambiguation (`emil-design-vocabulary`)**:
   - **Tag**: Static categorical descriptor (`BETA`, game type `NLH $1/$3`, `Closed`). Styled as a compact `rounded-md` pill.
   - **Badge**: Dynamic status or live count indicator (`Live · 2h 14m` with activity dot/spinner, `Draft`, `+13` diff, or a count in a settings row).
5. **Horizontal Filter Pills over Cramped Header Chrome**:
   - Move `ScopeButton` (`apps/mobile/src/features/Scope.tsx`) out of React Navigation's native `headerLeft` into a horizontal row of `rounded-full` filter pills (`FilterPillBar`) directly beneath `TopBar` (`Personal play ⌄` / `Vegas crew, Vegas weekend ⌄`, plus contextual game/status filter pills).
6. **Circular Surface Action Buttons (`44×44px` Touch Targets)**:
   - Top-right actions (new session compose, search/filter, `Groups`, `You`) use `44×44px` circular `rounded-full bg-surface border border-line` `IconButton` controls—never bare unframed icons.

---

## 2. Token & Primitive Specifications

### 2.1 Color & Surface Tokens (`apps/mobile/global.css` & `apps/web/src/index.css`)

- Keep `apps/mobile/global.css` and `apps/web/src/index.css` in strict lockstep so `apps/web/src/design/tokens.test.ts` passes all parity, sRGB gamut, and WCAG `4.5:1` contrast checks.
- **Preserved OKLCH Tinted Neutral Palette**: Retain the existing hue-`260` OKLCH surface hierarchy (`--color-canvas`, `--color-surface`, `--color-raised`, `--color-fill`, `--color-line`, `--color-line-strong`), which already satisfies all 56 text/surface WCAG AA contrast pairs and matches the hardcoded `--color-canvas` hex values (`#04060a` dark / `#f3f4f7` light) checked in `apps/web/index.html`, `apps/web/preview/index.html`, and `apps/web/src/lib/theme.ts`.
- **Light Mode**: Cool alabaster `bg-canvas` (`oklch(0.968 0.004 260)` / `#f3f4f7`), pure elevated `bg-surface` (`oklch(0.996 0.002 260)` / `#fefeff`) for `rounded-2xl` cards, and `bg-fill` (`oklch(0.916 0.008 260)` / `#e1e4eb`) for pill segmented tracks and the active tab capsule thumb.
- **Dark Mode**: Obsidian `bg-canvas` (`oklch(0.115 0.012 260)` / `#04060a`) $\rightarrow$ `bg-surface` (`oklch(0.165 0.014 260)`) $\rightarrow$ `bg-raised` (`oklch(0.205 0.016 260)`) $\rightarrow$ `bg-fill` (`oklch(0.24 0.018 260)`), with `0.5px` (`StyleSheet.hairlineWidth`) **alpha** dividers (`border-line` / `border-line-strong`).

### 2.2 Typography Scale (`apps/mobile/global.css`)

Note: `apps/web/src/design/tokens.test.ts` verifies that mobile's `type-*` utility classes are a superset of web's (`type-title`, `type-callout`).

| Utility Class                    | Target Specification                                                                        | Primary Usage                                                                |
| :------------------------------- | :------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------- |
| `type-hero`                      | `36px–40px`, `font-semibold` / `700`, `tabular-nums`, `-0.03em` tracking, `1.08` leading    | Hero card & quota figures (`+$1,420`, `$196.13*`, `87% left`)                |
| `type-title`                     | `28px`, `font-bold`, system sans, **sentence case**, `-0.025em` tracking, `1.15` leading    | Top-level screen titles (`Your play`, `Session`, `Settle up`, `Your groups`) |
| `type-headline`                  | `32px`, `font-bold`, system sans, **sentence case**, `-0.025em` tracking, `1.12` leading    | Onboarding / empty-account headline                                          |
| `type-heading`                   | `17px`, `font-semibold`, system sans, **sentence case**, `-0.015em` tracking, `1.3` leading | Card titles & primary session feed titles                                    |
| `type-body`                      | `17px`, `font-normal`, system sans, `1.4` leading (`>=16px` input floor)                    | Form inputs, settings row titles, primary body copy                          |
| `type-callout`                   | `15px`, `font-medium`, system sans, `1.35` leading                                          | Segmented control labels, filter pills, secondary actions                    |
| `type-section`                   | `13px`, `font-medium`, `text-muted`, **sentence case**, `1.35` leading                      | Grouped list headers (`Playing now`, `Finished results`, `Settled (16)`)     |
| `type-footnote`                  | `13px`, `font-normal`, `text-muted`, `tabular-nums`, `1.35` leading                         | Breakdown metadata (`64.9% of buy-ins · 8 sessions`), field hints/errors     |
| `type-label`                     | `12px`, `font-medium`, `text-muted`, **sentence case**, `tabular-nums`                      | Card kickers (`Total in`, `Total out`, `Final result`, `Overall`)            |
| `type-number` / `type-number-lg` | `16px` / `20px`, `font-semibold`, `tabular-nums`                                            | Right-aligned row amounts (`+$420`, `$127.36`)                               |

---

## 3. Screen-by-Screen Blueprint

### 3.1 Navigation Shell (`App.tsx`, `features/PlaceTabs.tsx`, `features/PlaceTabs.web.tsx`, `features/Scope.tsx`, `features/LiveBar.tsx`, `components/ui/Screen.tsx`)

- **`TopBar` (`components/ui/Screen.tsx`)**:
  - Left: Wordmark **`Color`** (bold `text-ink`) **`Up`** (regular `text-muted`) + `BETA` **tag** alongside the screen's `accessibilityRole="header"` `type-title` heading (`Your play`, `Session`, `Settle up`, `Your groups`).
  - Right: `44×44px` circular `IconButton` controls (`square.and.pencil` / `plus` for new session, `Groups`, and `You`).
- **`FilterPillBar` (`features/Scope.tsx`)**:
  - Horizontal scroll/row of `rounded-full` pills (`bg-surface border border-line px-3.5 py-2 min-h-[36px]`) for the active Group & Trip scope (`ScopeButton` preserving `accessibilityLabel={`${item.group.name}, ${trip?.name ?? "no trips yet"}`}`) plus contextual game/status filters.
- **Floating Capsule `PlaceTabs` (`features/PlaceTabs.tsx`, `features/PlaceTabs.web.tsx`)**:
  - Switch `features/PlaceTabs.tsx` from `@react-navigation/bottom-tabs/unstable` (`createNativeBottomTabNavigator`, which renders OS `UITabBarController` chrome and ignores custom JS `tabBar` renders) to `createBottomTabNavigator` from `@react-navigation/bottom-tabs` with `screenOptions: { headerShown: false }` and a shared custom `FloatingCapsuleTabBar` component.
  - Update `useTabBarHeight()` in `features/PlaceTabs.tsx` and `features/PlaceTabs.web.tsx` to return `64 + Math.max(insets.bottom, 12)` so `Screen` scroll views pad clear of the floating bar.
  - Floating `rounded-full` capsule above `insets.bottom` (`mx-5`, `p-1.5`, `bg-surface/95`, `border border-line`).
  - Up to 4 icon-only peer tabs (`Sessions`, `Board`, `Settle up` gated by `if: useScopeHasTrip`, and `Group`), each preserving `accessibilityRole="tab"` and its exact `accessibilityLabel` (`"Sessions"`, `"Board"`, `"Settle up"`, `"Group"`).
  - Active state: concentric `rounded-full bg-fill` thumb + **filled** icon swap + tactile `scale(0.95)` press feedback.
- **Floating `LiveBar` (`features/LiveBar.tsx`)**:
  - Compact `rounded-2xl bg-raised border border-line px-4 py-3` card floating `8px` above the capsule tab bar whenever a session is live.

### 3.2 Sessions & Home Feed (`screens/Home.tsx`, `screens/Sessions.tsx`, `features/SessionList.tsx`, `screens/Play.tsx`, `screens/Session.tsx`, `features/SeatHero.tsx`)

- **Inline-Rule Collapsible Sections (`AccordionSectionHeader` in `components/ui/Surface.tsx`)**:
  - `Playing now`: Active personal session or live shared table rows with pulsing live dot/spinner + `Live · 2h 14m` **badge** and quick `+ Rebuy` / `Cash out` pills.
  - `Finished results` (and `Unsettled` / `Settled (N)` in group scope): Completed sessions followed by an inline `0.5px` horizontal rule (`border-line`) and collapse chevron.
- **Two-Line Feed Rows**:
  - Left `28×28px` `rounded-lg` monogram/color `Chip`.
  - Top line: `type-heading` venue/game title on the left; relative timestamp or duration (`35m`, `4h`) in `type-footnote tabular-nums` on the right.
  - Bottom line: `type-footnote` subtitle (`Vegas weekend · Hold'em $1/$2`) on the left; tabular `Money` net result (`+$420`, `-$180`, or `$300 in`) on the right.
- **Centered `EmptyState` (`components/ui/Surface.tsx`)**:
  - Vertically centered (`flex-1 items-center justify-center px-8`), `19px font-bold text-ink` sentence-case title, `15px text-muted text-center` description, and optional pill action button.

### 3.3 Board & Bankroll Analytics (`screens/Board.tsx`, `features/TripBoard.tsx`, `features/AllTimeBoard.tsx`, `features/TripHero.tsx`, `features/RaceHero.tsx`, `features/RaceStats.tsx`)

- **Stacked Pill Segmented Controls (`Choice` in `components/ui/Field.tsx`)**:
  - Row 1: `This trip | All time` (with `All time with ${group.name}` heading when in all-time view).
  - Row 2: `24h | 7d | 30d | All` time-window pill bar (or `Money | % of buy-in` unit toggle).
- **Glow-Free Hero Chart Card (`features/TripHero.tsx`, `features/RaceHero.tsx`)**:
  - `rounded-2xl bg-surface p-5` card with top-left `type-label` (`Net bankroll` / `Trip total`), `type-hero` tabular `Money` figure, `type-footnote` session count subtitle (`Across 14 sessions`), rounded-cap vertical session bars (`rx={4}`) or `RaceChart` lines, bottom-corner date range labels (`Oct 11` … `Nov 9`), and inline color-dot legend along the bottom edge.
  - Preserves empty-board copy `"Close a session to put it on the board."` when no sessions are closed yet.
- **Proportional Breakdown Cards (`ProportionalBarRow` in `components/ui/Surface.tsx`)**:
  - Grouped inside a `rounded-2xl bg-surface` card under a muted `type-section` header (`Standings`, `By game`, `By venue`).
  - Each row renders:
    - Top line: Color dot or player `Chip` + title on the left; tabular `Money` on the right.
    - Middle line: `4px`-high `rounded-full bg-fill` track with a proportional colored fill bar (`width: ${sharePct}%`).
    - Bottom line: Muted `type-footnote` (`64.9% of buy-ins · 8 sessions · +$52/hr`).

### 3.4 Settle Up, Backing & Play Limits (`screens/SettleUp.tsx`, `features/PersonalLimits.tsx`, `features/Backing.tsx`)

- **Quota & Pace Cards (`QuotaCard` in `components/ui/Surface.tsx`)**:
  - Model play limits (`Monthly loss limit`, `Session time reminder`) and settlement/backing progress on the T3 Code `Limits` cards:
    - Header: Sentence-case title on the left + pace status (`Within limit`, `Ahead of pace`, `2 of 3 paid`) on the right.
    - Readout: `type-hero` tabular figure (`87% left`, `$410 left`, or `$0 left`).
    - Progress Track (`QuotaBar`): `24px`-high `rounded-md` bar with solid semantic fill for the remaining/settled share, SVG diagonal hatch stripes for the consumed/unsettled share, and a `2px` vertical pace marker tick (`|`).
    - Footer: Reset countdown (`↻ Resets in 6d 14h`) or counterparty settlement actions (`Venmo`, `Zelle`, `Cash App`, `Record payment`).
  - Preserves settled empty-state copy `"Everyone's square"` when all balances are zero.

### 3.5 Unified Grouped Settings (`features/You.tsx`, `screens/Group.tsx`, `screens/GroupSettings.tsx`, `screens/People.tsx`)

- Consolidate personal (`You`) and group (`Group`) configuration into an iOS Grouped Settings layout (`SettingsGroup` & `SettingsRow` in `components/ui/Surface.tsx`) with a top-right circular search/quick-jump `IconButton`:
  - **`Account & sync`**: `Color Up Account` (email), `Active group` (count), `Notifications & reminders`.
  - **`Preferences`**: `Appearance` (`System / Light / Dark` radio group), `Default stakes & game`, `Play limits`, `Payment handles`.
  - **`Group & table`**: `Players & seats` (`screens/People.tsx`), `Trips & events` (`features/Trips.tsx`), `Backing & stakes` (`features/Backing.tsx`), `Invite & share link`, `Export CSV ledger`.
- Each `SettingsRow` (`min-h-[52px] px-4 py-3`) inside a `rounded-2xl bg-surface` card pairs a `20px` outlined left icon, `type-body` title, right-aligned `text-muted` current value, and `text-faint` `chevron-right` with inset `0.5px` dividers (`ml-12`).

---

## 4. Preserved Accessibility & E2E Contracts

To keep `apps/mobile/src/App.test.tsx`, `apps/mobile/e2e/full-loop.spec.ts`, `apps/mobile/solo/e2e/solo.spec.ts`, and `apps/mobile/e2e/table-map.spec.ts` green without test regressions, the redesign MUST preserve these exact accessible roles, labels, and copy strings:

1. **Bottom Tab Bar (`features/PlaceTabs.tsx`, `features/PlaceTabs.web.tsx`)**:
   - Each tab item renders `accessibilityRole="tab"` with exact names `"Sessions"`, `"Board"`, `"Settle up"`, and `"Group"`.
   - When a group has no trips yet (`!useScopeHasTrip()`), only the `"Group"` tab is rendered.
2. **Scope Switcher (`features/Scope.tsx`)**:
   - The scope pill (`ScopeButton`) renders `accessibilityRole="button"` with `accessibilityLabel={`${item.group.name}, ${trip?.name ?? "no trips yet"}`}` (e.g. `"Vegas crew, no trips yet"` or `"Vegas crew, Vegas weekend"`).
   - Inside the scope sheet, `"Personal play"` is a button that returns to `HomeScreen`.
3. **Header Actions (`features/Personal.tsx`, `features/You.tsx`)**:
   - `HomeScreen` header renders accessible buttons named `"Groups"` and `"You"`.
   - `You` sheet renders `"Play limits"`, `"Appearance"` (`accessibilityRole="radiogroup"` with `"System"`, `"Light"`, `"Dark"` radios), `"Sign out"` (when signed in), and `"Close"`.
4. **Screen Headings & Key Copy**:
   - `accessibilityRole="header"` headings on `HomeScreen` (`"Your play"`), `PlayScreen` (`"Session"` or venue/game title), `GroupsScreen` (`"Your groups"`), and `SettleUpScreen` (`"Settle up"`).
   - Session lifecycle labels: `"Playing now"`, `"Finished results"`, `"Total in"`, `"Total out"`, `"Final result"`, `"Save cash-out"`, `"Reopen cash-out"`, `"Log rebuy"`.
   - Board & Settle Up copy: `"Close a session to put it on the board."`, `"All time with ${group.name}"`, `"Everyone's square"`.

---

## 5. Implementation Sequence & Verification

1. **Phase 1 — Tokens & UI Primitives**:
   - Update `apps/mobile/global.css` and `apps/web/src/index.css` type utilities (`type-hero`, `type-title`, `type-headline`, `type-heading`, `type-body`, `type-callout`, `type-section`, `type-footnote`, `type-label`, `type-number`, `type-number-lg`); verify `apps/web/src/design/tokens.test.ts`.
   - Build/update `Card` (`rounded-2xl`), `AccordionSectionHeader`, `ProportionalBarRow`, `QuotaCard` / `QuotaBar`, `SettingsGroup`, and `SettingsRow` in `apps/mobile/src/components/ui/Surface.tsx`.
   - Add `IconButton` (`44×44px` circular surface button), `FilterPill`, and tactile `scale(0.97)` press physics in `apps/mobile/src/components/ui/Button.tsx`.
   - Upgrade `Choice` in `apps/mobile/src/components/ui/Field.tsx` to the `rounded-full` pill segmented control.
2. **Phase 2 — Navigation Chrome & Floating Capsule Bar**:
   - Implement `TopBar` in `apps/mobile/src/components/ui/Screen.tsx` and `FilterPillBar` in `apps/mobile/src/features/Scope.tsx`.
   - Switch `apps/mobile/src/features/PlaceTabs.tsx` from `createNativeBottomTabNavigator` to `createBottomTabNavigator` (`@react-navigation/bottom-tabs`) and share the floating capsule 4-tab bar across `PlaceTabs.tsx` and `PlaceTabs.web.tsx`.
   - Float `LiveBar` (`apps/mobile/src/features/LiveBar.tsx`) directly above the capsule tab bar and update `useTabBarHeight()` + `Screen` safe-area bottom padding.
3. **Phase 3 — Sessions Feed & Empty States**:
   - Refactor `apps/mobile/src/screens/Home.tsx`, `apps/mobile/src/screens/Sessions.tsx`, `apps/mobile/src/features/SessionList.tsx`, `apps/mobile/src/screens/Play.tsx`, `apps/mobile/src/screens/Session.tsx`, and `apps/mobile/src/features/SeatHero.tsx` to use collapsible inline-rule sections, `rounded-lg` `Chip` rows, glow-free `SeatHero`, and centered `EmptyState`.
4. **Phase 4 — Board Analytics, Quota Cards & Grouped Settings**:
   - Refactor `apps/mobile/src/screens/Board.tsx`, `apps/mobile/src/features/TripHero.tsx`, `apps/mobile/src/features/RaceHero.tsx`, `apps/mobile/src/features/TripBoard.tsx`, and `apps/mobile/src/features/AllTimeBoard.tsx` to remove `Glow`, add stacked pill `Choice` bars, and render `ProportionalBarRow` lists.
   - Refactor `apps/mobile/src/features/PersonalLimits.tsx`, `apps/mobile/src/screens/SettleUp.tsx`, and `apps/mobile/src/features/Backing.tsx` to use `QuotaCard` / `QuotaBar`.
   - Refactor `apps/mobile/src/screens/Group.tsx`, `apps/mobile/src/features/You.tsx`, and `apps/mobile/src/screens/GroupSettings.tsx` into the unified `SettingsGroup` / `SettingsRow` layout.
5. **Phase 5 — Verification**:
   - Run `pnpm install` (if needed in the worktree), `pnpm fmt`, `pnpm lint`, `pnpm knip`, `pnpm typecheck`, and `pnpm test`.
   - Inspect all 4 tabs in light and dark modes on a simulator via T3 Code device tools (`device_list` $\rightarrow$ `device_open` $\rightarrow$ `device_screenshot`) against the `emil-ui-review` checklist.
