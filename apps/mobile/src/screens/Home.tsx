import { useNavigation } from "@react-navigation/native";
import { formatDay, formatDuration, formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import {
  localDateText,
  RECORDING_CURRENCY,
  recordingMonths,
  visitTitle,
  type RecordedVisit,
  type RecordingHome,
} from "@stacks/client-runtime/recordingView";
import { gameChip } from "@stacks/client-runtime/stats";
import { MinorUnits, type VisitId } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { PastSessionSheet, StartSheet } from "../features/RecordingForms";
import { chipColor } from "../features/StatsParts";

/** How many finished sessions Play lists before See all. */
const RECENT = 5;

const money = (amount: MinorUnits) => formatMoney(amount, RECORDING_CURRENCY);
const signed = (amount: MinorUnits) =>
  formatMoney(amount, RECORDING_CURRENCY, { signDisplay: "exceptZero" });

/** This month's result and your latest finished sessions; the LiveBar shows what's live. */
export function HomeScreen() {
  const { home, status, error, retryLoad } = useRecordingHome();
  const navigation = useNavigation();
  const [sheet, setSheet] = useState<"start" | "past" | null>(null);
  const open = (visitId: VisitId) => navigation.navigate("Play", { visitId });
  const opened = (visitId: VisitId) => {
    setSheet(null);
    open(visitId);
  };
  const empty = home !== null && home.active.length === 0 && home.finished.length === 0;
  return (
    <PersonalScreen
      live
      fab={
        <ActionMenu
          fab
          label="Start or add a session"
          disabled={home === null}
          actions={[
            { label: "Start session", onPress: () => setSheet("start") },
            { label: "Add past session", onPress: () => setSheet("past") },
          ]}
        />
      }
    >
      <SaveStatus status={status} error={error} onRetry={retryLoad} />
      {home === null ? (
        status === "load_failed" ? null : (
          <Skeleton className="h-32 w-full rounded-[22px]" />
        )
      ) : empty ? (
        <EmptyState centered title="No sessions yet">
          Tap + to start one with your first buy-in. It's saved on this device, and you don't need
          an account.
        </EmptyState>
      ) : (
        <>
          <MonthHero home={home} />
          {home.finished.length > 0 ? (
            <View className="gap-2">
              <SectionHeading
                action={
                  <Button
                    label="See all"
                    accessibilityLabel="See all sessions"
                    variant="ghost"
                    size="sm"
                    onPress={() => navigation.navigate("History")}
                  />
                }
              >
                Recent sessions
              </SectionHeading>
              <List>
                {home.finished.slice(0, RECENT).map((item) => (
                  <FinishedRow
                    key={item.visit.id}
                    item={item}
                    onPress={() => open(item.visit.id)}
                  />
                ))}
              </List>
            </View>
          ) : (
            <Button
              label="All sessions"
              variant="ghost"
              className="self-start"
              onPress={() => navigation.navigate("History")}
            />
          )}
        </>
      )}
      {sheet === "start" ? (
        <StartSheet
          onClose={() => setSheet(null)}
          onStarted={opened}
          onOpened={(tableId) => {
            setSheet(null);
            navigation.navigate("Table", { tableId });
          }}
        />
      ) : null}
      {sheet === "past" ? (
        <PastSessionSheet onClose={() => setSheet(null)} onAdded={opened} />
      ) : null}
    </PersonalScreen>
  );
}

/** The month you're in: its result from finished sessions, hours and how many you played. */
function MonthHero({ home }: { home: RecordingHome }) {
  const key = localDateText().slice(0, 7);
  const month = recordingMonths(home).find((item) => item.month === key);
  const count = month?.finished ?? 0;
  const minutes = month?.minutes ?? 0;
  const played = minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
  return (
    <View className="gap-1 rounded-[22px] bg-surface p-4">
      <Text accessibilityRole="header" className="type-title text-ink">
        {new Intl.DateTimeFormat(undefined, { month: "long" }).format(
          new Date(`${key}-02T12:00:00`),
        )}
      </Text>
      <Money
        amount={month?.result ?? MinorUnits.make(0)}
        currency={RECORDING_CURRENCY}
        tone="result"
        fit
        className="type-hero"
      />
      <Text className="type-footnote text-muted">
        {count === 0
          ? "No sessions yet this month"
          : `${played} · ${count === 1 ? "1 session" : `${count} sessions`}`}
        . Live play counts once you finish.
      </Text>
    </View>
  );
}

function FinishedRow({ item, onPress }: { item: RecordedVisit; onPress: () => void }) {
  const title = visitTitle(item.table);
  const finished = item.visit.finishedAt!;
  const when =
    localDateText(DateTime.toDateUtc(finished)) === localDateText()
      ? formatTime(item.visit.startedAt)
      : formatDay(finished);
  const duration = formatDuration(item.visit.startedAt, finished);
  const meta = [item.venue?.name, when, duration].filter(Boolean).join(" · ");
  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`${when}, ${duration}, ${title},${item.venue ? ` ${item.venue.name},` : ""} in ${money(item.totals.buyIn)}, out ${money(item.totals.cashOut)}, result ${signed(item.finalResult!)}`}
      accessibilityHint="Opens the session"
    >
      <View className={cn("w-1 self-stretch rounded-full", chipColor[gameChip(item.table.game)])} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="type-heading text-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="type-footnote text-muted">
          {meta}
        </Text>
      </View>
      <Money
        amount={item.finalResult!}
        currency={RECORDING_CURRENCY}
        tone="result"
        className="type-number"
      />
      <Icon name="chevron-right" color="faint" size={16} />
    </Row>
  );
}
