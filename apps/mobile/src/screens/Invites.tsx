import { useUser } from "@clerk/expo";
import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { InvitePreview } from "@stacks/contracts";
import { useState } from "react";
import { Text } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { PageTitle, Skeleton, Surface } from "../components/ui/Surface";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ code: string }>;

const closedReasons = {
  expired: "This invite has expired.",
  revoked: "This invite was cancelled.",
  used_up: "This invite has been used up.",
} as const;

export function JoinScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.invitePreview(route.params.code)}
        skeleton={<Skeleton className="h-64" />}
      >
        {(preview) => <JoinView code={route.params.code} preview={preview} />}
      </Loaded>
    </Screen>
  );
}

function JoinView({ code, preview }: { code: string; preview: InvitePreview }) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const { user } = useUser();
  const accept = useAction(stacks.Client.mutation("invites", "accept"));
  const [name, setName] = useState(user?.firstName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const openGroup = (groupId: string) =>
    navigation.dispatch(StackActions.replace("Group", { groupId }));

  const join = async () => {
    if (!name.trim()) return setNameError("Enter the name your friends know you by.");
    setNameError(null);
    const joined = await accept.run({ params: { code }, payload: { displayName: name.trim() } });
    if (joined) openGroup(joined.group.id);
  };

  return (
    <Surface className="gap-5 p-5">
      <PageTitle
        eyebrow={`${preview.memberCount} ${preview.memberCount === 1 ? "member" : "members"}`}
      >
        {preview.groupName}
      </PageTitle>
      {preview.alreadyMember ? (
        <>
          <Text className="text-base text-muted">You're already in this group.</Text>
          <Button label="Open group" variant="primary" onPress={() => openGroup(preview.groupId)} />
        </>
      ) : preview.status !== "open" ? (
        <Text className="text-base text-muted">
          {closedReasons[preview.status]} Ask whoever sent it for a new link.
        </Text>
      ) : (
        <>
          <TextField
            label="Your name in this group"
            value={name}
            onChangeText={setName}
            maxLength={60}
            error={nameError}
          />
          {accept.error ? <FormError>{accept.error}</FormError> : null}
          <Button
            label="Join group"
            variant="primary"
            size="lg"
            pending={accept.pending}
            onPress={() => void join()}
          />
        </>
      )}
    </Surface>
  );
}

export function ClaimScreen({ route }: Props) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const claim = useAction(stacks.Client.mutation("guests", "claim"));
  const confirm = async () => {
    const claimed = await claim.run({ params: { code: route.params.code } });
    if (claimed) navigation.dispatch(StackActions.replace("Group", { groupId: claimed.group.id }));
  };
  return (
    <Screen>
      <Loaded
        query={stacks.claimPreview(route.params.code)}
        skeleton={<Skeleton className="h-64" />}
      >
        {(preview) => (
          <Surface className="gap-5 p-5">
            <PageTitle eyebrow={preview.groupName}>{`Are you ${preview.displayName}?`}</PageTitle>
            <Text className="text-base text-muted">
              {preview.displayName} has been playing in {preview.groupName} as a guest. Claim it to
              join the group and make their sessions, results and balance yours.
            </Text>
            {claim.error ? <FormError>{claim.error}</FormError> : null}
            <Button
              label={`Yes, I'm ${preview.displayName}`}
              variant="primary"
              size="lg"
              pending={claim.pending}
              onPress={() => void confirm()}
            />
          </Surface>
        )}
      </Loaded>
    </Screen>
  );
}
