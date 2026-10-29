import { useAuth } from "@clerk/expo";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { localClock, tripDates } from "@stacks/client-runtime/trip";
import { tonightBoard } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/ui/Button";
import { Choice, FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { List, PageTitle, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { ToastHost } from "../components/ui/Toast";
import { cn } from "../components/ui/cn";
import { LiveBar } from "../features/LiveBar";
import { TripStats } from "../features/RaceStats";
import { SessionList } from "../features/SessionList";
import { TonightBoard, TripBoard } from "../features/TripBoard";
import { Loaded, useAction, useStacks } from "../lib/stacks";
import { SessionView } from "./Session";
import { SettleView } from "../features/SettleUp";

type Tab = "table" | "board" | "money";
type Props = StaticScreenProps<{ tripId: string; tab?: Tab }>;

export function TripScreen({ route }: Props) {
  return <TripHome tripId={TripId.make(route.params.tripId)} tab={route.params.tab} />;
}

/** A trip as three views of the same thing: your table, the board, and the money. */
export function TripHome({ tripId, tab }: { tripId: TripId; tab?: Tab | undefined }) {
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(tripId)} skeleton={<Skeleton className="m-4 h-96" />}>
      {(trip) => (
        <Loaded
          query={stacks.group(trip.trip.groupId)}
          skeleton={<Skeleton className="m-4 h-96" />}
        >
          {(group) => <TripTabs trip={trip} group={group} asked={tab} />}
        </Loaded>
      )}
    </Loaded>
  );
}

const tabs = [
  { key: "table", label: "Table" },
  { key: "board", label: "Board" },
  { key: "money", label: "Money" },
] as const;

function TripTabs({
  trip,
  group,
  asked,
}: {
  trip: TripDetail;
  group: GroupDetail;
  asked: Tab | undefined;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(asked ?? (trip.trip.endedAt === null ? "table" : "board"));
  // Coming back with a tab in the link (the live bar asks for the table) switches to it.
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    if (asked) setTab(asked);
  }
  const mine = trip.sessions.find(
    (s) => s.session.status === "live" && s.playerIds.includes(group.myPlayerId),
  );
  const barHeight = 56 + Math.max(insets.bottom, 8);

  return (
    <View className="flex-1 bg-canvas">
      <ToastHost above={barHeight}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerClassName="gap-6 pt-4"
          contentContainerStyle={{ paddingBottom: barHeight + 96 }}
        >
          <TripTitle trip={trip} group={group} />
          {tab === "table" ? (
            <TableTab trip={trip} group={group} mine={mine} />
          ) : tab === "board" ? (
            <BoardTab trip={trip} group={group} />
          ) : (
            <View className="gap-6 px-4">
              <SettleView detail={group} trip={trip} />
            </View>
          )}
        </ScrollView>
      </ToastHost>
      {tab !== "table" && mine ? (
        <LiveBar bottom={barHeight} onPress={() => setTab("table")} />
      ) : null}
      <View
        accessibilityRole="tablist"
        className="absolute inset-x-0 bottom-0 flex-row border-t border-line bg-canvas"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        {tabs.map((option) => {
          const current = option.key === tab;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: current }}
              onPress={() => setTab(option.key)}
              className="h-14 flex-1 items-center justify-center gap-1 active:bg-sunken"
            >
              <View
                className={cn("h-0.5 w-6 rounded-full", current ? "bg-ink" : "bg-transparent")}
              />
              <Text
                className={cn(
                  "text-[15px]",
                  current ? "font-semibold text-ink" : "font-medium text-muted",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The trip's name opens the switcher; the dots open the trip's own options. */
function TripTitle({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const [switching, setSwitching] = useState(false);
  const [options, setOptions] = useState(false);
  return (
    <View className="flex-row items-start gap-3 px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Switch to another trip, the group's stats or its people"
        onPress={() => setSwitching(true)}
        className="flex-1 active:opacity-70"
      >
        <PageTitle context={`${group.group.name} · ${tripDates(trip.trip)} ▾`}>
          {trip.trip.name}
        </PageTitle>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Trip options"
        onPress={() => setOptions(true)}
        className="min-h-11 min-w-11 items-center justify-center rounded-lg active:bg-sunken"
      >
        <Text className="text-xl text-muted">⋯</Text>
      </Pressable>
      {switching ? (
        <Switcher trip={trip} group={group} onClose={() => setSwitching(false)} />
      ) : null}
      {options ? <TripOptions trip={trip} group={group} onClose={() => setOptions(false)} /> : null}
    </View>
  );
}

function Switcher({
  trip,
  group,
  onClose,
}: {
  trip: TripDetail;
  group: GroupDetail;
  onClose: () => void;
}) {
  const navigation = useNavigation();
  const go = (to: () => void) => {
    onClose();
    to();
  };
  const groupId = group.group.id;
  return (
    <Sheet open onClose={onClose} title={group.group.name}>
      <List>
        {group.trips.map((other) => (
          <Row
            key={other.id}
            accessibilityHint="Opens the trip"
            onPress={() =>
              other.id === trip.trip.id
                ? onClose()
                : go(() => navigation.navigate("Trip", { tripId: other.id }))
            }
          >
            <Text numberOfLines={1} className="flex-1 text-base font-medium text-ink">
              {other.name}
            </Text>
            <Text className="text-sm text-muted">
              {other.id === trip.trip.id ? "Here" : tripDates(other)}
            </Text>
          </Row>
        ))}
      </List>
      <List>
        <Row onPress={() => go(() => navigation.navigate("Stats", { groupId }))}>
          <Text className="flex-1 text-base text-ink">All-time stats</Text>
          <Icon name="chevron-right" color="faint" size={18} />
        </Row>
        <Row onPress={() => go(() => navigation.navigate("People", { groupId }))}>
          <Text className="flex-1 text-base text-ink">People</Text>
          <Icon name="chevron-right" color="faint" size={18} />
        </Row>
        <Row onPress={() => go(() => navigation.navigate("Group", { groupId }))}>
          <Text className="flex-1 text-base text-ink">All trips</Text>
          <Icon name="chevron-right" color="faint" size={18} />
        </Row>
        <Row onPress={() => go(() => navigation.navigate("Groups"))}>
          <Text className="flex-1 text-base text-ink">Your groups and account</Text>
          <Icon name="chevron-right" color="faint" size={18} />
        </Row>
      </List>
    </Sheet>
  );
}

/** Your live table if you're seated at one; otherwise a way to start one and what's been played. */
function TableTab({
  trip,
  group,
  mine,
}: {
  trip: TripDetail;
  group: GroupDetail;
  mine: TripDetail["sessions"][number] | undefined;
}) {
  const stacks = useStacks();
  const navigation = useNavigation();
  // The table you just closed stays on screen with its results, until you start the next one.
  const [kept, setKept] = useState(mine?.session.id ?? null);
  if (mine && mine.session.id !== kept) setKept(mine.session.id);
  const shown = trip.sessions.find((s) => s.session.id === kept);
  const live = trip.sessions.filter((s) => s.session.status === "live");
  const closed = trip.sessions.filter((s) => s.session.status === "closed").toReversed();
  // One tree either way, so the table you're at stays mounted as it closes and shows its receipt.
  return (
    <View className="gap-6 px-4">
      {mine ? null : trip.trip.endedAt === null ? (
        <Button
          label="Start a session"
          variant="primary"
          size="lg"
          onPress={() => navigation.navigate("NewSession", { tripId: trip.trip.id })}
        />
      ) : (
        <Text className="text-base text-muted">This trip has ended. Reopen it to play more.</Text>
      )}
      {shown ? (
        <Loaded query={stacks.session(shown.session.id)} skeleton={<Skeleton className="h-96" />}>
          {(session) => <SessionView detail={session} group={group} />}
        </Loaded>
      ) : null}
      {!mine && live.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Live now</SectionHeading>
          <SessionList sessions={live} detail={group} />
        </View>
      ) : null}
      {!mine && closed.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Sessions</SectionHeading>
          <SessionList sessions={closed} detail={group} />
        </View>
      ) : null}
    </View>
  );
}

const boardViews = [
  { value: "tonight", label: "Tonight" },
  { value: "trip", label: "Trip" },
  { value: "race", label: "Race" },
] as const;

function BoardTab({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  // Opens on tonight while there's anything on it.
  const [view, setView] = useState<(typeof boardViews)[number]["value"]>(() =>
    tonightBoard(
      trip.sessions.filter((s) => s.session.status === "closed"),
      trip.sessions.filter((s) => s.session.status === "live"),
      localClock,
      DateTime.nowUnsafe(),
    ).length > 0
      ? "tonight"
      : "trip",
  );
  return (
    <View className="gap-2">
      <View className="px-4">
        <Choice label="Show" options={boardViews} value={view} onChange={setView} columns={3} />
      </View>
      {view === "tonight" ? (
        <TonightBoard detail={group} trip={trip} />
      ) : view === "trip" ? (
        <TripBoard detail={group} trip={trip} />
      ) : (
        <TripStats detail={group} trip={trip} />
      )}
    </View>
  );
}

function TripOptions({
  trip,
  group,
  onClose,
}: {
  trip: TripDetail;
  group: GroupDetail;
  onClose: () => void;
}) {
  const navigation = useNavigation();
  const stacks = useStacks();
  const { userId } = useAuth();
  const end = useAction(stacks.Client.mutation("trips", "end"));
  const reopen = useAction(stacks.Client.mutation("trips", "reopen"));
  const remove = useAction(stacks.Client.mutation("trips", "delete"));
  const [confirming, setConfirming] = useState(false);
  const params = { tripId: trip.trip.id };
  const canDelete =
    trip.sessions.length === 0 && (isAdmin(group) || trip.trip.createdBy === userId);
  const error = end.error ?? reopen.error ?? remove.error;

  return (
    <Sheet open onClose={onClose} title={trip.trip.name}>
      {trip.trip.endedAt === null ? (
        <Button
          label="End trip"
          size="lg"
          pending={end.pending}
          onPress={() =>
            void end.run({ params, payload: {} }).then((ok) => (ok ? onClose() : undefined))
          }
        />
      ) : (
        <Button
          label="Reopen trip"
          size="lg"
          pending={reopen.pending}
          onPress={() => void reopen.run({ params }).then((ok) => (ok ? onClose() : undefined))}
        />
      )}
      {canDelete ? (
        <View className="gap-2">
          {confirming ? (
            <Text className="text-sm text-muted">
              Nothing has been played in it yet, so nothing else changes.
            </Text>
          ) : null}
          <Button
            label={confirming ? "Delete for good" : "Delete trip"}
            variant="danger"
            size="lg"
            pending={remove.pending}
            onPress={() => {
              if (!confirming) return setConfirming(true);
              void remove.run({ params }).then((ok) => {
                if (!ok) return;
                onClose();
                navigation.goBack();
              });
            }}
          />
        </View>
      ) : null}
      {error ? <FormError>{error}</FormError> : null}
    </Sheet>
  );
}
