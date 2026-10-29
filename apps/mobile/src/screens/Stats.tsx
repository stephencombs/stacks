import type { StaticScreenProps } from "@react-navigation/native";
import { GroupId, type GroupDetail, type GroupStats, type PlayerResult } from "@stacks/contracts";
import { gameNames, playedSummary, playerNames, whose } from "@stacks/client-runtime/format";
import { netFor, type Subject } from "@stacks/shared/results";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Screen } from "../components/ui/Screen";
import { EmptyState, List, Row, SectionHeading, Skeleton, Surface } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { NetChart } from "../features/NetChart";
import { SessionBars } from "../features/SessionBars";
import { Standings } from "../features/Standings";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function StatsScreen({ route }: Props) {
  const stacks = useStacks();
  const groupId = GroupId.make(route.params.groupId);
  return (
    <Screen>
      <Loaded query={stacks.group(groupId)} skeleton={<Skeleton className="h-96" />}>
        {(detail) => (
          <Loaded query={stacks.stats(groupId)} skeleton={<Skeleton className="h-64" />}>
            {(stats) => <StatsView detail={detail} stats={stats} />}
          </Loaded>
        )}
      </Loaded>
    </Screen>
  );
}

const charts = [
  { key: "each", label: "Each session" },
  { key: "total", label: "Running total" },
] as const;

function StatsView({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  const me = detail.myPlayerId;
  const [chart, setChart] = useState<(typeof charts)[number]["key"]>("each");
  const [subject, setSubject] = useState<Subject>(() =>
    stats.byPlayer.some((result) => result.playerId === me) ? me : "group",
  );
  const currency = detail.group.currency;
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        Stats count closed sessions, so close one to see how everyone's doing.
      </EmptyState>
    );
  }
  const owner = whose(subject, me, playerNames(detail));
  const net = (results: ReadonlyArray<PlayerResult>) => {
    const amount = netFor(results, subject);
    return amount === undefined ? (
      <Text className="text-muted">—</Text>
    ) : (
      <Money amount={amount} currency={currency} tone="result" className="text-base" />
    );
  };

  return (
    <>
      <Text className="text-base text-muted">
        {playedSummary(stats.sessionCount, stats.minutesPlayed)}
      </Text>
      <View className="gap-2">
        <SectionHeading>Standings</SectionHeading>
        <Standings detail={detail} stats={stats} me={me} selected={subject} onSelect={setSubject} />
      </View>
      <View className="gap-2">
        <SectionHeading>{`${owner} sessions`}</SectionHeading>
        <Surface className="gap-4 p-4">
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Chart"
            className="flex-row gap-1 self-start rounded-xl bg-sunken p-1"
          >
            {charts.map((option) => {
              const selected = chart === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setChart(option.key)}
                  className={cn(
                    "min-h-10 justify-center rounded-lg px-3",
                    selected ? "bg-accent" : "active:opacity-70",
                  )}
                >
                  <Text
                    className={cn(
                      "text-xs font-semibold tracking-[1.5px] uppercase",
                      selected ? "text-accent-ink" : "text-muted",
                    )}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {chart === "each" ? (
            <SessionBars stats={stats} subject={subject} whose={owner} currency={currency} />
          ) : (
            <NetChart stats={stats} subject={subject} whose={owner} currency={currency} />
          )}
        </Surface>
      </View>
      <View className="gap-2">
        <SectionHeading>{`${owner} results by game`}</SectionHeading>
        <List>
          {stats.byGame.map((row) => (
            <Row key={row.key}>
              <Text className="flex-1 text-base text-ink">
                {gameNames[row.key]}{" "}
                <Text className="text-sm text-muted">· {row.sessionCount}</Text>
              </Text>
              {net(row.results)}
            </Row>
          ))}
        </List>
      </View>
      <View className="gap-2">
        <SectionHeading>{`${owner} results by venue`}</SectionHeading>
        <List>
          {stats.byVenue.map((row) => (
            <Row key={row.key.id}>
              <Text numberOfLines={1} className="flex-1 text-base text-ink">
                {row.key.name} <Text className="text-sm text-muted">· {row.sessionCount}</Text>
              </Text>
              {net(row.results)}
            </Row>
          ))}
        </List>
      </View>
    </>
  );
}
