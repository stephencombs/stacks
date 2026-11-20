import { groupStatsView, type GroupStatsView as View_ } from "@stacks/client-runtime/groupStats";
import { savedLine } from "@stacks/client-runtime/statsCopy";
import type { StatsFilters } from "@stacks/client-runtime/stats";
import type { CurrencyCode, GroupId, PlayerId } from "@stacks/contracts";
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { usePreferences } from "../lib/preferences";
import { useGroupStats } from "../lib/stacks";
import { Chip } from "./Chip";
import { Race } from "./Race";
import { ByCasino, ByGame, Figure, Filters, signed } from "./StatsParts";

type Shown = Extract<View_, { kind: "stats" }>;
type Standing = Shown["standings"][number];

/**
 * A group's stats in Stats: standings first, then everyone's running result, a trip's awards, and
 * the group's result by game and casino. Offline it shows the last copy and when it was saved.
 */
export function GroupStatsView({
  groupId,
  chip,
  filters,
  onFilters,
  onJustMe,
}: {
  groupId: GroupId;
  chip: ReactNode;
  filters: StatsFilters;
  onFilters: (filters: StatsFilters) => void;
  onJustMe: () => void;
}) {
  const state = useGroupStats(groupId);
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
  if (state.kind === "loading")
    return (
      <View className="gap-6">
        <View className="flex-row gap-2">
          <Skeleton className="h-11 w-32 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
        </View>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </View>
    );
  if (state.kind === "refused" || state.kind === "unavailable")
    return (
      <>
        <Filters lead={chip} chips={[]} filtered={false} onChange={onFilters} />
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
      </>
    );

  const { detail, stats } = state.kind === "live" ? state : state.copy;
  const view = groupStatsView(stats, detail, filters, prefs);
  return (
    <>
      <Filters lead={chip} chips={view.chips} filtered={view.filtered} onChange={onFilters} />
      {state.kind === "saved" ? (
        <Text className="type-footnote text-muted">
          {`${savedLine(state.copy.fetchedAt)}. You're offline, so this may be behind.`}
        </Text>
      ) : null}
      {view.kind === "empty" ? (
        <EmptyState centered title="No finished sessions yet" action={justMe}>
          {`${detail.group.name}'s stats count the finished sessions in its trips.`}
        </EmptyState>
      ) : view.kind === "no_match" ? (
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
          {view.sentence}
        </EmptyState>
      ) : (
        <ShownStats view={view} me={detail.myPlayerId} onFilter={onFilters} />
      )}
    </>
  );
}

function ShownStats({
  view,
  me,
  onFilter,
}: {
  view: Shown;
  me: PlayerId;
  onFilter: (filters: StatsFilters) => void;
}) {
  const [open, setOpen] = useState<Standing | null>(null);
  const racers = view.standings.filter((row) => row.rank !== null);
  const leader = racers.some((row) => row.playerId === me) ? me : racers[0]?.playerId;
  return (
    <>
      <Standings view={view} onOpen={setOpen} />
      {view.sessions > 1 && leader !== undefined ? (
        <View className="gap-2">
          <SectionHeading>Running result</SectionHeading>
          <Race
            sessions={view.race.sessions}
            players={racers}
            currency={view.currency}
            picked={leader}
            marks={view.race.marks}
            where={(session) => session.where}
            latest={view.title}
          />
        </View>
      ) : null}
      {view.awards && view.awards.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Awards</SectionHeading>
          <List>
            {view.awards.map((award) => (
              <Row key={award.key}>
                <Chip chip={award.chip} name={award.name} size={28} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="type-heading text-ink">{award.title}</Text>
                  <Text className="type-footnote text-muted">{`${award.name} · ${award.line}`}</Text>
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
          line={`${view.title} · ${view.sessions} finished ${view.sessions === 1 ? "session" : "sessions"}`}
          onFilter={onFilter}
        />
      ) : null}
      {open ? (
        <StatSheet
          row={open}
          title={view.title}
          currency={view.currency}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/** Everyone ranked by result, you marked, the group's result under them. */
function Standings({ view, onOpen }: { view: Shown; onOpen: (row: Standing) => void }) {
  const prefs = usePreferences();
  return (
    <View className="gap-2">
      <SectionHeading count={view.title}>Standings</SectionHeading>
      <List>
        {view.standings.map((row) => (
          <Row
            key={row.playerId}
            onPress={() => onOpen(row)}
            accessibilityLabel={`${row.rank === null ? "Unranked" : `Rank ${row.rank}`}, ${row.name}${row.you ? ", you" : ""}, ${row.meta}, ${signed(row.result, view.currency, prefs, true)}`}
            accessibilityHint="Shows their stats"
            className={cn(row.you && "border-l-[3px] border-l-ink")}
          >
            <Text className="min-w-6 text-center tabular-nums text-base text-muted">
              {row.rank ?? "–"}
            </Text>
            <Chip chip={row.chip} name={row.name} size={28} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="type-heading text-ink">
                {row.name}
                {row.you ? <Text className="font-normal text-muted"> · you</Text> : null}
              </Text>
              <Text numberOfLines={1} className="type-footnote text-muted">
                {row.meta}
              </Text>
            </View>
            <Money
              amount={row.result}
              currency={view.currency}
              tone="result"
              className="type-number"
            />
          </Row>
        ))}
        <Row>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="type-heading text-ink">Group result</Text>
            <Text className="type-footnote text-muted">
              {`${view.sessions} ${view.sessions === 1 ? "session" : "sessions"}`}
            </Text>
          </View>
          <Money
            amount={view.total}
            currency={view.currency}
            tone="result"
            className="type-number"
          />
        </Row>
      </List>
    </View>
  );
}

/** One member's numbers over what's shown. */
function StatSheet({
  row,
  title,
  currency,
  onClose,
}: {
  row: Standing;
  title: string;
  currency: CurrencyCode;
  onClose: () => void;
}) {
  const { sheet } = row;
  return (
    <Sheet
      open
      title={row.name}
      description={row.rank === null ? `${title} · No sessions` : `${title} · Rank ${row.rank}`}
      onClose={onClose}
    >
      <View className="gap-6">
        <Money amount={sheet.result} currency={currency} tone="result" fit className="type-hero" />
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
          <Figure label="Win rate" {...(sheet.sessions > 0 ? { sub: sheet.winRateLine } : {})}>
            <Text className="type-heading text-ink">{sheet.winRate}</Text>
          </Figure>
        </View>
      </View>
    </Sheet>
  );
}
