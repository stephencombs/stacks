import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { formatDay } from "@stacks/client-runtime/format";
import {
  pairHistoryRows,
  pairStanding,
  pendingPayments,
  type PairHistoryRow,
} from "@stacks/client-runtime/playerMoney";
import { useRecordingSubmit, useRecordingSync } from "@stacks/client-runtime/recordingReact";
import {
  paymentSyncView,
  parseRecordingAmount,
  RECORDING_CURRENCY,
} from "@stacks/client-runtime/recordingView";
import { PlayerId, type EntryId, type PairHistory, type PlayerPair } from "@stacks/contracts";
import { useState } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading, Skeleton, Tag } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { PersonalScreen } from "../features/Personal";
import { useBalances, usePair, useRecordingState } from "../lib/playerMoney";

const SEPARATE =
  "What you and the people you've played with owe each other, outside any trip. Trip balances stay on each trip's Settle up.";

function Standing({ pair, hero = false }: { pair: PlayerPair; hero?: boolean }) {
  const standing = pairStanding(pair);
  return (
    <View className={cn("items-end", hero && "items-start gap-1")}>
      <Text className={cn("text-sm", standing.direction === "square" ? "text-muted" : "text-ink")}>
        {standing.text}
      </Text>
      {standing.amount !== null ? (
        <Money
          amount={standing.amount}
          currency={RECORDING_CURRENCY}
          fit={hero}
          className={cn(
            "font-semibold",
            hero && "type-title",
            standing.direction === "owed" ? "text-win" : "text-loss",
          )}
        />
      ) : null}
    </View>
  );
}

function Failed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <View accessibilityRole="alert" className="gap-2">
      <Text className="text-sm text-danger">{error}</Text>
      <Button label="Try again" size="sm" onPress={onRetry} />
    </View>
  );
}

/** The refused payments on this device, each to record again or discard. */
function Refused() {
  const state = useRecordingState();
  const sync = useRecordingSync();
  const rejected = paymentSyncView(state, null).rejected;
  if (rejected.length === 0 && sync.error === null) return null;
  return (
    <View className="gap-2">
      {sync.error ? <FormError>{sync.error}</FormError> : null}
      {rejected.map((item) => (
        <View
          key={item.operationId}
          accessibilityRole="alert"
          className="gap-3 rounded-lg bg-sunken px-3 py-2.5"
        >
          <View className="min-w-0 flex-row gap-2">
            <Icon name="alert" color="danger" size={16} />
            <Text selectable className="flex-1 text-sm text-danger">
              {item.sentence}
            </Text>
          </View>
          <View className="flex-row justify-end gap-2">
            <Button label="Discard" size="sm" onPress={() => void sync.discard(item.operationId)} />
            <Button
              label="Record again"
              size="sm"
              onPress={() => void sync.recordAgain(item.operationId)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Settle up, under You: per-person balances between players, outside any trip. */
export function PlayerBalancesScreen() {
  const navigation = useNavigation();
  const { result, reload } = useBalances();
  const waiting = pendingPayments(useRecordingState()).length;
  return (
    <PersonalScreen>
      <View className="gap-1">
        <Text accessibilityRole="header" className="type-title text-ink">
          Settle up
        </Text>
        <Text className="text-sm text-muted">{SEPARATE}</Text>
      </View>
      <Refused />
      {waiting > 0 ? (
        <Text className="text-sm text-muted">
          {waiting === 1 ? "1 payment is" : `${waiting} payments are`} saved on this device, waiting
          to sync.
        </Text>
      ) : null}
      {result.status === "loading" ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : result.status === "error" ? (
        <Failed error={result.error} onRetry={reload} />
      ) : result.value.pairs.length === 0 ? (
        <EmptyState title="Nobody to settle with yet">
          Share a table with someone, and you can record who paid for whom here.
        </EmptyState>
      ) : (
        <List>
          {result.value.pairs.map((pair) => (
            <Row
              key={`${pair.playerId}-${pair.counterparty.id}`}
              onPress={() => navigation.navigate("PlayerPair", { playerId: pair.counterparty.id })}
              accessibilityHint="Shows your history with them and records a payment"
              className="min-h-14"
            >
              <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-medium text-ink">
                {pair.counterparty.displayName}
              </Text>
              <Standing pair={pair} />
            </Row>
          ))}
        </List>
      )}
    </PersonalScreen>
  );
}

type PairProps = StaticScreenProps<{ playerId: string }>;

export function PlayerPairScreen({ route }: PairProps) {
  const playerId = PlayerId.make(route.params.playerId);
  const { result, reload } = usePair(playerId);
  const state = useRecordingState();
  const [open, setOpen] = useState<
    { type: "pay" } | { type: "correct" | "void"; row: PairHistoryRow } | null
  >(null);
  const waiting = pendingPayments(state, playerId);
  const close = () => setOpen(null);
  if (result.status === "loading")
    return (
      <PersonalScreen>
        <Skeleton className="h-40 w-full rounded-xl" />
      </PersonalScreen>
    );
  if (result.status === "error")
    return (
      <PersonalScreen>
        <Failed error={result.error} onRetry={reload} />
      </PersonalScreen>
    );
  const history = result.value;
  if (!history)
    return (
      <PersonalScreen>
        <EmptyState title="Nobody to settle with">
          You can settle only with people you've shared a table with.
        </EmptyState>
      </PersonalScreen>
    );
  const rows = pairHistoryRows(history, state?.actor.id ?? null);
  const name = history.pair.counterparty.displayName;
  return (
    <PersonalScreen
      dock={
        <Button
          label="Record a payment"
          variant="primary"
          size="lg"
          onPress={() => setOpen({ type: "pay" })}
        />
      }
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="type-title text-ink">
          {name}
        </Text>
        <Text className="text-sm text-muted">Between you two, outside any trip.</Text>
      </View>
      <Standing pair={history.pair} hero />
      <Refused />
      {waiting.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>Waiting to sync</SectionHeading>
          <List>
            {waiting.map((command) => (
              <Row key={command.operationId}>
                <Text className="min-w-0 flex-1 text-base text-ink">
                  {command.type === "repay"
                    ? command.fromPlayerId === history.pair.playerId
                      ? `You paid ${name}`
                      : `${name} paid you`
                    : command.type === "correct_repayment"
                      ? "Correction"
                      : "Void"}
                </Text>
                {command.type === "repay" ? (
                  <Money amount={command.amount} currency={RECORDING_CURRENCY} />
                ) : command.type === "correct_repayment" ? (
                  <Money amount={command.replacement.amount} currency={RECORDING_CURRENCY} />
                ) : null}
                <Tag>Saved on this device</Tag>
              </Row>
            ))}
          </List>
        </View>
      ) : null}
      <View className="gap-2">
        <SectionHeading>History</SectionHeading>
        {rows.length === 0 ? (
          <EmptyState title="Nothing between you yet">
            Covered buy-ins, cash-outs you took for each other and payments show here.
          </EmptyState>
        ) : (
          <List>
            {rows.map((row) => (
              <HistoryRow
                key={row.id}
                row={row}
                onCorrect={() => setOpen({ type: "correct", row })}
                onVoid={() => setOpen({ type: "void", row })}
              />
            ))}
          </List>
        )}
      </View>
      {open?.type === "pay" ? (
        <PaymentSheet history={history} onClose={close} onSaved={reload} />
      ) : open?.type === "correct" || open?.type === "void" ? (
        <ChangePaymentSheet
          kind={open.type}
          row={open.row}
          history={history}
          onClose={close}
          onSaved={reload}
        />
      ) : null}
    </PersonalScreen>
  );
}

function HistoryRow({
  row,
  onCorrect,
  onVoid,
}: {
  row: PairHistoryRow;
  onCorrect: () => void;
  onVoid: () => void;
}) {
  const voided = row.voided !== null;
  const details = [
    formatDay(row.occurredAt),
    `Recorded by ${row.recordedBy}`,
    row.correction ? "Correction" : null,
    row.voided
      ? `Voided by ${row.voided.by}${row.voided.reason ? `: ${row.voided.reason}` : ""}`
      : null,
  ].filter(Boolean);
  return (
    <View className="gap-2 border-t border-line px-4 py-3.5">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className={cn("text-base font-medium", voided ? "text-muted line-through" : "text-ink")}
          >
            {row.text}
          </Text>
          <Text className="text-sm text-muted">{details.join(" · ")}</Text>
        </View>
        <Money
          amount={row.amount}
          currency={RECORDING_CURRENCY}
          className={voided ? "text-muted line-through" : "font-semibold"}
        />
      </View>
      {row.kind === "payment" && !voided ? (
        <View className="flex-row justify-end gap-2">
          <Button label="Correct" size="sm" onPress={onCorrect} />
          <Button label="Void" size="sm" onPress={onVoid} />
        </View>
      ) : null}
    </View>
  );
}

/** An amount typed as text, read as integer minor units. */
function useAmountText(initial = "") {
  const [text, setText] = useState(initial);
  const [checked, setChecked] = useState(false);
  return {
    text,
    set: setText,
    error: checked ? parseRecordingAmount(text, 1).error : null,
    read: () => {
      setChecked(true);
      const parsed = parseRecordingAmount(text, 1);
      return parsed.error === null ? parsed.amount : null;
    },
  };
}

function PaymentSheet({
  history,
  onClose,
  onSaved,
}: {
  history: PairHistory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();
  const amount = useAmountText();
  const [note, setNote] = useState("");
  const name = history.pair.counterparty.displayName;
  const [direction, setDirection] = useState<"paid" | "received">(
    pairStanding(history.pair).direction === "owed" ? "received" : "paid",
  );
  const me = history.pair.playerId;
  const them = history.pair.counterparty.id;
  return (
    <Sheet
      open
      busy={save.pending}
      onClose={onClose}
      title="Record a payment"
      description="Color Up records payments. It never moves money."
      footer={
        <>
          {save.error ? <FormError>{save.error}</FormError> : null}
          <Button
            label="Record payment"
            variant="primary"
            size="lg"
            haptic
            pending={save.pending}
            onPress={async () => {
              const value = amount.read();
              if (value === null) return;
              const receipt = await save.submit({
                type: "repay",
                fromPlayerId: direction === "paid" ? me : them,
                toPlayerId: direction === "paid" ? them : me,
                amount: value,
                ...(note.trim() ? { note } : {}),
              });
              if (receipt) {
                onClose();
                onSaved();
              }
            }}
          />
        </>
      }
    >
      <Choice
        label="Who paid"
        options={[
          { value: "paid", label: `You paid ${name}` },
          { value: "received", label: `${name} paid you` },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <TextField
        label="Amount"
        keyboardType="decimal-pad"
        value={amount.text}
        onChangeText={amount.set}
        error={amount.error}
      />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} />
    </Sheet>
  );
}

function ChangePaymentSheet({
  kind,
  row,
  history,
  onClose,
  onSaved,
}: {
  kind: "correct" | "void";
  row: PairHistoryRow;
  history: PairHistory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();
  const state = useRecordingState();
  const amount = useAmountText();
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  // The device holds the payment once it has pulled it; until then it can't be changed offline.
  const known = state?.repayments.some((item) => item.id === row.id) ?? false;
  const repaymentId: EntryId = row.id;
  return (
    <Sheet
      open
      busy={save.pending}
      onClose={onClose}
      title={kind === "void" ? "Void payment" : "Correct payment"}
      description={`${row.text}. The original stays in the history with who changed it.`}
      footer={
        <>
          {save.error ? <FormError>{save.error}</FormError> : null}
          {!known ? (
            <FormError>This payment hasn't reached this device yet. Try again shortly.</FormError>
          ) : null}
          <Button
            label={kind === "void" ? "Void payment" : "Save correction"}
            variant={kind === "void" ? "danger" : "primary"}
            size="lg"
            disabled={!known}
            pending={save.pending}
            onPress={async () => {
              const why = reason.trim();
              setMissing(why === "");
              const value = kind === "correct" ? amount.read() : 0;
              if (why === "" || value === null) return;
              const receipt = await save.submit(
                kind === "void"
                  ? { type: "void_repayment", repaymentId, reason: why }
                  : { type: "correct_repayment", repaymentId, reason: why, amount: value },
              );
              if (receipt) {
                onClose();
                onSaved();
              }
            }}
          />
        </>
      }
    >
      {kind === "correct" ? (
        <TextField
          label="Correct amount"
          keyboardType="decimal-pad"
          value={amount.text}
          onChangeText={amount.set}
          error={amount.error}
        />
      ) : null}
      <TextField
        label="Reason"
        value={reason}
        onChangeText={setReason}
        error={missing ? `Say why you're ${kind === "void" ? "voiding" : "correcting"} it.` : null}
      />
      <Text className="text-sm text-muted">
        Between you and {history.pair.counterparty.displayName}.
      </Text>
    </Sheet>
  );
}
