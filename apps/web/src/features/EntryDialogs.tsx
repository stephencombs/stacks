import {
  EntryId,
  MinorUnits,
  PlayerId,
  type Entry,
  type GroupDetail,
  type SessionId,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { decimalSeparator, formatMoney, minorUnitDigits, parseMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useId, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, RadioCards, Select } from "~/components/ui/Field";
import { useAction, useOutbox, useStacks } from "~/lib/stacks";

export type EntryDraft = {
  readonly kind: "buy_in" | "cash_out" | "adjustment";
  readonly playerId: PlayerId;
  /** Set when correcting: the new entry replaces this one. */
  readonly replaces?: Entry;
};

const titles = { buy_in: "Buy in", cash_out: "Cash out", adjustment: "Adjust" } as const;
const kinds = ["buy_in", "cash_out", "adjustment"] as const;

/** The amount as someone would type it in their locale: "120.50", no symbol or grouping. */
const amountText = (amount: MinorUnits, currency: GroupDetail["group"]["currency"]) => {
  const digits = minorUnitDigits(currency);
  const magnitude = String(Math.abs(amount)).padStart(digits + 1, "0");
  const decimal = decimalSeparator();
  const text =
    digits === 0
      ? magnitude
      : `${magnitude.slice(0, -digits)}${decimal}${magnitude.slice(-digits)}`;
  return amount < 0 ? `-${text}` : text;
};

/** Records one entry for a player, offering the likely buy-in amounts first. */
export function EntryDialog({
  detail,
  sessionId,
  draft,
  presets,
  onClose,
}: {
  detail: GroupDetail;
  sessionId: SessionId;
  draft: EntryDraft;
  /** Buy-in amounts to offer, most likely first. */
  presets: ReadonlyArray<number>;
  onClose: () => void;
}) {
  const formId = useId();
  const outbox = useOutbox();
  const currency = detail.group.currency;
  const [kind, setKind] = useState(draft.kind);
  const [amount, setAmount] = useState(() =>
    draft.replaces ? amountText(draft.replaces.amount, currency) : "",
  );
  const [amountError, setAmountError] = useState<string | null>(null);

  const player = detail.players.find((p) => p.id === draft.playerId);
  const others = detail.players.filter((p) => p.id !== draft.playerId);
  const counterpartyLabel = kind === "buy_in" ? "Whose money" : "Who has the cash";
  const ownLabel = kind === "buy_in" ? `${player?.displayName}'s own` : `${player?.displayName}`;

  const record = (form: HTMLFormElement, value: MinorUnits) => {
    const data = new FormData(form);
    const counterparty = kind === "adjustment" ? "" : String(data.get("counterparty") ?? "");
    const note = String(data.get("note") ?? "").trim();
    // Recorded at once; the outbox sends it now, or when the connection is back.
    void outbox.add(sessionId, {
      id: EntryId.make(newId()),
      kind,
      playerId: draft.playerId,
      counterpartyId: counterparty ? PlayerId.make(counterparty) : null,
      amount: value,
      occurredAt: DateTime.nowUnsafe(),
      note: note || null,
      replacesEntryId: draft.replaces?.id ?? null,
    });
    onClose();
  };

  const validateAmount = (text: string) => {
    const value = Option.getOrNull(parseMoney(text, currency));
    if (
      value === null ||
      (kind !== "adjustment" && value < 0) ||
      (kind === "adjustment" && value === 0)
    ) {
      return kind === "adjustment"
        ? "Enter an amount like 15 or -15."
        : `Enter an amount like ${formatMoney(MinorUnits.make(2000), currency)}.`;
    }
    if (kind === "buy_in" && value === 0) return "A buy-in needs an amount.";
    return null;
  };

  const changeAmount = (text: string) => {
    setAmount(text);
    if (amountError) setAmountError(validateAmount(text));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateAmount(amount);
    if (error) return setAmountError(error);
    const value = Option.getOrThrow(parseMoney(amount, currency));
    record(event.currentTarget, value);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={
        draft.replaces ? `Correct ${titles[kind].toLowerCase()}` : (player?.displayName ?? "Player")
      }
      description={
        draft.replaces
          ? "The original entry is voided and this one takes its place."
          : kind === "adjustment"
            ? "For anything the buy-ins and cash-outs missed. Use a minus sign for a loss."
            : undefined
      }
      footer={
        <Button type="submit" form={formId} variant="primary" size="lg" className="w-full">
          {draft.replaces
            ? "Save correction"
            : kind === "adjustment"
              ? "Save adjustment"
              : `Record ${titles[kind].toLowerCase()}`}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
        {draft.replaces ? null : (
          <RadioCards
            label={<span className="sr-only">What happened</span>}
            options={kinds.map((option) => ({ value: option, label: titles[option] }))}
            value={kind}
            onChange={(option) => {
              setKind(option);
              setAmountError(null);
            }}
          />
        )}
        <Field label="Amount" error={amountError}>
          {(props) => (
            <Input
              {...props}
              value={amount}
              onChange={(event) => changeAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              autoFocus={matchMedia("(pointer: fine)").matches}
              className="text-2xl tabular-nums"
            />
          )}
        </Field>
        {kind === "buy_in" && !draft.replaces && presets.length > 0 ? (
          <div className="flex gap-2">
            {presets.map((preset) => (
              <Button
                key={preset}
                size="sm"
                className="flex-1 tabular-nums"
                onClick={() => changeAmount(amountText(MinorUnits.make(preset), currency))}
              >
                {formatMoney(MinorUnits.make(preset), currency)}
              </Button>
            ))}
          </div>
        ) : null}
        {kind === "cash_out" && !draft.replaces ? (
          // Fills the amount like a preset does: one stray tap shouldn't take a player out.
          <Button size="sm" onClick={() => changeAmount(amountText(MinorUnits.make(0), currency))}>
            Bust · {formatMoney(MinorUnits.make(0), currency)}
          </Button>
        ) : null}
        {kind !== "adjustment" ? (
          <Field
            label={counterpartyLabel}
            hint={
              kind === "buy_in"
                ? "If someone else covered it, they'll be owed this."
                : "If someone else is holding it, they'll owe it."
            }
          >
            {(props) => (
              <Select
                {...props}
                name="counterparty"
                defaultValue={draft.replaces?.counterpartyId ?? ""}
              >
                <option value="">{ownLabel}</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Note (optional)">
          {(props) => (
            <Input
              {...props}
              name="note"
              maxLength={280}
              defaultValue={draft.replaces?.note ?? ""}
              autoComplete="off"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

export function VoidEntryDialog({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const stacks = useStacks();
  const voidEntry = useAction(stacks.Client.mutation("ledger", "voidEntry"));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entry) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    const done = await voidEntry.run({
      params: { entryId: entry.id },
      payload: { reason: reason || null },
    });
    if (done) onClose();
  };
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Void this entry?"
      description="It stays in the history, crossed out, and stops counting toward results and balances."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Reason (optional)">
          {(props) => <Input {...props} name="reason" maxLength={280} autoComplete="off" />}
        </Field>
        {voidEntry.error ? <FormError>{voidEntry.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Keep it</Button>
          <Button type="submit" variant="danger" pending={voidEntry.pending}>
            Void entry
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
