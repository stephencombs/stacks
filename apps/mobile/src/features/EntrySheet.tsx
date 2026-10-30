import { MinorUnits, PlayerId, type Entry, type GroupDetail } from "@stacks/contracts";
import { decimalSeparator, formatMoney, minorUnitDigits, parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, TextField } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { cn } from "../components/ui/cn";

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
  const [choosingWhose, setChoosingWhose] = useState(false);
  const [note, setNote] = useState(draft.replaces?.note ?? "");
  const [noting, setNoting] = useState(Boolean(draft.replaces?.note));
  const [amountError, setAmountError] = useState<string | null>(null);
  const cents = minorUnitDigits(currency) > 0;
  const value = Option.getOrNull(parseMoney(amount, currency));

  const press = (key: string) => {
    setAmountError(null);
    if (key === "back") return setAmount((a) => a.slice(0, -1));
    if (key === "sign") return setAmount((a) => (a.startsWith("-") ? a.slice(1) : `-${a}`));
    if (key === decimal && amount.includes(decimal)) return;
    setAmount((a) => (a === "0" && key !== decimal ? key : a + key));
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

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const bottomLeft = kind === "adjustment" ? "sign" : cents ? decimal : null;
  const whoseLabel = kind === "buy_in" ? "Whose money" : "Who has the cash";
  const whose = others.find((other) => other.id === counterparty)?.displayName;

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
    >
      {draft.replaces ? null : (
        <Choice label="What happened" options={kinds} value={kind} onChange={setKind} columns={3} />
      )}
      <View accessible accessibilityLabel="Amount" accessibilityValue={{ text: amount || "none" }}>
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          className={cn("font-mono text-5xl", amount ? "text-ink" : "text-faint")}
        >
          {value === null
            ? amount || formatMoney(MinorUnits.make(0), currency)
            : formatMoney(value, currency, {
                signDisplay: kind === "adjustment" ? "exceptZero" : "auto",
              })}
        </Text>
        {amountError ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
            {amountError}
          </Text>
        ) : null}
      </View>
      {kind === "buy_in" && presets.length > 0 ? (
        <View className="flex-row gap-2">
          {presets.map((preset) => (
            <Button
              key={preset}
              label={formatMoney(MinorUnits.make(preset), currency)}
              size="sm"
              className="flex-1"
              onPress={() => setAmount(amountText(MinorUnits.make(preset), currency))}
            />
          ))}
        </View>
      ) : null}
      {kind === "cash_out" && !draft.replaces ? (
        <Button
          label={`Bust · ${formatMoney(MinorUnits.make(0), currency)}`}
          size="sm"
          haptic
          onPress={() => submit(MinorUnits.make(0))}
        />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {[...keys, bottomLeft, "0", "back"].map((key) =>
          key === null ? (
            <View key="gap" className="h-16 basis-[31%] grow" />
          ) : (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={
                key === "back" ? "Delete" : key === "sign" ? "Plus or minus" : key
              }
              onPress={() => press(key)}
              className="h-16 basis-[31%] grow items-center justify-center rounded-xl bg-surface active:bg-sunken"
            >
              <Text className="font-mono text-2xl text-ink">
                {key === "back" ? "⌫" : key === "sign" ? "±" : key}
              </Text>
            </Pressable>
          ),
        )}
      </View>
      {kind !== "adjustment" && others.length > 0 ? (
        choosingWhose ? (
          <Choice
            label={whoseLabel}
            options={[
              {
                value: "",
                label:
                  kind === "buy_in" ? `${player?.displayName}'s own` : `${player?.displayName}`,
              },
              ...others.map((other) => ({ value: other.id, label: other.displayName })),
            ]}
            value={counterparty}
            onChange={(next) => {
              setCounterparty(next);
              setChoosingWhose(false);
            }}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${whoseLabel}: ${whose ?? "their own"}. Change`}
            onPress={() => setChoosingWhose(true)}
            className="min-h-11 flex-row items-center justify-between"
          >
            <Text className="text-sm text-muted">
              {kind === "buy_in"
                ? whose
                  ? `${whose}'s money · they'll be owed this`
                  : "Their own money"
                : whose
                  ? `${whose} has the cash · they'll owe this`
                  : "They have the cash"}
            </Text>
            <Text className="text-sm font-semibold text-accent-text">Change</Text>
          </Pressable>
        )
      ) : null}
      {noting ? (
        <TextField label="Note" value={note} onChangeText={setNote} maxLength={280} />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setNoting(true)}
          className="min-h-11 justify-center"
        >
          <Text className="text-sm font-semibold text-accent-text">Add a note</Text>
        </Pressable>
      )}
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
    </Sheet>
  );
}
