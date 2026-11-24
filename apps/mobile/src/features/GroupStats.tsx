import {
  groupStatsView,
  type GroupStatsView as View_,
  type Line,
  type Who,
} from "@stacks/client-runtime/groupStats";
import { savedLine } from "@stacks/client-runtime/statsCopy";
import type { StatsFilters } from "@stacks/client-runtime/stats";
import { ordinal } from "@stacks/client-runtime/trip";
import type { CurrencyCode, GroupId, PlayerId, TripId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Match from "effect/Match";
import { useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Choice } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { useGo } from "../lib/go";
import { HIDDEN_AMOUNT_LABEL, usePreferences } from "../lib/preferences";
import { useLargeText } from "../lib/useLargeText";
import { useGroupStats } from "../lib/stacks";
import { InsightRow, LineText, ResultBars } from "./GroupStatsParts";
import { Dash, ReturnFigure, Tile } from "./PersonalStats";
import { PlayerChip } from "./PlayerChip";
import { GroupStatsSkeleton } from "./ScreenSkeletons";
import {
  AndroidStatsEmpty,
  ByCasino,
  ByGame,
  Figure,
  Filters,
  StatsContent,
  StatsHeading,
  signed,
} from "./StatsParts";

const provenance = "Only sessions recorded in this group.\nDevice-only play stays in Just me.";

type Shown = Extract<View_, { kind: "stats" }>;

type Standing = Shown["standings"][number];

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * A group's stats in Stats: its result by trip, the standings, what the crew did together, its
 * trips, habits and records, and the result by game and casino. Offline it shows the last copy and
 * when it was saved.
 */
export function GroupStatsView({
  groupId,
  groupName,
  currentTripId,
  liveTrips,
  chip,
  filters,
  onFilters,
  onJustMe,
}: {
  groupId: GroupId;
  groupName: string;
  currentTripId: TripId | null;
  liveTrips: ReadonlySet<string>;
  chip: ReactNode;
  filters: StatsFilters;
  onFilters: (filters: StatsFilters) => void;
  onJustMe: () => void;
}) {
  const state = useGroupStats(groupId);
  const go = useGo();
  const android = Platform.OS === "android";
  const prefs = usePreferences();

  const justMe = (
    <Button
      label="Just me"
      variant="primary"
      size="lg"
      className="mt-2 self-stretch"
      onPress={onJustMe}
    />
  );

  const groupChip = <Filters lead={chip} chips={[]} filtered={false} onChange={onFilters} />;

  if (state.kind === "loading")
    return (
      <StatsContent filters={android ? groupChip : undefined}>
        <GroupStatsSkeleton chips={!android} />
      </StatsContent>
    );

  if (state.kind === "refused" || state.kind === "unavailable")
    return (
      <StatsContent filters={groupChip}>
        {android ? (
          <AndroidStatsEmpty
            icon={state.kind === "refused" ? "alert" : "cloud-off"}
            title={
              state.kind === "refused"
                ? "Can't show this group"
                : `${groupName} isn’t available offline yet`
            }
            body={
              state.kind === "refused"
                ? state.message
                : "Connect to load this group’s stats. Your own saved stats are available."
            }
            button="Show Just me"
            onPress={onJustMe}
          />
        ) : (
          <EmptyState
            centered
            title={
              state.kind === "refused" ? "Can't show this group" : "Group stats need a connection"
            }
            action={justMe}
          >
            {state.kind === "refused"
              ? state.message
              : "This phone hasn't saved this group's stats yet. Your own stats work offline."}
          </EmptyState>
        )}
      </StatsContent>
    );

  const { detail, stats } = state.kind === "live" ? state : state.copy;
  const name = detail.group.name;
  const view = groupStatsView(stats, detail, filters, prefs);
  const activeTrip = currentTripId ?? detail.trips.find((trip) => trip.endedAt === null)?.id;
  const tripRange = filters.tripId && view.trips.byId.get(filters.tripId)?.range;

  return (
    <StatsContent
      filters={
        <Filters
          lead={chip}
          chips={view.chips}
          filtered={view.filtered}
          onChange={onFilters}
          trips={view.trips}
          groupName={name}
          liveTrips={liveTrips}
        />
      }
    >
      {state.kind === "saved" ? (
        android ? (
          <OfflineBanner fetchedAt={state.copy.fetchedAt} />
        ) : (
          <Text className="type-footnote text-muted">
            {`${savedLine(state.copy.fetchedAt)}. You're offline, so this may be behind.`}
          </Text>
        )
      ) : null}
      {android && tripRange ? (
        <Text className="px-1 type-footnote text-muted">{tripRange} · Whole trip</Text>
      ) : null}
      {Match.value(view).pipe(
        Match.when({ kind: "empty" }, () =>
          android ? (
            <AndroidStatsEmpty
              icon="group"
              title="No finished sessions yet"
              body={`When someone finishes a session in ${name}, everyone’s results will appear here.`}
              button="Start a group session"
              onPress={() => (activeTrip ? go.trip(activeTrip) : go.group(groupId))}
              note="Only play recorded in this group counts here."
            />
          ) : (
            <EmptyState centered title="No finished sessions yet" action={justMe}>
              {`${name}'s stats count the finished sessions in its trips.`}
            </EmptyState>
          ),
        ),
        Match.when({ kind: "no_match" }, (filtered) =>
          android ? (
            <AndroidStatsEmpty
              icon="search"
              title="No matching sessions"
              body={filtered.sentence.replace(/^No finished /, "No ")}
              button="Clear filters"
              onPress={() => onFilters({})}
              note="Your group stays selected."
            />
          ) : (
            <EmptyState
              centered
              title="No matching sessions"
              action={
                <Button
                  label="Reset all filters"
                  variant="primary"
                  size="lg"
                  className="mt-2 self-stretch"
                  onPress={() => onFilters({})}
                />
              }
            >
              {filtered.sentence}
            </EmptyState>
          ),
        ),
        Match.orElse((shown) => (
          <ShownStats view={shown} me={detail.myPlayerId} groupName={name} onFilter={onFilters} />
        )),
      )}
    </StatsContent>
  );
}

function OfflineBanner({ fetchedAt }: { fetchedAt: DateTime.Utc }) {
  const local = DateTime.setZone(fetchedAt, DateTime.zoneMakeLocal());

  const date = DateTime.format(local, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const time = DateTime.format(local, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View
      className="flex-row items-center gap-3 rounded-2xl bg-fill p-3.5"
      accessibilityLiveRegion="polite"
    >
      <Icon name="cloud-off" color="muted" size={24} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-ink">Offline · Showing saved stats</Text>
        <Text className="type-footnote text-muted">{`Last fetched ${date} at ${time}`}</Text>
      </View>
    </View>
  );
}

function ShownStats({
  view,
  me,
  groupName,
  onFilter,
}: {
  view: Shown;
  me: PlayerId;
  groupName: string;
  onFilter: (filters: StatsFilters) => void;
}) {
  const android = Platform.OS === "android";
  const [open, setOpen] = useState<PlayerId | null>(null);
  const selected = view.standings.find((row) => row.playerId === open);

  return (
    <>
      <Hero view={view} onFilter={onFilter} />
      <Standings view={view} onOpen={(row) => setOpen(row.playerId)} />
      {view.together ? (
        <InsightSection title="Together" rows={view.together} currency={view.currency} />
      ) : null}
      {view.tripList ? (
        <Trips
          list={view.tripList}
          title={view.title}
          currency={view.currency}
          onFilter={onFilter}
        />
      ) : null}
      {view.awards && view.awards.length > 0 ? (
        <View className="gap-2">
          <StatsHeading>Awards</StatsHeading>
          <List>
            {view.awards.map((award) => (
              <Row key={award.key} className={android ? "py-2.5" : undefined}>
                <PlayerChip
                  playerId={award.playerId}
                  chip={award.chip}
                  name={android ? award.name.slice(0, 1) : award.name}
                  size={28}
                  ring={android}
                />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="type-heading text-ink">{award.title}</Text>
                  <Text className="type-footnote text-muted">{`${award.name}${android && award.playerId === me ? " (you)" : ""} · ${award.line}`}</Text>
                </View>
              </Row>
            ))}
          </List>
        </View>
      ) : null}
      {view.habits ? (
        <InsightSection title="Habits" rows={view.habits} currency={view.currency} />
      ) : null}
      {view.records ? (
        <InsightSection title="Records" rows={view.records} currency={view.currency} />
      ) : null}
      {view.byGame ? (
        <ByGame rows={view.byGame} currency={view.currency} onFilter={onFilter} />
      ) : null}
      {view.byCasino ? (
        <ByCasino
          rows={view.byCasino}
          currency={view.currency}
          line={`${view.title} · ${view.sessions} ${view.sessions === 1 ? "table" : "tables"}`}
          onFilter={onFilter}
        />
      ) : null}
      {selected ? (
        <StatSheet
          row={selected}
          groupName={groupName}
          players={view.standings.length}
          title={view.title}
          currency={view.currency}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function Hero({ view, onFilter }: { view: Shown; onFilter: (filters: StatsFilters) => void }) {
  const { hero } = view;
  const large = useLargeText();

  return (
    <View className="overflow-hidden rounded-[22px] bg-surface">
      <View className="px-5 pt-5">
        <View className={large ? "gap-1" : "flex-row items-baseline justify-between gap-3"}>
          <Text
            accessibilityRole="header"
            className={cn("type-label text-muted", !large && "min-w-0 flex-1")}
          >
            {hero.kicker}
          </Text>
          <Text className={cn("type-footnote text-muted", !large && "shrink-0")}>
            {`${hero.players} ${hero.players === 1 ? "player" : "players"} · ${hero.tables} ${hero.tables === 1 ? "table" : "tables"}`}
          </Text>
        </View>
        <Money
          amount={hero.result}
          currency={view.currency}
          tone="result"
          fit
          className="mt-1.5 type-hero"
        />
        {hero.up ? (
          <Text className="mt-1 type-footnote text-muted">
            {`Up on ${hero.up.up} of ${hero.up.of} finished ${hero.up.of === 1 ? "trip" : "trips"}`}
          </Text>
        ) : null}
      </View>
      {hero.chart ? (
        <ResultBars chart={hero.chart} currency={view.currency} onOpen={onFilter} />
      ) : (
        <View className="h-5" />
      )}
      <View className={cn("border-t border-line", !large && "flex-row")}>
        <Tile label="Your place">
          {hero.place ? (
            <Text numberOfLines={1} className="type-number text-ink">
              {hero.place.label}
              <Text className="type-footnote text-muted">{` of ${hero.place.of}`}</Text>
            </Text>
          ) : (
            <Dash />
          )}
        </Tile>
        <Tile label="Your result" divided>
          {hero.yours === null ? (
            <Dash />
          ) : (
            <Money
              amount={hero.yours}
              currency={view.currency}
              tone="result"
              fit
              className="type-number"
            />
          )}
        </Tile>
        <Tile label="Return" divided>
          <ReturnFigure figure={hero.returnRate} />
        </Tile>
      </View>
    </View>
  );
}

const modes = [
  { value: "result", label: "Result" },
  { value: "return", label: "Return" },
] as const;

function Standings({ view, onOpen }: { view: Shown; onOpen: (row: Standing) => void }) {
  const prefs = usePreferences();
  const android = Platform.OS === "android";
  const large = useLargeText();
  const [picked, setPicked] = useState<(typeof modes)[number]["value"]>("result");
  const mode = view.byReturn === null ? "result" : picked;
  const rows = mode === "return" && view.byReturn ? view.byReturn : view.standings;

  return (
    <View className="gap-2">
      <StatsHeading count={android ? plural(view.sessions, "table") : view.title}>
        Standings
      </StatsHeading>
      {view.byReturn ? (
        <Choice label="Rank by" labelHidden options={modes} value={mode} onChange={setPicked} />
      ) : null}
      <List>
        {rows.map((row) => {
          const count = row.sheet.sessions;
          const rate = row.rate;

          const meta = android
            ? [
                row.guest ? "Guest" : null,
                count === 0 ? "No sessions" : `${count} ${count === 1 ? "session" : "sessions"}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : row.meta;

          const figure =
            mode === "return"
              ? prefs.privacyMode
                ? HIDDEN_AMOUNT_LABEL
                : rate === null || rate.tone === "none"
                  ? "Not available"
                  : rate.label
              : signed(row.result, view.currency, prefs, true);

          return (
            <Row
              key={row.playerId}
              onPress={() => onOpen(row)}
              accessibilityLabel={`${row.rank === null ? "Unranked" : `Rank ${row.rank}`}, ${row.name}${row.you ? ", you" : ""}, ${meta}, ${figure}`}
              accessibilityHint="Shows their stats"
              className={cn(
                android
                  ? "relative min-h-14 gap-2 px-4 py-2.5"
                  : row.you && "border-l-[3px] border-l-ink",
                large && "flex-col items-stretch gap-2",
              )}
            >
              {android && row.you ? (
                <View className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-ink" />
              ) : null}
              <View className={cn("min-w-0 flex-row items-center gap-3", !large && "flex-1")}>
                <Text
                  className={cn(
                    "text-center tabular-nums text-muted",
                    android ? "min-w-4 text-sm" : "min-w-6 text-base",
                  )}
                >
                  {row.rank ?? "–"}
                </Text>
                <PlayerChip
                  playerId={row.playerId}
                  chip={row.chip}
                  name={android ? row.name.slice(0, 1) : row.name}
                  size={android ? 30 : 28}
                  ring={android}
                />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text
                    numberOfLines={large ? undefined : android ? 2 : 1}
                    className={cn("text-ink", android ? "text-sm font-semibold" : "type-heading")}
                  >
                    {row.name}
                    {row.you ? (
                      <Text className="font-normal text-muted">
                        {android ? " · You" : " · you"}
                      </Text>
                    ) : null}
                  </Text>
                  <Text numberOfLines={large ? undefined : 1} className="type-footnote text-muted">
                    {meta}
                  </Text>
                </View>
                {large ? <Icon name="chevron-right" color="faint" size={16} /> : null}
              </View>
              {mode === "return" ? (
                rate && rate.tone !== "none" ? (
                  <ReturnFigure figure={rate} />
                ) : (
                  <Dash />
                )
              ) : (
                <Money
                  amount={row.result}
                  currency={view.currency}
                  tone="result"
                  fit={android || large}
                  className={android ? "font-semibold" : "type-number"}
                />
              )}
              {large ? null : <Icon name="chevron-right" color="faint" size={16} />}
            </Row>
          );
        })}
      </List>
      {view.footnote && mode === "result" ? (
        <LineText
          line={view.footnote}
          currency={view.currency}
          className="px-1 type-footnote text-muted"
        />
      ) : null}
      {android ? <Text className="mt-2 px-1 type-footnote text-muted">{provenance}</Text> : null}
    </View>
  );
}

function InsightSection({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: ReadonlyArray<{
    readonly key: string;
    readonly people: ReadonlyArray<Who>;
    readonly title: string;
    readonly line: Line;
    readonly trailing: Line | null;
  }>;
  currency: CurrencyCode;
}) {
  return (
    <View className="gap-2">
      <StatsHeading>{title}</StatsHeading>
      <List>
        {rows.map((row) => (
          <InsightRow
            key={row.key}
            people={row.people}
            title={row.title}
            line={row.line}
            trailing={row.trailing}
            currency={currency}
          />
        ))}
      </List>
    </View>
  );
}

type TripList = NonNullable<Shown["tripList"]>;

function TripRows({
  rows,
  currency,
  onOpen,
}: {
  rows: TripList["rows"];
  currency: CurrencyCode;
  onOpen: (filters: StatsFilters) => void;
}) {
  return rows.map((row) => (
    <InsightRow
      key={row.key}
      people={row.leaders}
      title={row.name}
      line={row.line}
      trailing={[{ amount: row.result, tone: "result" }]}
      currency={currency}
      hint="Shows only this trip"
      onPress={() => onOpen(row.filters)}
    />
  ));
}

function Trips({
  list,
  title,
  currency,
  onFilter,
}: {
  list: TripList;
  title: string;
  currency: CurrencyCode;
  onFilter: (filters: StatsFilters) => void;
}) {
  const [all, setAll] = useState(false);
  const android = Platform.OS === "android";

  return (
    <View className="gap-2">
      <StatsHeading {...(list.wins ? { count: list.wins } : {})}>Trips</StatsHeading>
      <List>
        <TripRows rows={list.rows} currency={currency} onOpen={onFilter} />
        {list.all ? (
          <Row
            onPress={() => setAll(true)}
            accessibilityLabel={`All ${list.all.length} trips`}
            accessibilityHint="Lists every trip"
          >
            <Text className="flex-1 type-body text-ink">{`All ${list.all.length} trips`}</Text>
            <Icon name="chevron-right" color="faint" size={16} />
          </Row>
        ) : null}
      </List>
      {all && list.all ? (
        <Sheet
          open
          title="Trips"
          description={android ? undefined : `${title} · ${list.all.length} trips`}
          onClose={() => setAll(false)}
        >
          <List>
            <TripRows
              rows={list.all}
              currency={currency}
              onOpen={(filters) => {
                setAll(false);
                onFilter(filters);
              }}
            />
          </List>
        </Sheet>
      ) : null}
    </View>
  );
}

function StatSheet({
  row,
  groupName,
  players,
  title,
  currency,
  onClose,
}: {
  row: Standing;
  groupName: string;
  players: number;
  title: string;
  currency: CurrencyCode;
  onClose: () => void;
}) {
  const { sheet } = row;
  const android = Platform.OS === "android";

  const numbers = (
    <View className="flex-row flex-wrap gap-y-4">
      <Figure label="Sessions">
        <Text className="type-heading text-ink">{sheet.sessions}</Text>
      </Figure>
      <Figure label="Hours">
        <Text className="type-heading text-ink">{sheet.hours}</Text>
      </Figure>
      <Figure label="Per hour">
        <Money
          amount={sheet.hourlyResult}
          currency={currency}
          tone="result"
          className="text-[17px] font-semibold"
        />
      </Figure>
      <Figure
        label="Win rate"
        {...(sheet.sessions > 0 ? { sub: sheet.winRateLine + (android ? " sessions" : "") } : {})}
      >
        <Text className="type-heading text-ink">{sheet.winRate}</Text>
      </Figure>
    </View>
  );

  const result = (
    <Money amount={sheet.result} currency={currency} tone="result" fit className="type-hero" />
  );

  return (
    <Sheet
      open
      title={row.name}
      description={
        android
          ? undefined
          : row.rank === null
            ? `${title} · No sessions`
            : `${title} · Rank ${row.rank}`
      }
      onClose={onClose}
    >
      {android ? (
        <View className="gap-4">
          <View className="flex-row items-center justify-center gap-2">
            <PlayerChip
              playerId={row.playerId}
              chip={row.chip}
              name={row.name.slice(0, 1)}
              size={23}
              ring
            />
            <Text className="type-footnote text-muted">
              {groupName} · {title}
            </Text>
          </View>
          <View className="gap-3 rounded-[22px] bg-fill p-4">
            <View className="gap-0.5">
              <Text className="type-label text-muted">Result</Text>
              {result}
              <Text className="type-footnote text-muted">
                {row.rank === null
                  ? "No sessions"
                  : `${ordinal(row.rank)} of ${players} ${players === 1 ? "player" : "players"}`}
              </Text>
            </View>
            {numbers}
          </View>
          {row.best ? (
            <View className="flex-row items-center gap-2 rounded-[22px] bg-fill px-4 py-2.5">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-sm font-semibold text-ink">Best session</Text>
                <Text className="type-footnote text-muted">{row.best.line}</Text>
              </View>
              <Money
                amount={row.best.result}
                currency={currency}
                tone="result"
                fit
                className="font-semibold"
              />
            </View>
          ) : null}
          <Text className="px-1 type-footnote text-muted">{provenance}</Text>
        </View>
      ) : (
        <View className="gap-6">
          {result}
          {numbers}
        </View>
      )}
    </Sheet>
  );
}
