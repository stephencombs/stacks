import { Link } from "@tanstack/react-router";
import type { GroupDetail, SessionSummary } from "@stacks/contracts";
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { formatDay, formatTime, gameNames } from "@stacks/client-runtime/format";
import { Loaded, useStacks } from "~/lib/stacks";

const PAGE_SIZE = 30;

function SessionRow({ summary, detail }: { summary: SessionSummary; detail: GroupDetail }) {
  const { session, venue, results } = summary;
  const mine = results.find((result) => result.playerId === detail.myPlayerId);
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.id }}
      className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 first:rounded-t-2xl last:rounded-b-2xl hover:bg-sunken"
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
            className="font-medium"
          />
        ) : (
          <span className="text-faint">Sat out</span>
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

/** The sessions the group view includes, then 30 more at a time on request. */
export function SessionHistory({
  detail,
  sessions: first,
  hasMore,
}: {
  detail: GroupDetail;
  sessions: ReadonlyArray<SessionSummary>;
  hasMore: boolean;
}) {
  const [cursors, setCursors] = useState<ReadonlyArray<SessionSummary["session"]["startedAt"]>>([]);
  const showMore = (page: ReadonlyArray<SessionSummary>, full: boolean) =>
    full && page.length > 0 ? (
      <Button
        variant="ghost"
        onClick={() => setCursors((all) => [...all, page.at(-1)!.session.startedAt])}
      >
        Show older sessions
      </Button>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      <SessionList sessions={first} detail={detail} />
      {cursors.length === 0 ? showMore(first, hasMore) : null}
      {cursors.map((before, index) => (
        <OlderPage
          key={before.epochMilliseconds}
          detail={detail}
          before={before}
          renderMore={(page) =>
            index === cursors.length - 1 ? showMore(page, page.length >= PAGE_SIZE) : null
          }
        />
      ))}
    </div>
  );
}

function OlderPage({
  detail,
  before,
  renderMore,
}: {
  detail: GroupDetail;
  before: SessionSummary["session"]["startedAt"];
  renderMore: (page: ReadonlyArray<SessionSummary>) => ReactNode;
}) {
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.olderSessions(detail.group.id, before)}
      skeleton={<Skeleton className="h-24" />}
    >
      {(page) =>
        page.length === 0 ? (
          <p className="text-sm text-muted">That's every session.</p>
        ) : (
          <>
            <SessionList sessions={page} detail={detail} />
            {renderMore(page)}
          </>
        )
      }
    </Loaded>
  );
}
