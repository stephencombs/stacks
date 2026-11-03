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
import { Button, ButtonLink } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { cn } from "~/components/ui/cn";
import { AddGuestDialog } from "~/features/AddGuestDialog";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { BackLink } from "~/components/ui/Nav";
import { Note, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowText, Tag } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";
import { PlayerName } from "~/features/Player";
import { EntryDialog, VoidEntryDialog, type EntryDraft } from "~/features/EntryDialogs";
import { SeatHero, TableStats } from "~/features/SeatHero";
import { TableMap } from "~/features/TableMap";
import { LimitNotices } from "~/features/PersonalLimits";
import { Tonight } from "~/features/TripBoard";
import { isAdmin, playerNames } from "@stacks/client-runtime/format";
import { formatDay, formatDuration, formatTime, gameNames } from "@stacks/client-runtime/format";
import { tableView } from "@stacks/client-runtime/table";
import { chipOf } from "@stacks/client-runtime/trip";
import { newId } from "@stacks/client-runtime/ids";
import { formatMoney, parseMoney } from "@stacks/shared/money";
import { seatCount, seatsNow } from "@stacks/shared/seats";
import { buyInPresets } from "@stacks/shared/table";
import { playerResults, type PlayerResult } from "@stacks/shared/results";
import {
  Loaded,
  useAction,
  useOutbox,
  usePending,
  useRememberTrip,
  useStacks,
  useUnsaved,
} from "~/lib/stacks";

type EntryInput = {
  readonly kind: EntryDraft["kind"];
  readonly playerId: PlayerId;
  readonly counterpartyId: PlayerId | null;
  readonly amount: MinorUnits;
  readonly note: string | null;
  readonly replacesEntryId: EntryId | null;
};

export function SessionView({
  session: detail,
  group,
}: {
  session: SessionDetail;
  group: GroupDetail;
}) {
  const { session, venue } = detail;
  const { userId } = useAuth();
  useRememberTrip(session.tripId);
  const trip = group.trips.find((t) => t.id === session.tripId);
  const tripEnded = trip ? trip.endedAt !== null : false;
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
    ...recorded.map((entry) => ({
      ...entry,
      voidedAt: replaced.has(entry.id) ? (entry.occurredAt ?? session.startedAt) : null,
    })),
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
  const results = [...resultOf.values()];
  const total = (pick: (result: PlayerResult) => number) =>
    results.reduce((sum, result) => sum + pick(result), 0);
  const buyIn = total((r) => r.buyIn);
  const cashOut = total((r) => r.cashOut);
  const mySeated = detail.playerIds.includes(group.myPlayerId);
  const focusPlayerId =
    mySeated && !cashedOut.has(group.myPlayerId)
      ? group.myPlayerId
      : (seats.find((id) => !cashedOut.has(id)) ?? seats[0]);
  // Imported sessions end when they start: no length was recorded.
  const timed = session.endedAt && DateTime.isGreaterThan(session.endedAt, session.startedAt);
  const facts = (
    <>
      {trip ? `${trip.name} · ` : ""}
      {gameNames[session.game]} · {formatDay(session.startedAt)} · {formatTime(session.startedAt)}
      {timed
        ? ` to ${formatTime(session.endedAt!)} (${formatDuration(session.startedAt, session.endedAt!)})`
        : ""}
    </>
  );
  // Imported sessions only have each player's net, so there's no money in or out to show.
  const tableStats = (
    <TableStats
      items={[
        { label: "Players", value: detail.playerIds.length },
        ...(buyIn === 0 && cashOut === 0
          ? [
              {
                label: "Table net",
                value: <Money amount={total((r) => r.net)} currency={currency} tone="result" />,
              },
            ]
          : [
              { label: "In", value: <Money amount={buyIn} currency={currency} /> },
              { label: "Out", value: <Money amount={cashOut} currency={currency} /> },
            ]),
      ]}
    />
  );
  const heroPlayerId = live ? focusPlayerId : mySeated ? group.myPlayerId : undefined;
  const heroRebuy = heroPlayerId === undefined ? undefined : rebought.get(heroPlayerId);
  const notes = session.notes ? (
    <p className="max-w-[65ch] text-sm text-pretty whitespace-pre-line">{session.notes}</p>
  ) : null;

  return (
    <>
      <PageHeader
        back={
          <BackLink to="/trips/$tripId" params={{ tripId: session.tripId }}>
            {trip?.name ?? group.group.name}
          </BackLink>
        }
        options={<HighLimitToggle detail={detail} />}
        title={venue.name}
        tag={<Tag tone={live ? "live" : "neutral"}>{live ? "Live" : "Closed"}</Tag>}
        context={facts}
      >
        {notes}
      </PageHeader>

      <Loaded query={stacks.trip(session.tripId)} skeleton={<></>}>
        {(trip) => (
          <LimitNotices
            group={group}
            trip={trip}
            local={{
              sessionId: session.id,
              status: session.status,
              myJoinedAt: detail.myJoinedAt ?? null,
              playing:
                detail.playerIds.includes(group.myPlayerId) && !cashedOut.has(group.myPlayerId),
              net: resultOf.get(group.myPlayerId)?.net ?? MinorUnits.make(0),
            }}
          />
        )}
      </Loaded>

      {seatCount(session) ? (
        <TableMap
          detail={detail}
          seats={seatCount(session)!}
          view={tableView({
            closed: !live,
            seats: seatsNow(detail.seatings),
            results: resultOf,
            cashedOut,
          })}
          currency={currency}
          names={names}
          chipOf={(playerId) => chipOf(group, playerId)}
        />
      ) : null}
      {tableStats}
      {heroPlayerId ? (
        <SeatHero
          name={names.get(heroPlayerId) ?? "Player"}
          chip={chipOf(group, heroPlayerId)}
          seat={seatsNow(detail.seatings).get(heroPlayerId)}
          you={heroPlayerId === group.myPlayerId}
          result={resultOf.get(heroPlayerId)}
          live={live}
          out={cashedOut.has(heroPlayerId)}
          rebuyAmount={lastBuyIn(heroPlayerId)?.amount}
          undoing={heroRebuy !== undefined}
          currency={currency}
          onBuyIn={() => setDraft({ kind: "buy_in", playerId: heroPlayerId })}
          onRebuy={() => {
            const last = lastBuyIn(heroPlayerId);
            if (last) rebuy(heroPlayerId, last.amount);
          }}
          onUndo={() => {
            forget(heroPlayerId);
            if (heroRebuy) void undo(heroRebuy);
          }}
          onCashOut={() => setDraft({ kind: "cash_out", playerId: heroPlayerId })}
        />
      ) : null}

      <Section
        title="At the table"
        action={
          live ? (
            <Button size="sm" variant="ghost" onClick={() => setAddingPlayer(true)}>
              <UserPlus className="size-4" aria-hidden />
              Add player
            </Button>
          ) : null
        }
      >
        <List>
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
                <Chip chip={chipOf(group, playerId)} name={name} size={28} />
                <RowText
                  title={<PlayerName name={name} you={playerId === group.myPlayerId} />}
                  meta={
                    !result ? (
                      "No buy-ins yet"
                    ) : result.buyIn === 0 && result.cashOut === 0 ? null : (
                      <>
                        In <Money amount={result.buyIn} currency={currency} />
                        {final ? (
                          <>
                            {" "}
                            · Out <Money amount={result.cashOut} currency={currency} />
                          </>
                        ) : null}
                      </>
                    )
                  }
                />
                {final ? (
                  <span
                    key={live ? "live" : "closed"}
                    className={cn(
                      "text-right font-semibold whitespace-nowrap",
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
              <div key={playerId} className="flex min-h-14 items-center gap-3 pr-4">
                {live ? (
                  <button
                    type="button"
                    aria-label={`${name}, ${status}`}
                    title="Record a buy-in, cash-out or adjustment"
                    onClick={() =>
                      setDraft({ kind: bought && !out ? "cash_out" : "buy_in", playerId })
                    }
                    className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-3 pl-4 text-left transition-colors duration-150 hover:bg-sunken focus-visible:-outline-offset-2"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4">{row}</div>
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
                    className="min-w-20 tabular-nums"
                    aria-label={`Rebuy for ${name}`}
                    onClick={() => rebuy(playerId, lastRebuy.amount)}
                  >
                    +{formatMoney(lastRebuy.amount, currency)}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="tint"
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
        </List>
        {live ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-1">
            <Note>Pick a player to cash them out or record anything else.</Note>
            <Button onClick={() => setClosing(true)}>Close session</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {!tripEnded ? (
              <ButtonLink
                to="/trips/$tripId/sessions/new"
                params={{ tripId: session.tripId }}
                search={{ from: session.id }}
                variant="primary"
              >
                Start another session
              </ButtonLink>
            ) : null}
            <ButtonLink
              to="/trips/$tripId/board"
              params={{ tripId: session.tripId }}
              variant={tripEnded ? "primary" : "secondary"}
            >
              See the board
            </ButtonLink>
          </div>
        )}
        {voidEntry.error ? <FormError>{voidEntry.error}</FormError> : null}
      </Section>

      {live ? (
        <Loaded query={stacks.trip(session.tripId)} skeleton={<></>}>
          {(trip) => <Tonight detail={group} trip={trip} sessionId={session.id} />}
        </Loaded>
      ) : null}

      <Section title="History">
        {detail.entries.length === 0 && unsaved.length === 0 ? (
          <Note>Buy-ins and cash-outs show up here as you record them.</Note>
        ) : (
          <List>
            {unsaved.toReversed().map(({ entry, failed }) => (
              <Row key={entry.id}>
                <RowText
                  title={
                    <>
                      {names.get(entry.playerId)} {verbs[entry.kind]}{" "}
                      <Money
                        amount={entry.amount}
                        currency={currency}
                        tone={entry.kind === "adjustment" ? "result" : "plain"}
                      />
                    </>
                  }
                  meta={
                    failed ? (
                      <span className="text-danger">{failed}</span>
                    ) : (
                      "Saved in this browser, sending"
                    )
                  }
                />
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
              </Row>
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
          </List>
        )}
      </Section>

      {live ? null : <ReopenSession detail={detail} group={group} />}

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
  const voidedBy = entry.voidedBy
    ? (group.players.find((player) => player.userId === entry.voidedBy)?.displayName ?? null)
    : null;
  const counterparty = entry.counterpartyId ? names.get(entry.counterpartyId) : null;
  return (
    <Row>
      <RowText
        struck={voided}
        title={
          <>
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
                />
              </>
            )}
          </>
        }
        meta={[
          formatTime(entry.occurredAt),
          counterparty && entry.kind === "buy_in" ? `${counterparty} paid` : null,
          counterparty && entry.kind === "cash_out" ? `${counterparty} has the cash` : null,
          entry.note,
          voided
            ? `${voidedBy ? `Voided by ${voidedBy}` : "Voided"}${entry.voidReason ? `: ${entry.voidReason}` : ""}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      {entry.replacesEntryId ? <Tag>Corrected</Tag> : null}
      {actions}
    </Row>
  );
}

/** A closed session's way back: an admin can reopen it to fix a mistake. */
function ReopenSession({ detail, group }: { detail: SessionDetail; group: GroupDetail }) {
  const stacks = useStacks();
  const reopen = useAction(stacks.Client.mutation("sessions", "reopen"));
  if (!isAdmin(group)) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={() => void reopen.run({ params: { sessionId: detail.session.id } })}
        pending={reopen.pending}
      >
        Reopen session
      </Button>
      <Note>Reopen to fix a mistake. Closed sessions can't be edited.</Note>
      {reopen.error ? <FormError>{reopen.error}</FormError> : null}
    </div>
  );
}

/** Marks the table high limit or not; anyone in the group can, even after it closes. */
function HighLimitToggle({ detail }: { detail: SessionDetail }) {
  const stacks = useStacks();
  const set = useAction(stacks.Client.mutation("sessions", "setHighLimit"));
  const on = detail.session.highLimit;
  return (
    <Button
      size="sm"
      variant={on ? "tint" : "ghost"}
      aria-pressed={on}
      disabled={set.pending}
      title={on ? "Played at a high-limit table" : "Mark as a high-limit table"}
      onClick={() =>
        void set.run({ params: { sessionId: detail.session.id }, payload: { highLimit: !on } })
      }
    >
      High limit
    </Button>
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
  open,
  onOpenChange,
}: {
  detail: SessionDetail;
  playing: ReadonlyArray<{ readonly id: PlayerId; readonly name: string }>;
  currency: CurrencyCode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const close = useAction(stacks.Client.mutation("sessions", "close"));
  const outbox = useOutbox();
  const unsent = usePending(detail.session.id).length;
  const [missing, setMissing] = useState(false);
  const [closing, setClosing] = useState<"close" | "move" | null>(null);
  const sendClose = async (
    cashOuts: ReadonlyArray<{ player: { id: PlayerId }; amount: MinorUnits | null }>,
  ) => {
    // Anything still waiting to be sent goes first, so the close counts it.
    await outbox.flush();
    if (outbox.pending().some((p) => p.sessionId === detail.session.id)) return false;
    // The last cash-outs travel with the close: one request for the whole table.
    return close.run({
      params: { sessionId: detail.session.id },
      payload: {
        cashOuts: cashOuts.map(({ player, amount }) => ({
          id: EntryId.make(newId()),
          playerId: player.id,
          amount: amount!,
        })),
      },
    });
  };
  const confirm = async (form: HTMLFormElement, next: boolean) => {
    const data = new FormData(form);
    const cashOuts = playing.map((player) => ({
      player,
      amount: Option.getOrNull(parseMoney(String(data.get(player.id) ?? ""), currency)),
    }));
    if (cashOuts.some(({ amount }) => amount === null || amount < 0)) return setMissing(true);
    setMissing(false);
    setClosing(next ? "move" : "close");
    const closed = await sendClose(cashOuts).finally(() => setClosing(null));
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
          void confirm(event.currentTarget, false);
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
                    className="tabular-nums"
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
            {unsent === 1 ? "1 entry hasn't" : `${unsent} entries haven't`} reached Color Up yet.
            Close once they have, so nothing is left out.
          </FormError>
        ) : null}
        {close.error ? <FormError>{close.error}</FormError> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Keep playing</Button>
          {/* Not a submit button: Enter in a cash-out field must close, not move tables. */}
          <Button
            disabled={closing !== null}
            pending={closing === "move"}
            onClick={(event) => void confirm(event.currentTarget.form!, true)}
            title="Close and start another session with the same players"
          >
            Close and move tables
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={closing !== null}
            pending={closing === "close"}
          >
            Close session
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
              <Button type="submit" variant="primary" size="lg" pending={add.pending}>
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
