import type { VenueId } from "@stacks/contracts";
import type { CachedVenue } from "@stacks/client-runtime/recording";
import { useVenueSearch } from "@stacks/client-runtime/recordingReact";
import { venuePlace } from "@stacks/client-runtime/recordingView";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, TextInput, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { Text } from "../components/ui/Text";

import { appleMapsSearch, type AppleMapsPlace } from "../../modules/apple-maps-search/src";
import { Button } from "../components/ui/Button";
import { ControlSurface } from "../components/ui/ControlSurface";
import { FormError, TextField } from "../components/ui/Field";
import { GlassSurface } from "../components/ui/GlassSurface";
import { Icon } from "../components/ui/Icon";
import { PressableScale } from "../components/ui/PressableScale";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, Surface } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { useDebounced } from "../lib/useDebounced";

const placeDetail = (place: AppleMapsPlace) =>
  place.address || [place.city, place.region, place.country].filter(Boolean).join(", ");

const usesAppleMapsOnly = () => Platform.OS === "ios" && appleMapsSearch !== null;

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

function FloatingCasinoSearchBar({
  value,
  onChangeText,
  onClose,
}: {
  value: string;
  onChangeText: (next: string) => void;
  onClose: () => void;
}) {
  const muted = String(useCSSVariable("--color-muted"));

  return (
    <View className="flex-row items-center gap-2.5">
      <GlassSurface
        radius={22}
        interactive
        className="h-11 flex-1 flex-row items-center gap-2 rounded-full px-3.5"
      >
        <Icon name="search" color="ink" size={18} />
        <TextInput
          accessibilityLabel="Search casinos"
          value={value}
          onChangeText={onChangeText}
          placeholder="Search casinos"
          placeholderTextColor={muted}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          className="flex-1 text-base text-ink"
        />
      </GlassSurface>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        hitSlop={6}
        className="size-11 items-center justify-center"
      >
        <ControlSurface>
          <Icon name="close" color="ink" size={18} />
        </ControlSurface>
      </PressableScale>
    </View>
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
        <Text numberOfLines={2} className="text-base font-medium text-ink">
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
  const ios = Platform.OS === "ios";

  return (
    <Sheet
      open
      back={!ios}
      large
      hideHeader={ios}
      floatingFooter={ios}
      title={picker.context === "default" ? "Default casino" : "Casino"}
      footer={
        ios ? (
          <FloatingCasinoSearchBar value={text} onChangeText={setText} onClose={onClose} />
        ) : (
          <CasinoSearchField value={text} onChangeText={setText} />
        )
      }
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
 * The casino a personal session was at. On iOS, native Apple Maps (`MKLocalSearch`) is the sole
 * search source and picking a place resolves it to a canonical venue; Android searches the catalog.
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
  const appleOnly = usesAppleMapsOnly();
  const search = useVenueSearch(appleOnly ? "" : q, appleOnly ? null : near);

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
    if (!appleOnly || !appleMapsSearch || (!q && !near)) return;
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
  }, [appleOnly, appleKey, q, near]);

  const pickApplePlace = async (place: AppleMapsPlace, key: string) => {
    if (resolvingKey !== null) return;
    setResolvingKey(key);
    setResolveError(null);

    try {
      const resolved = await search.resolveVenue({
        name: place.name,
        city: place.city,
        region: place.region,
        country: place.country,
        lat: place.lat,
        lng: place.lng,
      });

      onSelect(resolved);
    } catch {
      setResolveError("Couldn't save that casino right now. Check your connection and try again.");
    } finally {
      setResolvingKey(null);
    }
  };

  if (appleOnly) {
    const appleSearching = (q !== "" || near !== null) && appleState?.key !== appleKey;
    const applePlaces = appleState?.key === appleKey ? appleState.places : [];

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
        {appleSearching && applePlaces.length === 0 ? (
          <Text accessibilityLiveRegion="polite" className="px-1 text-sm text-muted">
            Searching…
          </Text>
        ) : !appleSearching && applePlaces.length === 0 && (q || near) ? (
          <Text accessibilityLiveRegion="polite" className="px-1 text-sm text-muted">
            {q ? `No casinos match “${q}”.` : "No casinos found near you. Search by name instead."}
          </Text>
        ) : null}
        {applePlaces.length > 0 || selectedId !== null ? (
          <List>
            {applePlaces.map((place) => {
              const key = `${place.name}:${place.lat.toFixed(4)}:${place.lng.toFixed(4)}`;
              const busy = resolvingKey === key;

              return (
                <Row
                  key={key}
                  accessibilityLabel={place.name}
                  onPress={busy ? undefined : () => void pickApplePlace(place, key)}
                  className="py-4"
                >
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text numberOfLines={2} className="type-heading text-ink">
                      {place.name}
                    </Text>
                    {placeDetail(place) ? (
                      <Text numberOfLines={1} className="type-footnote text-muted">
                        {placeDetail(place)}
                      </Text>
                    ) : null}
                  </View>
                  {busy ? <ActivityIndicator size="small" /> : null}
                </Row>
              );
            })}
            {selectedId !== null ? (
              <Row
                accessibilityLabel={context === "default" ? "Not set" : "Not listed"}
                onPress={() => onSelect(null)}
                className="py-4"
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="type-heading text-ink">
                    {context === "default" ? "Not set" : "Not listed"}
                  </Text>
                  <Text className="type-footnote text-muted">
                    {context === "default"
                      ? "Start new sessions without a casino"
                      : "Keep this session without a casino"}
                  </Text>
                </View>
              </Row>
            ) : null}
          </List>
        ) : null}
      </View>
    );
  }

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
