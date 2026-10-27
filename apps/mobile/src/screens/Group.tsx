import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { GroupId, MinorUnits, type GroupDetail } from "@stacks/contracts";
import { useLayoutEffect } from "react";
import { Text, View } from "react-native";

import { BalanceLabel } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Screen } from "../components/ui/Screen";
import { EmptyState, Row, SectionHeading, Skeleton, Surface } from "../components/ui/Surface";
import { SessionList } from "../features/SessionList";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function GroupScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.group(GroupId.make(route.params.groupId))}
        skeleton={<Skeleton className="h-96" />}
      >
        {(detail) => <GroupView detail={detail} />}
      </Loaded>
    </Screen>
  );
}

function GroupView({ detail }: { detail: GroupDetail }) {
  const navigation = useNavigation();
  const groupId = detail.group.id;
  const live = detail.sessions.filter((summary) => summary.session.status === "live");
  const past = detail.sessions.filter((summary) => summary.session.status === "closed");
  const balanceOf = new Map(detail.balances.map((balance) => [balance.playerId, balance.amount]));

  useLayoutEffect(() => {
    navigation.setOptions({ title: detail.group.name });
  }, [navigation, detail.group.name]);

  return (
    <>
      <Button
        label="Start a session"
        variant="primary"
        size="lg"
        onPress={() => navigation.navigate("NewSession", { groupId })}
      />
      <View className="flex-row gap-2">
        <Button
          label="Settle up"
          size="sm"
          className="flex-1"
          onPress={() => navigation.navigate("Settle", { groupId })}
        />
        <Button
          label="Stats"
          size="sm"
          className="flex-1"
          onPress={() => navigation.navigate("Stats", { groupId })}
        />
        <Button
          label="People"
          size="sm"
          className="flex-1"
          onPress={() => navigation.navigate("People", { groupId })}
        />
      </View>

      {live.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Playing now</SectionHeading>
          <SessionList sessions={live} detail={detail} />
        </View>
      ) : null}

      <View className="gap-2">
        <SectionHeading>Balances</SectionHeading>
        <Surface>
          {detail.players.map((player) => (
            <Row key={player.id}>
              <Text numberOfLines={1} className="flex-1 text-base text-ink">
                {player.displayName}
                {player.id === detail.myPlayerId ? (
                  <Text className="text-muted"> (you)</Text>
                ) : null}
                {player.userId === null ? <Text className="text-faint"> · guest</Text> : null}
              </Text>
              <BalanceLabel
                amount={balanceOf.get(player.id) ?? MinorUnits.make(0)}
                currency={detail.group.currency}
              />
            </Row>
          ))}
        </Surface>
      </View>

      <View className="gap-2">
        <SectionHeading>Sessions</SectionHeading>
        {detail.sessions.length === 0 ? (
          <EmptyState title="No sessions yet">
            Start one when you sit down to play. Everyone's buy-ins and cash-outs go in it, and the
            balances above update as you go.
          </EmptyState>
        ) : past.length > 0 ? (
          <SessionList sessions={past} detail={detail} />
        ) : (
          <Text className="text-sm text-muted">Finished sessions show up here.</Text>
        )}
      </View>
    </>
  );
}
