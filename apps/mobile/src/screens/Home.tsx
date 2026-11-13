import { useNavigation } from "@react-navigation/native";
import { formatDay, formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import {
  RECORDING_CURRENCY,
  visitTitle,
  type RecordedVisit,
} from "@stacks/client-runtime/recordingView";
import type { MinorUnits, VisitId } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import { useState } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import {
  Badge,
  EmptyState,
  List,
  PageTitle,
  Row,
  SectionHeading,
  Skeleton,
} from "../components/ui/Surface";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { PastSessionSheet, StartSheet } from "../features/RecordingForms";

/** How many finished sessions show before "Show all". */
const RECENT = 10;

const money = (amount: MinorUnits) => formatMoney(amount, RECORDING_CURRENCY);
const signed = (amount: MinorUnits) =>
  formatMoney(amount, RECORDING_CURRENCY, { signDisplay: "exceptZero" });

/** Your play: sessions in play, then finished ones and their result. No account needed. */
export function HomeScreen() {
  const { home, status, error, retryLoad } = useRecordingHome();
  const navigation = useNavigation();
  const [sheet, setSheet] = useState<"start" | "past" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [finishedCollapsed, setFinishedCollapsed] = useState(false);
  const open = (visitId: VisitId) => navigation.navigate("Play", { visitId });
  const opened = (visitId: VisitId) => {
    setSheet(null);
    open(visitId);
  };
  const playing = (home?.active.length ?? 0) > 0;
  return (
    <PersonalScreen
      dock={
        <>
          <Button
            label="Start session"
            variant={playing ? "secondary" : "primary"}
            size="lg"
            haptic
            disabled={home === null}
            onPress={() => setSheet("start")}
          />
          <Button
            label="Add past session"
            variant="ghost"
            size="lg"
            disabled={home === null}
            onPress={() => setSheet("past")}
          />
        </>
      }
    >
      <View className="gap-2">
        <PageTitle>Play</PageTitle>
        <SaveStatus status={status} error={error} onRetry={retryLoad} />
      </View>
      {home === null ? (
        status === "load_failed" ? null : (
          <Skeleton className="h-32 w-full rounded-xl" />
        )
      ) : (
        <>
          {playing ? (
            <View className="gap-2">
              <SectionHeading>Playing now</SectionHeading>
              <List>
                {home.active.map((item) => (
                  <ActiveRow key={item.visit.id} item={item} onPress={() => open(item.visit.id)} />
                ))}
              </List>
            </View>
          ) : null}
          {home.finished.length > 0 ? (
            <>
              <FinishedHero result={home.finishedResult} count={home.finished.length} />
              <View className="gap-2">
                <SectionHeading
                  count={home.finished.length}
                  collapsible
                  collapsed={finishedCollapsed}
                  onToggle={() => setFinishedCollapsed((c) => !c)}
                >
                  Finished
                </SectionHeading>
                {!finishedCollapsed ? (
                  <>
                    <List>
                      {(showAll ? home.finished : home.finished.slice(0, RECENT)).map((item) => (
                        <FinishedRow
                          key={item.visit.id}
                          item={item}
                          onPress={() => open(item.visit.id)}
                        />
                      ))}
                    </List>
                    {home.finished.length > RECENT && !showAll ? (
                      <Button
                        label={`Show all ${home.finished.length}`}
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onPress={() => setShowAll(true)}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>
            </>
          ) : null}
          {!playing && home.finished.length === 0 ? (
            <EmptyState centered title="No sessions yet">
              Start one with your first buy-in. It's saved on this device, and you don't need an
              account.
            </EmptyState>
          ) : null}
        </>
      )}
      {sheet === "start" ? <StartSheet onClose={() => setSheet(null)} onStarted={opened} /> : null}
      {sheet === "past" ? (
        <PastSessionSheet onClose={() => setSheet(null)} onAdded={opened} />
      ) : null}
    </PersonalScreen>
  );
}

function ActiveRow({ item, onPress }: { item: RecordedVisit; onPress: () => void }) {
  const title = visitTitle(item.table);
  const started = formatTime(item.visit.startedAt);
  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`${title}, live. Started ${started}, in ${money(item.totals.buyIn)}, out ${money(item.totals.cashOut)}, result pending`}
      accessibilityHint="Opens the session"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="type-heading text-ink">
          {title}
        </Text>
        <Text className="type-footnote text-muted">
          Started {started} · In{" "}
          <Money amount={item.totals.buyIn} currency={RECORDING_CURRENCY} className="text-muted" />{" "}
          · Out{" "}
          <Money
            amount={item.totals.cashOut}
            currency={RECORDING_CURRENCY}
            className="text-muted"
          />{" "}
          · Result pending
        </Text>
      </View>
      <Badge tone="live">Live</Badge>
      <Icon name="chevron-right" color="faint" size={16} />
    </Row>
  );
}

function FinishedRow({ item, onPress }: { item: RecordedVisit; onPress: () => void }) {
  const title = `${formatDay(item.visit.finishedAt!)} · ${visitTitle(item.table)}`;
  return (
    <Row
      onPress={onPress}
      accessibilityLabel={`${title}, in ${money(item.totals.buyIn)}, out ${money(item.totals.cashOut)}, result ${signed(item.finalResult!)}`}
      accessibilityHint="Opens the session"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="type-heading text-ink">
          {title}
        </Text>
        <Text className="type-footnote text-muted">
          In{" "}
          <Money amount={item.totals.buyIn} currency={RECORDING_CURRENCY} className="text-muted" />{" "}
          · Out{" "}
          <Money
            amount={item.totals.cashOut}
            currency={RECORDING_CURRENCY}
            className="text-muted"
          />
        </Text>
      </View>
      <Money
        amount={item.finalResult!}
        currency={RECORDING_CURRENCY}
        tone="result"
        className="type-number"
      />
    </Row>
  );
}

function FinishedHero({ result, count }: { result: MinorUnits; count: number }) {
  return (
    <View className="rounded-2xl border border-line bg-surface p-5 gap-1.5">
      <Text className="type-label text-muted">Finished results</Text>
      <Money
        amount={result}
        currency={RECORDING_CURRENCY}
        tone="result"
        fit
        className="type-hero"
      />
      <Text className="type-footnote text-muted">
        {count === 1 ? "1 finished session" : `${count} finished sessions`}. Live play counts once
        you finish.
      </Text>
    </View>
  );
}
