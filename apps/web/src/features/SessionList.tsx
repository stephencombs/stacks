import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import { chipOf, type TripPlay } from "@stacks/client-runtime/trip";
import { nameList } from "@stacks/client-runtime/crew";
import {
  formatDay,
  formatDuration,
  formatTime,
  gameNames,
  playerNames,
  venueLabel,
} from "@stacks/client-runtime/format";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Money } from "~/components/Money";
import { Dialog } from "~/components/ui/Dialog";
import { List, Row, RowButton, RowLink, RowText, Tag } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";

/** Who's still at a live table, by name, members first. */
const playingLine = (
  playing: ReadonlyArray<string>,
  others: ReadonlyArray<{ readonly displayName: string; readonly playing: boolean }> = [],
) => nameList([...playing, ...others.filter((o) => o.playing).map((o) => o.displayName)]) || null;

function SessionRow({ summary, detail }: { summary: SessionSummary; detail: GroupDetail }) {
  const { session, venue, results } = summary;
  const live = session.status === "live";
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  const names = playerNames(detail);
  const who = live ? playingLine(summary.playing.map((id) => names.get(id) ?? "Someone")) : null;
  return (
    <RowLink to="/sessions/$sessionId" params={{ sessionId: session.id }}>
      <RowText
        title={venue.name}
        meta={
          <span className="tabular-nums">
            {who ? `${who} · ` : ""}
            {gameNames[session.game]} · {live ? "since " : ""}
            {formatTime(session.startedAt)}
          </span>
        }
      />
      {live ? <Tag tone="live">Live</Tag> : null}
      {mine && !live ? (
        <Money
          amount={mine.net}
          currency={detail.group.currency}
          tone="result"
          className="font-semibold"
        />
      ) : null}
    </RowLink>
  );
}

/** Read-only breakdown of a table you didn't play in: who sat down and how they finished. */
function TableSummaryDialog({
  play,
  detail,
  onClose,
}: {
  play: Extract<TripPlay, { kind: "table" }>;
  detail: GroupDetail;
  onClose: () => void;
}) {
  const names = playerNames(detail);
  const when = play.live
    ? `Since ${formatTime(play.startedAt)}`
    : play.endedAt
      ? `${formatDay(play.startedAt)} · ${formatTime(play.startedAt)} – ${formatTime(play.endedAt)} (${formatDuration(play.startedAt, play.endedAt)})`
      : `${formatDay(play.startedAt)} · ${formatTime(play.startedAt)}`;
  const description = [
    play.table.game ? gameNames[play.table.game] : "No game set",
    play.table.highLimit ? "High limit" : null,
    when,
  ]
    .filter(Boolean)
    .join(" · ");
  const seenGuests = new Map<string, number>();
  const guestKey = (name: string) => {
    const n = (seenGuests.get(name) ?? 0) + 1;
    seenGuests.set(name, n);
    return `guest-${name}-${n}`;
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={venueLabel(play.venue)}
      description={description}
    >
      {play.playerIds.length === 0 && play.others.length === 0 ? (
        <p className="text-sm text-muted">No players recorded at this table yet.</p>
      ) : (
        <List>
          {play.playerIds.map((playerId) => {
            const name =
              playerId === detail.myPlayerId ? "You" : (names.get(playerId) ?? "Someone");
            const isPlaying = play.playing.includes(playerId);
            const open = play.inPlay.find((item) => item.playerId === playerId);
            const result = play.results.find((item) => item.playerId === playerId);
            return (
              <Row key={playerId}>
                <Chip chip={chipOf(detail, playerId)} name={name} size={28} />
                <RowText
                  title={name}
                  meta={
                    isPlaying ? (
                      open && open.buyIn > 0 ? (
                        <>
                          In for <Money amount={open.buyIn} currency={detail.group.currency} />
                        </>
                      ) : (
                        "Playing"
                      )
                    ) : result ? (
                      <>
                        In <Money amount={result.buyIn} currency={detail.group.currency} /> · Out{" "}
                        <Money amount={result.cashOut} currency={detail.group.currency} />
                      </>
                    ) : undefined
                  }
                />
                {isPlaying ? (
                  <Tag tone="live">Live</Tag>
                ) : result ? (
                  <Money
                    amount={result.net}
                    currency={detail.group.currency}
                    tone="result"
                    className="font-semibold"
                  />
                ) : null}
              </Row>
            );
          })}
          {play.others.map((other) => (
            <Row key={guestKey(other.displayName)}>
              <RowText title={other.displayName} meta="Guest" />
              {other.playing ? (
                <Tag tone="live">Live</Tag>
              ) : (
                <Money
                  amount={other.net}
                  currency={detail.group.currency}
                  tone="result"
                  className="font-semibold"
                />
              )}
            </Row>
          ))}
        </List>
      )}
    </Dialog>
  );
}

/** A table in the trip. Opens your own visit if you played, or a read-only summary if you didn't. */
function TableRow({
  play,
  detail,
}: {
  play: Extract<TripPlay, { kind: "table" }>;
  detail: GroupDetail;
}) {
  const [open, setOpen] = useState(false);
  const mine = play.results.find((result) => result.playerId === detail.myPlayerId);
  const names = playerNames(detail);
  const who = play.live
    ? playingLine(
        play.playing.map((id) => names.get(id) ?? "Someone"),
        play.others,
      )
    : null;
  const content = (
    <>
      <RowText
        title={venueLabel(play.venue)}
        meta={
          <span className="tabular-nums">
            {who ? `${who} · ` : ""}
            {play.table.game ? gameNames[play.table.game] : "No game set"} ·{" "}
            {play.live ? "since " : ""}
            {formatTime(play.startedAt)}
          </span>
        }
      />
      {play.live ? <Tag tone="live">Live</Tag> : null}
      {mine && !play.live ? (
        <Money
          amount={mine.net}
          currency={detail.group.currency}
          tone="result"
          className="font-semibold"
        />
      ) : null}
    </>
  );
  if (play.myVisitId) {
    return (
      <RowLink to="/play/$visitId" params={{ visitId: play.myVisitId }}>
        {content}
      </RowLink>
    );
  }
  return (
    <>
      <RowButton onClick={() => setOpen(true)}>
        {content}
        <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
      </RowButton>
      {open ? (
        <TableSummaryDialog play={play} detail={detail} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * A trip's sessions and tables as rows. Closed ones show their start time: they sit under the
 * heading of their day.
 */
export function SessionList({
  sessions,
  detail,
}: {
  sessions: ReadonlyArray<TripPlay>;
  detail: GroupDetail;
}) {
  return (
    <List>
      {sessions.map((play) =>
        play.kind === "session" ? (
          <SessionRow key={play.session.id} summary={play} detail={detail} />
        ) : (
          <TableRow key={play.session.id} play={play} detail={detail} />
        ),
      )}
    </List>
  );
}
