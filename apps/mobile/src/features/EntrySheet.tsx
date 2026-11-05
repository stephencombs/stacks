import { MinorUnits, PlayerId, type Entry, type GroupDetail } from "@stacks/contracts";
import { decimalSeparator, formatMoney, minorUnitDigits, parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { cn } from "../components/ui/cn";
import { holdBackspace } from "./holdBackspace";

// A click can follow pointer-up as its own event. Remember the press-in delete
// until that click arrives, so a tap doesn't remove a second character.
const DELETE_PRESS_SETTLE_MS = 300;

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
  const amountRef = useRef(amount);
  const releaseRepeat = useRef<(() => void) | null>(null);
  const deletePress = useRef(0);
  const deletedOnPressIn = useRef(false);
  const settleDelete = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cents = minorUnitDigits(currency) > 0;
  const value = Option.getOrNull(parseMoney(amount, currency));

  useEffect(
    () => () => {
      releaseRepeat.current?.();
      if (settleDelete.current !== null) clearTimeout(settleDelete.current);
    },
    [],
  );

  const writeAmount = (next: string) => {
    amountRef.current = next;
    setAmount(next);
  };

  const eraseOne = () => {
    const next = amountRef.current.slice(0, -1);
    if (next === amountRef.current) return true;
    writeAmount(next);
    setAmountError(null);
    return next.length === 0;
  };

  const pressDelete = () => {
    deletePress.current += 1;
    deletedOnPressIn.current = true;
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    releaseRepeat.current?.();
    releaseRepeat.current = holdBackspace(eraseOne);
  };

  const releaseDelete = () => {
    releaseRepeat.current?.();
    releaseRepeat.current = null;
    if (settleDelete.current !== null) clearTimeout(settleDelete.current);
    const seen = deletePress.current;
    settleDelete.current = setTimeout(() => {
      settleDelete.current = null;
      if (deletePress.current === seen) deletedOnPressIn.current = false;
    }, DELETE_PRESS_SETTLE_MS);
  };

  // VoiceOver and keyboard activation fire onPress without a press-in.
  const activateDelete = () => {
    deletePress.current += 1;
    if (deletedOnPressIn.current) {
      deletedOnPressIn.current = false;
      return;
    }
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    eraseOne();
  };

  const press = (key: string) => {
    setAmountError(null);
    const current = amountRef.current;
    if (key === "sign")
      return writeAmount(current.startsWith("-") ? current.slice(1) : `-${current}`);
    if (key === decimal && current.includes(decimal)) return;
    writeAmount(current === "0" && key !== decimal ? key : current + key);
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
  const tap = (key: string) => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
    press(key);
  };

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
      {draft.replaces ? null : (
        <Choice label="What happened" labelHidden options={kinds} value={kind} onChange={setKind} />
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
          <Text accessibilityLiveRegion="polite" className="text-center type-footnote text-danger">
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
                onPress={() => writeAmount(amountText(MinorUnits.make(preset), currency))}
              />
            ))
          ) : (
            <Button
              label={`Bust · ${formatMoney(MinorUnits.make(0), currency)}`}
              size="sm"
              haptic
              // Fills the amount like a preset does: one stray tap shouldn't take a player out.
              onPress={() => writeAmount(amountText(MinorUnits.make(0), currency))}
            />
          )}
        </View>
      ) : null}
      <View className="flex-row flex-wrap">
        {[...keys, bottomLeft, "0", "back"].map((key) =>
          key === null ? (
            <View key="gap" className="h-16 basis-1/3" />
          ) : (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={
                key === "back" ? "Delete" : key === "sign" ? "Plus or minus" : key
              }
              // The sheet scrolls; a stolen press would stop a held delete.
              cancelable={key === "back" ? false : undefined}
              onPressIn={key === "back" ? pressDelete : undefined}
              onPressOut={key === "back" ? releaseDelete : undefined}
              onPress={key === "back" ? activateDelete : () => tap(key)}
              className="h-16 basis-1/3 items-center justify-center rounded-full active:bg-fill"
            >
              {key === "back" ? (
                <Icon name="delete" color="ink" size={24} />
              ) : (
                <Text className="text-3xl font-medium text-ink">{key === "sign" ? "±" : key}</Text>
              )}
            </Pressable>
          ),
        )}
      </View>
      {kind !== "adjustment" && others.length > 0 && choosingWhose ? (
        <Choice
          label={whoseLabel}
          options={[
            {
              value: "",
              label: kind === "buy_in" ? `${player?.displayName}'s own` : `${player?.displayName}`,
            },
            ...others.map((other) => ({ value: other.id, label: other.displayName })),
          ]}
          value={counterparty}
          onChange={(next) => {
            setCounterparty(next);
            setChoosingWhose(false);
          }}
        />
      ) : null}
      {noting ? (
        <TextField label="Note" value={note} onChangeText={setNote} maxLength={280} />
      ) : null}
      <View className="overflow-hidden rounded-xl bg-surface">
        {kind !== "adjustment" && others.length > 0 && !choosingWhose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${whoseLabel}: ${whose ?? "their own"}. Change`}
            onPress={() => setChoosingWhose(true)}
            className="min-h-12 flex-row items-center gap-3 px-4 active:bg-sunken"
          >
            <Text className="type-body text-ink">{whoseLabel}</Text>
            <Text numberOfLines={1} className="flex-1 text-right type-body text-muted">
              {whose ?? (kind === "buy_in" ? "Their own" : "They do")}
            </Text>
            <Icon name="chevron-right" color="faint" size={16} />
          </Pressable>
        ) : null}
        {noting ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a note"
            onPress={() => setNoting(true)}
            className={cn(
              "min-h-12 flex-row items-center gap-3 px-4 active:bg-sunken",
              kind !== "adjustment" &&
                others.length > 0 &&
                !choosingWhose &&
                "border-t border-line",
            )}
          >
            <Text className="flex-1 type-body text-ink">Note</Text>
            <Text className="type-body text-muted">Add</Text>
            <Icon name="chevron-right" color="faint" size={16} />
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}
