import type { StaticScreenProps } from "@react-navigation/native";
import { GroupId, type GroupDetail, type GroupStats, type PlayerResult } from "@stacks/contracts";
import { gameNames, playerNames } from "@stacks/client-runtime/format";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Screen } from "../components/ui/Screen";
import { EmptyState, List, Row, SectionHeading, Skeleton, Surface } from "../components/ui/Surface";
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

function StatsView({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  const names = playerNames(detail);
  const currency = detail.group.currency;
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        Stats count closed sessions, so close one to see how everyone's doing.
      </EmptyState>
    );
  }
  const mine = (results: ReadonlyArray<PlayerResult>) =>
    results.find((r) => r.playerId === detail.myPlayerId);
  const tile = (label: string, value: string) => (
    <Surface className="flex-1 gap-1 px-4 py-3">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="font-serif text-3xl text-ink tabular-nums">{value}</Text>
    </Surface>
  );

  return (
    <>
      <View className="flex-row gap-3">
        {tile("Sessions", String(stats.sessionCount))}
        {tile("Hours played", String(Math.round(stats.minutesPlayed / 6) / 10))}
      </View>
      <View className="gap-2">
        <SectionHeading>Everyone, all time</SectionHeading>
        <List>
          {stats.byPlayer
            .toSorted((a, b) => b.net - a.net)
            .map((result) => (
              <Row key={result.playerId}>
                <Text className="flex-1 text-base text-ink">{names.get(result.playerId)}</Text>
                <Money
                  amount={result.net}
                  currency={currency}
                  tone="result"
                  className="text-base font-medium"
                />
              </Row>
            ))}
        </List>
      </View>
      <View className="gap-2">
        <SectionHeading>Your results by game</SectionHeading>
        <List>
          {stats.byGame.map((row) => {
            const result = mine(row.results);
            return (
              <Row key={row.key}>
                <Text className="flex-1 text-base text-ink">
                  {gameNames[row.key]}{" "}
                  <Text className="text-sm text-muted">· {row.sessionCount}</Text>
                </Text>
                {result ? (
                  <Money
                    amount={result.net}
                    currency={currency}
                    tone="result"
                    className="text-base"
                  />
                ) : (
                  <Text className="text-muted">—</Text>
                )}
              </Row>
            );
          })}
        </List>
      </View>
      <View className="gap-2">
        <SectionHeading>Your results by venue</SectionHeading>
        <List>
          {stats.byVenue.map((row) => {
            const result = mine(row.results);
            return (
              <Row key={row.key.id}>
                <Text numberOfLines={1} className="flex-1 text-base text-ink">
                  {row.key.name} <Text className="text-sm text-muted">· {row.sessionCount}</Text>
                </Text>
                {result ? (
                  <Money
                    amount={result.net}
                    currency={currency}
                    tone="result"
                    className="text-base"
                  />
                ) : (
                  <Text className="text-muted">—</Text>
                )}
              </Row>
            );
          })}
        </List>
      </View>
    </>
  );
}
