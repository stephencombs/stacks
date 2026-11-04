import { TripId, type GroupDetail, type GroupId, type TripDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { playerNames } from "@stacks/client-runtime/format";
import {
  boardMoney,
  chipOf,
  localClock,
  tripDates,
  unsettledAmount,
} from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading } from "../components/ui/Surface";
import { useGo } from "../lib/go";
import { useScope } from "../lib/scope";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { Chip } from "./Chip";
import { Skeleton } from "../components/ui/Surface";

/** The group's trips: the ones going now with their leaders, then past trips. Each opens its sessions. */
export function TripsSection({ detail }: { detail: GroupDetail }) {
  const go = useGo();
  const stacks = useStacks();
  const [starting, setStarting] = useState(false);
  const going = detail.trips.filter((trip) => trip.endedAt === null);
  const past = detail.trips.filter((trip) => trip.endedAt !== null);

  return (
    <View className="gap-2">
      <SectionHeading
        action={
          detail.trips.length === 0 ? undefined : (
            <Button label="New trip" size="sm" variant="ghost" onPress={() => setStarting(true)} />
          )
        }
      >
        Trips
      </SectionHeading>
      {detail.trips.length === 0 ? <NoTrips onStart={() => setStarting(true)} /> : null}
      {going.map((trip) => (
        <Pressable
          key={trip.id}
          accessibilityRole="button"
          accessibilityLabel={`${trip.name}, going`}
          onPress={() => go.trip(trip.id)}
          className="gap-3 rounded-xl bg-surface p-4 active:opacity-90"
        >
          <View className="gap-1">
            <Text className="text-lg font-semibold text-ink">{trip.name}</Text>
            <Text className="text-sm text-muted">Going · {tripDates(trip)}</Text>
          </View>
          <Loaded
            query={stacks.trip(trip.id)}
            skeleton={
              <View accessibilityElementsHidden className="h-[22px] flex-row items-center gap-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </View>
            }
          >
            {(detailed) => <Leaders detail={detail} trip={detailed} />}
          </Loaded>
        </Pressable>
      ))}
      {past.length > 0 ? (
        <List>
          {past.map((trip) => (
            <Row
              key={trip.id}
              accessibilityHint="Opens the trip"
              onPress={() =>
                go.trip(trip.id, unsettledAmount(detail, trip.id) ? "SettleUp" : "Sessions")
              }
            >
              <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
                {trip.name}
              </Text>
              <Text className="text-sm text-muted">
                {unsettledAmount(detail, trip.id) ? "Needs settling" : tripDates(trip)}
              </Text>
              <Icon name="chevron-right" color="faint" size={18} />
            </Row>
          ))}
        </List>
      ) : null}
      {starting ? (
        <StartTripSheet
          groupId={detail.group.id}
          first={detail.trips.length === 0}
          onClose={() => setStarting(false)}
        />
      ) : null}
    </View>
  );
}

/** A group with no trips yet: what a trip is, and the way to start the first. */
export function NoTrips({ onStart }: { onStart: () => void }) {
  return (
    <EmptyState
      title="No trips yet"
      action={<Button label="Start a trip" variant="primary" onPress={onStart} className="mt-2" />}
    >
      Every session is part of a trip, like a weekend in Vegas or this month's home games. Start
      one, and its sessions get their own leaderboard, awards and settle-up.
    </EmptyState>
  );
}

/** The top three on the trip's board so far. */
function Leaders({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const names = playerNames(detail);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const top = tripStandings(closed, localClock).slice(0, 3);
  if (top.length === 0)
    return <Text className="text-sm text-muted">Close a session to put it on the board.</Text>;
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      {top.map((s) => (
        <View key={s.playerId} className="flex-row items-center gap-2">
          <Text className="font-mono text-sm text-accent-text">{s.rank}</Text>
          <Chip chip={chipOf(detail, s.playerId)} name={names.get(s.playerId) ?? ""} size={22} />
          <Text
            className={`font-mono text-sm ${s.net > 0 ? "text-win" : s.net < 0 ? "text-loss" : "text-muted"}`}
          >
            {boardMoney(s.net, detail.group.currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const STARTS = [
  { value: "0", label: "Today" },
  { value: "1", label: "Yesterday" },
  { value: "2", label: "2 days ago" },
  { value: "3", label: "3 days ago" },
] as const;

/**
 * Starts a trip and puts it in scope. A group's first trip brings Sessions, Board and Settle up
 * into the tab bar, so that one stays put; any later one opens its sessions.
 */
export function StartTripSheet({
  groupId,
  first,
  onClose,
  onStarted,
}: {
  groupId: GroupId;
  first: boolean;
  onClose: () => void;
  /** After the trip starts, for a sheet that opened this one. */
  onStarted?: () => void;
}) {
  const go = useGo();
  const { setTrip } = useScope();
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("trips", "create"));
  const [now] = useState(() => new Date());
  const [name, setName] = useState("");
  const [daysAgo, setDaysAgo] = useState<(typeof STARTS)[number]["value"]>("0");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setProblem("Give the trip a name.");
    setProblem(null);
    // A trip starts at midnight of its first day.
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(daysAgo));
    const saved = await create.run({
      params: { groupId },
      payload: {
        id: TripId.make(newId()),
        name: name.trim(),
        startedAt: DateTime.makeUnsafe(start.getTime()),
      },
    });
    if (!saved) return;
    onClose();
    onStarted?.();
    if (first) setTrip(saved.id);
    else go.trip(saved.id);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Start a trip"
      description="Sessions you start in it go on its board and settle up on their own."
      footer={
        <Button
          label="Start trip"
          variant="primary"
          size="lg"
          pending={create.pending}
          onPress={() => void submit()}
        />
      }
    >
      <TextField
        label="Trip name"
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder={`Vegas ${now.getFullYear()}`}
      />
      <Choice label="Started" options={STARTS} value={daysAgo} onChange={setDaysAgo} />
      {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
    </Sheet>
  );
}
