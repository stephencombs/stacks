import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { formatDay, formatPlayed, formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome, useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import {
  recordingGroupingOf,
  recordingPeriods,
  RECORDING_CURRENCY,
  visitTitle,
  type RecordingGrouping,
} from "@stacks/client-runtime/recordingView";
import { useRef, useState } from "react";
import { Platform, Text, View, type ScrollViewInstance } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { PersonalScreen, SaveStatus } from "../features/Personal";

type Props = StaticScreenProps<{ period?: string } | undefined>;

const groupings = [
  { value: "month", label: "By month" },
  { value: "year", label: "By year" },
] as const;

const periodLabel = (period: string) =>
  period.length === 4
    ? period
    : new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
        new Date(`${period}-02T12:00:00`),
      );

/**
 * All sessions by month or year. `/history/2026-11` and `/history/2026` open that grouping with
 * their period in view.
 */
export function HistoryScreen({ route }: Props) {
  const { home, status, error, retryLoad } = useRecordingHome();
  const restore = useRecordingSubmit();
  const navigation = useNavigation();
  const period = route.params?.period;
  const [by, setBy] = useState<RecordingGrouping>(recordingGroupingOf(period) ?? "month");
  const [linked, setLinked] = useState(period);
  if (period !== linked) {
    setLinked(period);
    setBy(recordingGroupingOf(period) ?? by);
  }
  const scroll = useRef<ScrollViewInstance>(null);
  const scrolledTo = useRef<string | undefined>(undefined);
  // iOS draws the header over the list, so the list's top sits under it.
  const headerHeight = useHeaderHeight();
  const groups = home ? recordingPeriods(home, by) : [];
  return (
    <PersonalScreen scrollRef={scroll}>
      <SaveStatus status={status} error={error} onRetry={retryLoad} />
      {restore.error ? <FormError>{restore.error}</FormError> : null}
      {home === null ? (
        status === "load_failed" ? null : (
          <Skeleton className="h-40 w-full rounded-xl" />
        )
      ) : groups.length === 0 ? (
        <EmptyState title="No sessions yet">
          Your sessions will appear here, including ones you delete.
        </EmptyState>
      ) : (
        <>
          <SegmentedControl label="Group by" options={groupings} value={by} onChange={setBy} />
          {groups.map(({ period: key, result, finished, minutes, visits }) => (
            <View
              key={key}
              className="gap-2"
              onLayout={(event) => {
                if (key !== period || scrolledTo.current === key) return;
                scrolledTo.current = key;
                scroll.current?.scrollTo({
                  y: event.nativeEvent.layout.y - 16 - (Platform.OS === "ios" ? headerHeight : 0),
                  animated: false,
                });
              }}
            >
              <SectionHeading
                action={
                  finished === 0 ? undefined : (
                    <Text numberOfLines={1} className="shrink type-section text-muted">
                      <Money amount={result} currency={RECORDING_CURRENCY} tone="result" /> ·{" "}
                      {formatPlayed(minutes)} · {finished} {finished === 1 ? "session" : "sessions"}
                    </Text>
                  )
                }
              >
                {periodLabel(key)}
              </SectionHeading>
              <List>
                {visits.map((item) =>
                  item.visit.deletedAt !== undefined ? (
                    <Row key={item.visit.id}>
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="type-heading text-muted line-through">
                          {formatDay(item.visit.startedAt)} · {visitTitle(item.table)}
                        </Text>
                        <Text className="type-footnote text-muted">
                          Deleted · {item.venue?.name ? `${item.venue.name} · ` : ""}
                          {formatTime(item.visit.startedAt)}
                        </Text>
                      </View>
                      <Button
                        label="Restore"
                        accessibilityLabel={`Restore ${visitTitle(item.table)} from ${formatDay(item.visit.startedAt)}`}
                        variant="ghost"
                        pending={restore.pending}
                        onPress={() =>
                          void restore.submit({ type: "restore_visit", visitId: item.visit.id })
                        }
                      />
                    </Row>
                  ) : (
                    <Row
                      key={item.visit.id}
                      onPress={() => navigation.navigate("Play", { visitId: item.visit.id })}
                    >
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="type-heading text-ink">
                          {formatDay(item.visit.startedAt)} · {visitTitle(item.table)}
                        </Text>
                        <Text className="type-footnote text-muted">
                          {item.venue?.name ? `${item.venue.name} · ` : ""}
                          {formatTime(item.visit.startedAt)}
                        </Text>
                      </View>
                      {item.finalResult === null ? (
                        <Text className="type-label text-live">Live</Text>
                      ) : (
                        <Money
                          amount={item.finalResult}
                          currency={RECORDING_CURRENCY}
                          tone="result"
                        />
                      )}
                      <Icon name="chevron-right" color="faint" size={18} />
                    </Row>
                  ),
                )}
              </List>
            </View>
          ))}
        </>
      )}
    </PersonalScreen>
  );
}
