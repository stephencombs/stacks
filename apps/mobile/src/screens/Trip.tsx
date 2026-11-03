import { useAuth } from "@clerk/expo";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import { tripDates } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { List, PageTitle, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { ToastHost } from "../components/ui/Toast";
import { LiveBar } from "../features/LiveBar";
import { PersonalLimits } from "../features/PersonalLimits";
import { TripStats } from "../features/RaceStats";
import { LiveSessionCard, SessionList } from "../features/SessionList";
import { DaysBoard, TonightBoard, TripBoard } from "../features/TripBoard";
import { TripHero } from "../features/TripHero";
import { TripRoute } from "../features/TripRoute";
import { Loaded, useAction, useLastTrip, useRememberTrip, useStacks } from "../lib/stacks";
import { SettleView } from "../features/SettleUp";
import { TripTabs } from "../features/TripTabs";
import type { TripTab } from "../features/tripTabConfig";

type Props = StaticScreenProps<{ tripId: string; tab?: TripTab }>;

export function TripScreen({ route }: Props) {
  return <TripHome tripId={TripId.make(route.params.tripId)} tab={route.params.tab} />;
}

export function TripHome({ tripId, tab }: { tripId: TripId; tab?: TripTab | undefined }) {
  const stacks = useStacks();
  useRememberTrip(tripId);
  return (
    <Loaded query={stacks.trip(tripId)} skeleton={<Skeleton className="m-4 h-96" />}>
      {(trip) => (
        <Loaded
          query={stacks.group(trip.trip.groupId)}
          skeleton={<Skeleton className="m-4 h-96" />}
        >
          {(group) => (
            <TripTabs
              key={tab ?? "default"}
              initial={tab ?? "table"}
              render={(shown, barHeight) => (
                <TripTabScreen trip={trip} group={group} tab={shown} barHeight={barHeight} />
              )}
            />
          )}
        </Loaded>
      )}
    </Loaded>
  );
}

function TripTabScreen({
  trip,
  group,
  tab,
  barHeight,
}: {
  trip: TripDetail;
  group: GroupDetail;
  tab: TripTab;
  barHeight: number;
}) {
  const mine = trip.sessions.find(
    (s) => s.session.status === "live" && s.playerIds.includes(group.myPlayerId),
  );
  return (
    <View className="flex-1 bg-canvas">
      <ToastHost above={barHeight}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerClassName="gap-6 pt-4 pb-24"
        >
          <TripTitle trip={trip} group={group} />
          <PersonalLimits group={group} trip={trip} settings={tab === "table"} />
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
      <LiveBar bottom={barHeight} />
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
  const stacks = useStacks();
  const otherGroups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []).filter(
    (item) => item.group.id !== group.group.id,
  );
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
      {otherGroups.length > 0 ? (
        <List>
          {otherGroups.map((item) => {
            const going = item.trips.find((other) => other.endedAt === null);
            return (
              <Row
                key={item.group.id}
                onPress={() =>
                  go(() =>
                    going
                      ? navigation.navigate("Trip", { tripId: going.id })
                      : navigation.navigate("Group", { groupId: item.group.id }),
                  )
                }
              >
                <Text className="flex-1 text-base text-ink">{item.group.name}</Text>
                {going ? <Text className="text-sm text-muted">{going.name}</Text> : null}
              </Row>
            );
          })}
        </List>
      ) : null}
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
  const navigation = useNavigation();
  const live = trip.sessions.filter((s) => s.session.status === "live" && s !== mine);
  const closed = trip.sessions.filter((s) => s.session.status === "closed").toReversed();
  return (
    <View className="gap-6 px-4">
      <TripHero
        group={group}
        sessions={trip.sessions.filter((s) => s.session.status === "closed")}
      />
      {mine ? <LiveSessionCard summary={mine} detail={group} /> : null}
      {trip.trip.endedAt === null ? (
        <Button
          label="Start a session"
          variant={mine ? "secondary" : "primary"}
          size="lg"
          onPress={() => navigation.navigate("NewSession", { tripId: trip.trip.id })}
        />
      ) : (
        <Text className="text-base text-muted">This trip has ended. Reopen it to play more.</Text>
      )}
      {live.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>{mine ? "Other live sessions" : "Live sessions"}</SectionHeading>
          <SessionList sessions={live} detail={group} />
        </View>
      ) : null}
      {closed.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Past sessions</SectionHeading>
          <SessionList sessions={closed} detail={group} />
        </View>
      ) : null}
    </View>
  );
}

const boardViews = [
  { value: "trip", label: "Standings" },
  { value: "tonight", label: "Tonight" },
  { value: "days", label: "Days" },
  { value: "race", label: "Race" },
  // The route draws on the phone's own maps, which the web build doesn't have.
  ...(Platform.OS === "web" ? [] : [{ value: "route", label: "Route" } as const]),
] as const;

function BoardTab({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const [view, setView] = useState<(typeof boardViews)[number]["value"]>("trip");
  return (
    <View className="gap-2">
      <View className="px-4">
        <Choice label="Show" options={boardViews} value={view} onChange={setView} />
      </View>
      {view === "tonight" ? (
        <TonightBoard detail={group} trip={trip} />
      ) : view === "trip" ? (
        <TripBoard detail={group} trip={trip} />
      ) : view === "days" ? (
        <DaysBoard detail={group} trip={trip} />
      ) : view === "route" ? (
        <TripRoute detail={group} trip={trip} />
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
  const { lastTripId, setLastTripId } = useLastTrip();
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
            void end.run({ params, payload: {} }).then((ok) => {
              if (ok) {
                onClose();
                navigation.navigate("Trip", { tripId: trip.trip.id, tab: "money" });
              }
            })
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
                if (lastTripId === trip.trip.id) setLastTripId(null);
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
