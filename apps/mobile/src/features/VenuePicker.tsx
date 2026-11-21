import type { VenueId } from "@stacks/contracts";
import type { CachedVenue } from "@stacks/client-runtime/recording";
import { useVenueSearch } from "@stacks/client-runtime/recordingReact";
import { venuePlace } from "@stacks/client-runtime/recordingView";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { Surface } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
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
      className={cn(
        "min-h-11 flex-row items-center gap-3 rounded-xl px-3 py-2.5",
        selected ? "bg-fill" : "active:bg-fill",
      )}
    >
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-base font-medium text-ink">
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="text-sm text-muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" color="ink" size={18} /> : null}
    </Pressable>
  );
}

type Near = { lat: number; lng: number };

export function CasinoPickerSheet({
  onClose,
  onSelect,
  ...picker
}: Parameters<typeof SessionVenuePicker>[0] & { onClose: () => void }) {
  return (
    <Sheet
      open
      back
      title={picker.context === "default" ? "Default casino" : "Casino"}
      onClose={onClose}
    >
      <SessionVenuePicker
        {...picker}
        onSelect={(venue) => {
          onSelect(venue);
          onClose();
        }}
      />
    </Sheet>
  );
}

const here = () =>
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(
    (position) => ({ lat: position.coords.latitude, lng: position.coords.longitude }),
    () => null,
  );

/**
 * The casino a personal session was at: nearby casinos first when location is allowed, then by
 * name as you type, and "Not listed" for none. Searching needs the network; casinos this device
 * has saved stay pickable without it. `selectedId` keeps an uncached casino distinct from none.
 */
export function SessionVenuePicker({
  selectedId,
  selected,
  onSelect,
  context = "session",
}: {
  selectedId: VenueId | null;
  selected: CachedVenue | null;
  onSelect: (venue: CachedVenue | null) => void;
  context?: "session" | "default";
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
        inputClassName="rounded-[10px]"
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
      <Surface className="rounded-[14px] p-1">
        <View accessibilityRole="radiogroup">
          {heading ? <Text className="px-2 pb-1 text-sm text-muted">{heading}</Text> : null}
          {selectedId !== null && !shown.some((venue) => venue.id === selectedId) ? (
            <Text accessibilityLiveRegion="polite" className="px-3 py-2 text-sm text-muted">
              Current casino unavailable. This session keeps it until you choose another casino or{" "}
              {context === "default" ? "Not set" : "Not listed"}.
            </Text>
          ) : null}
          {shown.map((venue) => (
            <VenueOption
              key={venue.id}
              venue={venue}
              selected={selectedId === venue.id}
              onSelect={() => onSelect(venue)}
            />
          ))}
          <OptionRow
            title={context === "default" ? "Not set" : "Not listed"}
            detail={
              context === "default"
                ? "Start new sessions without a casino"
                : "Keep this session without a casino"
            }
            selected={selectedId === null}
            onSelect={() => onSelect(null)}
          />
        </View>
      </Surface>
    </View>
  );
}
