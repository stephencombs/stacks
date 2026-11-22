import {
  Game,
  MinorUnits,
  type PlayEntry,
  type PlayerId,
  type PlayerIdentity,
  type TableId,
  type TripId,
  type VisitId,
} from "@stacks/contracts";
import { formatDay, gameNames, shortName, tellApart } from "@stacks/client-runtime/format";
import type {
  CachedVenue,
  RecordingInput,
  RecordingReceipt,
} from "@stacks/client-runtime/recording";
import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import {
  useBuyInTotal,
  useRecordingHome,
  useRecordingSubmit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  amountInputText,
  buyInTotalLabel,
  buyInTotalPreview,
  cashOutResultPreview,
  localDateText,
  localTimeText,
  parsePastSessionTimes,
  parseStartedAt,
  parseRecordingAmount,
  parseTimeNear,
  RECORDING_CURRENCY,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { decimalSeparator, formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import { use, useState, type ReactNode } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { DateTimeField } from "../components/ui/DateTimeField";
import { Sheet } from "../components/ui/Sheet";
import { InSheet } from "../components/ui/sheetContext";
import { List, Row } from "../components/ui/Surface";
import { Switch } from "../components/ui/Switch";
import { cn } from "../components/ui/cn";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";
import { useRecordingState } from "../lib/recording";
import { GlassSurface } from "../components/ui/GlassSurface";
import { AmountKeypad } from "./AmountKeypad";
import { Chip } from "./Chip";
import { CasinoPickerSheet, SessionVenuePicker } from "./VenuePicker";
import { applyAmountKey } from "./amountKey";
import { TripChoice } from "./TableTrip";

const money = (amount: number, showCents = false) =>
  formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY, {
    trailingZeroDisplay: showCents ? "auto" : "stripIfInteger",
  });

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
  keypad = true,
}: {
  keypad?: boolean;
  label: string;
  amount: Amount;
  hint?: ReactNode;
}) {
  const parsed = parseRecordingAmount(amount.text, 0);

  return (
    <View className="gap-2">
      <View
        accessible
        accessibilityLabel={label || "Amount"}
        accessibilityValue={{ text: amount.text ? amount.text : "none" }}
        className="items-center gap-1 pt-1"
      >
        {label ? <Text className="type-footnote font-medium text-muted">{label}</Text> : null}
        {parsed.error === null ? (
          <Money
            amount={parsed.amount}
            currency={RECORDING_CURRENCY}
            fit
            className="text-[52px] leading-[58px] font-bold tracking-[-1px]"
          />
        ) : (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className={cn(
              "text-[52px] leading-[58px] font-bold tracking-[-1px] tabular-nums",
              amount.text ? "text-ink" : "text-faint",
            )}
          >
            {amount.text || money(0)}
          </Text>
        )}
      </View>
      {amount.error ? (
        <View accessibilityLiveRegion="polite" className="flex-row justify-center gap-1.5 px-1">
          <Icon name="alert" color="loss" size={14} />
          <Text className="type-footnote text-loss">{amount.error}</Text>
        </View>
      ) : hint ? (
        <Text className="px-1 text-center type-footnote text-muted">{hint}</Text>
      ) : null}
      {keypad ? <RecordingKeypad amount={amount} /> : null}
    </View>
  );
}

function RecordingKeypad({
  amount,
  tiled = Platform.OS === "ios",
}: {
  amount: Amount;
  tiled?: boolean;
}) {
  if (tiled) {
    return (
      <View className="border-t border-line pt-2.5">
        <AmountKeypad onKey={amount.press} bottomLeft={decimal} tiled />
      </View>
    );
  }

  return (
    <GlassSurface radius={22} className="rounded-2xl p-2">
      <AmountKeypad onKey={amount.press} bottomLeft={decimal} />
    </GlassSurface>
  );
}

/** An amount typed with the system keyboard, for a form with several fields. */
function TypedAmount({ label, amount }: { label: string; amount: Amount }) {
  if (Platform.OS === "android")
    return (
      <View className="flex-1 gap-1.5">
        <Text className="px-1 type-footnote font-medium text-muted">{label}</Text>
        <View
          className={cn(
            "min-h-12 flex-row items-center gap-1.5 rounded-2xl border border-line bg-surface px-3.5",
            amount.error && "border-loss",
          )}
        >
          <Text className="type-body font-medium text-muted">$</Text>
          <TextInput
            accessibilityLabel={label}
            accessibilityHint={amount.error ?? undefined}
            value={amount.text}
            onChangeText={amount.set}
            keyboardType="decimal-pad"
            autoComplete="off"
            autoCorrect={false}
            placeholder="0"
            placeholderTextColorClassName="accent-muted"
            className="flex-1 py-2.5 font-sans type-body text-ink tabular-nums"
          />
        </View>
        {amount.error ? (
          <View accessibilityLiveRegion="polite" className="flex-row gap-1.5 px-1">
            <Icon name="alert" color="loss" size={14} />
            <Text className="flex-1 type-footnote text-loss">{amount.error}</Text>
          </View>
        ) : null}
      </View>
    );

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
      inputClassName="tabular-nums"
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
  secondaryAction,
  back = false,
  keypad,
  keypadInFooter = Platform.OS === "android",
  save,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string | undefined;
  submitLabel: string;
  submitVariant?: "primary" | "danger";
  cancelLabel?: string;
  secondaryAction?: { readonly label: string; readonly onPress: () => void };
  back?: boolean;
  keypad?: ReactNode;
  keypadInFooter?: boolean;
  save: { readonly pending: boolean; readonly error: string | null };
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open
      busy={save.pending}
      back={back}
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
      footer={
        <>
          {save.error ? (
            <FormError>{save.error} What you entered is still here. Try again.</FormError>
          ) : null}
          {secondaryAction ? (
            <View className="flex-row gap-2">
              <Button
                label={secondaryAction.label}
                variant={Platform.OS === "android" ? "ghost" : "secondary"}
                size="lg"
                disabled={save.pending}
                className={
                  Platform.OS === "android" ? "flex-1 border border-line bg-transparent" : "px-5"
                }
                onPress={secondaryAction.onPress}
              />
              <Button
                label={submitLabel}
                variant={submitVariant}
                size="lg"
                haptic
                testID="sheet-submit"
                pending={save.pending}
                className="flex-1"
                onPress={onSubmit}
              />
            </View>
          ) : (
            <Button
              label={submitLabel}
              variant={submitVariant}
              size="lg"
              haptic
              // A sheet's title and submit often say the same as the button that opened it.
              testID="sheet-submit"
              pending={save.pending}
              onPress={onSubmit}
            />
          )}
          {cancelLabel ? (
            <Button label={cancelLabel} size="lg" disabled={save.pending} onPress={onClose} />
          ) : null}
          {keypadInFooter ? keypad : null}
        </>
      }
    >
      {children}
      {keypadInFooter ? null : keypad}
    </Sheet>
  );
}

type GameChoice = Game | "none";

const games: ReadonlyArray<{ value: GameChoice; label: string }> = [
  { value: "none", label: "Not set" },
  ...Game.literals.map((game) => ({ value: game, label: gameNames[game] })),
];

function GameFields({
  game,
  gameName = "",
  highLimit,
  onGame,
  onGameName,
  onHighLimit,
}: {
  game: GameChoice;
  gameName?: string;
  highLimit: boolean;
  onGame: (game: GameChoice) => void;
  onGameName?: (value: string) => void;
  onHighLimit: (highLimit: boolean) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const inSheet = use(InSheet);
  const baseLabel = games.find((option) => option.value === game)!.label;
  const gameLabel = game === "other" && gameName.trim() ? gameName.trim() : baseLabel;

  return (
    <>
      <View className={cn("overflow-hidden rounded-xl", inSheet ? "bg-raised" : "bg-surface")}>
        {Platform.OS === "ios" ? (
          <View className="min-h-12 flex-row items-center justify-between gap-3 px-4">
            <Text className="type-body text-ink">Game</Text>
            <Choice
              inline
              label="Game"
              labelHidden
              options={games}
              value={game}
              onChange={(next) => {
                onGame(next);

                if (next !== "other") onGameName?.("");
              }}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Game: ${gameLabel}. Change`}
            accessibilityState={{ expanded: choosing }}
            onPress={() => setChoosing((open) => !open)}
            className={cn(
              "min-h-12 flex-row items-center gap-3 px-4 active:bg-fill",
              choosing && "bg-fill",
            )}
          >
            <Text className="type-body text-ink">Game</Text>
            <Text numberOfLines={1} className="flex-1 text-right type-body text-muted">
              {gameLabel}
            </Text>
            <Icon name={choosing ? "chevron-down" : "chevron-right"} color="faint" size={16} />
          </Pressable>
        )}
        <View className="min-h-12 flex-row items-center justify-between gap-3 border-t border-line px-4 py-2">
          <Text className="type-body text-ink">High limit</Text>
          <Switch accessibilityLabel="High limit" value={highLimit} onValueChange={onHighLimit} />
        </View>
      </View>
      {game === "other" && onGameName ? (
        <TextField
          label="Game name"
          placeholder="e.g. Pai Gow Poker"
          maxLength={60}
          autoComplete="off"
          value={gameName}
          onChangeText={onGameName}
        />
      ) : null}
      {Platform.OS !== "ios" && choosing ? (
        <Choice
          label="Game"
          labelHidden
          options={games}
          value={game}
          onChange={(next) => {
            onGame(next);

            if (next !== "other") onGameName?.("");
            setChoosing(false);
          }}
        />
      ) : null}
    </>
  );
}

function DetailsFields({
  venue,
  onVenue,
  ...gameProps
}: Parameters<typeof GameFields>[0] & {
  venue?: CachedVenue | null;
  onVenue?: () => void;
}) {
  const inSheet = use(InSheet);

  return (
    <View className="gap-1.5">
      <Text className="px-1 type-footnote font-medium text-muted">Details (optional)</Text>
      <GameFields {...gameProps} />
      {onVenue ? (
        <View className={cn("overflow-hidden rounded-xl", inSheet ? "bg-raised" : "bg-surface")}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Casino: ${venue?.name ?? "Not set"}. Change`}
            onPress={onVenue}
            className="min-h-12 flex-row items-center gap-3 px-4 active:bg-fill"
          >
            <Text className="type-body text-ink">Casino</Text>
            <Text numberOfLines={1} className="flex-1 text-right type-body text-muted">
              {venue?.name ?? "Not set"}
            </Text>
            <Icon name="chevron-right" color="faint" size={16} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const details = (
  game: GameChoice,
  highLimit: boolean,
  venue: CachedVenue | null = null,
  gameName = "",
) => ({
  ...(game === "none" ? {} : { game }),
  ...(game === "other" && gameName.trim() ? { gameName: gameName.trim() } : {}),
  ...(venue ? { venueId: venue.id } : {}),
  highLimit,
});

const startedVisit = (receipt: RecordingReceipt) =>
  "visitId" in receipt.command ? receipt.command.visitId : null;

export function StartSheet({
  onClose,
  onStarted,
  onOpened,
  initialTripId = null,
}: {
  initialTripId?: TripId | null;
  onClose: () => void;
  onStarted: (visitId: VisitId) => void;
  /** Offers recording a table without playing at it, which opens with no buy-in of your own. */
  onOpened?: (tableId: TableId) => void;
}) {
  const save = useRecordingSubmit();
  const inSheet = use(InSheet);
  const { home } = useRecordingHome();
  const prefs = usePreferences();
  const [tripId, setTripId] = useState(initialTripId);
  const buyIn = useAmount("", 1);
  const [game, setGame] = useState<GameChoice>(() => prefs.defaultGame ?? "none");
  const [gameName, setGameName] = useState("");
  const [venue, setVenue] = useState<CachedVenue | null>(() => prefs.defaultVenue);
  const [pickingVenue, setPickingVenue] = useState(false);
  const [highLimit, setHighLimit] = useState(false);
  const [recordingOnly, setRecordingOnly] = useState(false);
  const alreadyPlaying = Boolean(home?.active.length);
  const watching = recordingOnly && !alreadyPlaying;

  if (pickingVenue)
    return (
      <CasinoPickerSheet
        selectedId={venue?.id ?? null}
        selected={venue}
        onSelect={setVenue}
        onClose={() => setPickingVenue(false)}
      />
    );

  return (
    <RecordingSheet
      title={watching ? "Record a table" : "Start session"}
      description={
        watching
          ? "Record everyone's buy-ins and cash-outs at a table you aren't playing at."
          : "Your first buy-in starts it, timed from now."
      }
      submitLabel={watching ? "Open table" : "Start session"}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const venues = venue ? [venue] : [];

        if (watching) {
          const receipt = await save.submit(
            { type: "open_table", ...details(game, highLimit, venue, gameName) },
            venues,
          );

          if (tripId && receipt && "tableId" in receipt.command)
            await save.submit({ type: "set_table_trip", tableId: receipt.command.tableId, tripId });

          if (receipt && "tableId" in receipt.command) onOpened?.(receipt.command.tableId);

          return;
        }

        const amount = buyIn.read();

        if (amount === null) return;

        const receipt = await save.submit(
          {
            type: "start",
            buyIn: amount,
            ...details(game, highLimit, venue, gameName),
          },
          venues,
        );

        if (tripId && receipt && "tableId" in receipt.command)
          await save.submit({ type: "set_table_trip", tableId: receipt.command.tableId, tripId });
        const visitId = receipt && startedVisit(receipt);

        if (visitId) onStarted(visitId);
      }}
    >
      {watching ? null : <KeypadAmount label="Buy-in" amount={buyIn} />}
      {onOpened && alreadyPlaying ? (
        <Text className="text-sm text-muted">
          Finish your live session before opening a table just to record for others.
        </Text>
      ) : onOpened ? (
        <View
          className={cn(
            "min-h-12 flex-row items-center justify-between gap-3 rounded-xl px-4 py-2",
            inSheet ? "bg-raised" : "bg-surface",
          )}
        >
          <Text className="flex-1 type-body text-ink">I'm not playing, just recording</Text>
          <Switch
            accessibilityLabel="I'm not playing, just recording"
            value={watching}
            onValueChange={setRecordingOnly}
          />
        </View>
      ) : null}
      <TripChoice value={tripId} onChange={setTripId} />
      <DetailsFields
        game={game}
        gameName={gameName}
        highLimit={highLimit}
        venue={venue}
        onGame={setGame}
        onGameName={setGameName}
        onHighLimit={setHighLimit}
        onVenue={() => setPickingVenue(true)}
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
  const inSheet = use(InSheet);
  const prefs = usePreferences();
  const buyIn = useAmount("", 1);
  const cashOut = useAmount("", 0);
  const [now] = useState(() => new Date());

  const [times, setTimes] = useState<Times & { readonly finishNextDay: boolean }>(() => ({
    date: localDateText(now),
    start: "",
    finish: "",
    finishNextDay: false,
  }));

  const [timeErrors, setTimeErrors] = useState<Partial<Record<keyof Times, string>>>({});
  const [game, setGame] = useState<GameChoice>(() => prefs.defaultGame ?? "none");
  const [gameName, setGameName] = useState("");
  const [venue, setVenue] = useState<CachedVenue | null>(() => prefs.defaultVenue);
  const [pickingVenue, setPickingVenue] = useState(false);
  const [highLimit, setHighLimit] = useState(false);
  const inParsed = parseRecordingAmount(buyIn.text, 1);
  const outParsed = parseRecordingAmount(cashOut.text, 0);

  const resultPreview =
    inParsed.error === null && outParsed.error === null ? outParsed.amount - inParsed.amount : null;

  const updateTimes = (next: typeof times) => {
    setTimes(next);

    if (Object.keys(timeErrors).length > 0) {
      const parsed = parsePastSessionTimes(next);
      setTimeErrors(parsed.error === null ? {} : parsed.errors);
    }
  };

  const timeField = (field: keyof Times, label: string) => (
    <DateTimeField
      label={label}
      kind={field === "date" ? "date" : "time"}
      value={times[field]}
      onChange={(value) => updateTimes({ ...times, [field]: value })}
      error={timeErrors[field] ?? null}
      maximumDate={field === "date" ? now : undefined}
    />
  );

  if (pickingVenue)
    return (
      <CasinoPickerSheet
        selectedId={venue?.id ?? null}
        selected={venue}
        onSelect={setVenue}
        onClose={() => setPickingVenue(false)}
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
        setTimeErrors(parsed.error === null ? {} : parsed.errors);

        if (totalIn === null || totalOut === null || parsed.error !== null) return;

        const receipt = await save.submit(
          {
            type: "record_completed",
            buyIn: totalIn,
            cashOut: totalOut,
            startedAt: parsed.startedAt,
            finishedAt: parsed.finishedAt,
            ...details(game, highLimit, venue, gameName),
          },
          venue ? [venue] : [],
        );

        const visitId = receipt && startedVisit(receipt);

        if (visitId) onAdded(visitId);
      }}
    >
      <View className="flex-row gap-3">
        <TypedAmount label="Total in" amount={buyIn} />
        <TypedAmount label="Total out" amount={cashOut} />
      </View>
      {Platform.OS === "android" && resultPreview !== null ? (
        <View
          className={cn(
            "flex-row items-center justify-between rounded-xl px-4 py-3",
            inSheet ? "bg-raised" : "bg-surface",
          )}
        >
          <Text className="type-footnote font-medium text-muted">Your result</Text>
          <Money
            amount={MinorUnits.make(resultPreview)}
            currency={RECORDING_CURRENCY}
            tone="result"
            className="type-title"
          />
        </View>
      ) : null}
      {timeField("date", "Date")}
      <View className="flex-row gap-3">
        <View className="flex-1">{timeField("start", "Started")}</View>
        <View className="flex-1">{timeField("finish", "Finished")}</View>
      </View>
      <View
        className={cn(
          "min-h-12 flex-row items-center justify-between gap-3 rounded-xl px-4 py-2",
          inSheet ? "bg-raised" : "bg-surface",
        )}
      >
        <Text className="type-body text-ink">Finished the next day</Text>
        <Switch
          accessibilityLabel="Finished the next day"
          value={times.finishNextDay}
          onValueChange={(finishNextDay) => updateTimes({ ...times, finishNextDay })}
        />
      </View>
      <DetailsFields
        game={game}
        gameName={gameName}
        highLimit={highLimit}
        venue={venue}
        onGame={setGame}
        onGameName={setGameName}
        onHighLimit={setHighLimit}
        onVenue={() => setPickingVenue(true)}
      />
    </RecordingSheet>
  );
}

type Saved = (entryId: PlayEntry["id"], input: RecordingInput) => void;

/**
 * Whose money paid for a buy-in, or who took a cash-out: the player's own by default, or someone
 * else at the table, who then owes or is owed it.
 */
function usePaidBy(visit: RecordingVisitView) {
  const state = useRecordingState();
  const view = useServerTable(visit.visit.tableId);
  const people = counterpartiesAt(state, visit.visit.tableId, visit.visit.playerId, view ?? null);
  const [value, setValue] = useState<"own" | PlayerId>("own");
  const own = visit.visit.playerId === state?.self.id ? "Me" : "Their own money";
  const names = tellApart(people.map((person) => person.displayName));

  return {
    people,
    value,
    set: setValue,
    options: [
      { value: "own" as const, label: own },
      ...people.map((person, index) => ({ value: person.id, label: names[index]! })),
    ],
    /** Spread into an add or finish input. */
    input: () => (value === "own" ? {} : { counterpartyId: value }),
  };
}

function PaidField({ label, paid }: { label: string; paid: ReturnType<typeof usePaidBy> }) {
  if (paid.people.length === 0) return null;

  return <Choice label={label} options={paid.options} value={paid.value} onChange={paid.set} />;
}

export function RebuySheet({
  visit,
  who,
  back = false,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  /** Whose rebuy, when it isn't yours: "Priya". */
  who?: string | undefined;
  back?: boolean;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const prefs = usePreferences();
  const amount = useAmount("", 1);
  const paid = usePaidBy(visit);
  const preview = buyInTotalPreview(visit.totals.buyIn, amount.text, "add");
  const added = parseRecordingAmount(amount.text, 1);

  const hint =
    preview === null ? undefined : (
      <>
        {who ? `${who}'s` : "Your"} buy-in becomes{" "}
        <Money
          amount={MinorUnits.make(preview)}
          currency={RECORDING_CURRENCY}
          className="type-footnote font-medium text-ink"
        />
        {Platform.OS === "android" && added.error === null ? (
          <>
            {"\n"}
            <Text className="type-footnote text-faint">
              <Money
                amount={visit.totals.buyIn}
                currency={RECORDING_CURRENCY}
                className="type-footnote text-faint"
              />
              {" + "}
              <Money
                amount={added.amount}
                currency={RECORDING_CURRENCY}
                className="type-footnote text-faint"
              />
            </Text>
          </>
        ) : null}
      </>
    );

  return (
    <RecordingSheet
      keypad={<RecordingKeypad amount={amount} />}
      back={back}
      title={who ? `${shortName(who)}'s rebuy` : "Rebuy"}
      submitLabel="Add rebuy"
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
          ...paid.input(),
        } as const;

        const receipt = await save.submit(input);

        if (receipt?.command.type === "add") onSaved(receipt.command.entryId, input);
      }}
    >
      <KeypadAmount
        keypad={false}
        label={Platform.OS === "android" ? "" : "Amount"}
        amount={amount}
        hint={hint}
      />
      {visit.presets.length > 0 ? (
        <View
          className="flex-row justify-center gap-2"
          accessibilityRole="toolbar"
          accessibilityLabel="Recent amounts"
        >
          {visit.presets.map((preset) => (
            <Button
              key={preset}
              label={money(preset, prefs.showCents)}
              accessibilityLabel={`Fill ${money(preset, prefs.showCents)}`}
              size="sm"
              onPress={() => amount.set(amountInputText(preset))}
            />
          ))}
        </View>
      ) : null}
      <PaidField label="Paid by" paid={paid} />
    </RecordingSheet>
  );
}

/**
 * A time field for when something happened, between `earliest` and `latest`. Left as it opened,
 * it keeps `initial` to the second, so finishing in the minute a session started still follows it.
 */
function useClock(initial: DateTime.Utc) {
  const [text, setText] = useState(() => localTimeText(initial));
  const [error, setError] = useState<string | null>(null);

  return {
    text,
    error,
    set: (next: string) => {
      setText(next);
      setError(null);
    },
    /** The moment, or null after showing why it can't be saved. */
    read: (
      latest: { readonly at: DateTime.Utc; readonly error: string },
      earliest: { readonly at: DateTime.Utc; readonly error: string } | null,
    ) => {
      const value = text === localTimeText(initial) ? initial : parseTimeNear(text, latest.at);
      const ms = value && DateTime.toEpochMillis(value);

      const problem =
        ms === null
          ? "Enter a time like 21:30."
          : ms > DateTime.toEpochMillis(latest.at)
            ? latest.error
            : earliest !== null && ms < DateTime.toEpochMillis(earliest.at)
              ? earliest.error
              : null;

      setError(problem);

      return problem === null ? value : null;
    },
  };
}

/** Cashing out finishes the visit: what they left with, and when. */
export function CashOutSheet({
  visit,
  who,
  note,
  back = false,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  /** Whose cash-out, when it isn't yours: "Priya". */
  who?: string | undefined;
  /** What it does to the table: "Priya's visit ends. You and Dev keep playing." */
  note?: string | undefined;
  back?: boolean;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const inSheet = use(InSheet);
  const prefs = usePreferences();
  const amount = useAmount("", 0);
  const [now] = useState(() => DateTime.makeUnsafe(Date.now()));
  const clock = useClock(now);
  const paid = usePaidBy(visit);
  const previous = visit.totals.cashOut;
  const parsedCashOut = parseRecordingAmount(amount.text, 0);
  const resultPreview = cashOutResultPreview(visit, amount.text);

  return (
    <RecordingSheet
      keypad={<RecordingKeypad amount={amount} />}
      keypadInFooter
      back={back}
      title={who ? `Cash out ${shortName(who)}` : "Cash out"}
      description={note}
      submitLabel={who ? `End ${shortName(who)}'s visit` : "End session"}
      secondaryAction={{
        label: `${previous > 0 ? "Nothing more" : "Busted"} · ${money(0, prefs.showCents)}`,
        onPress: () => amount.set(amountInputText(0)),
      }}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const value = amount.read();

        const finishedAt = clock.read(
          { at: DateTime.makeUnsafe(Date.now()), error: "The session can't finish in the future." },
          { at: visit.visit.startedAt, error: "The session can't finish before it started." },
        );

        if (value === null || finishedAt === null) return;

        const input = {
          type: "finish",
          visitId: visit.visit.id,
          amount: value,
          finishedAt,
          ...paid.input(),
        } as const;

        const receipt = await save.submit(input);

        if (receipt?.command.type === "finish") onSaved(receipt.command.entryId, input);
      }}
    >
      <View className={cn("overflow-hidden rounded-xl", inSheet ? "bg-raised" : "bg-surface")}>
        <View className="gap-1 px-4 py-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="type-body text-ink">Cash-out</Text>
            {parsedCashOut.error === null ? (
              <Money
                amount={parsedCashOut.amount}
                currency={RECORDING_CURRENCY}
                className="text-[28px] leading-[34px] font-bold tabular-nums"
              />
            ) : (
              <Text
                className={cn(
                  "text-[28px] leading-[34px] font-bold tabular-nums",
                  amount.text ? "text-ink" : "text-faint",
                )}
              >
                {amount.text || money(0, prefs.showCents)}
              </Text>
            )}
          </View>
          {amount.error ? (
            <Text className="type-footnote text-loss">{amount.error}</Text>
          ) : previous > 0 ? (
            <Text className="type-footnote text-muted">
              Earlier cash-outs total{" "}
              <Money
                amount={previous}
                currency={RECORDING_CURRENCY}
                className="type-footnote text-muted"
              />
              .
            </Text>
          ) : null}
        </View>
        <View className="gap-1 border-t border-line px-4 py-2.5">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="type-body text-ink">Finished</Text>
            <View className="flex-row items-center gap-2">
              {Platform.OS === "android" ? (
                <View className="flex-row items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5">
                  <Icon name="calendar" color="muted" size={14} />
                  <Text className="type-footnote font-medium text-muted">{formatDay(now)}</Text>
                </View>
              ) : (
                <View className="rounded-[10px] bg-fill px-3 py-1.5">
                  <Text className="type-callout font-medium text-ink">
                    {DateTime.toDateUtc(now).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              )}
              <DateTimeField
                compact
                label="Finished at"
                kind="time"
                value={clock.text}
                onChange={clock.set}
              />
            </View>
          </View>
          {clock.error ? <Text className="type-footnote text-loss">{clock.error}</Text> : null}
        </View>
        <View className="flex-row items-center justify-between gap-3 border-t border-line px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="type-footnote text-muted">
              {who ? `${who}'s result` : "Your result"}
            </Text>
            <Text className="type-footnote text-muted">
              {formatDisplayMoney(visit.totals.buyIn, RECORDING_CURRENCY, prefs)} bought in
            </Text>
          </View>
          {resultPreview === null ? (
            <Text className="text-muted">—</Text>
          ) : (
            <Money
              amount={MinorUnits.make(resultPreview)}
              currency={RECORDING_CURRENCY}
              tone="result"
              className="type-title"
            />
          )}
        </View>
      </View>
      <PaidField label="Paid to" paid={paid} />
    </RecordingSheet>
  );
}

const totalModes = [
  { value: "add", label: "Add" },
  { value: "subtract", label: "Subtract" },
  { value: "set", label: "Set total" },
] as const;

/**
 * The buy-in as one total: add to it, take from it, or set it. Behind it, a buy-in or corrections
 * keep every amount in the history.
 */
export function BuyInTotalSheet({
  visit,
  own,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  own: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useBuyInTotal(visit.visit.id);
  const prefs = usePreferences();
  const [mode, setMode] = useState<(typeof totalModes)[number]["value"]>("add");
  const amount = useAmount("", 1);
  const current = visit.totals.buyIn;
  const currentShown = formatDisplayMoney(current, RECORDING_CURRENCY, prefs);
  const total = buyInTotalPreview(current, amount.text, mode);

  const preview =
    total === null ? (
      amount.text ? (
        "The new total must be greater than zero and within the supported amount."
      ) : (
        "Enter an amount to see the new total."
      )
    ) : (
      <>
        {own ? "Your buy-in becomes" : "New buy-in total"}{" "}
        <Money
          amount={MinorUnits.make(total)}
          currency={RECORDING_CURRENCY}
          className="type-footnote text-muted"
        />
      </>
    );

  return (
    <RecordingSheet
      keypad={<RecordingKeypad amount={amount} />}
      back
      title="Edit buy-in"
      description={Platform.OS === "android" ? undefined : `Now ${currentShown} in.`}
      submitLabel={buyInTotalLabel(mode, amount.text)}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const value = amount.read();

        if (value === null || total === null) return;

        if (await save.set(total)) onSaved();
      }}
    >
      {Platform.OS === "android" ? (
        <>
          <KeypadAmount keypad={false} label="" amount={amount} />
          <Choice
            label="Change"
            labelHidden
            options={totalModes}
            value={mode}
            onChange={(next) => {
              setMode(next);
              save.clearError();
            }}
          />
          <View className="items-center gap-1 px-2">
            <Text className="text-center type-footnote text-muted">{preview}</Text>
            <Text className="text-center type-footnote text-faint">
              Was {currentShown}. Corrections void earlier buy-ins, which stay in history.
            </Text>
          </View>
        </>
      ) : (
        <>
          <Choice
            label="Change"
            options={totalModes}
            value={mode}
            onChange={(next) => {
              setMode(next);
              save.clearError();
            }}
          />
          <KeypadAmount
            keypad={false}
            label={mode === "set" ? "New total" : "Amount"}
            amount={amount}
            hint={preview}
          />
          <Text className="type-footnote text-muted">
            Was {currentShown}. Corrections void earlier buy-ins, which stay in history.
          </Text>
        </>
      )}
    </RecordingSheet>
  );
}

/** When the visit started. It can move earlier, or later up to the first buy-in. */
export function StartTimeSheet({
  visit,
  back = false,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  back?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();
  const [now] = useState(() => DateTime.makeUnsafe(Date.now()));
  const initial = visit.visit.startedAt;
  const [date, setDate] = useState(() => localDateText(new Date(DateTime.toEpochMillis(initial))));
  const [time, setTime] = useState(() => localTimeText(initial));
  const [problem, setProblem] = useState<{ field: "date" | "time"; error: string } | null>(null);

  const first = visit.entries.reduce(
    (earliest, entry) =>
      DateTime.toEpochMillis(entry.occurredAt) < DateTime.toEpochMillis(earliest)
        ? entry.occurredAt
        : earliest,
    visit.visit.finishedAt ?? now,
  );

  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setProblem(null);
  };

  return (
    <RecordingSheet
      title="Start time"
      description="When you sat down. It can't be after your first buy-in."
      submitLabel="Save start time"
      back={back}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const parsed = parseStartedAt({ date, time }, initial, first);

        if (parsed.error !== null) return setProblem(parsed);

        const receipt = await save.submit({
          type: "edit_visit",
          visitId: visit.visit.id,
          startedAt: parsed.startedAt,
        });

        if (receipt) onSaved();
      }}
    >
      <DateTimeField
        label="Date"
        kind="date"
        value={date}
        onChange={change(setDate)}
        error={problem?.field === "date" ? problem.error : null}
        maximumDate={new Date(DateTime.toEpochMillis(now))}
      />
      <DateTimeField
        label="Started at"
        kind="time"
        value={time}
        onChange={change(setTime)}
        error={problem?.field === "time" ? problem.error : null}
      />
    </RecordingSheet>
  );
}

/** The table's game and whether it's high limit. */
export function GameSheet({
  visit,
  back = false,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  back?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();
  const [game, setGame] = useState<GameChoice>(visit.table.game ?? "none");
  const [gameName, setGameName] = useState(visit.table.gameName ?? "");
  const [highLimit, setHighLimit] = useState(visit.table.highLimit);

  return (
    <RecordingSheet
      title="Game"
      submitLabel="Save game"
      back={back}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const receipt = await save.submit({
          type: "edit_visit",
          visitId: visit.visit.id,
          table: {
            game: game === "none" ? null : game,
            gameName: game === "other" ? gameName.trim() || null : null,
            venueId: visit.table.venueId,
            highLimit,
          },
        });

        if (receipt) onSaved();
      }}
    >
      <View className="gap-1.5">
        <GameFields
          game={game}
          gameName={gameName}
          highLimit={highLimit}
          onGame={setGame}
          onGameName={setGameName}
          onHighLimit={setHighLimit}
        />
      </View>
    </RecordingSheet>
  );
}

/** The table's casino, picked from a search or from those saved on this device, or none. */
export function VenueSheet({
  visit,
  back = false,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  back?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();
  // A venue another device set that this one hasn't fetched yet stays until something is picked.
  const [picked, setPicked] = useState<{ venue: CachedVenue | null } | null>(null);
  const selected = picked ? picked.venue : visit.venue;

  return (
    <RecordingSheet
      title="Casino"
      submitLabel="Save casino"
      back={back}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        if (!picked) return onSaved();

        const receipt = await save.submit(
          {
            type: "edit_visit",
            visitId: visit.visit.id,
            table: {
              game: visit.table.game,
              gameName: visit.table.gameName ?? null,
              venueId: picked.venue?.id ?? null,
              highLimit: visit.table.highLimit,
            },
          },
          picked.venue ? [picked.venue] : [],
        );

        if (receipt) onSaved();
      }}
    >
      <SessionVenuePicker
        selectedId={picked ? (picked.venue?.id ?? null) : visit.table.venueId}
        selected={selected}
        onSelect={(venue) => setPicked({ venue })}
      />
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
  const prefs = usePreferences();
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
      description={`The ${formatDisplayMoney(entry.amount, RECORDING_CURRENCY, prefs)} ${kindName(entry)} stays in the history, crossed out, and stops counting toward this session.`}
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
  back = false,
  onClose,
  onReopened,
}: {
  visit: RecordingVisitView;
  back?: boolean;
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
      back={back}
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
  onAdded: (visitId: VisitId, name: string) => void;
}) {
  const save = useRecordingSubmit();
  const prefs = usePreferences();
  const amount = useAmount("", 1);
  const [choice, setChoice] = useState<string>(NEW_PLAYER);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const savedNames = tellApart(saved.map((player) => player.displayName));

  const chosen =
    Platform.OS === "android" || choice === NEW_PLAYER
      ? name.trim()
      : (saved.find((player) => player.id === choice)?.displayName ?? "");

  const typed = parseRecordingAmount(amount.text, 1);

  const submitSaved = async (playerId: PlayerId, label: string) => {
    const value = amount.read();

    if (value === null) return;

    const receipt = await save.submit({
      type: "join_table",
      tableId,
      playerId,
      buyIn: value,
    });

    if (receipt?.command.type === "join_table") onAdded(receipt.command.visitId, label);
  };

  return (
    <RecordingSheet
      title="Add player"
      description={
        Platform.OS === "android"
          ? undefined
          : "Record their buy-ins and cash-outs from this device."
      }
      submitLabel={
        chosen && typed.error === null
          ? `Add ${shortName(chosen)} · ${money(typed.amount, prefs.showCents)}`
          : "Add player"
      }
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const isNew = Platform.OS === "android" || choice === NEW_PLAYER;
        const trimmed = name.trim();
        setNameError(isNew && trimmed === "" ? "Enter the player's name." : null);
        const value = amount.read();

        if (value === null || (isNew && trimmed === "")) return;

        const receipt = await save.submit(
          isNew
            ? { type: "join_table", tableId, displayName: trimmed, buyIn: value }
            : { type: "join_table", tableId, playerId: choice as PlayerId, buyIn: value },
        );

        if (receipt?.command.type === "join_table") onAdded(receipt.command.visitId, chosen);
      }}
    >
      {Platform.OS === "android" ? (
        <>
          <View className="gap-1.5">
            <View
              className={cn(
                "rounded-t-lg rounded-b-none border-b bg-fill px-3.5 py-2",
                nameError ? "border-loss" : "border-ink/40",
              )}
            >
              <Text className="type-footnote font-medium text-muted">Name</Text>
              <TextInput
                accessibilityLabel="Name"
                value={name}
                maxLength={60}
                autoComplete="off"
                placeholder="Player's name"
                placeholderTextColorClassName="accent-muted"
                onChangeText={(next) => {
                  setName(next);

                  if (nameError && next.trim()) setNameError(null);
                }}
                className="py-1 font-sans type-body text-ink"
              />
            </View>
            {nameError ? (
              <View accessibilityLiveRegion="polite" className="flex-row gap-1.5 px-1">
                <Icon name="alert" color="loss" size={14} />
                <Text className="flex-1 type-footnote text-loss">{nameError}</Text>
              </View>
            ) : null}
          </View>
          <View className="gap-1.5">
            <View
              className={cn(
                "rounded-t-lg rounded-b-none border-b bg-fill px-3.5 py-2",
                amount.error ? "border-loss" : "border-ink/40",
              )}
            >
              <Text className="type-footnote font-medium text-muted">First buy-in</Text>
              <View className="flex-row items-center gap-1.5">
                <Text className="type-body font-medium text-muted">$</Text>
                <TextInput
                  accessibilityLabel="First buy-in"
                  value={amount.text}
                  onChangeText={amount.set}
                  keyboardType="decimal-pad"
                  autoComplete="off"
                  autoCorrect={false}
                  placeholder="0"
                  placeholderTextColorClassName="accent-muted"
                  className="flex-1 py-1 font-sans type-body text-ink tabular-nums"
                />
              </View>
            </View>
            {amount.error ? (
              <View accessibilityLiveRegion="polite" className="flex-row gap-1.5 px-1">
                <Icon name="alert" color="loss" size={14} />
                <Text className="flex-1 type-footnote text-loss">{amount.error}</Text>
              </View>
            ) : null}
          </View>
          {saved.length > 0 ? (
            <View className="gap-2 pt-1">
              <Text className="px-1 type-label tracking-wider text-muted uppercase">
                Saved on this phone
              </Text>
              <List>
                {saved.map((player, index) => {
                  const label = savedNames[index]!;

                  return (
                    <Row key={player.id}>
                      <Chip chip={(index % 8) + 1} name={label} size={36} ring />
                      <Text numberOfLines={1} className="min-w-0 flex-1 type-body text-ink">
                        {label}
                      </Text>
                      <Button
                        label="Add"
                        size="sm"
                        disabled={save.pending}
                        onPress={() => void submitSaved(player.id, label)}
                      />
                    </Row>
                  );
                })}
              </List>
            </View>
          ) : null}
        </>
      ) : (
        <>
          {saved.length > 0 ? (
            <Choice
              label="Player"
              value={choice}
              onChange={setChoice}
              options={[
                { value: NEW_PLAYER, label: "Someone new" },
                ...saved.map((player, index) => ({ value: player.id, label: savedNames[index]! })),
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
          <TypedAmount label="Buy-in" amount={amount} />
        </>
      )}
    </RecordingSheet>
  );
}

/**
 * Sits a player down at a table with a buy-in: either joining it for the first time or starting a
 * new visit after finishing an earlier one. It records on this device, so it works offline.
 */
export function SitDownSheet({
  tableId,
  player,
  returning = true,
  back = false,
  onClose,
  onSeated,
}: {
  tableId: TableId;
  player: PlayerIdentity;
  returning?: boolean;
  back?: boolean;
  onClose: () => void;
  onSeated: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 1);

  return (
    <RecordingSheet
      title={returning ? "Back at the table" : "Buy in"}
      description={
        returning
          ? "This starts a new session at the same table. Your last one stays as it finished."
          : player.displayName === "You"
            ? "Your buy-in."
            : `Your buy-in as ${player.displayName}.`
      }
      submitLabel={returning ? "Sit back down" : "Buy in"}
      back={back}
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

        if (receipt?.command.type === "join_table") onSeated(receipt.command.visitId);
      }}
    >
      <KeypadAmount label="Buy-in" amount={amount} />
    </RecordingSheet>
  );
}

/**
 * Joins a shared table as a new player. It asks only for a name, and says what joining does:
 * it never picks someone already at the table.
 */
export function JoinSheet({
  join,
  onClose,
  onJoined,
}: {
  join: { pending: boolean; error: string | null; join: (name: string) => Promise<unknown> };
  onClose: () => void;
  onJoined: () => void;
}) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    setNameError(trimmed === "" ? "Enter your name." : null);

    if (trimmed === "") return;

    if (await join.join(trimmed)) onJoined();
  };

  return (
    <Sheet
      open
      busy={join.pending}
      onClose={onClose}
      title="Join this table"
      description="This adds you to the table as a new player. You record your own buy-ins and cash-outs; whoever started the table can record and correct everyone's."
      footer={
        <View className="gap-2">
          <Button
            label="Join as a new player"
            variant="primary"
            size="lg"
            pending={join.pending}
            onPress={() => void submit()}
          />
          <Button label="Cancel" size="lg" disabled={join.pending} onPress={onClose} />
        </View>
      }
    >
      <TextField
        label="Your name"
        testID="join-name"
        hint="Others at the table see it."
        value={name}
        error={nameError}
        maxLength={60}
        autoComplete="given-name"
        autoFocus
        onChangeText={setName}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      {join.error ? <FormError>{join.error}</FormError> : null}
    </Sheet>
  );
}
