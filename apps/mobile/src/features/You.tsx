import { useClerk, useUser } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import type { GroupListItem } from "@stacks/contracts";
import { themeChoices } from "@stacks/client-runtime/theme";
import { chipOf } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { SectionHeading, Skeleton } from "../components/ui/Surface";
import { useScope } from "../lib/scope";
import { Loaded, TripLoaded, useStacks } from "../lib/stacks";
import { setTheme, useTheme } from "../lib/theme";
import { Chip } from "./Chip";
import { SettleUpLink } from "./Personal";
import { PlayLimits } from "./PersonalLimits";

/** Your chip, top right of every screen: everything that's only about you opens from it. */
export function YouButton() {
  const { user } = useUser();
  const { scope } = useScope();
  const [open, setOpen] = useState(false);
  const name = user?.firstName ?? user?.fullName ?? "You";
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="You"
        accessibilityHint="Your play limits, appearance and account"
        onPress={() => setOpen(true)}
        hitSlop={6}
        className="size-11 items-center justify-center rounded-full active:opacity-70"
      >
        {scope ? (
          <MyChip item={scope.item} name={name} size={32} />
        ) : (
          <Chip chip={1} name={name} size={32} />
        )}
      </Pressable>
      {open ? <YouSheet name={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Your chip in the group in scope, in the color the group knows you by. */
function MyChip({ item, name, size }: { item: GroupListItem; name: string; size: number }) {
  const stacks = useStacks();
  const detail = AsyncResult.getOrElse(useAtomValue(stacks.group(item.group.id)), () => null);
  return <Chip chip={detail ? chipOf(detail, item.myPlayerId) : 1} name={name} size={size} />;
}

function YouSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { scope } = useScope();
  const stacks = useStacks();
  const theme = useTheme();
  const navigation = useNavigation();
  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <Sheet
      open
      onClose={onClose}
      title="You"
      footer={<Button label="Sign out" variant="danger" onPress={() => void signOut()} />}
    >
      <View className="flex-row items-center gap-3">
        {scope ? (
          <MyChip item={scope.item} name={name} size={46} />
        ) : (
          <Chip chip={1} name={name} size={46} />
        )}
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-lg font-semibold text-ink">
            {user?.fullName ?? name}
          </Text>
          {email ? (
            <Text numberOfLines={1} className="text-sm text-muted">
              {email}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="gap-2">
        <SectionHeading>Play limits</SectionHeading>
        {scope?.trip ? (
          <TripLoaded tripId={scope.trip.id} skeleton={<Skeleton className="h-56 rounded-xl" />}>
            {(trip, group) => (
              <Loaded query={stacks.limits(trip.trip.id)} skeleton={<></>}>
                {(limits) => (
                  <PlayLimits
                    key={`${limits.lossLimit}-${limits.currency}-${limits.sessionReminderMinutes}`}
                    group={group}
                    trip={trip}
                    limits={limits}
                  />
                )}
              </Loaded>
            )}
          </TripLoaded>
        ) : (
          <Text className="text-sm text-muted">
            A loss limit belongs to a trip. Start one, and you can set yours here.
          </Text>
        )}
      </View>
      <SettleUpLink
        onPress={() => {
          onClose();
          navigation.navigate("PlayerBalances");
        }}
      />
      <Choice label="Appearance" options={themeChoices} value={theme} onChange={setTheme} />
    </Sheet>
  );
}
