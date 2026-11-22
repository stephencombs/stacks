import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { personalMapView, type MapFilter, type PersonalMapView } from "@stacks/client-runtime/map";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import { tripNames } from "@stacks/client-runtime/trip";
import { VenueId, type GroupListItem } from "@stacks/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as DateTime from "effect/DateTime";
import { AppleMaps, GoogleMaps } from "expo-maps";
import { use, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Path, Polyline, Rect } from "react-native-svg";
import { useCSSVariable, useUniwind } from "uniwind";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { Toolbar } from "../components/ui/Toolbar";
import { cn } from "../components/ui/cn";
import { TabBarHeight } from "../components/ui/tabBar";
import { PersonalLiveBar } from "../features/LiveBar";
import { useNativeHeaderActions } from "../features/NativeHeaderActions";
import { PersonalScreen, PersonalYouButton } from "../features/Personal";
import { chipColor } from "../features/chipColor";
import { useAccount } from "../lib/account";
import { googleMapsEnabled } from "../lib/config";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";
import { StacksProvider, useStacks } from "../lib/stacks";

const selectedVenue = (markerId: string | undefined) => {
  const id = markerId?.split(":")[0];

  if (id === undefined) return null;

  return Option.getOrNull(Schema.decodeUnknownOption(VenueId)(id));
};

type ActiveMap = Extract<PersonalMapView, { kind: "map" }>;

const emptyTrips = new Map<string, string>();
const noGroups: ReadonlyArray<GroupListItem> = [];

function TripNames({ children }: { children: (names: ReadonlyMap<string, string>) => ReactNode }) {
  const account = useAccount();

  if (!account.available || !account.isSignedIn || !account.userId) return children(emptyTrips);

  return (
    <StacksProvider>
      <SignedInTripNames>{children}</SignedInTripNames>
    </StacksProvider>
  );
}

function SignedInTripNames({
  children,
}: {
  children: (names: ReadonlyMap<string, string>) => ReactNode;
}) {
  const result = useAtomValue(useStacks().groups);
  const groups = AsyncResult.getOrElse(result, () => noGroups);
  const names = useMemo(() => tripNames(groups), [groups]);

  return children(names);
}

/** Places you've played from this device's ledger: pins, chronological paths, and venue history. */
export function MapScreen() {
  return <TripNames>{(names) => <MapContent tripNames={names} />}</TripNames>;
}

function MapContent({ tripNames: names }: { tripNames: ReadonlyMap<string, string> }) {
  const { home } = useRecordingHome();
  const [filter, setFilter] = useState<MapFilter>({ kind: "all" });
  const timeZone = useMemo(() => DateTime.zoneMakeLocal(), []);

  const view = useMemo(
    () => (home ? personalMapView(home, names, timeZone, filter) : null),
    [home, names, timeZone, filter],
  );

  if (view === null || view.kind === "empty") {
    return <EmptyMap />;
  }

  return <PopulatedMap view={view} onFilter={setFilter} />;
}

function EmptyMap() {
  const navigation = useNavigation();
  const android = Platform.OS === "android";
  const muted = String(useCSSVariable("--color-muted"));

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: true });
  }, [navigation]);

  return (
    <PersonalScreen live contentClassName={android ? "gap-0 pt-0" : undefined}>
      <View className="items-center gap-3 px-6 pt-[76px]">
        <Svg width={32} height={32} viewBox="0 0 960 960" accessibilityElementsHidden>
          <Path
            fill={muted}
            d="M600,840L360,756L174,828Q154,836 137,823.5Q120,811 120,790L120,230Q120,217 127.5,207Q135,197 148,192L360,120L600,204L786,132Q806,124 823,136.5Q840,149 840,170L840,730Q840,743 832.5,753Q825,763 812,768L600,840ZM560,742L560,274L400,218L400,686L560,742Z"
          />
        </Svg>
        <Text accessibilityRole="header" className="self-stretch text-center type-title text-ink">
          No casinos on the map yet
        </Text>
        <Text className="max-w-xs text-center type-callout text-muted">
          Finished sessions at a casino show here, colored by how you did.
        </Text>
      </View>
    </PersonalScreen>
  );
}

function PopulatedMap({
  view,
  onFilter,
}: {
  view: ActiveMap;
  onFilter: (filter: MapFilter) => void;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const barHeight = use(TabBarHeight);
  const android = Platform.OS === "android";
  const header = useNativeHeaderActions();

  useLayoutEffect(() => {
    if (!android) return;
    navigation.setOptions({ headerShown: false });

    return () => navigation.setOptions({ headerShown: true });
  }, [android, navigation]);
  const [liveBarHeight, setLiveBarHeight] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<VenueId | null>(null);
  const [showAllVenueVisits, setShowAllVenueVisits] = useState(false);
  const { theme } = useUniwind();
  const prefs = usePreferences();

  const [win, loss, muted, ink] = useCSSVariable([
    "--color-win",
    "--color-loss",
    "--color-muted",
    "--color-ink",
  ]).map(String);

  const selectedSheet = selectedVenueId ? view.venueSheet(selectedVenueId) : null;
  const bottomDock = barHeight + liveBarHeight;

  const colorFor = (outcome: "win" | "loss" | "even") =>
    prefs.privacyMode ? muted! : outcome === "win" ? win! : outcome === "loss" ? loss! : muted!;

  const pickVenue = (venueId: VenueId | null) => {
    setSelectedVenueId(venueId);
    setShowAllVenueVisits(false);
  };

  const openFilter = () => {
    pickVenue(null);
    setFilterOpen(true);
  };

  const clearFilter = () => {
    onFilter({ kind: "all" });
    pickVenue(null);
  };

  return (
    <View className="flex-1 bg-canvas">
      {view.camera === null ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="max-w-sm items-center gap-2 rounded-[22px] bg-surface p-6">
            <Text accessibilityRole="header" className="text-center type-headline text-ink">
              No casino locations yet
            </Text>
            <Text className="text-center type-callout text-muted">
              {view.noLocationLine ?? "Pick a casino with map coordinates to pin your play here."}
            </Text>
            {view.filtered ? (
              <Button
                label="Show all sessions"
                className="mt-2"
                onPress={() => {
                  onFilter({ kind: "all" });
                  pickVenue(null);
                }}
              />
            ) : null}
          </View>
        </View>
      ) : (
        <MapCanvas
          view={view}
          theme={theme === "dark" ? "dark" : "light"}
          privacyMode={prefs.privacyMode}
          selectedVenueId={selectedVenueId}
          winColor={win!}
          lossColor={loss!}
          mutedColor={muted!}
          inkColor={ink!}
          colorFor={colorFor}
          bottomClearance={bottomDock + 120}
          topClearance={insets.top + 68}
          onSelectVenue={pickVenue}
        />
      )}

      {header}
      <Toolbar placement="left">
        <Toolbar.Button
          label={view.filterLabel}
          accessibilityLabel={`Map filter: ${view.filterLabel}`}
          onPress={openFilter}
        />
        {view.filtered ? (
          <Toolbar.Button
            icon="xmark"
            accessibilityLabel="Clear map filter"
            separateBackground
            onPress={clearFilter}
          />
        ) : null}
      </Toolbar>
      {android ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: Math.max(16, insets.left),
            right: Math.max(16, insets.right),
          }}
          className="flex-row items-center justify-between gap-3"
        >
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Map filter: ${view.filterLabel}`}
              onPress={openFilter}
              className="min-h-11 max-w-[260px] flex-row items-center gap-2 rounded-full border border-line/60 bg-surface px-4 shadow-sm active:opacity-80"
            >
              <Text numberOfLines={1} className="shrink type-callout font-semibold text-ink">
                {view.filterLabel}
              </Text>
              <Icon name="chevron-down" color="muted" size={14} />
            </Pressable>
            {view.filtered ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear map filter"
                onPress={clearFilter}
                className="size-10 items-center justify-center rounded-full bg-surface shadow-sm active:opacity-80"
              >
                <Icon name="close" color="ink" size={16} />
              </Pressable>
            ) : null}
          </View>
          <PersonalYouButton />
        </View>
      ) : null}

      {}
      {selectedSheet ? (
        <View
          accessibilityRole="summary"
          accessibilityLabel={selectedSheet.name}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: bottomDock,
            ...(android ? { elevation: 8 } : null),
          }}
          className={cn(
            "rounded-t-[28px] bg-surface px-4 pt-2.5 pb-4 shadow-lg",
            android ? "" : "border-t border-line",
          )}
        >
          <View className="mb-3 items-center">
            <View className="h-1 w-9 rounded-full bg-fill-strong" />
          </View>
          <View className="flex-row items-start justify-between gap-3 px-1">
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="type-title text-ink">
                {selectedSheet.name}
              </Text>
              <Text numberOfLines={1} className="type-footnote text-muted">
                {selectedSheet.subtitle}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Money
                amount={selectedSheet.result}
                currency={RECORDING_CURRENCY}
                tone="result"
                className="type-title"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close venue details"
                onPress={() => pickVenue(null)}
                hitSlop={8}
                className="size-8 items-center justify-center rounded-full bg-fill active:opacity-70"
              >
                <Icon name="close" color="ink" size={14} />
              </Pressable>
            </View>
          </View>
          <ScrollView className="mt-3 max-h-52 rounded-2xl bg-fill/50">
            {(showAllVenueVisits ? selectedSheet.visits : selectedSheet.visits.slice(0, 2)).map(
              (item, index) => (
                <Pressable
                  key={item.visitId}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${item.meta}`}
                  onPress={() => navigation.navigate("Play", { visitId: item.visitId })}
                  className={cn(
                    "flex-row items-center gap-3 px-3.5 py-3 active:bg-fill",
                    index > 0 && "border-t border-line",
                  )}
                >
                  <View className={cn("h-8 w-1 rounded-full", chipColor[item.gameChip])} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text numberOfLines={1} className="type-heading text-ink">
                      {item.title}
                    </Text>
                    <Text numberOfLines={1} className="type-footnote text-muted">
                      {item.meta}
                    </Text>
                  </View>
                  <Money
                    amount={item.result}
                    currency={RECORDING_CURRENCY}
                    tone="result"
                    className="type-heading"
                  />
                  <Icon name="chevron-right" color="faint" size={16} />
                </Pressable>
              ),
            )}
          </ScrollView>
          {selectedSheet.visits.length > 2 && !showAllVenueVisits ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAllVenueVisits(true)}
              className="mt-3 items-center rounded-full bg-fill py-3 active:opacity-80"
            >
              <Text className="type-callout font-semibold text-ink">
                {`All ${selectedSheet.sessions} sessions here`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 16, right: 16, bottom: bottomDock + 12 }}
          className="gap-2"
        >
          {view.noLocationLine ? (
            <View className="self-center rounded-full bg-surface/95 px-3.5 py-1.5 shadow-sm">
              <Text className="type-footnote text-muted">{view.noLocationLine}</Text>
            </View>
          ) : null}
          {view.summaryCard ? (
            <View className="flex-row items-center justify-between gap-3 rounded-[22px] bg-surface p-4 shadow-md">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className="type-heading text-ink">
                  {view.summaryCard.title}
                </Text>
                <Text numberOfLines={1} className="type-footnote text-muted">
                  {view.summaryCard.subtitle}
                </Text>
              </View>
              <Money
                amount={view.summaryCard.result}
                currency={RECORDING_CURRENCY}
                tone="result"
                className="type-title"
              />
            </View>
          ) : null}
        </View>
      )}

      <PersonalLiveBar onHeightChange={setLiveBarHeight} bottom={barHeight} />

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Map view">
        <View className="gap-2 pb-4">
          {view.filterOptions.map((option) => {
            const active =
              option.filter.kind === view.filter.kind &&
              (option.filter.kind === "all" ||
                (option.filter.kind === "day" &&
                  view.filter.kind === "day" &&
                  option.filter.dayKey === view.filter.dayKey) ||
                (option.filter.kind === "trip" &&
                  view.filter.kind === "trip" &&
                  option.filter.tripId === view.filter.tripId));

            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onFilter(option.filter);
                  setFilterOpen(false);
                  pickVenue(null);
                }}
                className={cn(
                  "flex-row items-center justify-between gap-3 rounded-xl px-4 py-3 active:bg-fill",
                  active && "bg-fill",
                )}
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text numberOfLines={1} className="type-heading text-ink">
                    {option.label}
                  </Text>
                  <Text numberOfLines={1} className="type-footnote text-muted">
                    {option.subtitle}
                  </Text>
                </View>
                {active ? <Icon name="check" color="ink" size={18} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

function MapCanvas({
  view,
  theme,
  privacyMode,
  selectedVenueId,
  winColor,
  lossColor,
  mutedColor,
  inkColor,
  colorFor,
  topClearance,
  bottomClearance,
  onSelectVenue,
}: {
  view: ActiveMap;
  theme: "light" | "dark";
  privacyMode: boolean;
  selectedVenueId: VenueId | null;
  winColor: string;
  lossColor: string;
  mutedColor: string;
  inkColor: string;
  colorFor: (outcome: "win" | "loss" | "even") => string;
  topClearance: number;
  bottomClearance: number;
  onSelectVenue: (id: VenueId | null) => void;
}) {
  const pathMode = view.stops.length > 0;
  const scheme = theme === "dark" ? "DARK" : "LIGHT";

  if (Platform.OS === "ios" && view.camera) {
    const markers = pathMode
      ? view.stops.map((stop) => ({
          id: `${stop.venue.id}:${stop.number}`,
          coordinates: { latitude: stop.lat, longitude: stop.lng },
          title: stop.venue.name,
          systemImage: stop.number <= 50 ? `${stop.number}.circle.fill` : "circle.fill",
          tintColor: colorFor(stop.outcome),
        }))
      : view.pins.map((pin) => ({
          id: pin.venue.id,
          coordinates: { latitude: pin.lat, longitude: pin.lng },
          title: pin.venue.name,
          systemImage: "mappin.circle.fill",
          tintColor: colorFor(pin.outcome),
        }));

    return (
      <AppleMaps.View
        style={{ flex: 1 }}
        colorScheme={AppleMaps.MapColorScheme[scheme]}
        cameraPosition={view.camera}
        markers={markers}
        polylines={
          view.path.length > 1
            ? [
                {
                  id: "day-path",
                  coordinates: [...view.path],
                  color: inkColor,
                  width: 4,
                },
              ]
            : []
        }
        onMarkerClick={(marker) => {
          const id = selectedVenue(marker.id);

          if (id) onSelectVenue(id);
        }}
        onMapClick={() => onSelectVenue(null)}
      />
    );
  }

  if (Platform.OS === "android" && googleMapsEnabled && view.camera) {
    const markers = pathMode
      ? view.stops.map((stop) => ({
          id: `${stop.venue.id}:${stop.number}`,
          coordinates: { latitude: stop.lat, longitude: stop.lng },
          title: `${stop.number}. ${stop.venue.name}`,
        }))
      : view.pins.map((pin) => ({
          id: pin.venue.id,
          coordinates: { latitude: pin.lat, longitude: pin.lng },
          title: pin.venue.name,
        }));

    return (
      <GoogleMaps.View
        style={{ flex: 1 }}
        colorScheme={GoogleMaps.MapColorScheme[scheme]}
        cameraPosition={view.camera}
        markers={markers}
        polylines={
          view.path.length > 1
            ? [
                {
                  id: "day-path",
                  coordinates: [...view.path],
                  color: inkColor,
                  width: 8,
                },
              ]
            : []
        }
        onMarkerClick={(marker) => {
          const id = selectedVenue(marker.id);

          if (id) onSelectVenue(id);
        }}
        onMapClick={() => onSelectVenue(null)}
      />
    );
  }

  return (
    <FallbackMapCanvas
      view={view}
      theme={theme}
      privacyMode={privacyMode}
      selectedVenueId={selectedVenueId}
      winColor={winColor}
      lossColor={lossColor}
      mutedColor={mutedColor}
      topClearance={topClearance}
      bottomClearance={bottomClearance}
      onSelectVenue={onSelectVenue}
    />
  );
}

function FallbackMapCanvas({
  view,
  theme,
  privacyMode,
  selectedVenueId,
  winColor,
  lossColor,
  mutedColor,
  topClearance,
  bottomClearance,
  onSelectVenue,
}: {
  view: ActiveMap;
  theme: "light" | "dark";
  privacyMode: boolean;
  selectedVenueId: VenueId | null;
  winColor: string;
  lossColor: string;
  mutedColor: string;
  topClearance: number;
  bottomClearance: number;
  onSelectVenue: (id: VenueId | null) => void;
}) {
  const { width, height } = useWindowDimensions();
  const points = view.stops.length > 0 ? view.stops : view.pins;

  const project = useMemo(() => {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padX = Math.max(56, Math.round(width * 0.16));
    const usableW = Math.max(80, width - padX * 2);
    const topY = topClearance + 24;
    const usableH = Math.max(120, height - topY - bottomClearance);
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;

    return (lat: number, lng: number) => ({
      x: lngSpan < 0.0001 ? width / 2 : padX + ((lng - minLng) / lngSpan) * usableW,
      y: latSpan < 0.0001 ? topY + usableH * 0.45 : topY + ((maxLat - lat) / latSpan) * usableH,
    });
  }, [points, width, height, topClearance, bottomClearance]);

  const dark = theme === "dark";
  const bg = dark ? "#1C211B" : "#ECEEE7";
  const road = dark ? "#2C322B" : "#FFFFFF";
  const strip = dark ? "#453C24" : "#F8EBB8";
  const park = dark ? "#25392A" : "#D4E4C8";
  const dashColor = dark ? "#F5F5F7" : "#111114";

  const pathCoords = view.stops.map((s) => project(s.lat, s.lng));

  const pinColor = (outcome: "win" | "loss" | "even") =>
    privacyMode
      ? mutedColor
      : outcome === "win"
        ? winColor
        : outcome === "loss"
          ? lossColor
          : mutedColor;

  return (
    <View className="flex-1" style={{ backgroundColor: bg }}>
      <Pressable
        accessibilityLabel="Casino map"
        onPress={() => onSelectVenue(null)}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <Svg width={width} height={height} style={{ position: "absolute" }} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height} fill={bg} />
        <Rect
          x={width * 0.34}
          y={height * 0.36}
          width={width * 0.16}
          height={height * 0.16}
          rx={12}
          fill={park}
        />
        <Line
          x1={width * 0.54}
          y1={0}
          x2={width * 0.57}
          y2={height}
          stroke={strip}
          strokeWidth={18}
        />
        <Line
          x1={width * 0.18}
          y1={0}
          x2={width * 0.21}
          y2={height}
          stroke={road}
          strokeWidth={10}
        />
        <Line
          x1={width * 0.78}
          y1={0}
          x2={width * 0.81}
          y2={height}
          stroke={road}
          strokeWidth={10}
        />
        <Line
          x1={0}
          y1={height * 0.28}
          x2={width}
          y2={height * 0.26}
          stroke={road}
          strokeWidth={12}
        />
        <Line
          x1={0}
          y1={height * 0.61}
          x2={width}
          y2={height * 0.64}
          stroke={road}
          strokeWidth={12}
        />
        {pathCoords.length > 1 ? (
          <Polyline
            points={pathCoords.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={dashColor}
            strokeWidth={3}
            strokeDasharray="8 6"
          />
        ) : null}
      </Svg>

      {view.stops.length > 0
        ? view.stops.map((stop) => {
            const { x, y } = project(stop.lat, stop.lng);
            const selected = selectedVenueId === stop.venue.id;

            return (
              <Pressable
                key={`${stop.venue.id}:${stop.number}`}
                accessibilityRole="button"
                accessibilityLabel={`${stop.number}. ${stop.venue.name}, ${formatDisplayMoney(stop.result, RECORDING_CURRENCY, { showCents: false, privacyMode }, { signDisplay: "exceptZero", forAccessibility: true })}`}
                onPress={() => onSelectVenue(stop.venue.id)}
                style={{
                  position: "absolute",
                  left: Math.max(12, Math.min(width - 140, x - 48)),
                  top: Math.max(topClearance, y - 20),
                }}
                className={cn(
                  "flex-row items-center gap-2 rounded-full bg-surface py-1.5 pr-3 pl-1.5 shadow-md",
                  selected && "border-2 border-ink",
                )}
              >
                <View
                  className="size-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: pinColor(stop.outcome) }}
                >
                  <Text className="text-xs font-bold text-white">{stop.number}</Text>
                </View>
                <Money
                  amount={stop.result}
                  currency={RECORDING_CURRENCY}
                  tone="result"
                  className="type-callout font-bold"
                />
              </Pressable>
            );
          })
        : view.pins.map((pin) => {
            const { x, y } = project(pin.lat, pin.lng);
            const selected = selectedVenueId === pin.venue.id;
            const color = pinColor(pin.outcome);

            return (
              <Pressable
                key={pin.venue.id}
                accessibilityRole="button"
                accessibilityLabel={`${pin.venue.name}, ${formatDisplayMoney(pin.result, RECORDING_CURRENCY, { showCents: false, privacyMode }, { signDisplay: "exceptZero", forAccessibility: true })}`}
                onPress={() => onSelectVenue(pin.venue.id)}
                style={{
                  position: "absolute",
                  left: Math.max(12, Math.min(width - 150, x - 52)),
                  top: Math.max(topClearance, y - 24),
                }}
                className="items-center gap-1"
              >
                <View
                  className={cn(
                    "size-9 items-center justify-center rounded-full",
                    selected && "size-11",
                  )}
                  style={{ backgroundColor: `${color}33` }}
                >
                  <View
                    className={cn(
                      "rounded-full border-2 border-surface",
                      selected ? "size-7" : "size-5",
                    )}
                    style={{ backgroundColor: color }}
                  />
                </View>
                {selected ? null : (
                  <View className="flex-row items-center gap-1.5 rounded-full bg-surface/95 px-2.5 py-1 shadow-sm">
                    <Text numberOfLines={1} className="max-w-28 text-xs font-semibold text-ink">
                      {pin.venue.name}
                    </Text>
                    <Money
                      amount={pin.result}
                      currency={RECORDING_CURRENCY}
                      tone="result"
                      className="text-xs font-bold"
                    />
                  </View>
                )}
              </Pressable>
            );
          })}
    </View>
  );
}
