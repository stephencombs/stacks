import { MinorUnits, PlayerId, type Entry, type GroupDetail } from "@stacks/contracts";
import { formatMoney, minorUnitDigits, parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, TextField } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";

export type EntryDraft = {
  readonly kind: "buy_in" | "cash_out" | "adjustment";
  readonly playerId: PlayerId;
  /** Set when correcting: the new entry replaces this one. */
  readonly replaces?: Entry;
};

export type EntryInput = {
  readonly kind: EntryDraft["kind"];
  readonly playerId: PlayerId;
  readonly counterpartyId: PlayerId | null;
  readonly amount: MinorUnits;
  readonly note: string | null;
  readonly replacesEntryId: Entry["id"] | null;
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

/**
 * Collects one entry. The parent records it, so the entry can show in the session at once while
 * it saves.
 */
export function EntrySheet({
  detail,
  draft,
  onSubmit,
  onClose,
}: {
  detail: GroupDetail;
  draft: EntryDraft;
  onSubmit: (input: EntryInput) => void;
  onClose: () => void;
}) {
  const currency = detail.group.currency;
  const player = detail.players.find((p) => p.id === draft.playerId);
  const others = detail.players.filter(
    (p) => p.id !== draft.playerId && (p.role !== null || p.userId === null),
  );
  const [amount, setAmount] = useState(() =>
    draft.replaces ? amountText(draft.replaces.amount, currency) : "",
  );
  const [counterparty, setCounterparty] = useState<string>(draft.replaces?.counterpartyId ?? "");
  const [note, setNote] = useState(draft.replaces?.note ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);

  const submit = () => {
    const value = Option.getOrNull(parseMoney(amount, currency));
    const invalid =
      value === null ||
      (draft.kind === "buy_in" && value <= 0) ||
      (draft.kind === "cash_out" && value < 0) ||
      (draft.kind === "adjustment" && value === 0);
    if (invalid || value === null) {
      return setAmountError(
        draft.kind === "adjustment"
          ? "Enter an amount like 15 or -15."
          : `Enter an amount like ${formatMoney(MinorUnits.make(2000), currency)}.`,
      );
    }
    onSubmit({
      kind: draft.kind,
      playerId: draft.playerId,
      counterpartyId: counterparty ? PlayerId.make(counterparty) : null,
      amount: value,
      note: note.trim() || null,
      replacesEntryId: draft.replaces?.id ?? null,
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        draft.replaces
          ? `Correct ${titles[draft.kind].toLowerCase()}`
          : `${titles[draft.kind]} · ${player?.displayName}`
      }
      description={
        draft.replaces
          ? "The original entry is voided and this one takes its place."
          : draft.kind === "cash_out"
            ? "Record 0 if they busted."
            : draft.kind === "adjustment"
              ? "For anything the buy-ins and cash-outs missed. Use a minus sign for a loss."
              : undefined
      }
    >
      <TextField
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType={draft.kind === "adjustment" ? "numbers-and-punctuation" : "decimal-pad"}
        autoFocus
        error={amountError}
        inputClassName="min-h-16 font-mono text-3xl"
        onSubmitEditing={submit}
      />
      {draft.kind === "buy_in" && !draft.replaces ? (
        <View className="flex-row flex-wrap gap-2">
          {QUICK_AMOUNTS.map((quick) => (
            <Button
              key={quick}
              label={String(quick)}
              size="sm"
              onPress={() => setAmount(String(quick))}
            />
          ))}
        </View>
      ) : null}
      {draft.kind !== "adjustment" && others.length > 0 ? (
        <Choice
          label={draft.kind === "buy_in" ? "Whose money" : "Who has the cash"}
          options={[
            {
              value: "",
              label:
                draft.kind === "buy_in" ? `${player?.displayName}'s own` : `${player?.displayName}`,
            },
            ...others.map((other) => ({ value: other.id, label: other.displayName })),
          ]}
          value={counterparty}
          onChange={setCounterparty}
        />
      ) : null}
      {counterparty ? (
        <Text className="text-sm text-muted">
          {draft.kind === "buy_in" ? "They'll be owed this." : "They'll owe this."}
        </Text>
      ) : null}
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={280} />
      <Button
        label={
          draft.replaces
            ? "Save correction"
            : draft.kind === "adjustment"
              ? "Save adjustment"
              : `Record ${titles[draft.kind].toLowerCase()}`
        }
        variant="primary"
        size="xl"
        haptic
        onPress={submit}
      />
    </Sheet>
  );
}
