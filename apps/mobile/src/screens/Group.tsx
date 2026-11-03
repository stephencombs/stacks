import { CommonActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { InviteId, type GroupDetail } from "@stacks/contracts";
import { isFormerMember, isGuest } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { chipOf } from "@stacks/client-runtime/trip";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Screen } from "../components/ui/Screen";
import { List, PageTitle, Row, SectionHeading } from "../components/ui/Surface";
import { Chip } from "../features/Chip";
import { GroupSkeleton } from "../features/ScreenSkeletons";
import { TripsSection } from "../features/Trips";
import { webUrl } from "../lib/config";
import { useGo } from "../lib/go";
import { ScopeLoaded, useLinkedScope } from "../lib/scope";
import { shareLink } from "../lib/share";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId?: string } | undefined>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const roleNames = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** The group in scope: its trips, its people, its settings. */
export function GroupScreen({ route }: Props) {
  const stacks = useStacks();
  const navigation = useNavigation();
  useLinkedScope(route.params, () =>
    navigation.dispatch(CommonActions.setParams({ groupId: undefined })),
  );
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
      <PageTitle
        context={`${plural(members, "member")}${guests ? ` · ${plural(guests, "guest")}` : ""} · plays in ${detail.group.currency}`}
      >
        {detail.group.name}
      </PageTitle>
      <TripsSection detail={detail} />
      <View className="gap-2">
        <SectionHeading action={<InviteButton detail={detail} />}>People</SectionHeading>
        <List>
          <View className="flex-row flex-wrap gap-x-4 gap-y-3 px-4 py-3.5">
            {people.map((player) => (
              <View key={player.id} className="w-16 items-center gap-1">
                <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={34} />
                <Text numberOfLines={1} className="text-xs font-medium text-ink">
                  {player.id === detail.myPlayerId ? "You" : player.displayName}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted">
                  {player.role ? roleNames[player.role] : "Guest"}
                </Text>
              </View>
            ))}
          </View>
          <Row accessibilityHint="Opens the group's people" onPress={() => go.people(groupId)}>
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-medium text-ink">Members and guests</Text>
              <Text className="text-sm text-muted">Roles, invite links, guest claims</Text>
            </View>
            <Icon name="chevron-right" color="faint" size={18} />
          </Row>
        </List>
      </View>
      <View className="gap-2">
        <SectionHeading>Settings</SectionHeading>
        <List>
          <Row accessibilityHint="Opens the group's settings" onPress={() => go.settings(groupId)}>
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-medium text-ink">Group settings</Text>
              <Text className="text-sm text-muted">Your payment apps, the ledger, leaving</Text>
            </View>
            <Icon name="chevron-right" color="faint" size={18} />
          </Row>
        </List>
      </View>
    </>
  );
}

/** Makes a fresh invite link and hands it straight to the share sheet. */
function InviteButton({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("invites", "create"));
  const [copied, setCopied] = useState(false);
  const invite = async () => {
    const made = await create.run({
      params: { groupId: detail.group.id },
      payload: { id: InviteId.make(newId()), maxUses: null },
    });
    if (!made) return;
    const how = await shareLink(
      `${webUrl}/join/${made.code}`,
      `Join ${detail.group.name} on Color Up:`,
    );
    setCopied(how === "copied");
  };
  return (
    <View className="items-end gap-1">
      <Button
        label={copied ? "Link copied" : "Invite"}
        size="sm"
        variant="ghost"
        pending={create.pending}
        onPress={() => void invite()}
      />
      {create.error ? <FormError>{create.error}</FormError> : null}
    </View>
  );
}
