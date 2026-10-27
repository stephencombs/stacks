import { useAtomValue } from "@effect/atom-react";
import { VenueId, type GroupId, type Venue } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Location from "expo-location";
import { useState } from "react";
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
  venue: Venue;
  selected: boolean;
  onSelect: () => void;
}) {
  const place = [venue.city, venue.region].filter(Boolean).join(", ");
  const detail = [
    place || (venue.kind === "online" ? "Online" : venue.kind === "home" ? "Home game" : ""),
    venue.verified ? "" : "Unverified",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={venue.name}
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      className={cn("rounded-xl px-3 py-2.5", selected ? "bg-accent" : "active:bg-sunken")}
    >
      <Text
        numberOfLines={1}
        className={cn("text-base font-medium", selected ? "text-accent-ink" : "text-ink")}
      >
        {venue.name}
      </Text>
      {detail ? (
        <Text
          numberOfLines={1}
          className={cn("text-sm", selected ? "text-accent-ink/70" : "text-muted")}
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
  const result = useAtomValue(stacks.venueSearch(groupId, search));
  const venues = AsyncResult.getOrElse(result, () => []);
  if (AsyncResult.isInitial(result) || (result.waiting && venues.length === 0)) {
    return <Text className="px-3 py-2 text-sm text-muted">Searching…</Text>;
  }
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
          label={locating === "busy" ? "Finding you…" : near ? "Near you" : "Near me"}
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
            <Text className="px-3 pb-1 text-xs font-semibold tracking-widest text-muted uppercase">
              Recent
            </Text>
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
        columns={3}
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
      <Button
        label="Add venue"
        variant="primary"
        size="lg"
        pending={create.pending}
        onPress={() => void submit()}
      />
    </Sheet>
  );
}
