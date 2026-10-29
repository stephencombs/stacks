import { useClerk, useUser } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import { CurrencyCode, GroupId } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { themeChoices } from "@stacks/client-runtime/theme";
import { useState } from "react";
import { Text, View } from "react-native";

import { BalanceLabel } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, Skeleton, Tag } from "../components/ui/Surface";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { setTheme, useTheme } from "../lib/theme";

export function GroupsScreen() {
  const stacks = useStacks();
  const navigation = useNavigation();
  const [creating, setCreating] = useState(false);
  const [account, setAccount] = useState(false);

  return (
    <Screen>
      <View className="gap-3">
        <Text accessibilityRole="header" className="font-display text-4xl text-ink">
          Your groups
        </Text>
        <View className="flex-row gap-2">
          <Button
            label="New group"
            variant="primary"
            className="flex-1"
            onPress={() => setCreating(true)}
          />
          <Button label="Account" onPress={() => setAccount(true)} />
        </View>
      </View>
      <Loaded query={stacks.groups} skeleton={<Skeleton className="h-40" />}>
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
                  onPress={() => navigation.navigate("Group", { groupId: item.group.id })}
                >
                  <View className="flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="shrink font-display text-xl text-ink">
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
      <AccountSheet open={account} onClose={() => setAccount(false)} />
    </Screen>
  );
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "JPY"] as const;

function CreateGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stacks = useStacks();
  const navigation = useNavigation();
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
      navigation.navigate("Group", { groupId: detail.group.id });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New group"
      description="Everyone in a group shares one ledger in one currency."
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
        columns={4}
      />
      {create.error ? <FormError>{create.error}</FormError> : null}
      <Button
        label="Create group"
        variant="primary"
        size="lg"
        pending={create.pending}
        onPress={() => void submit()}
      />
    </Sheet>
  );
}

function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const theme = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title="Account">
      <View className="gap-1">
        <Text className="text-base text-ink">
          {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
        </Text>
        {user?.primaryEmailAddress ? (
          <Text className="text-sm text-muted">{user.primaryEmailAddress.emailAddress}</Text>
        ) : null}
      </View>
      <Choice
        label="Appearance"
        options={themeChoices}
        value={theme}
        onChange={setTheme}
        columns={3}
      />
      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
    </Sheet>
  );
}
