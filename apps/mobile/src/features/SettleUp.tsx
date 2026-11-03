import {
  EntryId,
  type Entry,
  type GroupDetail,
  type TripDetail,
  MinorUnits,
  type PlayerId,
  type Transfer,
} from "@stacks/contracts";
import { formatDay, isAdmin, playerNames } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { barTrack } from "@stacks/client-runtime/chart";
import { balanceHeadline, chipOf } from "@stacks/client-runtime/trip";
import { applyPayments } from "@stacks/shared/balances";
import { parseMoney } from "@stacks/shared/money";
import { settleUp } from "@stacks/shared/settleUp";
import * as Option from "effect/Option";
import { useState } from "react";
import { Text, View } from "react-native";

import { BalanceLabel, Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Glow } from "../components/ui/Glow";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { BackingSection } from "./Backing";
import { Chip } from "./Chip";
import { PayLinks, ShareSettleUpButton } from "./PayLinks";
import { useAction, useStacks } from "../lib/stacks";

type Payment = {
  readonly id: EntryId;
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly amount: MinorUnits;
  readonly note: string | null;
};

export function SettleView({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const stacks = useStacks();
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const recordSettlement = useAction(stacks.Client.mutation("ledger", "recordSettlement"));
  const [pending, setPending] = useState<ReadonlyArray<Payment>>([]);
  const [paying, setPaying] = useState<Transfer | null | "custom">(null);
  const [voiding, setVoiding] = useState<Entry | null>(null);

  // A payment counts the moment it's recorded, so its suggestion can't be marked paid twice.
  const unsaved = pending.filter(
    (payment) => !trip.settlements.some((saved) => saved.id === payment.id),
  );
  const balanceOf = applyPayments(
    new Map(trip.balances.map((balance) => [balance.playerId, balance.amount])),
    unsaved,
  );
  const transfers = settleUp(balanceOf);
  const me = detail.myPlayerId;
  const involvesMe = (transfer: Transfer) => transfer.from === me || transfer.to === me;
  const mine = transfers.filter(involvesMe);
  const others = transfers.filter((transfer) => !involvesMe(transfer));
  const myBalance = balanceOf.get(me) ?? MinorUnits.make(0);
  const head = balanceHeadline(myBalance, mine.length);
  const track = barTrack(detail.players.map((player) => balanceOf.get(player.id) ?? 0));
  const transferRow = (transfer: Transfer) => (
    <Row key={`${transfer.from}:${transfer.to}`} className="flex-col items-stretch gap-2.5">
      <View className="flex-row items-center gap-3">
        <View
          accessible
          accessibilityLabel={`${names.get(transfer.from)} pays ${names.get(transfer.to)}`}
          className="flex-1 flex-row flex-wrap items-center gap-x-1.5"
        >
          <Payer detail={detail} playerId={transfer.from} />
          <Icon name="arrow-right" color="accent-text" size={16} />
          <Payer detail={detail} playerId={transfer.to} />
        </View>
        <Money amount={transfer.amount} currency={currency} className="text-lg" />
        <Button label="Mark paid" size="sm" onPress={() => setPaying(transfer)} />
      </View>
      <PayLinks detail={detail} tripName={trip.trip.name} transfer={transfer} />
    </Row>
  );

  const record = async (payment: Omit<Payment, "id">) => {
    const id = EntryId.make(newId());
    setPending((all) => [...all, { ...payment, id }]);
    const saved = await recordSettlement.run({
      params: { tripId: trip.trip.id },
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
        <SectionHeading
          action={
            <ShareSettleUpButton
              detail={detail}
              tripName={trip.trip.name}
              transfers={[...mine, ...others]}
            />
          }
        >
          You
        </SectionHeading>
        <View className="overflow-hidden rounded-3xl bg-surface">
          <Glow tone={head.tone} />
          <View className="gap-1 px-4 pt-4 pb-4">
            <Text className="type-label text-muted">{head.label}</Text>
            <Money
              amount={MinorUnits.make(Math.abs(myBalance))}
              currency={currency}
              fit
              className={cn(
                "font-display text-6xl leading-[64px]",
                myBalance > 0 ? "text-win" : myBalance < 0 ? "text-loss" : "text-muted",
              )}
            />
            {head.line ? <Text className="text-sm text-muted">{head.line}</Text> : null}
          </View>
          {mine.map(transferRow)}
        </View>
        {recordSettlement.error ? <FormError>{recordSettlement.error}</FormError> : null}
      </View>

      {transfers.length === 0 ? (
        <EmptyState title="Everyone's square">
          Nobody owes anybody on this trip. Debts show up here when someone covers a buy-in or holds
          someone else's cash.
        </EmptyState>
      ) : others.length > 0 ? (
        <View className="gap-2">
          <SectionHeading>
            {mine.length > 0 ? "Everyone else" : "Suggested payments"}
          </SectionHeading>
          <List>{others.map(transferRow)}</List>
        </View>
      ) : null}
      {transfers.length > 0 ? (
        <Text className="text-sm text-muted">
          Payments that clear every balance. Pay however you like; Stacks only keeps the record.
        </Text>
      ) : null}

      <View className="gap-2">
        <SectionHeading>Balances</SectionHeading>
        <List>
          {detail.players
            .toSorted((a, b) => Number(b.id === me) - Number(a.id === me))
            .map((player) => (
              <Row key={player.id}>
                <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={26} />
                <Text numberOfLines={1} className="flex-1 text-base text-ink">
                  {player.displayName}
                  {player.id === me ? <Text className="text-muted"> (you)</Text> : null}
                  {player.userId === null ? <Text className="text-muted"> · guest</Text> : null}
                </Text>
                <BalanceBar balance={balanceOf.get(player.id) ?? 0} track={track} />
                <BalanceLabel
                  amount={balanceOf.get(player.id) ?? MinorUnits.make(0)}
                  currency={currency}
                  className="min-w-24 text-right"
                />
              </Row>
            ))}
        </List>
      </View>
      <Button label="Record a payment" onPress={() => setPaying("custom")} />

      <BackingSection detail={detail} trip={trip} />

      <View className="gap-2">
        <SectionHeading>Payments</SectionHeading>
        {trip.settlements.length === 0 && unsaved.length === 0 ? (
          <Text className="text-sm text-muted">Payments you record show up here.</Text>
        ) : (
          <List>
            {unsaved.map((payment) => (
              <Row key={payment.id}>
                <Text className="w-20 text-sm text-muted">Saving…</Text>
                <Text className="flex-1 text-base text-ink">
                  {names.get(payment.from)} paid {names.get(payment.to)}
                </Text>
                <Money amount={payment.amount} currency={currency} />
              </Row>
            ))}
            {trip.settlements.map((entry) => {
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
                    className={cn(voided && "text-muted")}
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
      footer={<Button label="Record payment" variant="primary" size="lg" haptic onPress={submit} />}
    >
      {transfer ? (
        <Money amount={transfer.amount} currency={detail.group.currency} className="text-3xl" />
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
      footer={
        <Button
          label="Void payment"
          variant="danger"
          size="lg"
          pending={voidEntry.pending}
          onPress={() => void confirm()}
        />
      }
    >
      <TextField
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        maxLength={280}
      />
      {voidEntry.error ? <FormError>{voidEntry.error}</FormError> : null}
    </Sheet>
  );
}

function Payer({ detail, playerId }: { detail: GroupDetail; playerId: PlayerId }) {
  const name = detail.players.find((player) => player.id === playerId)?.displayName ?? "Someone";
  return (
    <View className="flex-row items-center gap-1.5">
      <Chip chip={chipOf(detail, playerId)} name={name} size={22} />
      <Text className="text-base font-medium text-ink">{name}</Text>
    </View>
  );
}

/** A balance as a bar from break-even: right and green when owed, left and red when owing. */
function BalanceBar({ balance, track }: { balance: number; track: ReturnType<typeof barTrack> }) {
  const extent = track.extent(balance) * 100;
  return (
    <View className="h-1.5 w-16 rounded-full bg-sunken">
      {balance === 0 ? null : (
        <View
          className={cn("absolute inset-y-0 rounded-full", balance > 0 ? "bg-win" : "bg-loss")}
          style={{
            left: `${balance > 0 ? track.zero * 100 : track.zero * 100 - extent}%`,
            width: `${extent}%`,
          }}
        />
      )}
    </View>
  );
}
