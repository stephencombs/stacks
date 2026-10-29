import { MinorUnits, type GroupDetail, type GroupStats, type PlayerId } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { playerNames } from "@stacks/client-runtime/format";
import { sessionCounts, type Subject } from "@stacks/shared/results";
import type { ReactNode } from "react";

import { Money } from "~/components/Money";
import { cn } from "~/components/ui/cn";

/**
 * Everyone ranked by all-time net, each with a bar from break-even, and the group's total.
 * Each row picks whose stats the rest of the page shows.
 */
export function Standings({
  detail,
  stats,
  me,
  selected,
  onSelect,
}: {
  detail: GroupDetail;
  stats: GroupStats;
  me: PlayerId;
  selected: Subject;
  onSelect: (subject: Subject) => void;
}) {
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const played = sessionCounts(stats.bySession);
  const ranked = stats.byPlayer.toSorted((a, b) => b.net - a.net);
  const track = barTrack(ranked.map((result) => result.net));
  const total = MinorUnits.make(ranked.reduce((sum, result) => sum + result.net, 0));
  const sessions = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;

  return (
    <ol className="divide-y divide-line">
      {ranked.map((result, index) => {
        const you = result.playerId === me;
        const width = track.extent(result.net) * 100;
        return (
          <Choice
            key={result.playerId}
            selected={selected === result.playerId}
            onSelect={() => onSelect(result.playerId)}
          >
            <span className="text-sm text-muted tabular-nums">{index + 1}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {names.get(result.playerId)}
                {you ? <span className="font-normal text-muted"> · you</span> : null}
              </span>
              <span className="text-sm text-muted tabular-nums">
                {sessions(played.get(result.playerId) ?? 0)}
                {result.buyIn > 0 ? (
                  <>
                    {" · bought in "}
                    <Money amount={result.buyIn} currency={currency} />
                  </>
                ) : null}
              </span>
            </span>
            <Money
              amount={result.net}
              currency={currency}
              tone="result"
              className="text-lg font-bold"
            />
            <span aria-hidden className="relative col-start-2 col-end-4 h-1.5">
              <span className="absolute inset-0 rounded-full bg-line" />
              <span
                className={cn(
                  "absolute inset-y-0 rounded-full",
                  result.net >= 0 ? "bg-win" : "bg-loss",
                )}
                style={
                  result.net >= 0
                    ? { left: `${track.zero * 100}%`, width: `${width}%` }
                    : { right: `${(1 - track.zero) * 100}%`, width: `${width}%` }
                }
              />
              {track.zero > 0 ? (
                <span
                  className="absolute -inset-y-1 w-px bg-line-strong"
                  style={{ left: `${track.zero * 100}%` }}
                />
              ) : null}
            </span>
          </Choice>
        );
      })}
      <Choice selected={selected === "group"} onSelect={() => onSelect("group")}>
        <span aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">Group total</span>
          <span className="text-sm text-muted tabular-nums">{sessions(stats.sessionCount)}</span>
        </span>
        <Money amount={total} currency={currency} tone="result" className="text-lg font-bold" />
      </Choice>
    </ol>
  );
}

function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <li className="first:*:rounded-t-2xl last:*:rounded-b-2xl">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "grid w-full grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3 gap-y-2 px-5 py-3.5 text-left transition-colors duration-150 focus-visible:-outline-offset-2",
          selected ? "bg-sunken" : "hover:bg-sunken/50",
        )}
      >
        {children}
      </button>
    </li>
  );
}
