import {
  StackActions,
  useNavigation,
  usePreventRemove,
  type StaticScreenProps,
} from "@react-navigation/native";
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
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { confirmAction } from "../components/ui/confirmAction";
import { Icon } from "../components/ui/Icon";
import { Choice, FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { AddGuestSheet } from "../features/AddGuestSheet";
import { Sheet } from "../components/ui/Sheet";
import { VenuePicker } from "../features/VenuePicker";
import { Chip } from "../features/Chip";
import { Loaded, TripLoaded, useAction, useStacks } from "../lib/stacks";
import { FormScreenSkeleton } from "../features/ScreenSkeletons";
import { useLinkedScope } from "../lib/scope";

type Props = StaticScreenProps<{
  tripId: string;
  /** The session just left when moving tables: the new one starts with its place and players. */
  from?: string;
}>;

export function NewSessionScreen({ route }: Props) {
  const stacks = useStacks();
  useLinkedScope(route.params);
  return (
    <TripLoaded
      renderError={(message, recovery) => (
        <NewSessionError message={message}>{recovery}</NewSessionError>
      )}
      tripId={TripId.make(route.params.tripId)}
      skeleton={<NewSessionSkeleton />}
    >
      {(trip, detail) =>
        route.params.from ? (
          <Loaded
            renderError={(message, recovery) => (
              <NewSessionError message={message}>{recovery}</NewSessionError>
            )}
            query={stacks.session(SessionId.make(route.params.from))}
            skeleton={<NewSessionSkeleton />}
          >
            {(from) => <NewSessionForm detail={detail} trip={trip} from={from} />}
          </Loaded>
        ) : (
          <NewSessionForm detail={detail} trip={trip} />
        )
      }
    </TripLoaded>
  );
}

function NewSessionError({ message, children }: { message: string; children?: ReactNode }) {
  const navigation = useNavigation();
  return (
    <Screen hideLiveReturn onCancel={() => navigation.goBack()}>
      <FormError>{message}</FormError>
      {children}
    </Screen>
  );
}

function NewSessionSkeleton() {
  const navigation = useNavigation();
  return (
    <Screen hideLiveReturn onCancel={() => navigation.goBack()}>
      <FormScreenSkeleton />
    </Screen>
  );
}

const GAMES = (Object.keys(gameNames) as ReadonlyArray<Game>).map((game) => ({
  value: game,
  label: gameNames[game],
}));

const STARTS = [
  { value: "0", label: "Now" },
  { value: "30", label: "30m ago" },
  { value: "60", label: "1h ago" },
  { value: "120", label: "2h ago" },
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
  const create = useAction(stacks.Client.mutation("sessions", "create"), "session_start_confirmed");
  const [venue, setVenue] = useState<Venue | null>(from?.venue ?? null);
  const [game, setGame] = useState<Game>(from?.session.game ?? "blackjack");
  const [highLimit, setHighLimit] = useState(from?.session.highLimit ?? false);
  const [startedAgo, setStartedAgo] = useState<(typeof STARTS)[number]["value"]>("0");
  const [playerIds, setPlayerIds] = useState<ReadonlySet<PlayerId>>(
    () => new Set(from?.playerIds ?? [detail.myPlayerId]),
  );
  const [addingGuest, setAddingGuest] = useState(false);
  const [picking, setPicking] = useState<"venue" | "players" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<SessionId | null>(null);
  const players = detail.players.filter((player) => player.role !== null || player.userId === null);
  const liveTables = trip.sessions.filter((item) => item.session.endedAt === null);
  const originalPlayers = from?.playerIds ?? [detail.myPlayerId];
  const dirty =
    venue?.id !== from?.venue.id ||
    game !== (from?.session.game ?? "blackjack") ||
    highLimit !== (from?.session.highLimit ?? false) ||
    startedAgo !== "0" ||
    playerIds.size !== originalPlayers.length ||
    originalPlayers.some((id) => !playerIds.has(id));
  usePreventRemove(!created && (dirty || create.pending), ({ data }) => {
    if (create.pending) return;
    confirmAction("Discard this session?", "Your choices won't be saved.", "Discard", () =>
      navigation.dispatch(data.action),
    );
  });
  useEffect(() => {
    if (!created) return;
    navigation.dispatch(
      StackActions.popTo("Places", {
        screen: "SessionsTab",
        params: { screen: "Session", params: { sessionId: created }, initial: false },
      }),
    );
  }, [created, navigation]);

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
    setCreated(session.session.id);
  };

  return (
    <Screen
      hideLiveReturn
      onCancel={() => navigation.goBack()}
      confirm={{ label: "Start", pending: create.pending, onPress: () => void submit() }}
    >
      {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
      <List>
        <Row onPress={() => setPicking("venue")} accessibilityHint="Search and choose a venue">
          <Text className="type-body text-muted">Venue</Text>
          <Text className="flex-1 text-right type-body text-ink">
            {venue?.name ?? "Choose a venue"}
          </Text>
          <Icon name="chevron-right" color="muted" size={18} />
        </Row>
        <Row onPress={() => setPicking("players")} accessibilityHint="Choose who is playing">
          <Text className="type-body text-muted">Players</Text>
          <Text className="flex-1 text-right type-body text-ink">{playerIds.size} selected</Text>
          <Icon name="chevron-right" color="muted" size={18} />
        </Row>
      </List>
      {liveTables.length > 0 ? (
        <Text className="type-footnote text-muted">
          {liveTables.length === 1
            ? `${liveTables[0]!.venue.name} is still live. Starting another table keeps it live.`
            : `${liveTables.length} tables are still live. Starting another keeps them live.`}
        </Text>
      ) : null}
      {picking === "venue" ? (
        <Sheet open title="Choose a venue" onClose={() => setPicking(null)}>
          <VenuePicker
            groupId={detail.group.id}
            selected={venue}
            onSelect={(next) => {
              setVenue(next);
              setPicking(null);
            }}
          />
        </Sheet>
      ) : null}
      <Choice label="Game" presentation="menu" options={GAMES} value={game} onChange={setGame} />
      <View className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-3">
        <Text className="text-base text-ink">High-limit table</Text>
        <Switch
          accessibilityLabel="High-limit table"
          value={highLimit}
          onValueChange={setHighLimit}
        />
      </View>
      {picking === "players" ? (
        <Sheet
          open
          title={`Players · ${playerIds.size} selected`}
          onClose={() => setPicking(null)}
          confirm={{ label: "Done", onPress: () => setPicking(null) }}
        >
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
                  <Pressable
                    key={player.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={player.displayName}
                    accessibilityState={{ checked }}
                    onPress={() => toggle(player.id)}
                    className="min-h-11 flex-row items-center gap-3 border-t border-line px-4 py-3.5 active:bg-sunken"
                  >
                    <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={28} />
                    <Text className="flex-1 type-body text-ink">
                      {player.displayName}
                      {player.id === detail.myPlayerId ? (
                        <Text className="text-muted"> (you)</Text>
                      ) : null}
                      {player.userId === null ? <Text className="text-muted"> · guest</Text> : null}
                    </Text>
                    <View
                      className={
                        checked
                          ? "size-6 items-center justify-center rounded-full bg-accent"
                          : "size-6 rounded-full border border-line-strong"
                      }
                    >
                      {checked ? <Icon name="check" color="accent-ink" size={16} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </List>
            <Text className="text-sm text-muted">Anyone else can join the session later.</Text>
          </View>
        </Sheet>
      ) : null}
      <Choice
        label="Started"
        presentation="menu"
        options={STARTS}
        value={startedAgo}
        onChange={setStartedAgo}
      />
      <AddGuestSheet
        detail={detail}
        open={addingGuest}
        onClose={() => setAddingGuest(false)}
        onAdded={(id) => setPlayerIds((current) => new Set([...current, id]))}
      />
    </Screen>
  );
}
