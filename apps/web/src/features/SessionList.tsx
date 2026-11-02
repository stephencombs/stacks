import type { GroupDetail, SessionSummary } from "@stacks/contracts";

import { Money } from "~/components/Money";
import { List, RowLink, RowText, Tag } from "~/components/ui/Surface";
import { formatDay, formatTime, gameNames } from "@stacks/client-runtime/format";

function SessionRow({ summary, detail }: { summary: SessionSummary; detail: GroupDetail }) {
  const { session, venue, results } = summary;
  const live = session.status === "live";
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  return (
    <RowLink to="/sessions/$sessionId" params={{ sessionId: session.id }}>
      <RowText
        title={venue.name}
        meta={`${gameNames[session.game]} · ${live ? `since ${formatTime(session.startedAt)}` : formatDay(session.startedAt)}`}
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

export function SessionList({
  sessions,
  detail,
}: {
  sessions: ReadonlyArray<SessionSummary>;
  detail: GroupDetail;
}) {
  return (
    <List>
      {sessions.map((summary) => (
        <SessionRow key={summary.session.id} summary={summary} detail={detail} />
      ))}
    </List>
  );
}
