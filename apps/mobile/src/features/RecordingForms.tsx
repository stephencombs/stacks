import {
  Game,
  MinorUnits,
  type PlayEntry,
  type PlayerId,
  type PlayerIdentity,
  type TableId,
  type VisitId,
} from "@stacks/contracts";
import { gameNames } from "@stacks/client-runtime/format";
import type { RecordingInput, RecordingReceipt } from "@stacks/client-runtime/recording";
import { useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import {
  amountInputText,
  localDateText,
  parsePastSessionTimes,
  parseRecordingAmount,
  RECORDING_CURRENCY,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { decimalSeparator, formatMoney } from "@stacks/shared/money";
import { useState, type ReactNode } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { cn } from "../components/ui/cn";
import { AmountKeypad } from "./AmountKeypad";
import { applyAmountKey } from "./amountKey";

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);
const decimal = decimalSeparator();

/** An amount's text and its error, which shows from the first submit and follows what's typed. */
function useAmount(initial: string, minimum: 0 | 1) {
  const [text, setText] = useState(initial);
  const [checked, setChecked] = useState(false);
  return {
    text,
    error: checked ? parseRecordingAmount(text, minimum).error : null,
    set: setText,
    // A held delete repeats from the keypad's first render, so each key applies to the latest text.
    press: (key: string) => setText((current) => applyAmountKey(current, key, decimal)),
    /** The amount, or null after showing why it can't be saved. */
    read: () => {
      setChecked(true);
      const parsed = parseRecordingAmount(text, minimum);
      return parsed.error === null ? parsed.amount : null;
    },
  };
}

type Amount = ReturnType<typeof useAmount>;

/**
 * An amount typed on the table keypad. It never raises the system keyboard, so the sheet's action
 * stays in sight.
 */
function KeypadAmount({
  label,
  amount,
  hint,
}: {
  label: string;
  amount: Amount;
  hint?: ReactNode;
}) {
  const parsed = parseRecordingAmount(amount.text, 0);
  return (
    <View className="gap-2">
      <View
        accessible
        accessibilityLabel={label}
        accessibilityValue={{ text: amount.text ? amount.text : "none" }}
        className="items-center gap-1 pt-1"
      >
        <Text className="type-footnote font-medium text-muted">{label}</Text>
        {parsed.error === null ? (
          <Money
            amount={parsed.amount}
            currency={RECORDING_CURRENCY}
            fit
            className="text-6xl leading-[72px]"
          />
        ) : (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className={cn(
              "font-mono text-6xl leading-[72px]",
              amount.text ? "text-ink" : "text-faint",
            )}
          >
            {amount.text || money(0)}
          </Text>
        )}
      </View>
      {amount.error ? (
        <View accessibilityLiveRegion="polite" className="flex-row justify-center gap-1.5 px-1">
          <Icon name="alert" color="danger" size={14} />
          <Text className="type-footnote text-danger">{amount.error}</Text>
        </View>
      ) : hint ? (
        <Text className="px-1 text-center type-footnote text-muted">{hint}</Text>
      ) : null}
      <AmountKeypad onKey={amount.press} bottomLeft={decimal} />
    </View>
  );
}

/** An amount typed with the system keyboard, for a form with several fields. */
function TypedAmount({ label, amount }: { label: string; amount: Amount }) {
  return (
    <TextField
      label={label}
      value={amount.text}
      onChangeText={amount.set}
      error={amount.error}
      keyboardType="decimal-pad"
      autoComplete="off"
      autoCorrect={false}
      className="flex-1"
      inputClassName="font-mono"
    />
  );
}

function ReasonField({
  label,
  value,
  error,
  onChange,
  onSubmit,
}: {
  label: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <TextField
      label={label}
      value={value}
      error={error}
      maxLength={280}
      autoComplete="off"
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
    />
  );
}

/** A required reason: says what's missing on submit, and clears once something's typed. */
function useReason(missing: string) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return {
    text,
    error,
    set: (value: string) => {
      setText(value);
      if (error && value.trim()) setError(null);
    },
    read: () => {
      const why = text.trim();
      setError(why ? null : missing);
      return why || null;
    },
  };
}

/**
 * A recording form in a sheet. It closes only once the device has saved, and while saving it
 * can't be dismissed. A failed save keeps everything entered, and submitting again retries it.
 */
function RecordingSheet({
  title,
  description,
  submitLabel,
  submitVariant = "primary",
  cancelLabel,
  save,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  submitVariant?: "primary" | "danger";
  cancelLabel?: string;
  save: ReturnType<typeof useRecordingSubmit>;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open
      busy={save.pending}
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
      footer={
        <>
          {save.error ? (
            <FormError>{save.error} What you entered is still here. Try again.</FormError>
          ) : null}
          <Button
            label={submitLabel}
            variant={submitVariant}
            size="lg"
            haptic
            pending={save.pending}
            onPress={onSubmit}
          />
          {cancelLabel ? (
            <Button label={cancelLabel} size="lg" disabled={save.pending} onPress={onClose} />
          ) : null}
        </>
      }
    >
      {children}
    </Sheet>
  );
}

type GameChoice = Game | "none";
const games: ReadonlyArray<{ value: GameChoice; label: string }> = [
  { value: "none", label: "Not set" },
  ...Game.literals.map((game) => ({ value: game, label: gameNames[game] })),
];

function DetailsFields({
  game,
  highLimit,
  onGame,
  onHighLimit,
}: {
  game: GameChoice;
  highLimit: boolean;
  onGame: (game: GameChoice) => void;
  onHighLimit: (highLimit: boolean) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const gameLabel = games.find((option) => option.value === game)!.label;
  return (
    <View className="gap-1.5">
      <Text className="px-1 type-footnote font-medium text-muted">Details (optional)</Text>
      <View className="overflow-hidden rounded-xl bg-surface">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Game: ${gameLabel}. Change`}
          accessibilityState={{ expanded: choosing }}
          onPress={() => setChoosing((open) => !open)}
          className={cn(
            "min-h-12 flex-row items-center gap-3 px-4 active:bg-sunken",
            choosing && "bg-sunken",
          )}
        >
          <Text className="type-body text-ink">Game</Text>
          <Text numberOfLines={1} className="flex-1 text-right type-body text-muted">
            {gameLabel}
          </Text>
          <Icon name={choosing ? "chevron-down" : "chevron-right"} color="faint" size={16} />
        </Pressable>
        <View className="min-h-12 flex-row items-center justify-between gap-3 border-t border-line px-4 py-2">
          <Text className="type-body text-ink">High limit</Text>
          <Switch accessibilityLabel="High limit" value={highLimit} onValueChange={onHighLimit} />
        </View>
      </View>
      {choosing ? (
        <Choice
          label="Game"
          labelHidden
          options={games}
          value={game}
          onChange={(next) => {
            onGame(next);
            setChoosing(false);
          }}
        />
      ) : null}
    </View>
  );
}

const details = (game: GameChoice, highLimit: boolean) => ({
  ...(game === "none" ? {} : { game }),
  highLimit,
});

const startedVisit = (receipt: RecordingReceipt) => receipt.command.visitId;

export function StartSheet({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const buyIn = useAmount("", 1);
  const [game, setGame] = useState<GameChoice>("none");
  const [highLimit, setHighLimit] = useState(false);
  return (
    <RecordingSheet
      title="Start session"
      description="Your first buy-in starts it, timed from now."
      submitLabel="Start session"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const amount = buyIn.read();
        if (amount === null) return;
        const receipt = await save.submit({
          type: "start",
          buyIn: amount,
          ...details(game, highLimit),
        });
        if (receipt) onStarted(startedVisit(receipt));
      }}
    >
      <KeypadAmount label="Buy-in" amount={buyIn} />
      <DetailsFields
        game={game}
        highLimit={highLimit}
        onGame={setGame}
        onHighLimit={setHighLimit}
      />
    </RecordingSheet>
  );
}

type Times = { readonly date: string; readonly start: string; readonly finish: string };

export function PastSessionSheet({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const buyIn = useAmount("", 1);
  const cashOut = useAmount("", 0);
  const [times, setTimes] = useState<Times>(() => ({
    date: localDateText(),
    start: "",
    finish: "",
  }));
  const [timeError, setTimeError] = useState<{ field: keyof Times; error: string } | null>(null);
  const [game, setGame] = useState<GameChoice>("none");
  const [highLimit, setHighLimit] = useState(false);
  const setTime = (field: keyof Times) => (value: string) => {
    const next = { ...times, [field]: value };
    setTimes(next);
    if (timeError) {
      const parsed = parsePastSessionTimes(next);
      setTimeError(parsed.error === null ? null : parsed);
    }
  };
  const timeField = (field: keyof Times, label: string, example: string) => (
    <TextField
      label={label}
      value={times[field]}
      onChangeText={setTime(field)}
      error={timeError?.field === field ? timeError.error : null}
      placeholder={example}
      keyboardType="numbers-and-punctuation"
      autoComplete="off"
      autoCorrect={false}
      autoCapitalize="none"
      maxLength={field === "date" ? 10 : 5}
      className="flex-1"
      inputClassName="font-mono"
    />
  );
  return (
    <RecordingSheet
      title="Add past session"
      description="Totals for a session you've already finished. Rebuys don't need listing."
      submitLabel="Add session"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const totalIn = buyIn.read();
        const totalOut = cashOut.read();
        const parsed = parsePastSessionTimes(times);
        setTimeError(parsed.error === null ? null : parsed);
        if (totalIn === null || totalOut === null || parsed.error !== null) return;
        const receipt = await save.submit({
          type: "record_completed",
          buyIn: totalIn,
          cashOut: totalOut,
          startedAt: parsed.startedAt,
          finishedAt: parsed.finishedAt,
          ...details(game, highLimit),
        });
        if (receipt) onAdded(startedVisit(receipt));
      }}
    >
      <View className="flex-row gap-3">
        <TypedAmount label="Total in" amount={buyIn} />
        <TypedAmount label="Total out" amount={cashOut} />
      </View>
      {timeField("date", "Date", "2026-11-07")}
      <View className="flex-row gap-3">
        {timeField("start", "Started", "21:30")}
        {timeField("finish", "Finished", "23:45")}
      </View>
      <DetailsFields
        game={game}
        highLimit={highLimit}
        onGame={setGame}
        onHighLimit={setHighLimit}
      />
    </RecordingSheet>
  );
}

type Saved = (entryId: PlayEntry["id"], input: RecordingInput) => void;

export function RebuySheet({
  visit,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 1);
  return (
    <RecordingSheet
      title="Rebuy"
      submitLabel="Record rebuy"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const value = amount.read();
        if (value === null) return;
        const input = {
          type: "add",
          visitId: visit.visit.id,
          kind: "buy_in",
          amount: value,
        } as const;
        const receipt = await save.submit(input);
        if (receipt?.command.type === "add") onSaved(receipt.command.entryId, input);
      }}
    >
      <KeypadAmount label="Amount" amount={amount} />
      {visit.presets.length > 0 ? (
        <View
          className="flex-row justify-center gap-2"
          accessibilityRole="toolbar"
          accessibilityLabel="Recent amounts"
        >
          {visit.presets.map((preset) => (
            <Button
              key={preset}
              label={money(preset)}
              accessibilityLabel={`Fill ${money(preset)}`}
              size="sm"
              onPress={() => amount.set(amountInputText(preset))}
            />
          ))}
        </View>
      ) : null}
    </RecordingSheet>
  );
}

const afterOptions = [
  { value: "keep", label: "Keep playing" },
  { value: "finish", label: "Finish playing" },
] as const;

export function CashOutSheet({
  visit,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 0);
  const [after, setAfter] = useState<"keep" | "finish">("keep");
  const previous = visit.totals.cashOut;
  return (
    <RecordingSheet
      title="Cash out"
      submitLabel={after === "finish" ? "Cash out and finish" : "Record cash-out"}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const value = amount.read();
        if (value === null) return;
        const input =
          after === "finish"
            ? ({ type: "finish", visitId: visit.visit.id, amount: value } as const)
            : ({ type: "add", visitId: visit.visit.id, kind: "cash_out", amount: value } as const);
        const receipt = await save.submit(input);
        if (receipt?.command.type === "add" || receipt?.command.type === "finish")
          onSaved(receipt.command.entryId, input);
      }}
    >
      <KeypadAmount
        label="Amount"
        amount={amount}
        hint={
          previous > 0 ? (
            <>
              Just this cash-out. Earlier ones total{" "}
              <Money
                amount={previous}
                currency={RECORDING_CURRENCY}
                className="type-footnote text-muted"
              />
              .
            </>
          ) : undefined
        }
      />
      <View className="items-center">
        <Button
          label={`${previous > 0 ? "Nothing more" : "Nothing to cash out"} · ${money(0)}`}
          size="sm"
          // Fills the amount like a preset does: one stray tap shouldn't record anything.
          onPress={() => amount.set(amountInputText(0))}
        />
      </View>
      <Choice
        label="After this cash-out"
        options={afterOptions}
        value={after}
        onChange={setAfter}
      />
      {after === "finish" ? (
        <Text className="px-1 type-footnote text-muted">
          Finishing ends your play in this session and works out its final result. Coming back later
          starts a new session.
        </Text>
      ) : null}
    </RecordingSheet>
  );
}

const kindName = (entry: PlayEntry) => (entry.kind === "buy_in" ? "buy-in" : "cash-out");

export function CorrectSheet({
  visit,
  entry,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  entry: PlayEntry;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount(amountInputText(entry.amount), entry.kind === "buy_in" ? 1 : 0);
  const reason = useReason("Say what was wrong with it.");
  const submit = async () => {
    const value = amount.read();
    const why = reason.read();
    if (value === null || why === null) return;
    const input = {
      type: "correct",
      visitId: visit.visit.id,
      entryId: entry.id,
      reason: why,
      replacement: { amount: value },
    } as const;
    const receipt = await save.submit(input);
    if (receipt?.command.type === "correct" && receipt.command.replacement)
      onSaved(receipt.command.replacement.id, input);
  };
  return (
    <RecordingSheet
      title={`Correct ${kindName(entry)}`}
      description="The original stays in the history, voided, and this one replaces it."
      submitLabel="Save correction"
      save={save}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <KeypadAmount label="Correct amount" amount={amount} />
      <ReasonField
        label="What was wrong"
        value={reason.text}
        error={reason.error}
        onChange={reason.set}
        onSubmit={() => void submit()}
      />
      {visit.visit.finishedAt !== null ? (
        <Text className="px-1 type-footnote text-muted">
          The session stays finished; its final result is worked out again.
        </Text>
      ) : null}
    </RecordingSheet>
  );
}

export function VoidSheet({
  visit,
  entry,
  onClose,
  onVoided,
}: {
  visit: RecordingVisitView;
  entry: PlayEntry;
  onClose: () => void;
  onVoided: () => void;
}) {
  const save = useRecordingSubmit();
  const reason = useReason("Say why it's being voided.");
  const submit = async () => {
    const why = reason.read();
    if (why === null) return;
    const receipt = await save.submit({
      type: "correct",
      visitId: visit.visit.id,
      entryId: entry.id,
      reason: why,
      replacement: null,
    });
    if (receipt) onVoided();
  };
  return (
    <RecordingSheet
      title="Void this entry?"
      description={`The ${money(entry.amount)} ${kindName(entry)} stays in the history, crossed out, and stops counting toward this session.`}
      submitLabel="Void entry"
      submitVariant="danger"
      cancelLabel="Keep entry"
      save={save}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <ReasonField
        label="Why"
        value={reason.text}
        error={reason.error}
        onChange={reason.set}
        onSubmit={() => void submit()}
      />
    </RecordingSheet>
  );
}

export function ReopenSheet({
  visit,
  onClose,
  onReopened,
}: {
  visit: RecordingVisitView;
  onClose: () => void;
  onReopened: () => void;
}) {
  const save = useRecordingSubmit();
  const reason = useReason("Say what happened.");
  const submit = async () => {
    const why = reason.read();
    if (why === null) return;
    const receipt = await save.submit({ type: "reopen", visitId: visit.visit.id, reason: why });
    if (receipt) onReopened();
  };
  return (
    <RecordingSheet
      title="Fix an accidental finish?"
      description="Only if you never stopped playing. The session goes back to live, and the finish stays in its history. If you left and came back, start a new session instead."
      submitLabel="Reopen session"
      cancelLabel="Keep finished"
      save={save}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <ReasonField
        label="What happened"
        value={reason.text}
        error={reason.error}
        onChange={reason.set}
        onSubmit={() => void submit()}
      />
      {visit.finalCashOut ? (
        <Text className="px-1 type-footnote text-muted">
          Your{" "}
          <Money
            amount={visit.finalCashOut.amount}
            currency={RECORDING_CURRENCY}
            className="type-footnote text-muted"
          />{" "}
          final cash-out will be voided, since you never cashed out.
        </Text>
      ) : null}
    </RecordingSheet>
  );
}

const NEW_PLAYER = "new";

/**
 * Starts a visit at this table for another player: one saved on this device, or someone new by
 * name. A name never finds or merges anyone; a new name is always a new player.
 */
export function AddPlayerSheet({
  tableId,
  saved,
  onClose,
  onAdded,
}: {
  tableId: TableId;
  saved: ReadonlyArray<PlayerIdentity>;
  onClose: () => void;
  onAdded: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 1);
  const [choice, setChoice] = useState<string>(NEW_PLAYER);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  return (
    <RecordingSheet
      title="Add player"
      description="Record their buy-ins and cash-outs from this device."
      submitLabel="Add player"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const isNew = choice === NEW_PLAYER;
        const trimmed = name.trim();
        setNameError(isNew && trimmed === "" ? "Enter the player's name." : null);
        const value = amount.read();
        if (value === null || (isNew && trimmed === "")) return;
        const receipt = await save.submit(
          isNew
            ? { type: "join_table", tableId, displayName: trimmed, buyIn: value }
            : { type: "join_table", tableId, playerId: choice as PlayerId, buyIn: value },
        );
        if (receipt?.command.type === "join_table") onAdded(receipt.command.visitId);
      }}
    >
      {saved.length > 0 ? (
        <Choice
          label="Player"
          value={choice}
          onChange={setChoice}
          options={[
            { value: NEW_PLAYER, label: "Someone new" },
            ...saved.map((player) => ({ value: player.id, label: player.displayName })),
          ]}
        />
      ) : null}
      {choice === NEW_PLAYER ? (
        <TextField
          label="Name"
          value={name}
          maxLength={60}
          autoComplete="off"
          error={nameError}
          onChangeText={setName}
        />
      ) : null}
      <KeypadAmount label="Buy-in" amount={amount} />
    </RecordingSheet>
  );
}

/**
 * Sits a player down at a table again with a new buy-in: a new visit, since their last one is
 * over. It records on this device, so it works offline.
 */
export function SitDownSheet({
  tableId,
  player,
  onClose,
  onSeated,
}: {
  tableId: TableId;
  player: PlayerIdentity;
  onClose: () => void;
  onSeated: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 1);
  return (
    <RecordingSheet
      title="Back at the table"
      submitLabel="Sit back down"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const value = amount.read();
        if (value === null) return;
        const receipt = await save.submit({
          type: "join_table",
          tableId,
          playerId: player.id,
          buyIn: value,
        });
        if (receipt) onSeated(receipt.command.visitId);
      }}
    >
      <KeypadAmount label="Buy-in" amount={amount} />
    </RecordingSheet>
  );
}
