import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import type { TripPlay } from "@stacks/client-runtime/trip";

import * as DateTime from "effect/DateTime";
import { ArrowRight } from "lucide-react";

import { Money } from "~/components/Money";
import { ButtonLink } from "~/components/ui/Button";
import { Glow, List, Row, RowLink, RowText, Surface, Tag } from "~/components/ui/Surface";
import { formatDuration, formatTime, gameNames, venueLabel } from "@stacks/client-runtime/format";

function SessionRow({ summary, detail }: { summary: SessionSummary; detail: GroupDetail }) {
  const { session, venue, results } = summary;
  const live = session.status === "live";
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  return (
    <RowLink to="/sessions/$sessionId" params={{ sessionId: session.id }}>
      <RowText
        title={venue.name}
        meta={
          <span className="tabular-nums">
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
  const content = (
    <>
      <RowText
        title={venueLabel(play.venue)}
        meta={
          <span className="tabular-nums">
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

/** Your live session, one tap from the table: where, how long, and what you have in play. */
export function LiveSessionCard({
  summary,
  detail,
}: {
  summary: SessionSummary;
  detail: GroupDetail;
}) {
  const { session, venue, results, playing } = summary;
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  return (
    <Surface className="relative overflow-hidden">
      <Glow tone="felt" />
      <div className="relative flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <Tag tone="live">Live · {formatDuration(session.startedAt, DateTime.nowUnsafe())}</Tag>
          <span className="text-sm text-muted tabular-nums">
            since {formatTime(session.startedAt)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate font-display text-3xl leading-none uppercase">{venue.name}</h2>
            <p className="text-sm text-muted">
              {gameNames[session.game]} · {playing.length} at the table
            </p>
          </div>
          {mine && mine.buyIn > 0 ? (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm text-muted">In play</span>
              <Money
                amount={mine.buyIn}
                currency={detail.group.currency}
                className="text-2xl font-semibold"
              />
            </div>
          ) : null}
        </div>
        <ButtonLink
          to="/sessions/$sessionId"
          params={{ sessionId: session.id }}
          variant="primary"
          size="lg"
          className="hidden pr-4.5 lg:inline-flex"
        >
          Back to the table
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </Surface>
  );
}
