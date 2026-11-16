import type { StaticScreenProps } from "@react-navigation/native";
import type { GroupDetail } from "@stacks/contracts";
import { isFormerMember, isGuest } from "@stacks/client-runtime/format";
import { View } from "react-native";

import { Button } from "../components/ui/Button";
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
    <Screen>
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
  return (
    <>
      <View className="gap-3">
        <PageTitle
          context={`${plural(members, "member")}${guests ? ` · ${plural(guests, "guest")}` : ""} · plays in ${detail.group.currency}`}
        >
          {detail.group.name}
        </PageTitle>
        <Button
          label="Stats"
          variant="secondary"
          className="self-start"
          onPress={() => go.stats({ groupId })}
        />
      </View>
      <TripsSection detail={detail} />
      <GroupPeople detail={detail} />
      <SettingsGroup title="Settings">
        <SettingsRow
          icon={<Icon name="settings" color="ink" size={16} />}
          title="Group settings"
          subtitle="The ledger, leaving"
          accessibilityHint="Opens the group's settings"
          onPress={() => go.settings(groupId)}
        />
      </SettingsGroup>
    </>
  );
}
