import {
  EntryId,
  MinorUnits,
  PlayerId,
  type Entry,
  type GroupDetail,
  type SessionId,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { formatMoney, minorUnitDigits, parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { useAction, useStacks } from "~/lib/stacks";

export type EntryDraft = {
  readonly kind: "buy_in" | "cash_out" | "adjustment";
  readonly playerId: PlayerId;
  /** Set when correcting: the new entry replaces this one. */
  readonly replaces?: Entry;
};

const titles = { buy_in: "Buy in", cash_out: "Cash out", adjustment: "Adjust result" } as const;
const QUICK_AMOUNTS = [20, 50, 100, 200, 500];

/** The amount as someone would type it in their locale: "120.50", no symbol or grouping. */
const amountText = (amount: MinorUnits, currency: GroupDetail["group"]["currency"]) => {
  const digits = minorUnitDigits(currency);
  const magnitude = String(Math.abs(amount)).padStart(digits + 1, "0");
  const decimal =
    new Intl.NumberFormat().formatToParts(1.5).find((part) => part.type === "decimal")?.value ??
    ".";
  const text =
    digits === 0
      ? magnitude
      : `${magnitude.slice(0, -digits)}${decimal}${magnitude.slice(-digits)}`;
  return amount < 0 ? `-${text}` : text;
};

export function EntryDialog({
  detail,
  sessionId,
  draft,
  onClose,
}: {
  detail: GroupDetail;
  sessionId: SessionId;
  draft: EntryDraft;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const add = useAction(stacks.Client.mutation("ledger", "addEntry"));
  const currency = detail.group.currency;
  const [amount, setAmount] = useState(() =>
    draft.replaces ? amountText(draft.replaces.amount, currency) : "",
  );
  const [amountError, setAmountError] = useState<string | null>(null);

  const player = detail.players.find((p) => p.id === draft.playerId);
  const others = detail.players.filter((p) => p.id !== draft.playerId);
  const counterpartyLabel = draft.kind === "buy_in" ? "Whose money" : "Who has the cash";
  const ownLabel =
    draft.kind === "buy_in" ? `${player?.displayName}'s own` : `${player?.displayName}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = parseMoney(amount, currency);
    const value = Option.getOrNull(parsed);
    if (
      value === null ||
      (draft.kind !== "adjustment" && value < 0) ||
      (draft.kind === "adjustment" && value === 0)
    ) {
      return setAmountError(
        draft.kind === "adjustment"
          ? "Enter an amount like 15 or -15."
          : `Enter an amount like ${formatMoney(MinorUnits.make(2000), currency)}.`,
      );
    }
    if (draft.kind === "buy_in" && value === 0) return setAmountError("A buy-in needs an amount.");
    setAmountError(null);
    const counterparty = String(form.get("counterparty") ?? "");
    const note = String(form.get("note") ?? "").trim();
    const saved = await add.run({
      params: { sessionId },
      payload: {
        id: EntryId.make(newId()),
        kind: draft.kind,
        playerId: draft.playerId,
        counterpartyId: counterparty ? PlayerId.make(counterparty) : null,
        amount: value,
        note: note || null,
        replacesEntryId: draft.replaces?.id ?? null,
      },
    });
    if (saved) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={
        draft.replaces
          ? `Correct ${titles[draft.kind].toLowerCase()}`
          : `${titles[draft.kind]} · ${player?.displayName}`
      }
      description={
        draft.replaces
          ? "The original entry is voided and this one takes its place."
          : draft.kind === "cash_out"
            ? `Record ${formatMoney(MinorUnits.make(0), currency)} if they busted.`
            : draft.kind === "adjustment"
              ? "For anything the buy-ins and cash-outs missed. Use a minus sign for a loss."
              : undefined
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Amount" error={amountError}>
          {(props) => (
            <Input
              {...props}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              className="font-mono text-2xl tabular-nums"
            />
          )}
        </Field>
        {draft.kind === "buy_in" && !draft.replaces ? (
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((quick) => (
              <Button key={quick} size="sm" onClick={() => setAmount(String(quick))}>
                {quick}
              </Button>
            ))}
          </div>
        ) : null}
        {draft.kind !== "adjustment" ? (
          <Field
            label={counterpartyLabel}
            hint={
              draft.kind === "buy_in"
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
        {add.error ? <FormError>{add.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" disabled={add.pending}>
          {add.pending
            ? "Saving…"
            : draft.replaces
              ? "Save correction"
              : `Record ${titles[draft.kind].toLowerCase()}`}
        </Button>
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
          <Button type="submit" variant="danger" disabled={voidEntry.pending}>
            {voidEntry.pending ? "Voiding…" : "Void entry"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
