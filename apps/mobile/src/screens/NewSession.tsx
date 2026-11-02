import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  TripId,
  SessionId,
  type Game,
  type GroupDetail,
  type TripDetail,
  type PlayerId,
  type SessionDetail,
  type Venue,
} from "@stacks/contracts";
import { gameNames } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { chipOf } from "@stacks/client-runtime/trip";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Choice, FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { List, Row, SectionHeading, Skeleton, Surface } from "../components/ui/Surface";
import { AddGuestSheet } from "../features/AddGuestSheet";
import { VenuePicker } from "../features/VenuePicker";
import { Chip } from "../features/Chip";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{
  tripId: string;
  /** The session just left when moving tables: the new one starts with its place and players. */
  from?: string;
}>;

export function NewSessionScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.trip(TripId.make(route.params.tripId))}
        skeleton={<Skeleton className="h-96" />}
      >
        {(trip) => (
          <Loaded query={stacks.group(trip.trip.groupId)} skeleton={<Skeleton className="h-96" />}>
            {(detail) =>
              route.params.from ? (
                <Loaded
                  query={stacks.session(SessionId.make(route.params.from))}
                  skeleton={<Skeleton className="h-96" />}
                >
                  {(from) => <NewSessionForm detail={detail} trip={trip} from={from} />}
                </Loaded>
              ) : (
                <NewSessionForm detail={detail} trip={trip} />
              )
            }
          </Loaded>
        )}
      </Loaded>
    </Screen>
  );
}

const GAMES = (Object.keys(gameNames) as ReadonlyArray<Game>).map((game) => ({
  value: game,
  label: gameNames[game],
}));

const STARTS = [
  { value: "0", label: "Now" },
  { value: "30", label: "30 min ago" },
  { value: "60", label: "1 hr ago" },
  { value: "120", label: "2 hr ago" },
] as const;

function NewSessionForm({
  detail,
  trip,
  from,
}: {
  detail: GroupDetail;
  trip: TripDetail;
  from?: SessionDetail;
}) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const create = useAction(stacks.Client.mutation("sessions", "create"));
  const [venue, setVenue] = useState<Venue | null>(from?.venue ?? null);
  const [game, setGame] = useState<Game>(from?.session.game ?? "blackjack");
  const [highLimit, setHighLimit] = useState(from?.session.highLimit ?? false);
  const [startedAgo, setStartedAgo] = useState<(typeof STARTS)[number]["value"]>("0");
  const [playerIds, setPlayerIds] = useState<ReadonlySet<PlayerId>>(
    () => new Set(from?.playerIds ?? [detail.myPlayerId]),
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
      params: { tripId: trip.trip.id },
      payload: {
        id: SessionId.make(newId()),
        venueId: venue.id,
        game,
        playerIds: [first, ...rest],
        notes: null,
        highLimit,
        ...(startedAgo === "0"
          ? {}
          : {
              startedAt: DateTime.subtract(DateTime.nowUnsafe(), {
                minutes: Number(startedAgo),
              }),
            }),
      },
    });
    if (!session) return;
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
      <Choice label="Game" options={GAMES} value={game} onChange={setGame} />
      <View className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-3">
        <Text className="text-base text-ink">High-limit table</Text>
        <Switch
          accessibilityLabel="High-limit table"
          value={highLimit}
          onValueChange={setHighLimit}
        />
      </View>
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
        <List>
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
                  <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={28} />
                  <Text className="flex-1 type-body text-ink">
                    {player.displayName}
                    {player.id === detail.myPlayerId ? (
                      <Text className="text-muted"> (you)</Text>
                    ) : null}
                    {player.userId === null ? <Text className="text-muted"> · guest</Text> : null}
                  </Text>
                  {checked ? <Icon name="check" color="accent-text" size={18} /> : null}
                </Pressable>
              </Row>
            );
          })}
        </List>
        <Text className="text-sm text-muted">Anyone else can join the session later.</Text>
      </View>
      <Choice label="Started" options={STARTS} value={startedAgo} onChange={setStartedAgo} />
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
