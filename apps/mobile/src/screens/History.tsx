import { useNavigation } from "@react-navigation/native";
import { formatDay, formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome, useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import {
  recordingMonths,
  RECORDING_CURRENCY,
  visitTitle,
} from "@stacks/client-runtime/recordingView";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { PersonalScreen, SaveStatus } from "../features/Personal";

export function HistoryScreen() {
  const { home, status, error, retryLoad } = useRecordingHome();
  const restore = useRecordingSubmit();
  const navigation = useNavigation();
  const months = home ? recordingMonths(home) : [];
  return (
    <PersonalScreen>
      <SaveStatus status={status} error={error} onRetry={retryLoad} />
      {restore.error ? <FormError>{restore.error}</FormError> : null}
      {home === null ? (
        status === "load_failed" ? null : (
          <Skeleton className="h-40 w-full rounded-xl" />
        )
      ) : months.length === 0 ? (
        <EmptyState title="No sessions yet">
          Your sessions will appear here, including ones you delete.
        </EmptyState>
      ) : (
        months.map(({ month, result, count, visits }) => (
          <View key={month} className="gap-2">
            <SectionHeading>
              {new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
                new Date(`${month}-02T12:00:00`),
              )}
            </SectionHeading>
            <Text className="text-sm text-muted">
              {count} {count === 1 ? "session" : "sessions"} ·{" "}
              <Money amount={result} currency={RECORDING_CURRENCY} tone="result" />
            </Text>
            <List>
              {visits.map((item) =>
                item.visit.deletedAt !== undefined ? (
                  <Row key={item.visit.id}>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="type-heading text-muted line-through">
                        {formatDay(item.visit.startedAt)} · {visitTitle(item.table)}
                      </Text>
                      <Text className="type-footnote text-muted">
                        {item.venue?.name ? `${item.venue.name} · ` : ""}Deleted
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
                      <Text className="text-sm text-muted">Live</Text>
                    ) : (
                      <Money
                        amount={item.finalResult}
                        currency={RECORDING_CURRENCY}
                        tone="result"
                      />
                    )}
                  </Row>
                ),
              )}
            </List>
          </View>
        ))
      )}
    </PersonalScreen>
  );
}
