import { Link } from "@tanstack/react-router";
import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import { ChevronRight } from "lucide-react";

import { Money } from "~/components/Money";
import { Surface, Tag } from "~/components/ui/Surface";
import { formatDay, formatTime, gameNames } from "@stacks/client-runtime/format";

function SessionRow({ summary, detail }: { summary: SessionSummary; detail: GroupDetail }) {
  const { session, venue, results } = summary;
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.id }}
      className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-sunken"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{venue.name}</span>
          {session.status === "live" ? <Tag tone="live">Live</Tag> : null}
        </div>
        <span className="text-sm text-muted">
          {gameNames[session.game]} · {formatDay(session.startedAt)}
          {session.status === "live" ? ` · since ${formatTime(session.startedAt)}` : ""}
        </span>
      </div>
      <div className="text-right text-sm">
        {mine ? (
          <Money
            amount={mine.net}
            currency={detail.group.currency}
            tone="result"
            className="font-bold"
          />
        ) : (
          <span />
        )}
      </div>
      <ChevronRight className="size-5 shrink-0 text-faint" aria-hidden />
    </Link>
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
    <Surface className="divide-y divide-line">
      {sessions.map((summary) => (
        <SessionRow key={summary.session.id} summary={summary} detail={detail} />
      ))}
    </Surface>
  );
}
