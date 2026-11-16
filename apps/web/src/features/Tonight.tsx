import type { GroupDetail, PlayerId, SessionId, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import { chipOf, localClock, tripPlays } from "@stacks/client-runtime/trip";
import { tonightBoard } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useLayoutEffect, useRef } from "react";

import { Money } from "~/components/Money";
import { Section } from "~/components/ui/Page";
import { List } from "~/components/ui/Surface";
import { PlayerName } from "./Player";
import { Standing } from "./Standing";

/**
 * Slides rows to their new places when the order changes while you watch. Rows move on
 * screen, so ease-in-out. Measuring after every render is cheap for a handful of rows.
 */
function useReorder() {
  const rows = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [key, row] of rows.current) {
      const top = row.offsetTop;
      const before = tops.current.get(key);
      if (before !== undefined && before !== top && !still) {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 240,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        });
      }
      tops.current.set(key, top);
    }
  });
  return (key: string) => (row: HTMLElement | null) => {
    if (row) rows.current.set(key, row);
    else rows.current.delete(key);
  };
}

/**
 * Tonight across every table, on a live session's page: who's up from tables that finished, and
 * what's still in play. Left out when this table is the whole night, since the table says it all.
 */
export function Tonight({
  detail,
  trip,
  sessionId,
}: {
  detail: GroupDetail;
  trip: TripDetail;
  sessionId: SessionId;
}) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const now = DateTime.nowUnsafe();
  const plays = tripPlays(trip);
  const closed = plays.filter((s) => !s.live);
  const live = plays.filter((s) => s.live);
  const rows = tonightBoard(closed, live, localClock, now);
  const inPlayTotal = rows.reduce((sum, r) => sum + r.inPlay, 0);
  const row = useReorder();
  const tonight = localClock.night(now);
  const others = plays.some(
    (s) =>
      s.session.id !== sessionId && (s.live || localClock.night(s.session.startedAt) === tonight),
  );
  if (!others || rows.length === 0) return null;

  return (
    <Section
      title="Tonight"
      aside={
        inPlayTotal > 0 ? (
          <>
            In play <Money amount={inPlayTotal} currency={currency} />
          </>
        ) : null
      }
    >
      <List as="ol" label="Tonight">
        {rows.map((r) => (
          <Standing
            key={r.playerId}
            rowRef={row(r.playerId)}
            rank={r.rank}
            chip={chipOf(detail, r.playerId)}
            name={<PlayerName name={name(r.playerId)} you={r.playerId === detail.myPlayerId} />}
            meta={
              r.inPlay > 0 ? (
                <>
                  In play <Money amount={r.inPlay} currency={currency} />
                </>
              ) : null
            }
            net={r.net}
            currency={currency}
          />
        ))}
      </List>
    </Section>
  );
}
