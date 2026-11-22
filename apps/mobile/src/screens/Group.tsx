import type { StaticScreenProps } from "@react-navigation/native";
import type { GroupDetail, GroupId } from "@stacks/contracts";
import { isAdmin, isFormerMember, isGuest } from "@stacks/client-runtime/format";
import { useCallback } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Button, IconButton } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Screen } from "../components/ui/Screen";
import { PageTitle, SettingsGroup, SettingsRow } from "../components/ui/Surface";
import { GroupPeople } from "../features/GroupPeople";
import { GroupSkeleton } from "../features/ScreenSkeletons";
import { TripsSection } from "../features/Trips";
import { useGo } from "../lib/go";
import { ScopeLoaded, usePlaceAddress } from "../lib/scope";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId?: string } | undefined>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The group in scope: its trips, its people, its settings, and a way into its stats. */
export function GroupScreen({ route }: Props) {
  const stacks = useStacks();
  usePlaceAddress(route.params, "groupId");

  return (
    <Screen
      live={Platform.OS !== "android"}
      contentClassName={Platform.OS === "android" ? "gap-3 pt-1" : undefined}
    >
      <ScopeLoaded skeleton={<GroupSkeleton />}>
        {({ item }) => (
          <Loaded query={stacks.group(item.group.id)} skeleton={<GroupSkeleton />}>
            {(detail) => <GroupHub detail={detail} />}
          </Loaded>
        )}
      </ScopeLoaded>
    </Screen>
  );
}

function GroupHub({ detail }: { detail: GroupDetail }) {
  const go = useGo();
  const groupId = detail.group.id;
  const people = detail.players.filter((player) => !isFormerMember(player));
  const guests = people.filter(isGuest).length;
  const members = people.length - guests;
  const android = Platform.OS === "android";
  const headerRight = useCallback(() => <GroupActions groupId={groupId} />, [groupId]);

  return (
    <>
      <View className="gap-3">
        <PageTitle
          inContent={android}
          headerRight={android ? headerRight : undefined}
          context={
            android
              ? undefined
              : `${plural(members, "member")}${guests ? ` · ${plural(guests, "guest")}` : ""} · plays in ${detail.group.currency}`
          }
        >
          {detail.group.name}
        </PageTitle>
        {android ? (
          <View className="flex-row gap-6">
            <GroupCount label="People" count={people.length} />
            <GroupCount label="Trips" count={detail.trips.length} />
          </View>
        ) : (
          <Button
            label="Stats"
            variant="secondary"
            className="self-start"
            onPress={() => go.stats({ groupId })}
          />
        )}
      </View>
      <TripsSection detail={detail} />
      <GroupPeople detail={detail} />
      {android ? null : (
        <SettingsGroup title="Settings">
          <SettingsRow
            icon={<Icon name="settings" color="ink" size={16} />}
            title="Group settings"
            subtitle={isAdmin(detail) ? "Name, ledger, leaving" : "The ledger, leaving"}
            accessibilityHint="Opens the group's settings"
            onPress={() => go.settings(groupId)}
          />
        </SettingsGroup>
      )}
    </>
  );
}

function GroupActions({ groupId }: { groupId: GroupId }) {
  const go = useGo();

  return (
    <View className="flex-row items-center gap-2">
      <Button label="Stats" size="sm" onPress={() => go.stats({ groupId })} />
      <IconButton
        plain
        accessibilityLabel="Group settings"
        icon={<Icon name="settings" color="ink" />}
        onPress={() => go.settings(groupId)}
      />
    </View>
  );
}

function GroupCount({ label, count }: { label: string; count: number }) {
  return (
    <View className="gap-1">
      <Text className="type-label text-muted">{label}</Text>
      <Text className="type-heading font-bold text-ink tabular-nums">{count}</Text>
    </View>
  );
}
