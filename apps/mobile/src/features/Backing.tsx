import { useAuth } from "@clerk/expo";
import {
  PlayerId,
  StakeId,
  UserId,
  type GroupDetail,
  type StakeView,
  type TripDetail,
} from "@stacks/contracts";
import { canChangeStake, playerNames, stakeLines } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { useState } from "react";
import { Text, View } from "react-native";

import { confirmAction } from "../components/ui/confirmAction";
import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { useAction, useStacks } from "../lib/stacks";

/** Stakes: money one player gave another to play with, and what comes back. */
export function BackingSection({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const { userId } = useAuth();
  const names = playerNames(detail);
  const [backing, setBacking] = useState(false);
  const [managing, setManaging] = useState<StakeView | null>(null);
  const me = userId ? UserId.make(userId) : null;

  return (
    <View className="gap-2">
      <SectionHeading
        action={
          <Button
            label="Back a player"
            size="sm"
            variant="ghost"
            onPress={() => setBacking(true)}
          />
        }
      >
        Backing
      </SectionHeading>
      {trip.stakes.length === 0 ? (
        <Text className="rounded-2xl border border-line bg-surface p-4 type-footnote text-muted">
          When someone gives another player money to play with on this trip, add it here. The backer
          gets it back plus their share of the winnings, or what's left if it's lost.
        </Text>
      ) : (
        <List>
          {trip.stakes.map((view) => {
            const { title, status } = stakeLines(view, names, detail.group.currency);
            const voided = view.stake.voidedAt !== null;
            const content = (
              <View className="flex-1 gap-0.5">
                <Text
                  className={cn("type-heading", voided ? "text-muted line-through" : "text-ink")}
                >
                  {title}
                </Text>
                <Text className="type-footnote text-muted">
                  {status}
                  {view.stake.note ? ` · ${view.stake.note}` : ""}
                </Text>
              </View>
            );
            return !voided && canChangeStake(detail, view, me) ? (
              <Row
                key={view.stake.id}
                accessibilityHint="End, reopen or void this stake"
                onPress={() => setManaging(view)}
              >
                {content}
              </Row>
            ) : (
              <Row key={view.stake.id}>{content}</Row>
            );
          })}
        </List>
      )}
      {backing ? <BackSheet detail={detail} trip={trip} onClose={() => setBacking(false)} /> : null}
      {managing ? (
        <StakeSheet
          view={managing}
          title={stakeLines(managing, names, detail.group.currency).title}
          onClose={() => setManaging(null)}
        />
      ) : null}
    </View>
  );
}

function BackSheet({
  detail,
  trip,
  onClose,
}: {
  detail: GroupDetail;
  trip: TripDetail;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("stakes", "create"));
  const people = detail.players
    .filter((p) => p.role !== null || p.userId === null)
    .map((p) => ({ value: p.id, label: p.displayName }));
  const [lender, setLender] = useState<PlayerId>(detail.myPlayerId);
  const [borrower, setBorrower] = useState<PlayerId>(
    people.find((p) => p.value !== detail.myPlayerId)?.value ?? detail.myPlayerId,
  );
  const [amount, setAmount] = useState("");
  const [share, setShare] = useState("50");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    const value = Option.getOrNull(parseMoney(amount, detail.group.currency));
    const percent = Number(share.trim());
    if (lender === borrower) return setProblem("Pick two different people.");
    if (value === null || value <= 0) return setProblem("Enter how much they put up.");
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      return setProblem("The backer's share is a whole percent from 0 to 100.");
    }
    setProblem(null);
    const saved = await create.run({
      params: { tripId: trip.trip.id },
      payload: {
        id: StakeId.make(newId()),
        lenderId: lender,
        borrowerId: borrower,
        amount: value,
        lenderShare: percent,
        note: note.trim() || null,
      },
    });
    if (saved) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Back a player"
      description="From now until it's ended, the player's results go to the stake."
      footer={
        <Button
          label="Back them"
          variant="primary"
          size="lg"
          pending={create.pending}
          onPress={() => void submit()}
        />
      }
    >
      <Choice
        label="Who's putting up the money"
        options={people}
        value={lender}
        onChange={setLender}
      />
      <Choice label="Who's playing it" options={people} value={borrower} onChange={setBorrower} />
      <TextField
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        inputClassName="tabular-nums"
      />
      <TextField
        label="Backer's share of winnings (%)"
        value={share}
        onChangeText={setShare}
        keyboardType="number-pad"
        hint="If the player loses, the backer gets back what's left of the stake."
      />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={280} />
      {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
    </Sheet>
  );
}

function StakeSheet({
  view,
  title,
  onClose,
}: {
  view: StakeView;
  title: string;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const end = useAction(stacks.Client.mutation("stakes", "end"));
  const reopen = useAction(stacks.Client.mutation("stakes", "reopen"));
  const voidStake = useAction(stacks.Client.mutation("stakes", "void"));
  const [reason, setReason] = useState("");
  const params = { stakeId: view.stake.id };
  const done = (ok: unknown) => (ok ? onClose() : undefined);
  const error = end.error ?? reopen.error ?? voidStake.error;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Backing"
      busy={end.pending || reopen.pending || voidStake.pending}
      footer={
        view.stake.endedAt === null ? (
          <Button
            label="End stake"
            variant="primary"
            size="lg"
            pending={end.pending}
            disabled={reopen.pending || voidStake.pending}
            onPress={() => void end.run({ params, payload: {} }).then(done)}
          />
        ) : (
          <Button
            label="Reopen stake"
            variant="primary"
            size="lg"
            pending={reopen.pending}
            disabled={end.pending || voidStake.pending}
            onPress={() => void reopen.run({ params }).then(done)}
          />
        )
      }
    >
      <Text className="type-heading text-ink">{title}</Text>
      <Text className="type-footnote text-muted">
        {view.stake.endedAt === null ? "Open stake" : "Ended stake"}
      </Text>
      <Text className="text-sm text-muted">
        Voided stakes stay listed, crossed out, and stop counting toward balances.
      </Text>
      <TextField
        label="Reason for voiding (optional)"
        value={reason}
        onChangeText={setReason}
        maxLength={280}
      />
      <Button
        label="Void stake"
        variant="danger"
        disabled={end.pending || reopen.pending || voidStake.pending}
        onPress={() =>
          confirmAction(
            "Void this stake?",
            "It will stay in the history but stop counting toward balances.",
            "Void stake",
            () => {
              void voidStake.run({ params, payload: { reason: reason.trim() || null } }).then(done);
            },
          )
        }
      />
      {error ? <FormError>{error}</FormError> : null}
    </Sheet>
  );
}
