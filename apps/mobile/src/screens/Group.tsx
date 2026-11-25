import type { StaticScreenProps } from "@react-navigation/native";
import { groupScope, type GroupDetail, type GroupId } from "@stacks/contracts";
import { isFormerMember } from "@stacks/client-runtime/format";
import { useCallback } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Button, IconButton } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Screen } from "../components/ui/Screen";
import { PageTitle } from "../components/ui/Surface";
import { Toolbar } from "../components/ui/Toolbar";
import { GroupPeople } from "../features/GroupPeople";
import { GroupSkeleton } from "../features/ScreenSkeletons";
import { TripsSection } from "../features/Trips";
import { useGo } from "../lib/go";
import { ScopeLoaded, usePlaceAddress } from "../lib/scope";
import { ScopeNotices } from "../lib/realtime";
import { Loaded, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId?: string } | undefined>;

/** The group in scope: its trips, its people, its settings, and a way into its stats. */
export function GroupScreen({ route }: Props) {
  const stacks = useStacks();
  usePlaceAddress(route.params, "groupId");

  return (
    <Screen
      live={Platform.OS !== "android"}
      headerActions={false}
      contentClassName={Platform.OS === "android" ? "gap-3 pt-1" : undefined}
    >
      <ScopeLoaded skeleton={<GroupSkeleton />}>
        {({ item }) => (
          <ScopeNotices scopes={[groupScope(item.group.id)]}>
            <Loaded query={stacks.group(item.group.id)} skeleton={<GroupSkeleton />}>
              {(detail) => <GroupHub detail={detail} />}
            </Loaded>
          </ScopeNotices>
        )}
      </ScopeLoaded>
    </Screen>
  );
}

function GroupHub({ detail }: { detail: GroupDetail }) {
  const go = useGo();
  const groupId = detail.group.id;
  const people = detail.players.filter((player) => !isFormerMember(player));
  const headerRight = useCallback(() => <GroupActions groupId={groupId} />, [groupId]);

  return (
    <>
      <Toolbar placement="right">
        <Toolbar.Button label="Stats" separateBackground onPress={() => go.stats({ groupId })} />
        <Toolbar.Button
          icon="gearshape"
          accessibilityLabel="Group settings"
          separateBackground
          onPress={() => go.settings(groupId)}
        />
      </Toolbar>
      <View className="gap-3">
        <PageTitle inContent headerRight={Platform.OS === "android" ? headerRight : undefined}>
          {detail.group.name}
        </PageTitle>
        <View className="flex-row gap-6">
          <GroupCount label="People" count={people.length} />
          <GroupCount label="Trips" count={detail.trips.length} />
        </View>
      </View>
      <TripsSection detail={detail} />
      <GroupPeople detail={detail} />
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
