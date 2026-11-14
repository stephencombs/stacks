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
import { useBuyInTotal, useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import {
  amountInputText,
  localDateText,
  localTimeText,
  parsePastSessionTimes,
  parseRecordingAmount,
  parseTimeNear,
  RECORDING_CURRENCY,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import { useState, type FormEvent, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Checkbox } from "~/components/ui/Checkbox";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, RadioCards, Select } from "~/components/ui/Field";
import { Note } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

/** An amount field's text and its error, which shows on submit and clears as it's fixed. */
function useAmount(initial: string, minimum: 0 | 1) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return {
    text,
    error,
    set: (next: string) => {
      setText(next);
      if (error) setError(parseRecordingAmount(next, minimum).error);
    },
    /** The amount, or null after showing why it can't be saved. */
    read: () => {
      const parsed = parseRecordingAmount(text, minimum);
      setError(parsed.error);
      return parsed.error === null ? parsed.amount : null;
    },
  };
}

function AmountField({
  label,
  amount,
  hint,
  first = false,
}: {
  label: string;
  amount: ReturnType<typeof useAmount>;
  hint?: ReactNode;
  /** The form's first field: a mouse or keyboard starts typing here, a touch screen waits for a tap. */
  first?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={amount.error}>
      {(props) => (
        <Input
          {...props}
          value={amount.text}
          onChange={(event) => amount.set(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          autoFocus={first && matchMedia("(pointer: fine)").matches}
          className="text-2xl tabular-nums"
        />
      )}
    </Field>
  );
}

function ReasonField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} error={error}>
      {(props) => (
        <Input
          {...props}
          value={value}
          maxLength={280}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * A recording form in a dialog. It closes only once the device has saved, and while saving it
 * can't be dismissed. A failed save keeps everything typed, and submitting again retries it.
 */
function RecordingDialog({
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
  description?: ReactNode;
  submitLabel: string;
  submitVariant?: "primary" | "danger";
  cancelLabel?: string;
  save: { readonly pending: boolean; readonly error: string | null };
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.pending) onClose();
      }}
      title={title}
      description={description}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {children}
        {save.error ? (
          <FormError>{save.error} What you entered is still here. Try again.</FormError>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancelLabel ? (
            <Button size="lg" disabled={save.pending} onClick={onClose}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button type="submit" variant={submitVariant} size="lg" pending={save.pending}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const games = Game.literals.map((game) => ({ value: game, label: gameNames[game] }));

function GameFields({
  game,
  highLimit,
  onGame,
  onHighLimit,
}: {
  game: Game | "";
  highLimit: boolean;
  onGame: (game: Game | "") => void;
  onHighLimit: (highLimit: boolean) => void;
}) {
  return (
    <>
      <Field label="Game">
        {(props) => (
          <Select
            {...props}
            value={game}
            onChange={(event) => onGame(event.target.value as Game | "")}
          >
            <option value="">Not set</option>
            {games.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <Checkbox checked={highLimit} onCheckedChange={onHighLimit} />
        High limit
      </label>
    </>
  );
}

function DetailsFields(props: Parameters<typeof GameFields>[0]) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium text-muted">Details (optional)</legend>
      <GameFields {...props} />
    </fieldset>
  );
}

/** Who else's money a buy-in or cash-out was, among the others at the table. */
export type Counterparties = {
  /** Whose own money it is when no one else is chosen: "Me", or the player's name. */
  readonly owner: string;
  readonly people: ReadonlyArray<PlayerIdentity>;
};

const noCounterparties: Counterparties = { owner: "Me", people: [] };

function CounterpartyField({
  label,
  counterparties,
  value,
  onChange,
}: {
  label: string;
  counterparties: Counterparties;
  value: string;
  onChange: (value: string) => void;
}) {
  if (counterparties.people.length === 0) return null;
  return (
    <Field label={label}>
      {(props) => (
        <Select {...props} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{counterparties.owner}</option>
          {counterparties.people.map((player) => (
            <option key={player.id} value={player.id}>
              {player.displayName}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

const counterparty = (value: string) => (value === "" ? {} : { counterpartyId: value as PlayerId });

const startedVisit = (receipt: RecordingReceipt) =>
  "visitId" in receipt.command ? receipt.command.visitId : null;

export function StartDialog({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const buyIn = useAmount("", 1);
  const [game, setGame] = useState<Game | "">("");
  const [highLimit, setHighLimit] = useState(false);
  return (
    <RecordingDialog
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
          ...(game ? { game } : {}),
          highLimit,
        });
        const visitId = receipt && startedVisit(receipt);
        if (visitId) onStarted(visitId);
      }}
    >
      <AmountField label="Buy-in" amount={buyIn} first />
      <DetailsFields
        game={game}
        highLimit={highLimit}
        onGame={setGame}
        onHighLimit={setHighLimit}
      />
    </RecordingDialog>
  );
}

export function PastSessionDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const buyIn = useAmount("", 1);
  const cashOut = useAmount("", 0);
  const [times, setTimes] = useState({ date: localDateText(), start: "", finish: "" });
  const [timeError, setTimeError] = useState<{ field: string; error: string } | null>(null);
  const [game, setGame] = useState<Game | "">("");
  const [highLimit, setHighLimit] = useState(false);
  const setTime = (field: keyof typeof times) => (value: string) => {
    const next = { ...times, [field]: value };
    setTimes(next);
    if (timeError) {
      const parsed = parsePastSessionTimes(next);
      setTimeError(parsed.error === null ? null : parsed);
    }
  };
  const timeField = (field: keyof typeof times, label: string, type: "date" | "time") => (
    <Field label={label} error={timeError?.field === field ? timeError.error : null}>
      {(props) => (
        <Input
          {...props}
          type={type}
          value={times[field]}
          onChange={(event) => setTime(field)(event.target.value)}
        />
      )}
    </Field>
  );
  return (
    <RecordingDialog
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
          ...(game ? { game } : {}),
          highLimit,
        });
        const visitId = receipt && startedVisit(receipt);
        if (visitId) onAdded(visitId);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <AmountField label="Total in" amount={buyIn} first />
        <AmountField label="Total out" amount={cashOut} />
      </div>
      {timeField("date", "Date", "date")}
      <div className="grid grid-cols-2 gap-3">
        {timeField("start", "Started", "time")}
        {timeField("finish", "Finished", "time")}
      </div>
      <DetailsFields
        game={game}
        highLimit={highLimit}
        onGame={setGame}
        onHighLimit={setHighLimit}
      />
    </RecordingDialog>
  );
}

type Saved = (entryId: PlayEntry["id"], input: RecordingInput) => void;

export function RebuyDialog({
  visit,
  counterparties = noCounterparties,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  counterparties?: Counterparties;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 1);
  const [paidBy, setPaidBy] = useState("");
  return (
    <RecordingDialog
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
          ...counterparty(paidBy),
        } as const;
        const receipt = await save.submit(input);
        if (receipt?.command.type === "add") onSaved(receipt.command.entryId, input);
      }}
    >
      <AmountField label="Amount" amount={amount} first />
      {visit.presets.length > 0 ? (
        <div className="flex gap-2" role="group" aria-label="Recent amounts">
          {visit.presets.map((preset) => (
            <Button
              key={preset}
              className="flex-1 tabular-nums"
              onClick={() => amount.set(amountInputText(preset))}
            >
              {money(preset)}
            </Button>
          ))}
        </div>
      ) : null}
      <CounterpartyField
        label="Paid by"
        counterparties={counterparties}
        value={paidBy}
        onChange={setPaidBy}
      />
    </RecordingDialog>
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

function ClockField({ label, clock }: { label: string; clock: ReturnType<typeof useClock> }) {
  return (
    <Field label={label} error={clock.error}>
      {(props) => (
        <Input
          {...props}
          type="time"
          value={clock.text}
          onChange={(event) => clock.set(event.target.value)}
          className="max-w-40 tabular-nums"
        />
      )}
    </Field>
  );
}

/** Cashing out finishes the visit: what they left with, and when. */
export function CashOutDialog({
  visit,
  counterparties = noCounterparties,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  counterparties?: Counterparties;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 0);
  const [now] = useState(() => DateTime.makeUnsafe(Date.now()));
  const clock = useClock(now);
  const [paidTo, setPaidTo] = useState("");
  const previous = visit.totals.cashOut;
  return (
    <RecordingDialog
      title="Cash out"
      description="This finishes the session and works out its result."
      submitLabel="Cash out"
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
          ...counterparty(paidTo),
        } as const;
        const receipt = await save.submit(input);
        if (receipt?.command.type === "finish") onSaved(receipt.command.entryId, input);
      }}
    >
      <AmountField
        label="Amount"
        amount={amount}
        first
        hint={
          previous > 0 ? (
            <>
              Earlier cash-outs total <Money amount={previous} currency={RECORDING_CURRENCY} />.
            </>
          ) : undefined
        }
      />
      <Button className="self-start" onClick={() => amount.set(amountInputText(0))}>
        {previous > 0 ? "Nothing more" : "Nothing to cash out"} · {money(0)}
      </Button>
      <ClockField label="Finished at" clock={clock} />
      <CounterpartyField
        label="Paid to"
        counterparties={counterparties}
        value={paidTo}
        onChange={setPaidTo}
      />
    </RecordingDialog>
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
export function BuyInTotalDialog({
  visit,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useBuyInTotal(visit.visit.id);
  const [mode, setMode] = useState<(typeof totalModes)[number]["value"]>("add");
  const amount = useAmount("", 1);
  const current = visit.totals.buyIn;
  const typed = parseRecordingAmount(amount.text, 1);
  const total =
    typed.error !== null
      ? null
      : mode === "add"
        ? current + typed.amount
        : mode === "subtract"
          ? current - typed.amount
          : typed.amount;
  return (
    <RecordingDialog
      title="Buy-in"
      description={
        <>
          Now <Money amount={current} currency={RECORDING_CURRENCY} /> in.
        </>
      }
      submitLabel="Save buy-in"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const value = amount.read();
        if (value === null || total === null) return;
        if (await save.set(total)) onSaved();
      }}
    >
      <Segmented
        label="Change"
        options={totalModes}
        value={mode}
        onChange={(next) => {
          setMode(next);
          save.clearError();
        }}
      />
      <AmountField label={mode === "set" ? "New total" : "Amount"} amount={amount} first />
      {total !== null ? (
        <p role="status" className="text-sm text-muted">
          {total > 0 ? (
            <>
              New total <Money amount={total} currency={RECORDING_CURRENCY} />
            </>
          ) : (
            "The buy-in total must be more than zero."
          )}
        </p>
      ) : null}
    </RecordingDialog>
  );
}

/** When the visit started. It can move earlier, or later up to the first buy-in. */
export function StartTimeDialog({
  visit,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();
  const clock = useClock(visit.visit.startedAt);
  const [now] = useState(() => DateTime.makeUnsafe(Date.now()));
  const first = visit.entries.reduce(
    (earliest, entry) =>
      DateTime.toEpochMillis(entry.occurredAt) < DateTime.toEpochMillis(earliest)
        ? entry.occurredAt
        : earliest,
    visit.visit.finishedAt ?? now,
  );
  return (
    <RecordingDialog
      title="Start time"
      description="When you sat down. It can't be after your first buy-in."
      submitLabel="Save start time"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const startedAt = clock.read(
          { at: first, error: "The start can't be after your first buy-in." },
          null,
        );
        if (startedAt === null) return;
        const receipt = await save.submit({
          type: "edit_visit",
          visitId: visit.visit.id,
          startedAt,
        });
        if (receipt) onSaved();
      }}
    >
      <ClockField label="Started at" clock={clock} />
    </RecordingDialog>
  );
}

/** The table's game and whether it's high limit. */
export function GameDialog({
  visit,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();
  const [game, setGame] = useState<Game | "">(visit.table.game ?? "");
  const [highLimit, setHighLimit] = useState(visit.table.highLimit);
  return (
    <RecordingDialog
      title="Game"
      submitLabel="Save game"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const receipt = await save.submit({
          type: "edit_visit",
          visitId: visit.visit.id,
          table: { game: game === "" ? null : game, venueId: visit.table.venueId, highLimit },
        });
        if (receipt) onSaved();
      }}
    >
      <GameFields game={game} highLimit={highLimit} onGame={setGame} onHighLimit={setHighLimit} />
    </RecordingDialog>
  );
}

const kindName = (entry: PlayEntry) => (entry.kind === "buy_in" ? "buy-in" : "cash-out");

export function CorrectDialog({
  visit,
  entry,
  counterparties = noCounterparties,
  onClose,
  onSaved,
}: {
  visit: RecordingVisitView;
  entry: PlayEntry;
  counterparties?: Counterparties;
  onClose: () => void;
  onSaved: Saved;
}) {
  const save = useRecordingSubmit();
  const [other, setOther] = useState<string>(entry.counterpartyId ?? "");
  const amount = useAmount(amountInputText(entry.amount), entry.kind === "buy_in" ? 1 : 0);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  return (
    <RecordingDialog
      title={`Correct ${kindName(entry)}`}
      description="The original stays in the history, voided, and this one replaces it."
      submitLabel="Save correction"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const value = amount.read();
        const why = reason.trim();
        setReasonError(why ? null : "Say what was wrong with it.");
        if (value === null || !why) return;
        const input = {
          type: "correct",
          visitId: visit.visit.id,
          entryId: entry.id,
          reason: why,
          replacement: { amount: value, ...counterparty(other) },
        } as const;
        const receipt = await save.submit(input);
        if (receipt?.command.type === "correct" && receipt.command.replacement)
          onSaved(receipt.command.replacement.id, input);
      }}
    >
      <AmountField label="Correct amount" amount={amount} first />
      <CounterpartyField
        label={entry.kind === "buy_in" ? "Paid by" : "Paid to"}
        counterparties={counterparties}
        value={other}
        onChange={setOther}
      />
      <ReasonField
        label="What was wrong"
        value={reason}
        error={reasonError}
        onChange={(value) => {
          setReason(value);
          if (reasonError && value.trim()) setReasonError(null);
        }}
      />
      {visit.visit.finishedAt !== null ? (
        <Note>The session stays finished; its final result is worked out again.</Note>
      ) : null}
    </RecordingDialog>
  );
}

export function VoidDialog({
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
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  return (
    <RecordingDialog
      title="Void this entry?"
      description={`The ${money(entry.amount)} ${kindName(entry)} stays in the history, crossed out, and stops counting toward this session.`}
      submitLabel="Void entry"
      submitVariant="danger"
      cancelLabel="Keep entry"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const why = reason.trim();
        setReasonError(why ? null : "Say why it's being voided.");
        if (!why) return;
        const receipt = await save.submit({
          type: "correct",
          visitId: visit.visit.id,
          entryId: entry.id,
          reason: why,
          replacement: null,
        });
        if (receipt) onVoided();
      }}
    >
      <ReasonField
        label="Why"
        value={reason}
        error={reasonError}
        onChange={(value) => {
          setReason(value);
          if (reasonError && value.trim()) setReasonError(null);
        }}
      />
    </RecordingDialog>
  );
}

export function ReopenDialog({
  visit,
  onClose,
  onReopened,
}: {
  visit: RecordingVisitView;
  onClose: () => void;
  onReopened: () => void;
}) {
  const save = useRecordingSubmit();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  return (
    <RecordingDialog
      title="Fix an accidental finish?"
      description="Only if you never stopped playing. The session goes back to live, and the finish stays in its history. If you left and came back, start a new session instead."
      submitLabel="Reopen session"
      cancelLabel="Keep finished"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const why = reason.trim();
        setReasonError(why ? null : "Say what happened.");
        if (!why) return;
        const receipt = await save.submit({ type: "reopen", visitId: visit.visit.id, reason: why });
        if (receipt) onReopened();
      }}
    >
      <ReasonField
        label="What happened"
        value={reason}
        error={reasonError}
        onChange={(value) => {
          setReason(value);
          if (reasonError && value.trim()) setReasonError(null);
        }}
      />
      {visit.finalCashOut ? (
        <Note>
          Your <Money amount={visit.finalCashOut.amount} currency={RECORDING_CURRENCY} /> final
          cash-out will be voided, since you never cashed out.
        </Note>
      ) : null}
    </RecordingDialog>
  );
}

const NEW_PLAYER = "new";

/**
 * Starts a visit at this table for another player: one saved on this device, or someone new by
 * name. A name never finds or merges anyone; a new name is always a new player.
 */
export function AddPlayerDialog({
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
    <RecordingDialog
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
        <RadioCards
          label="Player"
          className="grid-cols-2"
          value={choice}
          onChange={setChoice}
          options={[
            { value: NEW_PLAYER, label: "Someone new" },
            ...saved.map((player) => ({ value: player.id, label: player.displayName })),
          ]}
        />
      ) : null}
      {choice === NEW_PLAYER ? (
        <Field label="Name" error={nameError}>
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={60}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
      ) : null}
      <AmountField label="Buy-in" amount={amount} />
    </RecordingDialog>
  );
}

/**
 * Sits a player down at a table with a new buy-in: their first visit after joining, or a new one
 * when they come back. It records on this device, so it works offline.
 */
export function SitDownDialog({
  tableId,
  player,
  returning,
  onClose,
  onSeated,
}: {
  tableId: TableId;
  player: PlayerIdentity;
  returning: boolean;
  onClose: () => void;
  onSeated: (visitId: VisitId) => void;
}) {
  const save = useRecordingSubmit();
  const amount = useAmount("", 1);
  return (
    <RecordingDialog
      title={returning ? "Back at the table" : "Buy in"}
      description={
        returning
          ? "This starts a new session at the same table. Your last one stays as it finished."
          : `Your buy-in as ${player.displayName}.`
      }
      submitLabel={returning ? "Sit back down" : "Buy in"}
      cancelLabel="Cancel"
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
      <AmountField label="Buy-in" amount={amount} first />
    </RecordingDialog>
  );
}

/**
 * Joins a shared table as a new player. It asks only for a name, and says what joining does:
 * it never picks someone already at the table.
 */
export function JoinDialog({
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    setNameError(trimmed === "" ? "Enter your name." : null);
    if (trimmed === "") return;
    if (await join.join(trimmed)) onJoined();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !join.pending) onClose();
      }}
      title="Join this table"
      description="This adds you to the table as a new player. You record your own buy-ins and cash-outs; whoever started the table can record and correct everyone's."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Your name" hint="Others at the table see it." error={nameError}>
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={60}
              autoComplete="given-name"
              autoFocus={matchMedia("(pointer: fine)").matches}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        {join.error ? <FormError>{join.error}</FormError> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button size="lg" disabled={join.pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg" pending={join.pending}>
            Join as a new player
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
