import { useAuth } from "@clerk/react";
import {
  EntryId,
  MinorUnits,
  type CurrencyCode,
  type Entry,
  type GroupDetail,
  type PlayerId,
  type SessionDetail,
} from "@stacks/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { UserPlus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { cn } from "~/components/ui/cn";
import { AddGuestDialog } from "~/features/AddGuestDialog";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { BackLink } from "~/components/ui/Nav";
import { PageTitle, SectionHeading, Surface, Tag } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";
import { EntryDialog, VoidEntryDialog, type EntryDraft } from "~/features/EntryDialogs";
import { isAdmin, playerNames } from "@stacks/client-runtime/format";
import { formatDay, formatDuration, formatTime, gameNames } from "@stacks/client-runtime/format";
import { chipOf } from "@stacks/client-runtime/trip";
import { newId } from "@stacks/client-runtime/ids";
import { formatMoney, parseMoney } from "@stacks/shared/money";
import { buyInPresets } from "@stacks/shared/table";
import { playerResults, type PlayerResult } from "@stacks/shared/results";
import { useAction, useOutbox, usePending, useStacks, useUnsaved } from "~/lib/stacks";

type EntryInput = {
  readonly kind: EntryDraft["kind"];
  readonly playerId: PlayerId;
  readonly counterpartyId: PlayerId | null;
  readonly amount: MinorUnits;
  readonly note: string | null;
  readonly replacesEntryId: EntryId | null;
};

/**
 * A session: its players, history and what can be done with it. On a trip's Table tab it sits
 * under the trip's own header, so it skips the way back and shows the venue as a section.
 */
export function SessionView({
  session: detail,
  group,
  inTrip = false,
}: {
  session: SessionDetail;
  group: GroupDetail;
  inTrip?: boolean;
}) {
  const { session, venue } = detail;
  const { userId } = useAuth();
  const names = playerNames(group);
  const currency = group.group.currency;
  const live = session.status === "live";
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [voiding, setVoiding] = useState<Entry | null>(null);
  const [closing, setClosing] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const outbox = useOutbox();
  const stacks = useStacks();
  const voidEntry = useAction(stacks.Client.mutation("ledger", "voidEntry"));
  // Entries recorded here count as soon as they're recorded, until this page has them back from
  // the server, except ones it refused.
  const { pending: unsaved, sent } = useUnsaved(session.id, detail.entries);
  const recorded = [...sent, ...unsaved.filter((p) => p.failed === null)].map((p) => p.entry);
  const replaced = new Set(recorded.map((entry) => entry.replacesEntryId));
  const counted = [
    ...detail.entries.map((entry) =>
      replaced.has(entry.id) ? { ...entry, voidedAt: entry.occurredAt } : entry,
    ),
    ...recorded.map((entry) => ({ ...entry, voidedAt: null })),
  ];
  const resultOf = playerResults(counted);
  const cashedOut = new Set(
    counted.filter((e) => e.kind === "cash_out" && e.voidedAt === null).map((e) => e.playerId),
  );
  const canVoid = (entry: Entry) =>
    isAdmin(group) || entry.createdBy === userId || entry.playerId === group.myPlayerId;
  const lastBuyIn = (playerId: PlayerId) =>
    counted.findLast(
      (e) =>
        e.kind === "buy_in" &&
        e.playerId === playerId &&
        e.voidedAt === null &&
        e.counterpartyId === null,
    );
  const record = (input: EntryInput) => {
    const id = EntryId.make(newId());
    void outbox.add(session.id, { ...input, id, occurredAt: DateTime.nowUnsafe() });
    return id;
  };
  // A rebuy's button turns into Undo for a few seconds, right where it was pressed.
  const [rebought, setRebought] = useState<ReadonlyMap<PlayerId, EntryId>>(new Map());
  const forget = (playerId: PlayerId, id?: EntryId) =>
    setRebought((all) => {
      if (id !== undefined && all.get(playerId) !== id) return all;
      const next = new Map(all);
      next.delete(playerId);
      return next;
    });
  const rebuy = (playerId: PlayerId, amount: Entry["amount"]) => {
    const id = record({
      kind: "buy_in",
      playerId,
      counterpartyId: null,
      amount,
      note: null,
      replacesEntryId: null,
    });
    setRebought((all) => new Map(all).set(playerId, id));
    setTimeout(() => forget(playerId, id), UNDO_MS);
  };
  const undo = async (id: EntryId) => {
    // An entry the server never got just leaves the outbox; one it has gets voided.
    await outbox.flush();
    if (outbox.pending().some((p) => p.entry.id === id)) return outbox.discard(id);
    await voidEntry.run({ params: { entryId: id }, payload: { reason: "Undone" } });
  };
  // While playing you come first; once closed, the table reads like a receipt, best result first.
  const seats = detail.playerIds.toSorted((a, b) =>
    live
      ? Number(b === group.myPlayerId) - Number(a === group.myPlayerId)
      : (resultOf.get(b)?.net ?? 0) - (resultOf.get(a)?.net ?? 0),
  );
  // Results already in when the page opened just sit there; ones that land here rack up.
  const [settledAtOpen] = useState(() => (live ? cashedOut : new Set(detail.playerIds)));
  const [closedAtOpen] = useState(!live);

  return (
    <>
      <div className={inTrip ? "flex flex-col gap-4" : "flex flex-col gap-4 pt-2"}>
        {inTrip ? null : (
          <BackLink to="/trips/$tripId" params={{ tripId: session.tripId }}>
            {group.trips.find((trip) => trip.id === session.tripId)?.name ?? group.group.name}
          </BackLink>
        )}
        <div className="flex flex-col gap-2">
          {inTrip ? (
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-3xl leading-none uppercase">{venue.name}</h2>
              <p className="text-sm text-muted">
                {gameNames[session.game]} · {formatDay(session.startedAt)}
              </p>
            </div>
          ) : (
            <PageTitle context={`${gameNames[session.game]} · ${formatDay(session.startedAt)}`}>
              {venue.name}
            </PageTitle>
          )}
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {live ? <Tag tone="live">Live</Tag> : <Tag>Closed</Tag>}
            {formatTime(session.startedAt)}
            {/* Imported sessions end when they start: no length was recorded. */}
            {session.endedAt && DateTime.isGreaterThan(session.endedAt, session.startedAt)
              ? ` to ${formatTime(session.endedAt)} (${formatDuration(session.startedAt, session.endedAt)})`
              : ""}
          </p>
        </div>
        <TicketStub
          players={detail.playerIds.length}
          results={[...resultOf.values()]}
          currency={currency}
        />
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
          {seats.map((playerId, rank) => {
            const result = resultOf.get(playerId);
            const name = names.get(playerId) ?? "Player";
            const lastRebuy = lastBuyIn(playerId);
            const undoable = rebought.get(playerId);
            const out = cashedOut.has(playerId);
            const bought = result !== undefined && result.buyIn > 0;
            // A closed session's results are final, cash-out or not.
            const final = result !== undefined && (!live || out);
            const status = final
              ? formatMoney(result.net, currency, { signDisplay: "exceptZero" })
              : bought
                ? `in ${formatMoney(result.buyIn, currency)}, playing`
                : "no buy-in yet";
            const row = (
              <>
                <Chip chip={chipOf(group, playerId)} name={name} size={30} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-display text-lg leading-tight tracking-wide uppercase">
                    {name}
                    {playerId === group.myPlayerId ? (
                      <span className="font-sans text-sm tracking-normal text-muted normal-case">
                        {" "}
                        you
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm whitespace-nowrap text-muted tabular-nums">
                    {result && result.buyIn === 0 && result.cashOut === 0 ? null : result ? (
                      <>
                        In <Money amount={result.buyIn} currency={currency} /> · Out{" "}
                        <Money amount={result.cashOut} currency={currency} />
                      </>
                    ) : (
                      "No buy-ins yet"
                    )}
                  </span>
                </span>
                {final ? (
                  <span
                    key={live ? "live" : "closed"}
                    className={cn(
                      "text-right text-lg font-bold whitespace-nowrap",
                      (live ? !settledAtOpen.has(playerId) : !closedAtOpen) &&
                        "motion-safe:animate-rack",
                    )}
                    style={live ? undefined : { animationDelay: `${rank * 90}ms` }}
                  >
                    <Money amount={result.net} currency={currency} tone="result" />
                  </span>
                ) : null}
              </>
            );
            return (
              <div key={playerId} className="flex items-center gap-3 pr-4">
                {live ? (
                  <button
                    type="button"
                    aria-label={`${name}, ${status}`}
                    title="Record a buy-in, cash-out or adjustment"
                    onClick={() =>
                      setDraft({ kind: bought && !out ? "cash_out" : "buy_in", playerId })
                    }
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 text-left transition-colors duration-150 hover:bg-sunken"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5">{row}</div>
                )}
                {!live || out ? null : undoable ? (
                  <Button
                    size="sm"
                    className="min-w-20"
                    aria-label={`Undo rebuy for ${name}`}
                    onClick={() => {
                      forget(playerId);
                      void undo(undoable);
                    }}
                  >
                    Undo
                  </Button>
                ) : lastRebuy ? (
                  <Button
                    size="sm"
                    variant="tint"
                    className="min-w-20 font-mono"
                    aria-label={`Rebuy for ${name}`}
                    onClick={() => rebuy(playerId, lastRebuy.amount)}
                  >
                    +{formatMoney(lastRebuy.amount, currency)}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="min-w-20"
                    aria-label={`Buy in for ${name}`}
                    onClick={() => setDraft({ kind: "buy_in", playerId })}
                  >
                    Buy in
                  </Button>
                )}
              </div>
            );
          })}
        </Surface>
        {live ? (
          <p className="text-sm text-muted">
            Pick a player to cash them out or record anything else.
          </p>
        ) : null}
        {voidEntry.error ? <FormError>{voidEntry.error}</FormError> : null}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>History</SectionHeading>
        {detail.entries.length === 0 && unsaved.length === 0 ? (
          <p className="text-sm text-muted">
            Buy-ins and cash-outs show up here as you record them.
          </p>
        ) : (
          <Surface className="divide-y divide-line">
            {unsaved.toReversed().map(({ entry, failed }) => (
              <div key={entry.id} className="flex items-center gap-4 px-5 py-3">
                <span className="w-16 shrink-0 font-mono text-xs text-muted">
                  {entry.occurredAt ? formatTime(entry.occurredAt) : ""}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span>
                    {names.get(entry.playerId)} {verbs[entry.kind]}{" "}
                    <Money
                      amount={entry.amount}
                      currency={currency}
                      tone={entry.kind === "adjustment" ? "result" : "plain"}
                      className="font-medium"
                    />
                  </span>
                  <span className={failed ? "text-sm text-danger" : "text-sm text-muted"}>
                    {failed ?? "Saved in this browser, sending"}
                  </span>
                </div>
                {failed ? (
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => void outbox.retry(entry.id)}>
                      Try again
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => outbox.discard(entry.id)}>
                      Discard
                    </Button>
                  </span>
                ) : null}
              </div>
            ))}
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
          presets={buyInPresets(counted, draft.playerId)}
          onClose={() => setDraft(null)}
        />
      ) : null}
      <VoidEntryDialog entry={voiding} onClose={() => setVoiding(null)} />
      <CloseSessionDialog
        detail={detail}
        playing={seats
          .filter((id) => (resultOf.get(id)?.buyIn ?? 0) > 0 && !cashedOut.has(id))
          .map((id) => ({ id, name: names.get(id) ?? "Player" }))}
        currency={currency}
        record={record}
        open={closing}
        onOpenChange={setClosing}
      />
      <AddPlayerDialog
        detail={detail}
        group={group}
        open={addingPlayer}
        onOpenChange={setAddingPlayer}
      />
    </>
  );
}

/** The table at a glance, like the stub of a betting ticket: who sat down, what went in and out. */
function TicketStub({
  players: seated,
  results,
  currency,
}: {
  players: number;
  results: ReadonlyArray<PlayerResult>;
  currency: CurrencyCode;
}) {
  const total = (pick: (result: PlayerResult) => number) =>
    MinorUnits.make(results.reduce((sum, result) => sum + pick(result), 0));
  const buyIn = total((r) => r.buyIn);
  const cashOut = total((r) => r.cashOut);
  const players = { label: "Players", value: <>{seated}</> };
  // Imported sessions only have each player's net, so there's no money in or out to show.
  const cells =
    buyIn === 0 && cashOut === 0
      ? [
          players,
          {
            label: "Table net",
            value: <Money amount={total((r) => r.net)} currency={currency} tone="result" />,
          },
        ]
      : [
          players,
          { label: "In", value: <Money amount={buyIn} currency={currency} /> },
          { label: "Out", value: <Money amount={cashOut} currency={currency} /> },
        ];
  return (
    <dl className="grid auto-cols-fr grid-flow-col divide-x divide-dashed divide-line-strong rounded-xl border border-dashed border-line-strong">
      {cells.map((cell) => (
        <div key={cell.label} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
          <dt className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
            {cell.label}
          </dt>
          <dd className="truncate font-mono text-base font-bold">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const UNDO_MS = 5000;

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
      <span className="w-16 shrink-0 font-mono text-xs text-muted">
        {formatTime(entry.occurredAt)}
      </span>
      <div
        className={
          voided ? "flex min-w-0 flex-1 flex-col text-muted" : "flex min-w-0 flex-1 flex-col"
        }
      >
        <span className={voided ? "line-through" : undefined}>
          {names.get(entry.playerId)}{" "}
          {entry.kind === "cash_out" && entry.amount === 0 ? (
            "busted"
          ) : (
            <>
              {verbs[entry.kind]}{" "}
              <Money
                amount={entry.amount}
                currency={group.group.currency}
                tone={entry.kind === "adjustment" ? "result" : "plain"}
                className="font-medium"
              />
            </>
          )}
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
      <Button
        variant="primary"
        size="lg"
        className="w-full sm:w-auto sm:self-start"
        onClick={onClose}
      >
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

/**
 * Closes the table, taking the cash-outs of anyone still playing on the way, and can open the
 * next table with the same people.
 */
function CloseSessionDialog({
  detail,
  playing,
  currency,
  record,
  open,
  onOpenChange,
}: {
  detail: SessionDetail;
  playing: ReadonlyArray<{ readonly id: PlayerId; readonly name: string }>;
  currency: CurrencyCode;
  record: (input: EntryInput) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const close = useAction(stacks.Client.mutation("sessions", "close"));
  const outbox = useOutbox();
  const unsent = usePending(detail.session.id).length;
  const [missing, setMissing] = useState(false);
  const confirm = async (form: HTMLFormElement, next: boolean) => {
    const data = new FormData(form);
    const cashOuts = playing.map((player) => ({
      player,
      amount: Option.getOrNull(parseMoney(String(data.get(player.id) ?? ""), currency)),
    }));
    if (cashOuts.some(({ amount }) => amount === null || amount < 0)) return setMissing(true);
    setMissing(false);
    for (const { player, amount } of cashOuts)
      record({
        kind: "cash_out",
        playerId: player.id,
        counterpartyId: null,
        amount: amount!,
        note: null,
        replacesEntryId: null,
      });
    // Closing first would make the server refuse what's still waiting to be sent.
    await outbox.flush();
    if (outbox.pending().some((p) => p.sessionId === detail.session.id)) return;
    const closed = await close.run({ params: { sessionId: detail.session.id }, payload: {} });
    if (!closed) return;
    onOpenChange(false);
    if (next)
      void navigate({
        to: "/trips/$tripId/sessions/new",
        params: { tripId: detail.session.tripId },
        search: { from: detail.session.id },
      });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Close this session?"
      description="Results lock in and the session stops taking entries. An admin can reopen it."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
          void confirm(event.currentTarget, next === "move");
        }}
      >
        {playing.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">What did everyone still playing leave with?</p>
            {playing.map((player) => (
              <Field key={player.id} label={player.name}>
                {(props) => (
                  <Input
                    {...props}
                    name={player.id}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0 if they busted"
                    className="font-mono"
                  />
                )}
              </Field>
            ))}
            {missing ? (
              <FormError>Enter what each of them cashed out, 0 if they busted.</FormError>
            ) : null}
          </div>
        ) : null}
        {unsent > 0 ? (
          <FormError>
            {unsent === 1 ? "1 entry hasn't" : `${unsent} entries haven't`} reached Stacks yet.
            Close once they have, so nothing is left out.
          </FormError>
        ) : null}
        {close.error ? <FormError>{close.error}</FormError> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Keep playing</Button>
          <Button
            type="submit"
            value="move"
            disabled={close.pending}
            title="Close and start another session with the same players"
          >
            Close and move tables
          </Button>
          <Button type="submit" variant="primary" disabled={close.pending}>
            {close.pending ? "Closing…" : "Close session"}
          </Button>
        </div>
      </form>
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
  const [addingGuest, setAddingGuest] = useState(false);
  const seated = new Set(detail.playerIds);
  const available = group.players.filter(
    (player) => !seated.has(player.id) && (player.role !== null || player.userId === null),
  );
  const seat = async (playerId: PlayerId) => {
    const done = await add.run({ params: { sessionId: detail.session.id }, payload: { playerId } });
    if (done) onOpenChange(false);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const playerId = String(new FormData(event.currentTarget).get("playerId") ?? "");
    const player = available.find((p) => p.id === playerId);
    if (player) void seat(player.id);
  };
  return (
    <>
      <Dialog open={open && !addingGuest} onOpenChange={onOpenChange} title="Add a player">
        <div className="flex flex-col gap-4">
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
              <Button type="submit" variant="primary" size="lg" disabled={add.pending}>
                Add to session
              </Button>
            </form>
          )}
          {add.error ? <FormError>{add.error}</FormError> : null}
          <Button variant="ghost" onClick={() => setAddingGuest(true)}>
            Not in the group? Add a guest
          </Button>
        </div>
      </Dialog>
      <AddGuestDialog
        detail={group}
        open={open && addingGuest}
        onOpenChange={setAddingGuest}
        onAdded={(id) => void seat(id)}
      />
    </>
  );
}
