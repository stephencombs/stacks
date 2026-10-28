import type { StaticScreenProps } from "@react-navigation/native";
import {
  EntryId,
  GroupId,
  type Entry,
  type GroupDetail,
  type MinorUnits,
  type PlayerId,
  type Transfer,
} from "@stacks/contracts";
import { formatDay, isAdmin, playerNames } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { applyPayments } from "@stacks/shared/balances";
import { parseMoney } from "@stacks/shared/money";
import { settleUp } from "@stacks/shared/settleUp";
import * as Option from "effect/Option";
import { useState } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function SettleScreen({ route }: Props) {
  const stacks = useStacks();
  return (
    <Screen>
      <Loaded
        query={stacks.group(GroupId.make(route.params.groupId))}
        skeleton={<Skeleton className="h-96" />}
      >
        {(detail) => <SettleView detail={detail} />}
      </Loaded>
    </Screen>
  );
}

type Payment = {
  readonly id: EntryId;
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly amount: MinorUnits;
  readonly note: string | null;
};

function SettleView({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const recordSettlement = useAction(stacks.Client.mutation("ledger", "recordSettlement"));
  const [pending, setPending] = useState<ReadonlyArray<Payment>>([]);
  const [paying, setPaying] = useState<Transfer | null | "custom">(null);
  const [voiding, setVoiding] = useState<Entry | null>(null);

  // A payment counts the moment it's recorded, so its suggestion can't be marked paid twice.
  const unsaved = pending.filter(
    (payment) => !detail.settlements.some((saved) => saved.id === payment.id),
  );
  const transfers = settleUp(
    applyPayments(
      new Map(detail.balances.map((balance) => [balance.playerId, balance.amount])),
      unsaved,
    ),
  );

  const record = async (payment: Omit<Payment, "id">) => {
    const id = EntryId.make(newId());
    setPending((all) => [...all, { ...payment, id }]);
    const saved = await recordSettlement.run({
      params: { groupId: detail.group.id },
      payload: {
        id,
        fromPlayerId: payment.from,
        toPlayerId: payment.to,
        amount: payment.amount,
        note: payment.note,
      },
    });
    if (!saved) setPending((all) => all.filter((p) => p.id !== id));
  };

  return (
    <>
      <View className="gap-2">
        <SectionHeading>Suggested payments</SectionHeading>
        {recordSettlement.error ? <FormError>{recordSettlement.error}</FormError> : null}
        {transfers.length === 0 ? (
          <EmptyState title="Everyone's square">
            Nobody owes anybody. Debts show up here when someone covers a buy-in or holds someone
            else's cash.
          </EmptyState>
        ) : (
          <>
            <List>
              {transfers.map((transfer) => (
                <Row key={`${transfer.from}:${transfer.to}`}>
                  <Text
                    accessibilityLabel={`${names.get(transfer.from)} pays ${names.get(transfer.to)}`}
                    className="flex-1 text-base text-ink"
                  >
                    {names.get(transfer.from)} → {names.get(transfer.to)}
                  </Text>
                  <Money
                    amount={transfer.amount}
                    currency={currency}
                    className="font-serif text-xl"
                  />
                  <Button label="Mark paid" size="sm" onPress={() => setPaying(transfer)} />
                </Row>
              ))}
            </List>
            <Text className="text-sm text-muted">
              Payments that clear every balance. Pay however you like; Stacks only keeps the record.
            </Text>
          </>
        )}
      </View>
      <Button label="Record a payment" onPress={() => setPaying("custom")} />

      <View className="gap-2">
        <SectionHeading>Payments</SectionHeading>
        {detail.settlements.length === 0 && unsaved.length === 0 ? (
          <Text className="text-sm text-muted">Payments you record show up here.</Text>
        ) : (
          <List>
            {unsaved.map((payment) => (
              <Row key={payment.id}>
                <Text className="w-20 text-sm text-muted">Saving…</Text>
                <Text className="flex-1 text-base text-ink">
                  {names.get(payment.from)} paid {names.get(payment.to)}
                </Text>
                <Money amount={payment.amount} currency={currency} className="font-medium" />
              </Row>
            ))}
            {detail.settlements.map((entry) => {
              const voided = entry.voidedAt !== null;
              const canVoid = !voided && (isAdmin(detail) || entry.playerId === detail.myPlayerId);
              return (
                <Row
                  key={entry.id}
                  {...(canVoid
                    ? { onPress: () => setVoiding(entry), accessibilityHint: "Void this payment" }
                    : {})}
                >
                  <Text className="w-20 text-sm text-muted">{formatDay(entry.occurredAt)}</Text>
                  <Text
                    className={cn(
                      "flex-1 text-base",
                      voided ? "text-muted line-through" : "text-ink",
                    )}
                  >
                    {names.get(entry.playerId)} paid{" "}
                    {entry.counterpartyId ? names.get(entry.counterpartyId) : ""}
                  </Text>
                  <Money
                    amount={entry.amount}
                    currency={currency}
                    className={cn("font-medium", voided && "text-muted")}
                  />
                </Row>
              );
            })}
          </List>
        )}
      </View>

      {paying ? (
        <PaymentSheet
          detail={detail}
          transfer={paying === "custom" ? null : paying}
          onRecord={(payment) => void record(payment)}
          onClose={() => setPaying(null)}
        />
      ) : null}
      {voiding ? <VoidPaymentSheet entry={voiding} onClose={() => setVoiding(null)} /> : null}
    </>
  );
}

function PaymentSheet({
  detail,
  transfer,
  onRecord,
  onClose,
}: {
  detail: GroupDetail;
  transfer: Transfer | null;
  onRecord: (payment: Omit<Payment, "id">) => void;
  onClose: () => void;
}) {
  const names = playerNames(detail);
  const people = detail.players.map((player) => ({ value: player.id, label: player.displayName }));
  const [from, setFrom] = useState<PlayerId>(transfer?.from ?? detail.myPlayerId);
  const [to, setTo] = useState<PlayerId>(
    transfer?.to ?? detail.players.find((p) => p.id !== detail.myPlayerId)?.id ?? detail.myPlayerId,
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const value = transfer
      ? transfer.amount
      : Option.getOrNull(parseMoney(amount, detail.group.currency));
    if (from === to) return setProblem("Pick two different people.");
    if (value === null || value <= 0) return setProblem("Enter how much was paid.");
    onRecord({ from, to, amount: value, note: note.trim() || null });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={transfer ? "Mark as paid" : "Record a payment"}
      description={
        transfer
          ? `${names.get(transfer.from)} paid ${names.get(transfer.to)}.`
          : "For money that changed hands outside a session."
      }
    >
      {transfer ? (
        <Money
          amount={transfer.amount}
          currency={detail.group.currency}
          className="font-serif text-4xl"
        />
      ) : (
        <>
          <Choice label="Who paid" options={people} value={from} onChange={setFrom} />
          <Choice label="Paid to" options={people} value={to} onChange={setTo} />
          <TextField
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            inputClassName="tabular-nums"
          />
        </>
      )}
      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        hint="Like “Venmo” or “cash at the airport”."
        maxLength={280}
      />
      {problem ? <FormError>{problem}</FormError> : null}
      <Button label="Record payment" variant="primary" size="lg" haptic onPress={submit} />
    </Sheet>
  );
}

function VoidPaymentSheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const stacks = useStacks();
  const voidEntry = useAction(stacks.Client.mutation("ledger", "voidEntry"));
  const [reason, setReason] = useState("");
  const confirm = async () => {
    if (
      await voidEntry.run({
        params: { entryId: entry.id },
        payload: { reason: reason.trim() || null },
      })
    )
      onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Void this payment?"
      description="It stays in the history, crossed out, and stops counting."
    >
      <TextField
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        maxLength={280}
      />
      {voidEntry.error ? <FormError>{voidEntry.error}</FormError> : null}
      <Button
        label="Void payment"
        variant="danger"
        size="lg"
        pending={voidEntry.pending}
        onPress={() => void confirm()}
      />
    </Sheet>
  );
}
