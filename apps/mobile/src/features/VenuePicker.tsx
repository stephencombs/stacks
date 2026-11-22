import type { VenueId } from "@stacks/contracts";
import type { CachedVenue } from "@stacks/client-runtime/recording";
import { useVenueSearch } from "@stacks/client-runtime/recordingReact";
import { venuePlace } from "@stacks/client-runtime/recordingView";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { Text } from "../components/ui/Text";

import { appleMapsSearch, type AppleMapsPlace } from "../../modules/apple-maps-search/src";
import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { Surface } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { useDebounced } from "../lib/useDebounced";

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const placeDetail = (place: AppleMapsPlace) =>
  [place.city, place.region, place.country].filter(Boolean).join(", ");

const samePlace = (venue: CachedVenue, place: AppleMapsPlace) => {
  if (normalize(venue.name) !== normalize(place.name)) return false;

  if (
    venue.lat !== null &&
    venue.lng !== null &&
    Math.abs(venue.lat - place.lat) < 0.01 &&
    Math.abs(venue.lng - place.lng) < 0.01
  ) {
    return true;
  }

  return normalize(venue.city) === normalize(place.city);
};

function CasinoSearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (next: string) => void;
}) {
  return (
    <TextField
      label=""
      accessibilityLabel="Search casinos"
      value={value}
      onChangeText={onChangeText}
      placeholder="Search casinos"
      autoCorrect={false}
      returnKeyType="search"
      inputClassName="rounded-[10px]"
    />
  );
}

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
  busy = false,
  onSelect,
}: {
  title: string;
  detail: string;
  selected: boolean;
  busy?: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: selected, busy }}
      disabled={busy}
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
      {busy ? (
        <ActivityIndicator size="small" />
      ) : selected ? (
        <Icon name="check" color="ink" size={18} />
      ) : null}
    </Pressable>
  );
}

type Near = { lat: number; lng: number };

export function CasinoPickerSheet({
  onClose,
  onSelect,
  ...picker
}: Omit<Parameters<typeof SessionVenuePicker>[0], "query"> & { onClose: () => void }) {
  const [text, setText] = useState("");

  return (
    <Sheet
      open
      back
      large
      title={picker.context === "default" ? "Default casino" : "Casino"}
      footer={<CasinoSearchField value={text} onChangeText={setText} />}
      onClose={onClose}
    >
      <SessionVenuePicker
        {...picker}
        query={text}
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
 * name as you type, and "Not listed" for none. On iOS, native Apple Maps (`MKLocalSearch`) runs
 * alongside the catalog; picking an Apple Maps place resolves it to a canonical venue.
 */
export function SessionVenuePicker({
  selectedId,
  selected,
  onSelect,
  context = "session",
  query,
}: {
  selectedId: VenueId | null;
  selected: CachedVenue | null;
  onSelect: (venue: CachedVenue | null) => void;
  context?: "session" | "default";
  /** Controlled search text when the sheet pins the search bar in its footer. */
  query?: string;
}) {
  const [localText, setLocalText] = useState("");
  const text = query ?? localText;
  const q = useDebounced(text.trim());
  const [near, setNear] = useState<Near | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const search = useVenueSearch(q, near);

  const [appleState, setAppleState] = useState<{
    key: string;
    places: ReadonlyArray<AppleMapsPlace>;
  } | null>(null);

  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

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

  const appleKey = JSON.stringify([q, near?.lat ?? null, near?.lng ?? null]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !appleMapsSearch || (!q && !near)) return;
    let current = true;

    void appleMapsSearch.searchCasinos(q, near?.lat ?? null, near?.lng ?? null).then(
      (places) => {
        if (current) setAppleState({ key: appleKey, places });
      },
      () => {
        if (current) setAppleState({ key: appleKey, places: [] });
      },
    );

    return () => {
      current = false;
    };
  }, [appleKey, q, near]);

  const shown =
    selected && !search.venues.some((venue) => venue.id === selected.id)
      ? [selected, ...search.venues]
      : search.venues;

  const applePlaces =
    appleState?.key === appleKey
      ? appleState.places.filter((place) => !shown.some((venue) => samePlace(venue, place)))
      : [];

  const totalFound = search.venues.length + applePlaces.length;

  const status =
    search.status === "offline" && applePlaces.length === 0
      ? "Searching needs a connection. These are the casinos saved on this device."
      : search.status === "searching" && totalFound === 0
        ? "Searching…"
        : search.status === "found" && totalFound === 0
          ? q
            ? `No casinos match “${q}”.`
            : "No casinos found near you. Search by name instead."
          : search.status === "saved" && totalFound === 0
            ? "Search for where you're playing."
            : null;

  const heading =
    search.status === "found" && search.venues.length > 0 && !q
      ? "Near you"
      : search.status === "saved" && search.venues.length > 0
        ? "On this device"
        : null;

  const pickApplePlace = async (place: AppleMapsPlace, key: string) => {
    if (resolvingKey !== null) return;
    setResolvingKey(key);
    setResolveError(null);

    try {
      const resolved = await search.resolveVenue(place);
      onSelect(resolved);
    } catch {
      setResolveError("Couldn't save that casino right now. Check your connection and try again.");
    } finally {
      setResolvingKey(null);
    }
  };

  return (
    <View className="gap-3">
      {query === undefined ? (
        <CasinoSearchField value={localText} onChangeText={setLocalText} />
      ) : null}
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
      {resolveError ? <FormError>{resolveError}</FormError> : null}
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
          {applePlaces.length > 0 ? (
            <>
              <Text className="px-2 pt-2 pb-1 text-sm text-muted">Apple Maps</Text>
              {applePlaces.map((place) => {
                const key = `${place.name}:${place.lat.toFixed(4)}:${place.lng.toFixed(4)}`;

                return (
                  <OptionRow
                    key={key}
                    title={place.name}
                    detail={placeDetail(place)}
                    selected={false}
                    busy={resolvingKey === key}
                    onSelect={() => void pickApplePlace(place, key)}
                  />
                );
              })}
            </>
          ) : null}
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
