import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import type { TripPlay } from "@stacks/client-runtime/trip";

import { nameList } from "@stacks/client-runtime/crew";
import { formatTime, gameNames, playerNames, venueLabel } from "@stacks/client-runtime/format";

import { Money } from "~/components/Money";
import { List, Row, RowLink, RowText, Tag } from "~/components/ui/Surface";

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

/** A table in the trip. It opens your own visit there; a table you didn't play has no page yet. */
function TableRow({
  play,
  detail,
}: {
  play: Extract<TripPlay, { kind: "table" }>;
  detail: GroupDetail;
}) {
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
  return play.myVisitId ? (
    <RowLink to="/play/$visitId" params={{ visitId: play.myVisitId }}>
      {content}
    </RowLink>
  ) : (
    <Row>{content}</Row>
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
