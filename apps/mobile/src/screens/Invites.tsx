import { useUser } from "@clerk/expo";
import type { StaticScreenProps } from "@react-navigation/native";
import type { GroupDetail, InvitePreview } from "@stacks/contracts";
import { useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { Text } from "../components/ui/Text";

import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { EmptyState, PageTitle, Surface } from "../components/ui/Surface";
import { useGo } from "../lib/go";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { InviteScreenSkeleton } from "../features/ScreenSkeletons";

type Props = StaticScreenProps<{ code: string }>;

const closedReasons = {
  expired: "This invite has expired.",
  revoked: "This invite was cancelled.",
  used_up: "This invite has been used up.",
} as const;

const inviteTitle = Platform.OS === "android" ? <PageTitle inContent>Invite</PageTitle> : null;

const inviteSkeleton = (
  <>
    {inviteTitle}
    <InviteScreenSkeleton />
  </>
);

const invalidInvite = (message: string) => (
  <>
    {inviteTitle}
    <EmptyState centered title="This invite can't be used">
      {message}
    </EmptyState>
  </>
);

function InviteCard({
  title,
  context,
  children,
}: {
  title: string;
  context: string;
  children: ReactNode;
}) {
  const android = Platform.OS === "android";

  const heading = (
    <PageTitle inContent={android} context={context}>
      {title}
    </PageTitle>
  );

  return (
    <>
      {android ? heading : null}
      <Surface className="gap-5 p-5">
        {android ? null : heading}
        {children}
      </Surface>
    </>
  );
}

export function JoinScreen({ route }: Props) {
  const stacks = useStacks();

  return (
    <Screen>
      <Loaded
        query={stacks.invitePreview(route.params.code)}
        skeleton={inviteSkeleton}
        renderError={invalidInvite}
      >
        {(preview) => <JoinView code={route.params.code} preview={preview} />}
      </Loaded>
    </Screen>
  );
}

function JoinView({ code, preview }: { code: string; preview: InvitePreview }) {
  const stacks = useStacks();
  const go = useGo();
  const { user } = useUser();
  const accept = useAction(stacks.Client.mutation("invites", "accept"));
  const [name, setName] = useState(user?.firstName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  const openDetail = (detail: GroupDetail) => {
    const trip = detail.trips.find((item) => item.endedAt === null);

    if (trip) go.trip(trip.id);
    else go.group(detail.group.id);
  };

  const join = async () => {
    if (!name.trim()) return setNameError("Enter the name your friends know you by.");
    setNameError(null);
    const joined = await accept.run({ params: { code }, payload: { displayName: name.trim() } });

    if (joined) openDetail(joined);
  };

  return (
    <InviteCard
      title={preview.groupName}
      context={`${preview.memberCount} ${preview.memberCount === 1 ? "member" : "members"}`}
    >
      {preview.alreadyMember ? (
        <>
          <Text className="text-base text-muted">You're already in this group.</Text>
          <Button
            label={preview.currentTripId ? "Open trip" : "Open group"}
            variant="primary"
            onPress={() =>
              preview.currentTripId ? go.trip(preview.currentTripId) : go.group(preview.groupId)
            }
          />
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
    </InviteCard>
  );
}

export function ClaimScreen({ route }: Props) {
  const stacks = useStacks();
  const go = useGo();
  const claim = useAction(stacks.Client.mutation("guests", "claim"));

  const confirm = async () => {
    const claimed = await claim.run({ params: { code: route.params.code } });

    if (claimed) {
      const trip = claimed.trips.find((item) => item.endedAt === null);

      if (trip) go.trip(trip.id);
      else go.group(claimed.group.id);
    }
  };

  return (
    <Screen>
      <Loaded
        query={stacks.claimPreview(route.params.code)}
        skeleton={inviteSkeleton}
        renderError={invalidInvite}
      >
        {(preview) =>
          preview.alreadyMember ? (
            <InviteCard title="You're already in this group" context={preview.groupName}>
              <Text className="text-base text-muted">
                This link is for {preview.displayName}, who has been playing in {preview.groupName}{" "}
                as a guest. Opening it is how they join and keep their history. You already play
                here, so there's nothing for you to claim.
              </Text>
              <Button
                label="Open group"
                variant="primary"
                size="lg"
                onPress={() => go.group(preview.groupId)}
              />
            </InviteCard>
          ) : (
            <InviteCard title={`Are you ${preview.displayName}?`} context={preview.groupName}>
              <Text className="text-base text-muted">
                {preview.displayName} has been playing in {preview.groupName} as a guest. Claim it
                to join the group and make their sessions, results and balance yours.
              </Text>
              {claim.error ? <FormError>{claim.error}</FormError> : null}
              <Button
                label={`Yes, I'm ${preview.displayName}`}
                variant="primary"
                size="lg"
                pending={claim.pending}
                onPress={() => void confirm()}
              />
            </InviteCard>
          )
        }
      </Loaded>
    </Screen>
  );
}
