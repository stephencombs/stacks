import { useAuth } from "@clerk/react";
import { PlayerId, StakeId, UserId, type GroupDetail, type StakeView } from "@stacks/contracts";
import { canChangeStake, playerNames, stakeLines } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { HandCoins } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { SectionHeading, Surface } from "~/components/ui/Surface";
import { useAction, useStacks } from "~/lib/stacks";

/** Stakes: money one player gave another to play with, and what comes back. */
export function BackingSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const { userId } = useAuth();
  const names = playerNames(detail);
  const end = useAction(stacks.Client.mutation("stakes", "end"));
  const reopen = useAction(stacks.Client.mutation("stakes", "reopen"));
  const [backing, setBacking] = useState(false);
  const [voiding, setVoiding] = useState<StakeView | null>(null);
  const me = userId ? UserId.make(userId) : null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading
        action={
          <Button size="sm" variant="ghost" onClick={() => setBacking(true)}>
            <HandCoins className="size-4" aria-hidden />
            Back a player
          </Button>
        }
      >
        Backing
      </SectionHeading>
      {detail.stakes.length === 0 ? (
        <p className="text-sm text-muted">
          When someone gives another player money to play with, add it here. The backer gets it back
          plus their share of the winnings, or what's left if it's lost, and Settle up counts it.
        </p>
      ) : (
        <Surface className="divide-y divide-line">
          {detail.stakes.map((view) => {
            const { title, status } = stakeLines(view, names, detail.group.currency);
            const { stake } = view;
            const voided = stake.voidedAt !== null;
            return (
              <div key={stake.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={voided ? "text-muted line-through" : undefined}>{title}</span>
                  <span className="text-sm text-muted tabular-nums">
                    {status}
                    {stake.note ? ` · ${stake.note}` : ""}
                  </span>
                </div>
                {!voided && canChangeStake(detail, view, me) ? (
                  <Menu label={`Actions for ${title}`}>
                    {stake.endedAt === null ? (
                      <MenuItem
                        onClick={() => void end.run({ params: { stakeId: stake.id }, payload: {} })}
                      >
                        End now
                      </MenuItem>
                    ) : (
                      <MenuItem onClick={() => void reopen.run({ params: { stakeId: stake.id } })}>
                        Reopen
                      </MenuItem>
                    )}
                    <MenuItem tone="danger" onClick={() => setVoiding(view)}>
                      Void
                    </MenuItem>
                  </Menu>
                ) : null}
              </div>
            );
          })}
        </Surface>
      )}
      {(end.error ?? reopen.error) ? <FormError>{end.error ?? reopen.error}</FormError> : null}
      {backing ? <BackDialog detail={detail} onClose={() => setBacking(false)} /> : null}
      {voiding ? (
        <VoidStakeDialog
          view={voiding}
          title={stakeLines(voiding, names, detail.group.currency).title}
          onClose={() => setVoiding(null)}
        />
      ) : null}
    </section>
  );
}

function BackDialog({ detail, onClose }: { detail: GroupDetail; onClose: () => void }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("stakes", "create"));
  const currency = detail.group.currency;
  const players = detail.players.filter((p) => p.role !== null || p.userId === null);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lenderId = PlayerId.make(String(form.get("lender")));
    const borrowerId = PlayerId.make(String(form.get("borrower")));
    const amount = Option.getOrNull(parseMoney(String(form.get("amount")), currency));
    const share = Number(String(form.get("share")).trim());
    if (lenderId === borrowerId) return setProblem("Pick two different people.");
    if (amount === null || amount <= 0) return setProblem("Enter how much they put up.");
    if (!Number.isInteger(share) || share < 0 || share > 100) {
      return setProblem("The backer's share is a whole percent from 0 to 100.");
    }
    setProblem(null);
    const note = String(form.get("note") ?? "").trim();
    const saved = await create.run({
      params: { groupId: detail.group.id },
      payload: {
        id: StakeId.make(newId()),
        lenderId,
        borrowerId,
        amount,
        lenderShare: share,
        note: note || null,
      },
    });
    if (saved) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Back a player"
      description="From now until it's ended, the player's results go to the stake."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Who's putting up the money">
          {(props) => (
            <Select {...props} name="lender" defaultValue={detail.myPlayerId}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Who's playing it">
          {(props) => (
            <Select
              {...props}
              name="borrower"
              defaultValue={players.find((p) => p.id !== detail.myPlayerId)?.id}
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
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
        <Field
          label="Backer's share of winnings (%)"
          hint="If the player loses, the backer gets back what's left of the stake."
        >
          {(props) => (
            <Input
              {...props}
              name="share"
              inputMode="numeric"
              defaultValue="50"
              autoComplete="off"
              className="tabular-nums"
            />
          )}
        </Field>
        <Field label="Note (optional)">
          {(props) => <Input {...props} name="note" maxLength={280} autoComplete="off" />}
        </Field>
        {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" disabled={create.pending}>
          {create.pending ? "Saving…" : "Back them"}
        </Button>
      </form>
    </Dialog>
  );
}

function VoidStakeDialog({
  view,
  title,
  onClose,
}: {
  view: StakeView;
  title: string;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const voidStake = useAction(stacks.Client.mutation("stakes", "void"));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    const done = await voidStake.run({
      params: { stakeId: view.stake.id },
      payload: { reason: reason || null },
    });
    if (done) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Void this stake?"
      description={`${title}. It stays listed, crossed out, and stops counting toward balances.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Reason (optional)">
          {(props) => <Input {...props} name="reason" maxLength={280} autoComplete="off" />}
        </Field>
        {voidStake.error ? <FormError>{voidStake.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Keep it</Button>
          <Button type="submit" variant="danger" disabled={voidStake.pending}>
            {voidStake.pending ? "Voiding…" : "Void stake"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
