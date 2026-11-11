import { MinorUnits, PlayerId, type Entry, type GroupDetail } from "@stacks/contracts";
import { decimalSeparator, formatMoney, minorUnitDigits, parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { cn } from "../components/ui/cn";
import { AmountKeypad } from "./AmountKeypad";
import { applyAmountKey } from "./amountKey";

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

const titles = { buy_in: "Buy in", cash_out: "Cash out", adjustment: "Adjust" } as const;
const kinds = [
  { value: "buy_in", label: "Buy in" },
  { value: "cash_out", label: "Cash out" },
  { value: "adjustment", label: "Adjust" },
] as const;

/** The amount as someone would type it in their locale: "120.50", no symbol or grouping. */
const amountText = (amount: MinorUnits, currency: GroupDetail["group"]["currency"]) => {
  const digits = minorUnitDigits(currency);
  const magnitude = String(Math.abs(amount)).padStart(digits + 1, "0");
  const text =
    digits === 0
      ? magnitude
      : `${magnitude.slice(0, -digits)}${decimal}${magnitude.slice(-digits)}`;
  return amount < 0 ? `-${text}` : text;
};
const decimal = decimalSeparator();

/**
 * Collects one entry with a keypad big enough to hit at a table, offering the likely amounts
 * first. The parent records it, so the entry shows in the session at once while it saves.
 */
export function EntrySheet({
  detail,
  draft,
  presets,
  onSubmit,
  onClose,
}: {
  detail: GroupDetail;
  draft: EntryDraft;
  /** Buy-in amounts to offer, most likely first. */
  presets: ReadonlyArray<number>;
  onSubmit: (input: EntryInput) => void;
  onClose: () => void;
}) {
  const currency = detail.group.currency;
  const player = detail.players.find((p) => p.id === draft.playerId);
  const others = detail.players.filter(
    (p) => p.id !== draft.playerId && (p.role !== null || p.userId === null),
  );
  const [kind, setKind] = useState(draft.kind);
  const [amount, setAmount] = useState(() =>
    draft.replaces ? amountText(draft.replaces.amount, currency) : "",
  );
  const [counterparty, setCounterparty] = useState<string>(draft.replaces?.counterpartyId ?? "");
  const [noteFocused, setNoteFocused] = useState(false);
  const [note, setNote] = useState(draft.replaces?.note ?? "");
  const [noting, setNoting] = useState(Boolean(draft.replaces?.note));
  const [amountError, setAmountError] = useState<string | null>(null);
  const cents = minorUnitDigits(currency) > 0;
  const value = Option.getOrNull(parseMoney(amount, currency));

  const press = (key: string) => {
    setAmountError(null);
    setAmount((current) => applyAmountKey(current, key, decimal));
  };

  const submit = (entered = value) => {
    const invalid =
      entered === null ||
      (kind === "buy_in" && entered <= 0) ||
      (kind === "cash_out" && entered < 0) ||
      (kind === "adjustment" && entered === 0);
    if (invalid || entered === null)
      return setAmountError(
        kind === "adjustment"
          ? "Enter what they won, or use ± for what they lost."
          : `Enter an amount like ${formatMoney(MinorUnits.make(10000), currency)}.`,
      );
    onSubmit({
      kind,
      playerId: draft.playerId,
      counterpartyId: kind !== "adjustment" && counterparty ? PlayerId.make(counterparty) : null,
      amount: entered,
      note: note.trim() || null,
      replacesEntryId: draft.replaces?.id ?? null,
    });
    onClose();
  };

  const bottomLeft = kind === "adjustment" ? "sign" : cents ? decimal : null;
  const whoseLabel = kind === "buy_in" ? "Whose money" : "Who has the cash";
  const showWhose = kind !== "adjustment" && others.length > 0;
  const whoseOptions = [
    {
      value: "",
      label: kind === "buy_in" ? `${player?.displayName}'s own` : `${player?.displayName}`,
    },
    ...others.map((other) => ({ value: other.id, label: other.displayName })),
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        draft.replaces ? `Correct ${titles[kind].toLowerCase()}` : (player?.displayName ?? "Player")
      }
      description={
        draft.replaces ? "The original entry is voided and this one takes its place." : undefined
      }
      footer={
        <Button
          label={
            draft.replaces
              ? "Save correction"
              : kind === "adjustment"
                ? "Save adjustment"
                : `Record ${titles[kind].toLowerCase()}`
          }
          variant="primary"
          size="xl"
          haptic
          onPress={() => submit()}
        />
      }
    >
      <View className="gap-5">
        {draft.replaces ? null : (
          <Choice
            label="What happened"
            labelHidden
            options={kinds}
            value={kind}
            onChange={setKind}
          />
        )}
        <View
          accessible
          accessibilityLabel="Amount"
          accessibilityValue={{ text: amount || "none" }}
          className="items-center gap-2 py-3"
        >
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            style={{ lineHeight: 72 }}
            className={cn("font-mono text-6xl", amount ? "text-ink" : "text-faint")}
          >
            {value === null
              ? amount || formatMoney(MinorUnits.make(0), currency)
              : formatMoney(value, currency, {
                  signDisplay: kind === "adjustment" ? "exceptZero" : "auto",
                })}
          </Text>
          {amountError ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-center type-footnote text-danger"
            >
              {amountError}
            </Text>
          ) : null}
        </View>
        {(kind === "buy_in" && presets.length > 0) || (kind === "cash_out" && !draft.replaces) ? (
          <View className="flex-row justify-center gap-2">
            {kind === "buy_in" ? (
              presets.map((preset) => (
                <Button
                  key={preset}
                  label={formatMoney(MinorUnits.make(preset), currency)}
                  size="sm"
                  onPress={() => setAmount(amountText(MinorUnits.make(preset), currency))}
                />
              ))
            ) : (
              <Button
                label={`Bust · ${formatMoney(MinorUnits.make(0), currency)}`}
                size="sm"
                haptic
                // Fills the amount like a preset does: one stray tap shouldn't take a player out.
                onPress={() => setAmount(amountText(MinorUnits.make(0), currency))}
              />
            )}
          </View>
        ) : null}
        {noteFocused ? null : <AmountKeypad onKey={press} bottomLeft={bottomLeft} />}
        {noting ? (
          <TextField
            label="Note"
            value={note}
            onChangeText={setNote}
            maxLength={280}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
          />
        ) : null}
        <View className="gap-3">
          {showWhose ? (
            <Choice
              label={whoseLabel}
              options={whoseOptions}
              value={counterparty}
              onChange={setCounterparty}
              presentation="menu"
            />
          ) : null}
          {noting ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a note"
              onPress={() => setNoting(true)}
              className="min-h-12 flex-row items-center gap-3 rounded-xl bg-surface px-4 active:bg-sunken"
            >
              <Text className="flex-1 type-body text-ink">Note</Text>
              <Text className="type-body text-muted">Add</Text>
              <Icon name="chevron-right" color="faint" size={16} />
            </Pressable>
          )}
        </View>
      </View>
    </Sheet>
  );
}
