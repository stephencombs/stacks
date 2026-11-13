import { useUser } from "@clerk/expo";
import { CurrencyCode, GroupId } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { useState } from "react";
import { Text, View } from "react-native";

import { BalanceLabel } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, PageTitle, Row, Tag } from "../components/ui/Surface";
import { useGo } from "../lib/go";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { RowsSkeleton } from "../features/ScreenSkeletons";

/**
 * The places once you're in a group; until then, a way to start one. Join and claim links still
 * open over this, so a friend's invite is the other way in.
 */
/** Every group you're in, and a new one. */
export function GroupsScreen() {
  const stacks = useStacks();
  const go = useGo();
  const [creating, setCreating] = useState(false);

  return (
    <Screen>
      <View className="gap-3">
        <PageTitle>Your groups</PageTitle>
        <Button label="New group" variant="primary" onPress={() => setCreating(true)} />
      </View>
      <Loaded query={stacks.groups} skeleton={<RowsSkeleton rows={3} trailing={false} />}>
        {(groups) =>
          groups.length === 0 ? (
            <EmptyState
              title="Start a group for the people you play with"
              action={
                <Button
                  label="Create a group"
                  variant="primary"
                  onPress={() => setCreating(true)}
                />
              }
            >
              A group keeps one shared ledger. If a friend already made one, open the invite link
              they sent you to join it.
            </EmptyState>
          ) : (
            <List>
              {groups.map((item) => (
                <Row
                  key={item.group.id}
                  accessibilityHint="Opens the group"
                  onPress={() => go.group(item.group.id)}
                >
                  <View className="flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="shrink text-lg font-semibold text-ink">
                        {item.group.name}
                      </Text>
                      {item.liveSessionCount > 0 ? <Tag tone="live">Live</Tag> : null}
                    </View>
                    <BalanceLabel
                      amount={item.myBalance}
                      currency={item.group.currency}
                      subject="you"
                    />
                  </View>
                  <Icon name="chevron-right" color="faint" />
                </Row>
              ))}
            </List>
          )
        }
      </Loaded>
      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />
    </Screen>
  );
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "JPY"] as const;

function CreateGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stacks = useStacks();
  const go = useGo();
  const { user } = useUser();
  const create = useAction(stacks.Client.mutation("groups", "create"));
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(user?.firstName ?? "");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("USD");
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setNameError("Give the group a name.");
    setNameError(null);
    const detail = await create.run({
      payload: {
        id: GroupId.make(newId()),
        name: name.trim(),
        currency: CurrencyCode.make(currency),
        displayName: displayName.trim() || "Me",
      },
    });
    if (detail) {
      onClose();
      setName("");
      go.group(detail.group.id);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New group"
      description="Everyone in a group shares one ledger in one currency."
      footer={
        <Button
          label="Create group"
          variant="primary"
          size="lg"
          pending={create.pending}
          onPress={() => void submit()}
        />
      }
    >
      <TextField
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="Vegas crew"
        maxLength={80}
        error={nameError}
      />
      <TextField
        label="Your name in this group"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={60}
      />
      <Choice
        label="Currency"
        options={CURRENCIES.map((code) => ({ value: code, label: code }))}
        value={currency}
        onChange={setCurrency}
      />
      {create.error ? <FormError>{create.error}</FormError> : null}
    </Sheet>
  );
}
