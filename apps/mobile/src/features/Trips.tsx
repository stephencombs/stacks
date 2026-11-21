import {
  MinorUnits,
  TripId,
  type GroupDetail,
  type GroupId,
  type Trip,
  type TripDetail,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { playerNames } from "@stacks/client-runtime/format";
import {
  boardMoney,
  chipOf,
  closedPlays,
  localClock,
  tripDates,
  tripPlays,
} from "@stacks/client-runtime/trip";
import { playerTrip, tripStandings } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { DateTimeField } from "../components/ui/DateTimeField";
import { fieldDate } from "../components/ui/dateTimeValue";
import { localDateText } from "@stacks/client-runtime/recordingView";
import { FormError, TextField } from "../components/ui/Field";
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
  const android = Platform.OS === "android";
  const going = detail.trips.filter((trip) => trip.endedAt === null);
  const past = detail.trips.filter((trip) => trip.endedAt !== null);

  return (
    <View className="gap-2">
      <SectionHeading
        action={
          detail.trips.length === 0 ? undefined : (
            <Button
              label="New trip"
              className={android ? "px-1" : undefined}
              size="sm"
              variant={android ? "link" : "ghost"}
              onPress={() => setStarting(true)}
            />
          )
        }
      >
        Trips
      </SectionHeading>
      {detail.trips.length === 0 ? <NoTrips onStart={() => setStarting(true)} /> : null}
      {android && detail.trips.length > 0 ? (
        <List>
          {[...going, ...past].map((trip) => (
            <TripRow key={trip.id} trip={trip} detail={detail} />
          ))}
        </List>
      ) : null}
      {android
        ? null
        : going.map((trip) => (
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
                  <View
                    accessibilityElementsHidden
                    className="h-[22px] flex-row items-center gap-4"
                  >
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
      {!android && past.length > 0 ? (
        <List>
          {past.map((trip) => (
            <Row key={trip.id} accessibilityHint="Opens the trip" onPress={() => go.trip(trip.id)}>
              <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
                {trip.name}
              </Text>
              <Text className="text-sm text-muted">{tripDates(trip)}</Text>
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

function TripRow({ trip, detail }: { trip: Trip; detail: GroupDetail }) {
  const stacks = useStacks();
  const go = useGo();
  const going = trip.endedAt === null;
  const date = tripDates(trip);
  const row = (loaded?: TripDetail) => {
    const count = loaded ? tripPlays(loaded).length : null;
    const result = loaded && !going ? playerTrip(closedPlays(loaded), detail.myPlayerId) : null;
    return (
      <Row
        accessibilityLabel={`${trip.name}, ${going ? "going" : date}`}
        accessibilityHint="Opens the trip"
        onPress={() => go.trip(trip.id)}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="type-heading font-bold text-ink">{trip.name}</Text>
          <Text className="type-footnote text-muted">
            {date}
            {count === null ? "" : ` · ${count} ${count === 1 ? "session" : "sessions"}`}
          </Text>
        </View>
        {going ? (
          <Text className="type-footnote font-semibold text-live">● Live</Text>
        ) : result && result.played > 0 ? (
          <Money
            amount={MinorUnits.make(result.net)}
            className="type-number font-bold"
            currency={detail.group.currency}
            tone="result"
          />
        ) : null}
        <Icon name="chevron-right" color="faint" size={18} />
      </Row>
    );
  };
  return (
    <Loaded query={stacks.trip(trip.id)} skeleton={row()} renderError={() => row()}>
      {(loaded) => row(loaded)}
    </Loaded>
  );
}

/** A group with no trips yet: what a trip is, and the way to start the first. */
function NoTrips({ onStart }: { onStart: () => void }) {
  return (
    <EmptyState
      title="No trips yet"
      action={<Button label="Start a trip" variant="primary" onPress={onStart} className="mt-2" />}
    >
      Every session is part of a trip, like a weekend in Vegas or this month's home games. Start
      one, and its sessions get their own leaderboard and awards.
    </EmptyState>
  );
}

/** The top three in the trip's standings so far. */
function Leaders({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const names = playerNames(detail);
  const closed = closedPlays(trip);
  const top = tripStandings(closed, localClock).slice(0, 3);
  if (top.length === 0)
    return (
      <Text className="text-sm text-muted">Standings start when the first table finishes.</Text>
    );
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      {top.map((s) => (
        <View key={s.playerId} className="flex-row items-center gap-2">
          <Text className="tabular-nums text-sm text-ink">{s.rank}</Text>
          <Chip chip={chipOf(detail, s.playerId)} name={names.get(s.playerId) ?? ""} size={22} />
          <Text
            className={`tabular-nums text-sm ${s.net > 0 ? "text-win" : s.net < 0 ? "text-loss" : "text-muted"}`}
          >
            {boardMoney(s.net, detail.group.currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Starts a trip and puts it in scope. A group's first trip puts it in scope right away; any
 * later one opens its sessions.
 */
function StartTripSheet({
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
  const { startTrip } = useScope();
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("trips", "create"));
  const [now] = useState(() => new Date());
  const [name, setName] = useState("");
  const [started, setStarted] = useState(() => localDateText(now));
  const [problem, setProblem] = useState<{ field: "name" | "started"; error: string } | null>(null);

  const submit = async () => {
    if (!name.trim()) return setProblem({ field: "name", error: "Give the trip a name." });
    setProblem(null);
    // A trip starts at midnight of its first day.
    const start = fieldDate(started, "date");
    if (!start || start > now)
      return setProblem({ field: "started", error: "Choose a start date today or earlier." });
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
    startTrip(saved);
    if (!first) go.trip(saved.id);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Start a trip"
      description="Tables you start in it count toward its standings."
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
        testID="trip-name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setProblem(null);
        }}
        maxLength={60}
        placeholder={`Vegas ${now.getFullYear()}`}
        error={problem?.field === "name" ? problem.error : null}
      />
      <DateTimeField
        label="Started"
        kind="date"
        value={started}
        onChange={(value) => {
          setStarted(value);
          setProblem(null);
        }}
        maximumDate={now}
        error={problem?.field === "started" ? problem.error : null}
      />
      {create.error ? <FormError>{create.error}</FormError> : null}
    </Sheet>
  );
}
