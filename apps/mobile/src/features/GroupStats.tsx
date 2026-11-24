import { groupStatsView, type GroupStatsView as View_ } from "@stacks/client-runtime/groupStats";
import { savedLine } from "@stacks/client-runtime/statsCopy";
import { finishedSessions, type StatsFilters } from "@stacks/client-runtime/stats";
import { ordinal } from "@stacks/client-runtime/trip";
import type { CurrencyCode, GroupId, PlayerId, TripId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Match from "effect/Match";
import { useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { useGo } from "../lib/go";
import { usePreferences } from "../lib/preferences";
import { useGroupStats } from "../lib/stacks";
import { Chip } from "./Chip";
import { Race } from "./Race";
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

/**
 * A group's stats in Stats: standings first, then everyone's running result, a trip's awards, and
 * the group's result by game and casino. Offline it shows the last copy and when it was saved.
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
        <View className="gap-6">
          {android ? null : (
            <View className="flex-row gap-2">
              <Skeleton className="h-11 w-32 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
            </View>
          )}
          <Skeleton className="h-72 w-full rounded-2xl" />
        </View>
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
  const racers = view.standings.filter((row) => row.rank !== null);
  const leader = racers.some((row) => row.playerId === me) ? me : racers[0]?.playerId;

  return (
    <>
      <Standings view={view} onOpen={(row) => setOpen(row.playerId)} />
      {view.sessions > 1 && leader !== undefined ? (
        <View className="gap-2">
          <StatsHeading count={android ? "By finished session" : undefined}>
            Running result
          </StatsHeading>
          <Race
            sessions={view.race.sessions}
            players={racers}
            currency={view.currency}
            picked={leader}
            marks={view.race.marks}
            where={(session) => session.where}
            latest={view.title}
            stats={android}
            you={me}
          />
        </View>
      ) : null}
      {view.awards && view.awards.length > 0 ? (
        <View className="gap-2">
          <StatsHeading>Awards</StatsHeading>
          <List>
            {view.awards.map((award) => (
              <Row key={award.key} className={android ? "py-2.5" : undefined}>
                <Chip
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
      {view.byGame ? (
        <ByGame rows={view.byGame} currency={view.currency} onFilter={onFilter} />
      ) : null}
      {view.byCasino ? (
        <ByCasino
          rows={view.byCasino}
          currency={view.currency}
          line={`${view.title} · ${finishedSessions(view.sessions)}`}
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

function Standings({ view, onOpen }: { view: Shown; onOpen: (row: Standing) => void }) {
  const prefs = usePreferences();
  const android = Platform.OS === "android";

  return (
    <View className="gap-2">
      <StatsHeading count={android ? finishedSessions(view.sessions) : view.title}>
        Standings
      </StatsHeading>
      <List>
        {view.standings.map((row) => {
          const count = row.sheet.sessions;

          const meta = android
            ? [
                row.guest ? "Guest" : null,
                count === 0 ? "No sessions" : `${count} ${count === 1 ? "session" : "sessions"}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : row.meta;

          return (
            <Row
              key={row.playerId}
              onPress={() => onOpen(row)}
              accessibilityLabel={`${row.rank === null ? "Unranked" : `Rank ${row.rank}`}, ${row.name}${row.you ? ", you" : ""}, ${meta}, ${signed(row.result, view.currency, prefs, true)}`}
              accessibilityHint="Shows their stats"
              className={cn(
                android
                  ? "relative min-h-14 gap-2 px-4 py-2.5"
                  : row.you && "border-l-[3px] border-l-ink",
              )}
            >
              {android && row.you ? (
                <View className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-ink" />
              ) : null}
              <Text
                className={cn(
                  "text-center tabular-nums text-muted",
                  android ? "min-w-4 text-sm" : "min-w-6 text-base",
                )}
              >
                {row.rank ?? "–"}
              </Text>
              <Chip
                chip={row.chip}
                name={android ? row.name.slice(0, 1) : row.name}
                size={android ? 30 : 28}
                ring={android}
              />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text
                  numberOfLines={android ? 2 : 1}
                  className={cn("text-ink", android ? "text-sm font-semibold" : "type-heading")}
                >
                  {row.name}
                  {row.you ? (
                    <Text className="font-normal text-muted">{android ? " · You" : " · you"}</Text>
                  ) : null}
                </Text>
                <Text numberOfLines={1} className="type-footnote text-muted">
                  {meta}
                </Text>
              </View>
              <Money
                amount={row.result}
                currency={view.currency}
                tone="result"
                fit={android}
                className={android ? "font-semibold" : "type-number"}
              />
              {android ? <Icon name="chevron-right" color="faint" size={16} /> : null}
            </Row>
          );
        })}
        <Row className={android ? "py-3" : undefined}>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className={android ? "text-sm text-muted" : "type-heading text-ink"}>
              Group result
            </Text>
            {android ? null : (
              <Text className="type-footnote text-muted">
                {`${view.sessions} ${view.sessions === 1 ? "session" : "sessions"}`}
              </Text>
            )}
          </View>
          <Money
            amount={view.total}
            currency={view.currency}
            tone="result"
            className="type-number"
          />
        </Row>
      </List>
      {android ? <Text className="mt-2 px-1 type-footnote text-muted">{provenance}</Text> : null}
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
            <Chip chip={row.chip} name={row.name.slice(0, 1)} size={23} ring />
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
