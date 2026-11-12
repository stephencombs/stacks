import { useAtomValue } from "@effect/atom-react";
import { StackActions, useNavigation } from "@react-navigation/native";
import { scopeTrips, tripDates, unsettledAmount } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useState } from "react";
import { Platform, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button, FilterPill } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { HeaderTitle } from "../components/ui/HeaderTitle";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading, Skeleton, Tag } from "../components/ui/Surface";
import { useGo } from "../lib/go";
import { tripIsLive, type Scope } from "@stacks/client-runtime/scope";
import { useScope } from "../lib/scope";
import { useStacks } from "../lib/stacks";
import { NoTrips, StartTripSheet } from "./Trips";

/** Where you are: the group over the trip, at the top of every place. Tapping it switches. */
export function ScopeButton({ title }: { title?: string } = {}) {
  const { scope } = useScope();
  const [open, setOpen] = useState(false);
  if (!scope)
    return (
      <View
        accessibilityElementsHidden
        className="min-h-9 w-40 flex-row items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2"
      >
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </View>
    );
  const { item, trip } = scope;
  return (
    <>
      {Platform.OS === "ios" ? (
        <HeaderTitle
          title={title || trip?.name || item.group.name}
          context={`${item.group.name} · ${trip?.name ?? "No trips yet"}`}
          onExpand={() => setOpen(true)}
        />
      ) : (
        <FilterPill
          sublabel={item.group.name}
          label={trip?.name ?? "No trips yet"}
          accessibilityLabel={`${item.group.name}, ${trip?.name ?? "no trips yet"}`}
          accessibilityHint="Switch to another trip or group"
          trailing={<Icon name="chevron-down" color="muted" size={14} />}
          onPress={() => setOpen(true)}
        />
      )}
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
            item.trips.length === 0 ? undefined : (
              <Button
                label="New trip"
                size="sm"
                variant="ghost"
                onPress={() => setStarting(true)}
              />
            )
          }
        >
          Trips
        </SectionHeading>
        {item.trips.length === 0 ? (
          <NoTrips onStart={() => setStarting(true)} />
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
                      <Text numberOfLines={1} className="shrink text-base font-medium text-ink">
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
        <Row onPress={then(() => navigation.navigate("Account", { screen: "Groups" }))}>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-medium text-ink">All groups</Text>
            <Text className="text-sm text-muted">Start a new group</Text>
          </View>
          <Icon name="chevron-right" color="faint" size={18} />
        </Row>
        <Row onPress={then(() => navigation.dispatch(StackActions.popTo("Home")))}>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-medium text-ink">Your play</Text>
            <Text className="text-sm text-muted">Sessions saved on this device</Text>
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
