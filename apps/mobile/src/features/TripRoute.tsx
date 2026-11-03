import type { GroupDetail, TripDetail, Venue } from "@stacks/contracts";
import { boardMoney } from "@stacks/client-runtime/trip";
import { tripRoute } from "@stacks/shared/trips";
import Constants from "expo-constants";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useCSSVariable, useUniwind } from "uniwind";

import { cn } from "../components/ui/cn";
import { SectionHeading } from "../components/ui/Surface";

const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

type Placed = Venue & { lat: number; lng: number };
const placed = (v: Venue): v is Placed => v.lat !== null && v.lng !== null;

/** Close enough to frame every casino: the zoom that fits the wider of the two spans. */
const cameraFor = (venues: ReadonlyArray<Placed>) => {
  const lats = venues.map((v) => v.lat);
  const lngs = venues.map((v) => v.lng);
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs),
    0.005,
  );
  return {
    coordinates: {
      latitude: (Math.max(...lats) + Math.min(...lats)) / 2,
      longitude: (Math.max(...lngs) + Math.min(...lngs)) / 2,
    },
    zoom: Math.min(16, Math.max(3, Math.log2(360 / span) - 1.2)),
  };
};

const directions = (venue: Venue) => {
  const where = placed(venue)
    ? `${venue.lat},${venue.lng}`
    : [venue.name, venue.city, venue.region].filter(Boolean).join(", ");
  const to = encodeURIComponent(where);
  return Platform.OS === "ios"
    ? `https://maps.apple.com/?daddr=${to}`
    : `https://www.google.com/maps/dir/?api=1&destination=${to}`;
};

/** Android draws Google's map, which needs a key baked into the build; without one, the list stands alone. */
const canDrawMap =
  Platform.OS === "ios" || Boolean(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);

/**
 * The Board's "By casino": the casinos the trip played, in the order it first reached each, on the
 * phone's own map. Nothing until a session closes.
 */
export function TripRoute({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const { theme } = useUniwind();
  const accent = String(useCSSVariable("--color-accent"));
  const route = tripRoute(trip.sessions.filter((s) => s.session.status === "closed"));
  if (route.stops.length === 0) return null;
  const onMap = route.stops.filter((s) => placed(s.venue));
  const camera = onMap.length > 0 ? cameraFor(onMap.map((s) => s.venue as Placed)) : null;
  const line = route.path.filter(placed).map((v) => ({ latitude: v.lat, longitude: v.lng }));
  const colorScheme = theme === "dark" ? "DARK" : "LIGHT";
  return (
    <View className="gap-2">
      <SectionHeading>By casino</SectionHeading>
      {canDrawMap && camera ? (
        <View
          className="h-72 overflow-hidden rounded-xl border border-line"
          accessibilityLabel={`Map of ${onMap.length} ${onMap.length === 1 ? "casino" : "casinos"}`}
        >
          {Platform.OS === "ios" ? (
            <AppleMaps.View
              style={{ flex: 1 }}
              colorScheme={AppleMaps.MapColorScheme[colorScheme]}
              cameraPosition={camera}
              markers={onMap.map((s) => ({
                id: s.venue.id,
                coordinates: {
                  latitude: (s.venue as Placed).lat,
                  longitude: (s.venue as Placed).lng,
                },
                title: s.venue.name,
                systemImage: s.number <= 50 ? `${s.number}.circle.fill` : "circle.fill",
                tintColor: accent,
              }))}
              polylines={
                line.length > 1 ? [{ id: "route", coordinates: line, color: accent, width: 4 }] : []
              }
            />
          ) : (
            <GoogleMaps.View
              style={{ flex: 1 }}
              colorScheme={GoogleMaps.MapColorScheme[colorScheme]}
              cameraPosition={camera}
              markers={onMap.map((s) => ({
                id: s.venue.id,
                coordinates: {
                  latitude: (s.venue as Placed).lat,
                  longitude: (s.venue as Placed).lng,
                },
                title: `${s.number}. ${s.venue.name}`,
                snippet: boardMoney(s.net, currency),
              }))}
              polylines={
                line.length > 1 ? [{ id: "route", coordinates: line, color: accent, width: 8 }] : []
              }
            />
          )}
        </View>
      ) : null}
      <View className="rounded-xl border border-line bg-surface">
        {route.stops.map((stop, index) => (
          <Pressable
            key={stop.venue.id}
            accessibilityRole="link"
            accessibilityLabel={`${stop.number}. ${stop.venue.name}, directions`}
            onPress={() => void Linking.openURL(directions(stop.venue))}
            className={cn(
              "flex-row items-center gap-3 px-3 py-3 active:bg-fill",
              index > 0 && "border-t border-line",
            )}
          >
            <View className="size-7 items-center justify-center rounded-full bg-accent">
              <Text className="font-mono text-sm text-accent-ink">{stop.number}</Text>
            </View>
            <View className="flex-1">
              <Text numberOfLines={1} className="text-base text-ink">
                {stop.venue.name}
              </Text>
              <Text className="type-label text-muted">
                {stop.visits} {stop.visits === 1 ? "session" : "sessions"}
                {placed(stop.venue) ? "" : " · not on the map"}
              </Text>
            </View>
            <Text className={cn("font-mono text-lg", tone(stop.net))}>
              {boardMoney(stop.net, currency)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
