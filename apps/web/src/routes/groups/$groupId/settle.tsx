import { createFileRoute } from "@tanstack/react-router";
import {
  EntryId,
  GroupId,
  PlayerId,
  type Entry,
  type GroupDetail,
  type MinorUnits,
  type Transfer,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { applyPayments } from "@stacks/shared/balances";
import { formatMoney, parseMoney } from "@stacks/shared/money";
import { settleUp } from "@stacks/shared/settleUp";
import * as Option from "effect/Option";
import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { EmptyState, SectionHeading, Skeleton, Surface } from "~/components/ui/Surface";
import { BackingSection } from "~/features/Backing";
import { VoidEntryDialog } from "~/features/EntryDialogs";
import { GroupHeader } from "~/features/GroupHeader";
import { isAdmin, playerNames } from "@stacks/client-runtime/format";
import { formatDay } from "@stacks/client-runtime/format";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/groups/$groupId/settle")({ component: SettleUp });

function SettleUp() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.group(GroupId.make(groupId))}
      skeleton={<Skeleton className="mt-4 h-96" />}
    >
      {(detail) => <SettleUpView detail={detail} />}
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

function SettleUpView({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const recordSettlement = useAction(stacks.Client.mutation("ledger", "recordSettlement"));
  const [pending, setPending] = useState<ReadonlyArray<Payment>>([]);
  const [paying, setPaying] = useState<Transfer | null>(null);
  const [recording, setRecording] = useState(false);
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
      <GroupHeader
        detail={detail}
        current="settle"
        action={<Button onClick={() => setRecording(true)}>Record a payment</Button>}
      />

      <section className="flex flex-col gap-2">
        <SectionHeading>Suggested payments</SectionHeading>
        {recordSettlement.error ? <FormError>{recordSettlement.error}</FormError> : null}
        {transfers.length === 0 ? (
          <EmptyState title="Everyone's square">
            Nobody owes anybody. Debts show up here when someone covers a buy-in or holds someone
            else's cash.
          </EmptyState>
        ) : (
          <>
            <Surface className="divide-y divide-line">
              {transfers.map((transfer) => (
                <div
                  key={`${transfer.from}:${transfer.to}`}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{names.get(transfer.from)}</span>
                    <ArrowRight className="size-4 text-muted" role="img" aria-label="pays" />
                    <span className="font-medium">{names.get(transfer.to)}</span>
                  </span>
                  <Money
                    amount={transfer.amount}
                    currency={currency}
                    className="font-serif text-xl"
                  />
                  <Button size="sm" onClick={() => setPaying(transfer)}>
                    Mark paid
                  </Button>
                </div>
              ))}
            </Surface>
            <p className="text-sm text-muted">
              Payments that clear every balance. Pay however you like; Stacks only keeps the record.
            </p>
          </>
        )}
      </section>

      <BackingSection detail={detail} />

      <section className="flex flex-col gap-2">
        <SectionHeading>Payments</SectionHeading>
        {detail.settlements.length === 0 && unsaved.length === 0 ? (
          <p className="text-sm text-muted">Payments you record show up here.</p>
        ) : (
          <Surface className="divide-y divide-line">
            {unsaved.map((payment) => (
              <div key={payment.id} className="flex items-center gap-4 px-5 py-3">
                <span className="w-24 shrink-0 text-sm text-muted">Saving…</span>
                <span className="flex-1">
                  {names.get(payment.from)} paid {names.get(payment.to)}{" "}
                  <Money amount={payment.amount} currency={currency} className="font-medium" />
                </span>
              </div>
            ))}
            {detail.settlements.map((entry) => {
              const voided = entry.voidedAt !== null;
              return (
                <div key={entry.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-24 shrink-0 text-sm text-muted">
                    {formatDay(entry.occurredAt)}
                  </span>
                  <span className={voided ? "flex-1 text-muted line-through" : "flex-1"}>
                    {names.get(entry.playerId)} paid{" "}
                    {entry.counterpartyId ? names.get(entry.counterpartyId) : ""}{" "}
                    <Money amount={entry.amount} currency={currency} className="font-medium" />
                    {entry.note ? <span className="text-muted"> · {entry.note}</span> : null}
                  </span>
                  {!voided && (isAdmin(detail) || entry.playerId === detail.myPlayerId) ? (
                    <Menu
                      label={`Actions for ${names.get(entry.playerId)} paid ${entry.counterpartyId ? names.get(entry.counterpartyId) : ""} ${formatMoney(entry.amount, currency)}`}
                    >
                      <MenuItem tone="danger" onClick={() => setVoiding(entry)}>
                        Void
                      </MenuItem>
                    </Menu>
                  ) : null}
                </div>
              );
            })}
          </Surface>
        )}
      </section>

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
