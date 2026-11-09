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
import { Glow } from "../components/ui/Glow";
import { Icon } from "../components/ui/Icon";
import {
  EmptyState,
  List,
  PageTitle,
  Row,
  SectionHeading,
  Skeleton,
  Tag,
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
        <PageTitle>Your play</PageTitle>
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
                  action={<Text className="text-sm text-muted">{home.finished.length}</Text>}
                >
                  Finished
                </SectionHeading>
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
              </View>
            </>
          ) : null}
          {!playing && home.finished.length === 0 ? (
            <EmptyState title="No sessions yet">
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
        <Text numberOfLines={1} className="text-base font-medium text-ink">
          {title}
        </Text>
        <Text className="text-sm text-muted">
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
      <Tag tone="live">Live</Tag>
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
        <Text numberOfLines={1} className="text-base font-medium text-ink">
          {title}
        </Text>
        <Text className="text-sm text-muted">
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
        className="text-base font-semibold"
      />
    </Row>
  );
}

function FinishedHero({ result, count }: { result: MinorUnits; count: number }) {
  return (
    <View className="overflow-hidden rounded-xl bg-surface p-4">
      <Glow tone={result > 0 ? "win" : result < 0 ? "loss" : "accent"} />
      <View className="gap-1">
        <Text className="text-sm font-medium text-muted">Finished results</Text>
        <Money
          amount={result}
          currency={RECORDING_CURRENCY}
          tone="result"
          fit
          className="font-display text-6xl leading-[64px]"
        />
        <Text className="text-sm text-muted">
          {count === 1 ? "1 finished session" : `${count} finished sessions`}. Live play counts once
          you finish.
        </Text>
      </View>
    </View>
  );
}
