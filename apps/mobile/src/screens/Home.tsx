import { useNavigation } from "@react-navigation/native";
import { formatDay, formatDuration, formatPlayed, formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import {
  localDateText,
  RECORDING_CURRENCY,
  recordingPeriods,
  visitTitle,
  type RecordedVisit,
  type RecordingHome,
} from "@stacks/client-runtime/recordingView";
import { gameChip } from "@stacks/client-runtime/stats";
import { MinorUnits, type VisitId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { ActionMenu } from "../components/ui/ActionMenu";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { PastSessionSheet, StartSheet } from "../features/RecordingForms";
import { chipColor } from "../features/chipColor";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";

const RECENT = 5;

/** This month's result and your latest finished sessions; the LiveBar shows what's live. */
export function HomeScreen() {
  const { home, status, error, retryLoad } = useRecordingHome();
  const navigation = useNavigation();
  const [sheet, setSheet] = useState<"start" | "past" | null>(null);
  const open = (visitId: VisitId) => navigation.navigate("Play", { visitId });

  const showHistory = () =>
    navigation.navigate("Tabs", {
      screen: "PlayTab",
      params: { screen: "History", initial: false },
    });

  const opened = (visitId: VisitId) => {
    setSheet(null);
    open(visitId);
  };

  const empty = home !== null && home.active.length === 0 && home.finished.length === 0;

  return (
    <PersonalScreen
      live
      contentClassName={Platform.OS === "android" ? "gap-4 pt-2" : undefined}
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
            <View className={Platform.OS === "android" ? "gap-0" : "gap-2"}>
              <SectionHeading
                action={
                  <Button
                    label="See all"
                    accessibilityLabel="See all sessions"
                    variant={Platform.OS === "android" ? "link" : "ghost"}
                    size="sm"
                    className={Platform.OS === "android" ? "px-1" : undefined}
                    onPress={showHistory}
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
              onPress={showHistory}
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

function MonthHero({ home }: { home: RecordingHome }) {
  const today = localDateText();
  const key = today.slice(0, 7);
  const month = recordingPeriods(home, "month").find((item) => item.period === key);
  const count = month?.finished ?? 0;
  const android = Platform.OS === "android";

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
          : `${formatPlayed(month?.minutes ?? 0)} · ${count === 1 ? "1 session" : `${count} sessions`}`}
        {android ? (
          count > 0 ? (
            <Text className="font-semibold text-win">
              {" "}
              · Week {Math.ceil(Number(today.slice(8, 10)) / 7)}
            </Text>
          ) : null
        ) : (
          ". Live play counts once you finish."
        )}
      </Text>
    </View>
  );
}

function FinishedRow({ item, onPress }: { item: RecordedVisit; onPress: () => void }) {
  const android = Platform.OS === "android";
  const prefs = usePreferences();
  const title = visitTitle(item.table);
  const finished = item.visit.finishedAt!;

  const when =
    localDateText(DateTime.toDateUtc(finished)) === localDateText()
      ? formatTime(item.visit.startedAt)
      : formatDay(finished);

  const duration = formatDuration(item.visit.startedAt, finished);
  const meta = [item.venue?.name, when, duration].filter(Boolean).join(" · ");

  const buyInLabel = formatDisplayMoney(item.totals.buyIn, RECORDING_CURRENCY, prefs, {
    forAccessibility: true,
  });

  const cashOutLabel = formatDisplayMoney(item.totals.cashOut, RECORDING_CURRENCY, prefs, {
    forAccessibility: true,
  });

  const resultLabel = formatDisplayMoney(item.finalResult!, RECORDING_CURRENCY, prefs, {
    signDisplay: "exceptZero",
    forAccessibility: true,
  });

  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`${when}, ${duration}, ${title},${item.venue ? ` ${item.venue.name},` : ""} in ${buyInLabel}, out ${cashOutLabel}, result ${resultLabel}`}
      accessibilityHint="Opens the session"
    >
      <View className={cn("w-1 self-stretch rounded-full", chipColor[gameChip(item.table.game)])} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn("type-heading text-ink", android && "font-bold")}>
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
        className={cn("type-number", android && "font-bold")}
      />
      <Icon name="chevron-right" color="faint" size={16} />
    </Row>
  );
}
