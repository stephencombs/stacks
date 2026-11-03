import { createFileRoute } from "@tanstack/react-router";
import {
  EntryId,
  MinorUnits,
  PlayerId,
  TripId,
  type Entry,
  type GroupDetail,
  type TripDetail,
  type Transfer,
} from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { formatDay, isAdmin, playerNames } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { chipOf } from "@stacks/client-runtime/trip";
import { applyPayments } from "@stacks/shared/balances";
import { formatMoney, parseMoney } from "@stacks/shared/money";
import { settleUp } from "@stacks/shared/settleUp";
import * as Option from "effect/Option";
import { useState, type FormEvent } from "react";

import { BalanceLabel, Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { EmptyState, Note, Section } from "~/components/ui/Page";
import { List, Row, RowText, Skeleton } from "~/components/ui/Surface";
import { BalanceBar, BalanceHero } from "~/features/BalanceHero";
import { BackingSection } from "~/features/Backing";
import { Chip } from "~/features/Chip";
import { VoidEntryDialog } from "~/features/EntryDialogs";
import { PlayerName } from "~/features/Player";
import { TransferRow } from "~/features/TransferRow";
import { ShareSettleUpButton } from "~/features/PayLinks";
import { TripHeader } from "~/features/TripHeader";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/settle")({ component: SettleUp });

function SettleUp() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="h-96" />}>
      {(trip) => (
        <Loaded query={stacks.group(trip.trip.groupId)} skeleton={<Skeleton className="h-96" />}>
          {(detail) => <SettleUpView detail={detail} trip={trip} />}
        </Loaded>
      )}
    </Loaded>
  );
}

type Payment = {
  readonly id: EntryId;
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly amount: MinorUnits;
  readonly note: string | null;
};

function SettleUpView({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const stacks = useStacks();
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const recordSettlement = useAction(stacks.Client.mutation("ledger", "recordSettlement"));
  const [pending, setPending] = useState<ReadonlyArray<Payment>>([]);
  const [paying, setPaying] = useState<Transfer | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<Entry | null>(null);

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
  const ordered = transfers.toSorted((a, b) => Number(involvesMe(b)) - Number(involvesMe(a)));
  const track = barTrack(detail.players.map((player) => balanceOf.get(player.id) ?? 0));

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
      <TripHeader group={detail} trip={trip} current="settle" />

      <BalanceHero
        balance={balanceOf.get(me) ?? MinorUnits.make(0)}
        payments={transfers.filter(involvesMe).length}
        currency={currency}
      />

      {transfers.length === 0 ? (
        <EmptyState title="Everyone's square">
          Debts show up here when someone covers a buy-in or holds someone else's cash.
        </EmptyState>
      ) : (
        <Section
          title="Suggested payments"
          action={
            <ShareSettleUpButton detail={detail} tripName={trip.trip.name} transfers={ordered} />
          }
        >
          <List>
            {ordered.map((transfer) => (
              <TransferRow
                key={`${transfer.from}:${transfer.to}`}
                detail={detail}
                tripName={trip.trip.name}
                transfer={transfer}
                onMarkPaid={setPaying}
              />
            ))}
          </List>
          <Note>
            These clear every balance. Pay however you like; Stacks only keeps the record.
          </Note>
          {recordSettlement.error ? <FormError>{recordSettlement.error}</FormError> : null}
        </Section>
      )}

      <Section title="Balances">
        <List>
          {detail.players
            .toSorted((a, b) => Number(b.id === me) - Number(a.id === me))
            .map((player) => (
              <Row key={player.id}>
                <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={28} />
                <RowText
                  title={
                    <PlayerName
                      name={names.get(player.id) ?? player.displayName}
                      you={player.id === me}
                      guest={player.userId === null}
                    />
                  }
                />
                <BalanceBar
                  balance={balanceOf.get(player.id) ?? 0}
                  track={track}
                  className="w-16 sm:w-28"
                />
                <span className="w-24 text-right font-medium">
                  <BalanceLabel
                    amount={balanceOf.get(player.id) ?? MinorUnits.make(0)}
                    currency={currency}
                  />
                </span>
              </Row>
            ))}
        </List>
      </Section>

      <BackingSection detail={detail} trip={trip} />

      <Section
        title="Payment history"
        action={
          <Button size="sm" variant="ghost" onClick={() => setRecording(true)}>
            Record a payment
          </Button>
        }
      >
        {trip.settlements.length === 0 && unsaved.length === 0 ? (
          <Note>Payments you record show up here.</Note>
        ) : (
          <List>
            {unsaved.map((payment) => (
              <Row key={payment.id}>
                <RowText
                  title={
                    <>
                      {names.get(payment.from)} paid {names.get(payment.to)}{" "}
                      <Money amount={payment.amount} currency={currency} />
                    </>
                  }
                  meta="Saving…"
                />
              </Row>
            ))}
            {trip.settlements.map((entry) => {
              const voided = entry.voidedAt !== null;
              return (
                <Row key={entry.id}>
                  <RowText
                    struck={voided}
                    title={
                      <>
                        {names.get(entry.playerId)} paid{" "}
                        {entry.counterpartyId ? names.get(entry.counterpartyId) : ""}{" "}
                        <Money amount={entry.amount} currency={currency} />
                      </>
                    }
                    meta={[
                      formatDay(entry.occurredAt),
                      entry.note,
                      voided ? `Voided${entry.voidReason ? `: ${entry.voidReason}` : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                  {!voided && (isAdmin(detail) || entry.playerId === detail.myPlayerId) ? (
                    <Menu
                      label={`Actions for ${names.get(entry.playerId)} paid ${entry.counterpartyId ? names.get(entry.counterpartyId) : ""} ${formatMoney(entry.amount, currency)}`}
                    >
                      <MenuItem tone="danger" onClick={() => setVoiding(entry)}>
                        Void
                      </MenuItem>
                    </Menu>
                  ) : null}
                </Row>
              );
            })}
          </List>
        )}
      </Section>

      {paying ? (
        <RecordPaymentDialog
          onRecord={(payment) => void record(payment)}
          key={`${paying.from}:${paying.to}`}
          detail={detail}
          transfer={paying}
          onClose={() => setPaying(null)}
        />
      ) : null}
      {recording ? (
        <RecordPaymentDialog
          detail={detail}
          transfer={null}
          onRecord={(payment) => void record(payment)}
          onClose={() => setRecording(false)}
        />
      ) : null}
      <VoidEntryDialog entry={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}

function RecordPaymentDialog({
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
  const currency = detail.group.currency;
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = transfer?.from ?? PlayerId.make(String(form.get("from")));
    const to = transfer?.to ?? PlayerId.make(String(form.get("to")));
    const amount = transfer
      ? transfer.amount
      : Option.getOrNull(parseMoney(String(form.get("amount")), currency));
    if (from === to) return setProblem("Pick two different people.");
    if (amount === null || amount <= 0) return setProblem("Enter how much was paid.");
    const note = String(form.get("note") ?? "").trim();
    onRecord({ from, to, amount, note: note || null });
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={transfer ? "Mark as paid" : "Record a payment"}
      description={
        transfer ? (
          <>
            {names.get(transfer.from)} paid {names.get(transfer.to)}{" "}
            <Money amount={transfer.amount} currency={currency} />.
          </>
        ) : (
          "For money that changed hands outside a session."
        )
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {transfer ? null : (
          <>
            <Field label="Who paid">
              {(props) => (
                <Select {...props} name="from" defaultValue={detail.myPlayerId}>
                  {detail.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Paid to">
              {(props) => (
                <Select
                  {...props}
                  name="to"
                  defaultValue={detail.players.find((p) => p.id !== detail.myPlayerId)?.id}
                >
                  {detail.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Amount">
              {(props) => (
                <Input
                  {...props}
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                />
              )}
            </Field>
          </>
        )}
        <Field label="Note (optional)" hint="Like “Venmo” or “cash at the airport”.">
          {(props) => <Input {...props} name="note" maxLength={280} autoComplete="off" />}
        </Field>
        {problem ? <FormError>{problem}</FormError> : null}
        <Button type="submit" variant="primary" size="lg">
          Record payment
        </Button>
      </form>
    </Dialog>
  );
}
