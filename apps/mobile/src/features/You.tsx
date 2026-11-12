import { useClerk, useUser } from "@clerk/expo";
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
import { Card } from "../components/ui/Surface";
import { useScope } from "../lib/scope";
import { useStacks } from "../lib/stacks";
import { setTheme, useTheme } from "../lib/theme";
import { Chip } from "./Chip";

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
        accessibilityHint="Your appearance and account"
        onPress={() => setOpen(true)}
        hitSlop={6}
        className="size-11 items-center justify-center rounded-full border border-line bg-surface active:scale-[0.95]"
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

export function YouSheet({ name = "You", onClose }: { name?: string; onClose: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { scope } = useScope();
  const theme = useTheme();
  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <Sheet
      open
      onClose={onClose}
      title="You"
      footer={<Button label="Sign out" variant="danger" onPress={() => void signOut()} />}
    >
      <Card className="flex-row items-center gap-3 p-4">
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
      </Card>
      <Choice label="Appearance" options={themeChoices} value={theme} onChange={setTheme} />
    </Sheet>
  );
}
