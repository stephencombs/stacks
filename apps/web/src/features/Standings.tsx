import type { GroupDetail, GroupStats, PlayerId } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { playerNames } from "@stacks/client-runtime/format";
import { sessionCounts } from "@stacks/shared/results";

import { Money } from "~/components/Money";
import { cn } from "~/components/ui/cn";

/** Everyone ranked by all-time net, each with a bar from break-even. */
export function Standings({
  detail,
  stats,
  me,
}: {
  detail: GroupDetail;
  stats: GroupStats;
  me: PlayerId;
}) {
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const played = sessionCounts(stats.bySession);
  const ranked = stats.byPlayer.toSorted((a, b) => b.net - a.net);
  const track = barTrack(ranked.map((result) => result.net));

  return (
    <ol className="divide-y divide-line">
      {ranked.map((result, index) => {
        const you = result.playerId === me;
        const sessions = played.get(result.playerId) ?? 0;
        const width = track.extent(result.net) * 100;
        return (
          <li
            key={result.playerId}
            aria-current={you ? "true" : undefined}
            className={cn(
              "grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3 gap-y-2 px-5 py-3.5 first:rounded-t-2xl last:rounded-b-2xl",
              you && "bg-sunken",
            )}
          >
            <span className="text-sm text-muted tabular-nums">{index + 1}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {names.get(result.playerId)}
                {you ? <span className="font-normal text-muted"> · you</span> : null}
              </span>
              <span className="text-sm text-muted tabular-nums">
                {sessions} {sessions === 1 ? "session" : "sessions"}
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
              className="font-serif text-xl"
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
          </li>
        );
      })}
    </ol>
  );
}
