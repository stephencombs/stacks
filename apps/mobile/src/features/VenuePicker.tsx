import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { describeError } from "@stacks/client-runtime/errors";
import * as Cause from "effect/Cause";
import { VenueId, type GroupId, type Venue } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import type { CachedVenue } from "@stacks/client-runtime/recording";
import { useVenueSearch } from "@stacks/client-runtime/recordingReact";
import { venuePlace } from "@stacks/client-runtime/recordingView";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { cn } from "../components/ui/cn";
import { useAction, useStacks } from "../lib/stacks";
import { useDebounced } from "../lib/useDebounced";

function VenueOption({
  venue,
  selected,
  onSelect,
}: {
  venue: CachedVenue & { readonly verified?: boolean };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <OptionRow
      title={venue.name}
      detail={[venuePlace(venue), venue.verified === false ? "Unverified" : ""]
        .filter(Boolean)
        .join(" · ")}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function OptionRow({
  title,
  detail,
  selected,
  onSelect,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      className={cn("min-h-11 rounded-xl px-3 py-2.5", selected ? "bg-ink" : "active:bg-fill")}
    >
      <Text
        numberOfLines={1}
        className={cn("text-base font-medium", selected ? "text-ink-inverse" : "text-ink")}
      >
        {title}
      </Text>
      {detail ? (
        <Text
          numberOfLines={1}
          className={cn("text-sm", selected ? "text-ink-inverse/70" : "text-muted")}
        >
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SearchResults({
  groupId,
  search,
  selected,
  onSelect,
}: {
  groupId: GroupId;
  search: { q: string; near?: { lat: number; lng: number } };
  selected: Venue | null;
  onSelect: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const query = stacks.venueSearch(groupId, search);
  const result = useAtomValue(query);
  const retry = useAtomRefresh(query);
  const venues = AsyncResult.getOrElse(result, () => []);
  if (AsyncResult.isInitial(result) || (result.waiting && venues.length === 0)) {
    return <Text className="px-3 py-2 text-sm text-muted">Searching…</Text>;
  }
  if (AsyncResult.isFailure(result))
    return (
      <View className="gap-3 px-3">
        <FormError>{describeError(Cause.squash(result.cause))}</FormError>
        <Button label="Retry venue search" onPress={retry} />
      </View>
    );
  if (venues.length === 0)
    return <Text className="px-3 py-2 text-sm text-muted">No venues match “{search.q}”.</Text>;
  return (
    <>
      {venues.map((venue) => (
        <VenueOption
          key={venue.id}
          venue={venue}
          selected={selected?.id === venue.id}
          onSelect={() => onSelect(venue)}
        />
      ))}
    </>
  );
}

type Near = { lat: number; lng: number };

const here = () =>
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(
    (position): Near => ({ lat: position.coords.latitude, lng: position.coords.longitude }),
    () => null,
  );

/**
 * The casino a personal session was at: nearby casinos first when location is allowed, then by
 * name as you type, and "Not listed" for none. Searching needs the network; casinos this device
 * has saved stay pickable without it. `selected` null is "Not listed".
 */
export function SessionVenuePicker({
  selected,
  onSelect,
}: {
  selected: CachedVenue | null;
  onSelect: (venue: CachedVenue | null) => void;
}) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const [near, setNear] = useState<Near | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const search = useVenueSearch(q, near);

  const locate = async () => {
    setLocating("busy");
    const permission = await Location.requestForegroundPermissionsAsync();
    const position = permission.granted ? await here() : null;
    if (!position) return setLocating("failed");
    setNear(position);
    setLocating("idle");
  };

  // Someone who has already let Color Up see where they are gets nearby casinos first, unasked.
  useEffect(() => {
    let current = true;
    void Location.getForegroundPermissionsAsync().then(async (permission) => {
      const position = permission.granted ? await here() : null;
      if (current && position) setNear(position);
    });
    return () => {
      current = false;
    };
  }, []);

  const shown =
    selected && !search.venues.some((venue) => venue.id === selected.id)
      ? [selected, ...search.venues]
      : search.venues;
  const status =
    search.status === "offline"
      ? "Searching needs a connection. These are the casinos saved on this device."
      : search.status === "searching" && search.venues.length === 0
        ? "Searching…"
        : search.status === "found" && search.venues.length === 0
          ? q
            ? `No casinos match “${q}”.`
            : "No casinos found near you. Search by name instead."
          : search.status === "saved" && search.venues.length === 0
            ? "Search for where you're playing."
            : null;
  const heading =
    search.status === "found" && search.venues.length > 0 && !q
      ? "Near you"
      : search.status === "saved" && search.venues.length > 0
        ? "On this device"
        : null;
  return (
    <View className="gap-3">
      <TextField
        label="Search casinos"
        value={text}
        onChangeText={setText}
        placeholder="Search casinos"
        autoCorrect={false}
        returnKeyType="search"
      />
      {near ? null : (
        <Button
          label="Near me"
          size="sm"
          className="self-start"
          pending={locating === "busy"}
          onPress={() => void locate()}
        />
      )}
      {locating === "failed" ? (
        <Text className="text-sm text-muted">
          Couldn't get your location. Search by name instead.
        </Text>
      ) : null}
      {status ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-muted">
            {status}
          </Text>
          {search.status === "offline" ? (
            <Button label="Try again" size="sm" variant="ghost" onPress={search.retry} />
          ) : null}
        </View>
      ) : null}
      <View accessibilityRole="radiogroup">
        {heading ? <Text className="pb-1 text-sm text-muted">{heading}</Text> : null}
        {shown.map((venue) => (
          <VenueOption
            key={venue.id}
            venue={venue}
            selected={selected?.id === venue.id}
            onSelect={() => onSelect(venue)}
          />
        ))}
        <OptionRow
          title="Not listed"
          detail="Keep this session without a casino"
          selected={selected === null}
          onSelect={() => onSelect(null)}
        />
      </View>
    </View>
  );
}

export function VenuePicker({
  groupId,
  selected,
  onSelect,
}: {
  groupId: GroupId;
  selected: Venue | null;
  onSelect: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const recent = AsyncResult.getOrElse(useAtomValue(stacks.recentVenues(groupId)), () => []);
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const [adding, setAdding] = useState(false);

  const locate = async () => {
    setLocating("busy");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return setLocating("failed");
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null);
    if (!position) return setLocating("failed");
    setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
    setLocating("idle");
  };

  // Someone who has already let Color Up see where they are gets nearby venues first, unasked.
  useEffect(() => {
    if (selected) return;
    let current = true;
    void Location.getForegroundPermissionsAsync().then(async (permission) => {
      if (!permission.granted) return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);
      if (current && position)
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
    });
    return () => {
      current = false;
    };
  }, [selected]);

  const searching = q !== "" || near !== null;
  return (
    <View className="gap-3">
      <TextField
        label="Search venues"
        value={text}
        onChangeText={setText}
        placeholder="Search casinos"
        autoCorrect={false}
        returnKeyType="search"
      />
      <View className="flex-row gap-2">
        <Button
          label={near ? "Near you" : "Near me"}
          size="sm"
          pending={locating === "busy"}
          onPress={() => void locate()}
        />
        <Button label="Add a venue" size="sm" onPress={() => setAdding(true)} />
      </View>
      {locating === "failed" ? (
        <Text className="text-sm text-muted">
          Couldn't get your location. Search by name instead.
        </Text>
      ) : null}
      <View accessibilityRole="radiogroup" className="-mx-3">
        {searching ? (
          <SearchResults
            groupId={groupId}
            search={near && q === "" ? { q, near } : { q }}
            selected={selected}
            onSelect={onSelect}
          />
        ) : recent.length > 0 ? (
          <>
            <Text className="px-3 pb-1 text-sm text-muted">Recent</Text>
            {recent.map((venue) => (
              <VenueOption
                key={venue.id}
                venue={venue}
                selected={selected?.id === venue.id}
                onSelect={() => onSelect(venue)}
              />
            ))}
          </>
        ) : (
          <Text className="px-3 text-sm text-muted">
            Search for where you're playing, or add it.
          </Text>
        )}
        {selected && !searching && !recent.some((venue) => venue.id === selected.id) ? (
          <VenueOption venue={selected} selected onSelect={() => onSelect(selected)} />
        ) : null}
      </View>
      {adding ? (
        <AddVenueSheet
          groupId={groupId}
          initialName={text.trim()}
          onClose={() => setAdding(false)}
          onAdded={(venue) => {
            onSelect(venue);
            setText("");
          }}
        />
      ) : null}
    </View>
  );
}

function AddVenueSheet({
  groupId,
  initialName,
  onClose,
  onAdded,
}: {
  groupId: GroupId;
  initialName: string;
  onClose: () => void;
  onAdded: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("venues", "create"));
  const [kind, setKind] = useState<Venue["kind"]>("casino");
  const [name, setName] = useState(initialName);
  const [city, setCity] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setNameError("Enter the venue's name.");
    setNameError(null);
    const venue = await create.run({
      payload: {
        id: VenueId.make(newId()),
        name: name.trim(),
        kind,
        city: kind === "casino" && city.trim() ? city.trim() : null,
        region: null,
        country: null,
        groupId: kind === "home" ? groupId : null,
      },
    });
    if (venue) {
      onAdded(venue);
      onClose();
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a venue"
      description="Casinos you add are shared with everyone on Stacks. Home games stay private to this group."
      footer={
        <Button
          label="Add venue"
          variant="primary"
          size="lg"
          pending={create.pending}
          onPress={() => void submit()}
        />
      }
    >
      <Choice
        label="Kind"
        options={[
          { value: "casino", label: "Casino" },
          { value: "online", label: "Online" },
          { value: "home", label: "Home game" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        maxLength={80}
        error={nameError}
      />
      {kind === "casino" ? (
        <TextField label="City" value={city} onChangeText={setCity} maxLength={80} />
      ) : null}
      {create.error ? <FormError>{create.error}</FormError> : null}
    </Sheet>
  );
}
