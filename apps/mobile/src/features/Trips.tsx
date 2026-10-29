import { useNavigation } from "@react-navigation/native";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { playerNames } from "@stacks/client-runtime/format";
import { boardMoney, chipOf, localClock, tripDates } from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { Chip } from "./Chip";

/** The group's trips: the ones going now as a jump onto their boards, then past trips. */
export function TripsSection({ detail }: { detail: GroupDetail }) {
  const navigation = useNavigation();
  const stacks = useStacks();
  const [starting, setStarting] = useState(false);
  const going = detail.trips.filter((trip) => trip.endedAt === null);
  const past = detail.trips.filter((trip) => trip.endedAt !== null);

  return (
    <View className="gap-2">
      <SectionHeading
        action={
          <Button
            label="Start a trip"
            size="sm"
            variant="ghost"
            onPress={() => setStarting(true)}
          />
        }
      >
        Trips
      </SectionHeading>
      {detail.trips.length === 0 ? (
        <Text className="text-sm text-muted">
          Every session is part of a trip, like a weekend in Vegas or this month's home games. Start
          one, and its sessions get their own leaderboard, awards and settle-up.
        </Text>
      ) : null}
      {going.map((trip) => (
        <Pressable
          key={trip.id}
          accessibilityRole="button"
          accessibilityLabel={`${trip.name}, live board`}
          onPress={() => navigation.navigate("Trip", { tripId: trip.id })}
          className="gap-3 rounded-2xl bg-board p-4 active:opacity-90"
        >
          <View className="gap-0.5">
            <Text className="text-[11px] font-semibold tracking-[2px] text-board-amber uppercase">
              Live board · {tripDates(trip)}
            </Text>
            <Text
              numberOfLines={1}
              className="text-2xl font-black tracking-tight text-board-ink uppercase"
            >
              {trip.name}
            </Text>
          </View>
          <Loaded query={stacks.trip(trip.id)} skeleton={<View className="h-6" />}>
            {(detailed) => <Leaders detail={detail} trip={detailed} />}
          </Loaded>
        </Pressable>
      ))}
      {past.length > 0 ? (
        <List>
          {past.map((trip) => (
            <Row
              key={trip.id}
              accessibilityHint="Opens the trip's board"
              onPress={() => navigation.navigate("Trip", { tripId: trip.id })}
            >
              <Text numberOfLines={1} className="flex-1 text-base text-ink">
                {trip.name}
              </Text>
              <Text className="text-sm text-muted">{tripDates(trip)}</Text>
              <Icon name="chevron-right" color="faint" size={18} />
            </Row>
          ))}
        </List>
      ) : null}
      {starting ? <StartTripSheet detail={detail} onClose={() => setStarting(false)} /> : null}
    </View>
  );
}

/** The top three on the trip's board so far. */
function Leaders({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const names = playerNames(detail);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const top = tripStandings(closed, localClock).slice(0, 3);
  if (top.length === 0)
    return <Text className="text-sm text-board-muted">The board fills in as sessions close.</Text>;
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      {top.map((s) => (
        <View key={s.playerId} className="flex-row items-center gap-2">
          <Text className="text-sm text-board-amber">{s.rank}</Text>
          <Chip chip={chipOf(detail, s.playerId)} name={names.get(s.playerId) ?? ""} size={22} />
          <Text className={`text-sm ${s.net >= 0 ? "text-board-win" : "text-board-loss"}`}>
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

function StartTripSheet({ detail, onClose }: { detail: GroupDetail; onClose: () => void }) {
  const navigation = useNavigation();
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
      params: { groupId: detail.group.id },
      payload: {
        id: TripId.make(newId()),
        name: name.trim(),
        startedAt: DateTime.makeUnsafe(start.getTime()),
      },
    });
    if (!saved) return;
    onClose();
    navigation.navigate("Trip", { tripId: saved.id });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Start a trip"
      description="Sessions you start in it go on its board and settle up on their own."
    >
      <TextField
        label="Trip name"
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder={`Vegas ${now.getFullYear()}`}
      />
      <Choice label="Started" options={STARTS} value={daysAgo} onChange={setDaysAgo} columns={2} />
      {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
      <Button
        label="Start trip"
        variant="primary"
        size="lg"
        pending={create.pending}
        onPress={() => void submit()}
      />
    </Sheet>
  );
}
