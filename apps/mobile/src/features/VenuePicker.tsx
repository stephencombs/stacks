import type { VenueId } from "@stacks/contracts";
import type { CachedVenue } from "@stacks/client-runtime/recording";
import { useVenueSearch } from "@stacks/client-runtime/recordingReact";
import { venuePlace } from "@stacks/client-runtime/recordingView";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";

import { appleMapsSearch, type AppleMapsPlace } from "../../modules/apple-maps-search/src";
import { Button } from "../components/ui/Button";
import { SearchablePickerSheet } from "../components/ui/SearchablePickerSheet";
import { PickerRows } from "../components/ui/PickerRows";
import { Text } from "../components/ui/Text";
import { useDebounced } from "../lib/useDebounced";

type Near = { lat: number; lng: number };

type Nearby =
  | { phase: "checking" | "locating" | "denied" | "failed"; near: null }
  | { phase: "ready"; near: Near };

type Option = {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly selected: boolean;
  readonly pick: () => CachedVenue | null | Promise<CachedVenue | null>;
};

const saveFailed = "Couldn't save that casino right now. Check your connection and try again.";

const placeDetail = (place: AppleMapsPlace) =>
  place.address || [place.city, place.region, place.country].filter(Boolean).join(", ");

const usesAppleMapsOnly = () => Platform.OS === "ios" && appleMapsSearch !== null;

const here = () =>
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(
    (position) => ({ lat: position.coords.latitude, lng: position.coords.longitude }),
    () => null,
  );

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const isSavedCasino = (place: AppleMapsPlace, venue: CachedVenue) =>
  sameName(place.name, venue.name) &&
  venue.lat !== null &&
  venue.lng !== null &&
  Math.abs(place.lat - venue.lat) < 0.005 &&
  Math.abs(place.lng - venue.lng) < 0.005;

function useNearby() {
  const [nearby, setNearby] = useState<Nearby>({ phase: "checking", near: null });

  useEffect(() => {
    let current = true;

    const resolveNearby = async () => {
      const permission = await Location.getForegroundPermissionsAsync();

      if (!permission.granted) return { phase: "denied", near: null } as const;

      if (current) setNearby({ phase: "locating", near: null });
      const near = await here();

      return near
        ? ({ phase: "ready", near } as const)
        : ({ phase: "failed", near: null } as const);
    };

    void resolveNearby().then(
      (next) => {
        if (current) setNearby(next);
      },
      () => {
        if (current) setNearby({ phase: "denied", near: null });
      },
    );

    return () => {
      current = false;
    };
  }, []);

  const locate = async () => {
    setNearby({ phase: "locating", near: null });
    const permission = await Location.requestForegroundPermissionsAsync();
    const near = permission.granted ? await here() : null;

    setNearby(near ? { phase: "ready", near } : { phase: "failed", near: null });
  };

  return { nearby, locate };
}

function useApplePlaces(enabled: boolean, q: string, near: Near | null) {
  const key = JSON.stringify([q, near?.lat ?? null, near?.lng ?? null]);
  const expected = enabled && appleMapsSearch !== null && (q !== "" || near !== null);

  const [answer, setAnswer] = useState<{
    key: string;
    places: ReadonlyArray<AppleMapsPlace>;
  } | null>(null);

  useEffect(() => {
    if (!expected || !appleMapsSearch) return;
    let current = true;

    void appleMapsSearch.searchCasinos(q, near?.lat ?? null, near?.lng ?? null).then(
      (places) => {
        if (current) setAnswer({ key, places });
      },
      () => {
        if (current) setAnswer({ key, places: [] });
      },
    );

    return () => {
      current = false;
    };
  }, [expected, key, q, near]);

  return {
    places: answer?.places ?? [],
    expected,
    settled: answer?.key === key,
  };
}

/**
 * Picks the casino a session was at, or none. Choosing a row finishes the pick: `onSelect` runs
 * with a spinner on that row and nothing can dismiss the sheet, and the caller closes it by
 * returning. A throw, or `error`, leaves the sheet open for another try. On iOS, native Apple Maps
 * (`MKLocalSearch`) is the sole search source and choosing a place resolves it to a canonical
 * venue; Android searches the catalog.
 */
export function CasinoPickerSheet({
  selectedId,
  selected,
  onSelect,
  onClose,
  context = "session",
  error,
}: {
  selectedId: VenueId | null;
  selected: CachedVenue | null;
  onSelect: (venue: CachedVenue | null) => void | Promise<void>;
  onClose: () => void;
  context?: "session" | "default";
  /** A failure the caller met while saving, shown beside any the picker meets itself. */
  error?: string | null;
}) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const { nearby, locate } = useNearby();
  const appleOnly = usesAppleMapsOnly();
  const apple = useApplePlaces(appleOnly, q, nearby.near);
  const search = useVenueSearch(appleOnly ? "" : q, appleOnly ? null : nearby.near);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const choosing = useRef(false);
  const locating = nearby.phase === "checking" || nearby.phase === "locating";
  const noneLabel = context === "default" ? "Not set" : "Not listed";

  const none = (isSelected: boolean) =>
    ({
      key: "none",
      title: noneLabel,
      detail:
        context === "default"
          ? "Start new sessions without a casino"
          : "Keep this session without a casino",
      selected: isSelected,
      pick: () => null,
    }) satisfies Option;

  const choose = async (option: Option) => {
    if (choosing.current) return;
    choosing.current = true;
    setPendingKey(option.key);
    setFailure(null);

    try {
      await onSelect(await option.pick());
    } catch {
      setFailure(saveFailed);
    } finally {
      choosing.current = false;
      setPendingKey(null);
    }
  };

  const notFound = q
    ? `No casinos match “${q}”.`
    : "No casinos found near you. Search by name instead.";

  let options: ReadonlyArray<Option>;
  let loading: boolean;
  let status: string | null;
  let heading: string | null = null;
  let unavailable = false;

  if (appleOnly) {
    options = [
      ...apple.places.map((place) => ({
        key: `${place.name}:${place.lat.toFixed(4)}:${place.lng.toFixed(4)}`,
        title: place.name,
        detail: placeDetail(place),
        selected: selected !== null && isSavedCasino(place, selected),
        pick: () =>
          search.resolveVenue({
            name: place.name,
            city: place.city,
            region: place.region,
            country: place.country,
            lat: place.lat,
            lng: place.lng,
          }),
      })),
      ...(selectedId !== null ? [none(false)] : []),
    ];

    loading =
      apple.places.length === 0 && ((q === "" && locating) || (apple.expected && !apple.settled));

    status =
      loading || apple.places.length > 0
        ? null
        : apple.expected
          ? notFound
          : "Search for where you're playing.";
  } else {
    const shown =
      selected && !search.venues.some((venue) => venue.id === selected.id)
        ? [selected, ...search.venues]
        : search.venues;

    options = [
      ...shown.map((venue) => ({
        key: venue.id,
        title: venue.name,
        detail: [
          venuePlace(venue),
          "verified" in venue && venue.verified === false ? "Unverified" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        selected: selectedId === venue.id,
        pick: () => venue,
      })),
      none(selectedId === null),
    ];

    loading =
      search.venues.length === 0 && (search.status === "searching" || (q === "" && locating));
    unavailable = selectedId !== null && !shown.some((venue) => venue.id === selectedId);

    status =
      search.status === "offline"
        ? "Searching needs a connection. These are the casinos saved on this device."
        : loading || search.venues.length > 0
          ? null
          : search.status === "found"
            ? notFound
            : "Search for where you're playing.";

    heading = search.status === "saved" && search.venues.length > 0 ? "On this device" : null;
  }

  return (
    <SearchablePickerSheet
      open
      title={context === "default" ? "Default casino" : "Casino"}
      placeholder="Search casinos"
      query={text}
      onQueryChange={setText}
      loading={loading}
      busy={pendingKey !== null}
      error={failure ?? error ?? null}
      onClose={onClose}
    >
      <View className="gap-3">
        {nearby.phase === "denied" || nearby.phase === "failed" ? (
          <Button label="Near me" size="sm" className="self-start" onPress={() => void locate()} />
        ) : null}
        {nearby.phase === "failed" ? (
          <Text className="type-footnote text-muted">
            Couldn't get your location. Search by name instead.
          </Text>
        ) : null}
        {status ? (
          <View className="flex-row items-center justify-between gap-3">
            <Text accessibilityLiveRegion="polite" className="flex-1 type-footnote text-muted">
              {status}
            </Text>
            {!appleOnly && search.status === "offline" ? (
              <Button label="Try again" size="sm" variant="ghost" onPress={search.retry} />
            ) : null}
          </View>
        ) : null}
        {heading ? <Text className="px-1 type-footnote text-muted">{heading}</Text> : null}
        {unavailable ? (
          <Text accessibilityLiveRegion="polite" className="px-1 type-footnote text-muted">
            Current casino unavailable. This session keeps it until you choose another casino or{" "}
            {noneLabel}.
          </Text>
        ) : null}
        <PickerRows options={options} pendingKey={pendingKey} onChoose={(o) => void choose(o)} />
      </View>
    </SearchablePickerSheet>
  );
}
