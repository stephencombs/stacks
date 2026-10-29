import { useAuth } from "@clerk/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  SessionId,
  type Entry,
  type GroupDetail,
  type PlayerId,
  type SessionDetail,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { ChevronLeft, UserPlus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError, Select } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { SectionHeading, Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { EntryDialog, VoidEntryDialog, type EntryDraft } from "~/features/EntryDialogs";
import { isAdmin, playerNames } from "@stacks/client-runtime/format";
import { formatDay, formatDuration, formatTime, gameNames } from "@stacks/client-runtime/format";
import { formatMoney } from "@stacks/shared/money";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/sessions/$sessionId")({ component: SessionPage });

function SessionPage() {
  const { sessionId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.session(SessionId.make(sessionId))}
      skeleton={<Skeleton className="mt-4 h-96" />}
    >
      {(session) => (
        <Loaded
          query={stacks.group(session.session.groupId)}
          skeleton={<Skeleton className="mt-4 h-96" />}
        >
          {(group) => <SessionView session={session} group={group} />}
        </Loaded>
      )}
    </Loaded>
  );
}

function SessionView({ session: detail, group }: { session: SessionDetail; group: GroupDetail }) {
  const { session, venue } = detail;
  const { userId } = useAuth();
  const names = playerNames(group);
  const currency = group.group.currency;
  const live = session.status === "live";
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [voiding, setVoiding] = useState<Entry | null>(null);
  const [closing, setClosing] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const resultOf = new Map(detail.results.map((result) => [result.playerId, result]));
  const cashedOut = new Set(
    detail.entries
      .filter((e) => e.kind === "cash_out" && e.voidedAt === null)
      .map((e) => e.playerId),
  );
  const canVoid = (entry: Entry) =>
    isAdmin(group) || entry.createdBy === userId || entry.playerId === group.myPlayerId;

  return (
    <>
      <div className="flex flex-col gap-3 pt-4">
        <Link
          to="/trips/$tripId"
          params={{ tripId: session.tripId }}
          className="-ml-1 inline-flex items-center gap-1 self-start text-sm text-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {group.trips.find((trip) => trip.id === session.tripId)?.name ?? group.group.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-4xl font-medium">{venue.name}</h1>
          {live ? <Tag tone="live">Live</Tag> : <Tag>Closed</Tag>}
        </div>
        <p className="text-muted">
          {gameNames[session.game]} · {formatDay(session.startedAt)} ·{" "}
          {formatTime(session.startedAt)}
          {/* Imported sessions end when they start: no length was recorded. */}
          {session.endedAt && DateTime.isGreaterThan(session.endedAt, session.startedAt)
            ? ` to ${formatTime(session.endedAt)} (${formatDuration(session.startedAt, session.endedAt)})`
            : ""}
        </p>
        {session.notes ? (
          <p className="max-w-[65ch] text-sm text-pretty whitespace-pre-line">{session.notes}</p>
        ) : null}
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeading
          action={
            live ? (
              <Button size="sm" variant="ghost" onClick={() => setAddingPlayer(true)}>
                <UserPlus className="size-4" aria-hidden />
                Add player
              </Button>
            ) : null
          }
        >
          Players
        </SectionHeading>
        <Surface className="divide-y divide-line">
          {detail.playerIds.map((playerId) => {
            const result = resultOf.get(playerId);
            return (
              <div
                key={playerId}
                className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{names.get(playerId)}</span>
                    <span className="text-sm whitespace-nowrap text-muted tabular-nums">
                      {result && result.buyIn === 0 && result.cashOut === 0 ? (
                        "Net result only"
                      ) : result ? (
                        <>
                          In <Money amount={result.buyIn} currency={currency} /> · Out{" "}
                          <Money amount={result.cashOut} currency={currency} />
                        </>
                      ) : (
                        "No buy-ins yet"
                      )}
                    </span>
                  </div>
                  <div className="text-right font-serif text-xl whitespace-nowrap">
                    {/* A closed session's results are final, cash-out or not. */}
                    {result && (!live || cashedOut.has(playerId)) ? (
                      <Money amount={result.net} currency={currency} tone="result" />
                    ) : result ? (
                      <span className="font-sans text-sm text-muted">Playing</span>
                    ) : null}
                  </div>
                </div>
                {live ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      aria-label={`Buy in for ${names.get(playerId)}`}
                      onClick={() => setDraft({ kind: "buy_in", playerId })}
                    >
                      Buy in
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      aria-label={`Cash out for ${names.get(playerId)}`}
                      onClick={() => setDraft({ kind: "cash_out", playerId })}
                    >
                      Cash out
                    </Button>
                    <Menu label={`More for ${names.get(playerId)}`}>
                      <MenuItem onClick={() => setDraft({ kind: "adjustment", playerId })}>
                        Adjust result
                      </MenuItem>
                    </Menu>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Surface>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>History</SectionHeading>
        {detail.entries.length === 0 ? (
          <p className="text-sm text-muted">
            Buy-ins and cash-outs show up here as you record them.
          </p>
        ) : (
          <Surface className="divide-y divide-line">
            {detail.entries.toReversed().map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                names={names}
                group={group}
                actions={
                  live && entry.voidedAt === null && canVoid(entry) ? (
                    <Menu
                      label={`Actions for ${names.get(entry.playerId)} ${verbs[entry.kind]} ${formatMoney(entry.amount, currency)}`}
                    >
                      {entry.kind !== "settlement" ? (
                        <MenuItem
                          onClick={() =>
                            setDraft({
                              kind: entry.kind as EntryDraft["kind"],
                              playerId: entry.playerId,
                              replaces: entry,
                            })
                          }
                        >
                          Correct
                        </MenuItem>
                      ) : null}
                      <MenuItem tone="danger" onClick={() => setVoiding(entry)}>
                        Void
                      </MenuItem>
                    </Menu>
                  ) : null
                }
              />
            ))}
          </Surface>
        )}
      </section>

      <SessionStatusActions detail={detail} group={group} onClose={() => setClosing(true)} />

      {draft ? (
        <EntryDialog
          key={`${draft.kind}:${draft.playerId}:${draft.replaces?.id ?? ""}`}
          detail={group}
          sessionId={session.id}
          draft={draft}
          onClose={() => setDraft(null)}
        />
      ) : null}
      <VoidEntryDialog entry={voiding} onClose={() => setVoiding(null)} />
      <CloseSessionDialog detail={detail} open={closing} onOpenChange={setClosing} />
      <AddPlayerDialog
        detail={detail}
        group={group}
        open={addingPlayer}
        onOpenChange={setAddingPlayer}
      />
    </>
  );
}

const verbs = {
  buy_in: "bought in",
  cash_out: "cashed out",
  adjustment: "adjusted",
  settlement: "paid",
} as const;

function EntryRow({
  entry,
  names,
  group,
  actions,
}: {
  entry: Entry;
  names: ReadonlyMap<PlayerId, string>;
  group: GroupDetail;
  actions: ReactNode;
}) {
  const voided = entry.voidedAt !== null;
  const counterparty = entry.counterpartyId ? names.get(entry.counterpartyId) : null;
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <span className="w-16 shrink-0 text-sm text-muted tabular-nums">
        {formatTime(entry.occurredAt)}
      </span>
      <div
        className={
          voided ? "flex min-w-0 flex-1 flex-col text-muted" : "flex min-w-0 flex-1 flex-col"
        }
      >
        <span className={voided ? "line-through" : undefined}>
          {names.get(entry.playerId)} {verbs[entry.kind]}{" "}
          <Money
            amount={entry.amount}
            currency={group.group.currency}
            tone={entry.kind === "adjustment" ? "result" : "plain"}
            className="font-medium"
          />
        </span>
        {counterparty || entry.note || voided ? (
          <span className="text-sm text-muted">
            {[
              counterparty && entry.kind === "buy_in" ? `${counterparty} paid` : null,
              counterparty && entry.kind === "cash_out" ? `${counterparty} has the cash` : null,
              entry.note,
              voided ? `Voided${entry.voidReason ? `: ${entry.voidReason}` : ""}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

function SessionStatusActions({
  detail,
  group,
  onClose,
}: {
  detail: SessionDetail;
  group: GroupDetail;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const reopen = useAction(stacks.Client.mutation("sessions", "reopen"));
  if (detail.session.status === "live") {
    return (
      <Button variant="primary" size="lg" className="self-start" onClick={onClose}>
        Close session
      </Button>
    );
  }
  if (!isAdmin(group)) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={() => void reopen.run({ params: { sessionId: detail.session.id } })}
        disabled={reopen.pending}
      >
        {reopen.pending ? "Reopening…" : "Reopen session"}
      </Button>
      <p className="text-sm text-muted">
        Reopen to fix a mistake. Closed sessions can't be edited.
      </p>
      {reopen.error ? <FormError>{reopen.error}</FormError> : null}
    </div>
  );
}

function CloseSessionDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: SessionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const close = useAction(stacks.Client.mutation("sessions", "close"));
  const confirm = async () => {
    const closed = await close.run({ params: { sessionId: detail.session.id }, payload: {} });
    if (closed) onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Close this session?"
      description="Results lock in and the session stops taking entries. An admin can reopen it."
    >
      <div className="flex flex-col gap-4">
        {close.error ? <FormError>{close.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Keep playing</Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={close.pending}>
            {close.pending ? "Closing…" : "Close session"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AddPlayerDialog({
  detail,
  group,
  open,
  onOpenChange,
}: {
  detail: SessionDetail;
  group: GroupDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const add = useAction(stacks.Client.mutation("sessions", "addPlayer"));
  const seated = new Set(detail.playerIds);
  const available = group.players.filter(
    (player) => !seated.has(player.id) && (player.role !== null || player.userId === null),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const playerId = String(new FormData(event.currentTarget).get("playerId") ?? "");
    const player = available.find((p) => p.id === playerId);
    if (!player) return;
    const done = await add.run({
      params: { sessionId: detail.session.id },
      payload: { playerId: player.id },
    });
    if (done) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add a player">
      {available.length === 0 ? (
        <p className="text-sm text-muted">Everyone in the group is already in this session.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Select name="playerId" aria-label="Player">
            {available.map((player) => (
              <option key={player.id} value={player.id}>
                {player.displayName}
              </option>
            ))}
          </Select>
          {add.error ? <FormError>{add.error}</FormError> : null}
          <Button type="submit" variant="primary" size="lg" disabled={add.pending}>
            Add to session
          </Button>
        </form>
      )}
    </Dialog>
  );
}
