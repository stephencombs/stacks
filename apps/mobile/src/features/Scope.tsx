import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type { GroupListItem, Trip } from "@stacks/contracts";
import { scopeTrips, tripDates, unsettledAmount } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading, Skeleton, Tag } from "../components/ui/Surface";
import { useGo } from "../lib/go";
import { tripIsLive, type Scope } from "@stacks/client-runtime/scope";
import { useScope } from "../lib/scope";
import { useStacks } from "../lib/stacks";
import { StartTripSheet } from "./Trips";

/** Where you are: the group over the trip, at the top of every place. Tapping it switches. */
export function ScopeButton() {
  const { scope } = useScope();
  const [open, setOpen] = useState(false);
  if (!scope)
    return (
      <View accessibilityElementsHidden className="min-h-11 w-36 justify-center gap-1.5 px-3">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-4 w-28" />
      </View>
    );
  const { item, trip } = scope;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.group.name}, ${trip?.name ?? "no trips yet"}`}
        accessibilityHint="Switch to another trip or group"
        onPress={() => setOpen(true)}
        className="min-h-11 max-w-64 justify-center rounded-xl border border-line bg-sunken px-3 py-1 active:bg-fill"
      >
        <Text numberOfLines={1} className="text-xs font-medium text-muted">
          {item.group.name}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text numberOfLines={1} className="shrink font-display text-xl leading-6 text-ink">
            {trip?.name ?? "No trips yet"}
          </Text>
          <Icon name="chevron-down" color="accent-text" size={14} />
        </View>
      </Pressable>
      {open ? <ScopeSheet scope={scope} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ScopeSheet({ scope, onClose }: { scope: Scope; onClose: () => void }) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const go = useGo();
  const { setTrip, setGroup } = useScope();
  const { item } = scope;
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  // Open balances come with the group, which the places load anyway; rows don't wait for it.
  const detail = AsyncResult.getOrElse(useAtomValue(stacks.group(item.group.id)), () => null);
  const others = groups.filter((other) => other.group.id !== item.group.id);
  const [starting, setStarting] = useState(false);
  const then = (next: () => void) => () => {
    onClose();
    next();
  };
  return (
    <Sheet open onClose={onClose} title={item.group.name}>
      <View className="gap-2">
        <SectionHeading
          action={
            <Button
              label="New trip"
              size="sm"
              variant={item.trips.length === 0 ? "primary" : "ghost"}
              onPress={() => setStarting(true)}
            />
          }
        >
          Trips
        </SectionHeading>
        {item.trips.length === 0 ? (
          <Text className="text-sm text-muted">
            Every session is part of a trip, like a weekend in Vegas or this month's home games.
          </Text>
        ) : (
          <List>
            {scopeTrips(item.trips).map((trip) => {
              const here = trip.id === scope.trip?.id;
              const open = detail ? unsettledAmount(detail, trip.id) : null;
              return (
                <Row
                  key={trip.id}
                  accessibilityHint={here ? "The trip you're in" : "Switches to this trip"}
                  onPress={then(() => setTrip(trip.id))}
                >
                  <View className="min-w-0 flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text
                        numberOfLines={1}
                        className={`shrink text-base text-ink ${here ? "font-semibold" : "font-medium"}`}
                      >
                        {trip.name}
                      </Text>
                      {tripIsLive(item, trip) ? <Tag tone="live">Live</Tag> : null}
                    </View>
                    <Text numberOfLines={1} className="text-sm text-muted">
                      {tripDates(trip)}
                      {open ? (
                        <>
                          {" · "}
                          <Money amount={open} currency={item.group.currency} /> to settle
                        </>
                      ) : null}
                    </Text>
                  </View>
                  {here ? <Icon name="check" color="accent-text" size={18} /> : null}
                </Row>
              );
            })}
          </List>
        )}
      </View>
      <List>
        <Row onPress={then(() => go.group(item.group.id))}>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-medium text-ink">Open {item.group.name}</Text>
            <Text className="text-sm text-muted">Every trip, people and settings</Text>
          </View>
          <Icon name="chevron-right" color="faint" size={18} />
        </Row>
      </List>
      {others.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Your other groups</SectionHeading>
          <List>
            {others.map((other) => {
              const going = other.trips.find((trip) => trip.endedAt === null);
              return (
                <Row key={other.group.id} onPress={then(() => setGroup(other.group.id))}>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="shrink text-base font-medium text-ink">
                        {other.group.name}
                      </Text>
                      {other.liveSessionCount > 0 ? <Tag tone="live">Live</Tag> : null}
                    </View>
                    <Text numberOfLines={1} className="text-sm text-muted">
                      {going
                        ? going.name
                        : other.trips.length === 0
                          ? "No trips yet"
                          : "No trip going"}
                    </Text>
                  </View>
                  <Icon name="chevron-right" color="faint" size={18} />
                </Row>
              );
            })}
          </List>
        </View>
      ) : null}
      <List>
        <Row onPress={then(() => navigation.navigate("Groups"))}>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-medium text-ink">All groups</Text>
            <Text className="text-sm text-muted">Start a new group</Text>
          </View>
          <Icon name="chevron-right" color="faint" size={18} />
        </Row>
      </List>
      {starting ? (
        <StartTripSheet
          groupId={item.group.id}
          first={item.trips.length === 0}
          onClose={() => setStarting(false)}
          onStarted={onClose}
        />
      ) : null}
    </Sheet>
  );
}
