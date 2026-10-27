import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  GroupId,
  SessionId,
  type Game,
  type GroupDetail,
  type PlayerId,
  type Venue,
} from "@stacks/contracts";
import { gameNames } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Row, SectionHeading, Skeleton, Surface } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { AddGuestSheet } from "../features/AddGuestSheet";
import { VenuePicker } from "../features/VenuePicker";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function NewSessionScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.group(GroupId.make(route.params.groupId))}
        skeleton={<Skeleton className="h-96" />}
      >
        {(detail) => <NewSessionForm detail={detail} />}
      </Loaded>
    </Screen>
  );
}

const GAMES = (Object.keys(gameNames) as ReadonlyArray<Game>).map((game) => ({
  value: game,
  label: gameNames[game],
}));

function NewSessionForm({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const create = useAction(stacks.Client.mutation("sessions", "create"));
  const [venue, setVenue] = useState<Venue | null>(null);
  const [game, setGame] = useState<Game>("blackjack");
  const [playerIds, setPlayerIds] = useState<ReadonlySet<PlayerId>>(
    () => new Set([detail.myPlayerId]),
  );
  const [addingGuest, setAddingGuest] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const players = detail.players.filter((player) => player.role !== null || player.userId === null);

  const toggle = (id: PlayerId) =>
    setPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    const [first, ...rest] = players
      .filter((player) => playerIds.has(player.id))
      .map((player) => player.id);
    if (!venue) return setProblem("Pick where you're playing.");
    if (!first) return setProblem("Pick at least one player.");
    setProblem(null);
    const session = await create.run({
      params: { groupId: detail.group.id },
      payload: {
        id: SessionId.make(newId()),
        venueId: venue.id,
        game,
        playerIds: [first, ...rest],
        notes: null,
      },
    });
    if (session)
      navigation.dispatch(StackActions.replace("Session", { sessionId: session.session.id }));
  };

  return (
    <>
      <View className="gap-2">
        <SectionHeading>Where</SectionHeading>
        <Surface className="p-4">
          <VenuePicker groupId={detail.group.id} selected={venue} onSelect={setVenue} />
        </Surface>
      </View>
      <Choice label="Game" options={GAMES} value={game} onChange={setGame} columns={2} />
      <View className="gap-2">
        <SectionHeading
          action={
            <Button
              label="Add a guest"
              size="sm"
              variant="ghost"
              onPress={() => setAddingGuest(true)}
            />
          }
        >
          Who's playing
        </SectionHeading>
        <Surface>
          {players.map((player) => {
            const checked = playerIds.has(player.id);
            return (
              <Row key={player.id}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={player.displayName}
                  accessibilityState={{ checked }}
                  onPress={() => toggle(player.id)}
                  className="flex-1 flex-row items-center gap-3"
                >
                  <View
                    className={cn(
                      "size-6 items-center justify-center rounded-md border",
                      checked ? "border-accent bg-accent" : "border-line-strong",
                    )}
                  >
                    {checked ? <Text className="text-sm font-bold text-accent-ink">✓</Text> : null}
                  </View>
                  <Text className="text-base text-ink">
                    {player.displayName}
                    {player.id === detail.myPlayerId ? (
                      <Text className="text-muted"> (you)</Text>
                    ) : null}
                    {player.userId === null ? <Text className="text-faint"> · guest</Text> : null}
                  </Text>
                </Pressable>
              </Row>
            );
          })}
        </Surface>
        <Text className="text-sm text-muted">Anyone else can join the session later.</Text>
      </View>
      {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
      <Button
        label="Start session"
        variant="primary"
        size="xl"
        pending={create.pending}
        onPress={() => void submit()}
      />
      <AddGuestSheet
        detail={detail}
        open={addingGuest}
        onClose={() => setAddingGuest(false)}
        onAdded={(id) => setPlayerIds((current) => new Set([...current, id]))}
      />
    </>
  );
}
