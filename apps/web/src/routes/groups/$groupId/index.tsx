import { createFileRoute } from "@tanstack/react-router";
import { GroupId, MinorUnits, type GroupDetail } from "@stacks/contracts";
import { Plus } from "lucide-react";

import { BalanceLabel } from "~/components/Money";
import { ButtonLink } from "~/components/ui/Button";
import { EmptyState, SectionHeading, Skeleton, Surface } from "~/components/ui/Surface";
import { GroupHeader } from "~/features/GroupHeader";
import { SessionHistory, SessionList } from "~/features/SessionList";
import { playerNames } from "@stacks/client-runtime/format";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/groups/$groupId/")({ component: GroupHome });

function GroupHome() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.group(GroupId.make(groupId))}
      skeleton={<Skeleton className="mt-4 h-96" />}
    >
      {(detail) => <GroupHomeView detail={detail} />}
    </Loaded>
  );
}

function GroupHomeView({ detail }: { detail: GroupDetail }) {
  const live = detail.sessions.filter((summary) => summary.session.status === "live");
  const past = detail.sessions.filter((summary) => summary.session.status === "closed");
  const names = playerNames(detail);
  const balanceOf = new Map(detail.balances.map((balance) => [balance.playerId, balance.amount]));
  const startSession = (
    <ButtonLink
      to="/groups/$groupId/sessions/new"
      params={{ groupId: detail.group.id }}
      variant="primary"
    >
      <Plus className="size-4" aria-hidden />
      Start a session
    </ButtonLink>
  );

  return (
    <>
      <GroupHeader detail={detail} current="home" action={startSession} />

      {live.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeading>Playing now</SectionHeading>
          <SessionList sessions={live} detail={detail} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionHeading
          action={
            detail.transfers.length > 0 ? (
              <ButtonLink
                to="/groups/$groupId/settle"
                params={{ groupId: detail.group.id }}
                size="sm"
              >
                Settle up
              </ButtonLink>
            ) : null
          }
        >
          Balances
        </SectionHeading>
        <Surface className="divide-y divide-line">
          {detail.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="truncate">
                {names.get(player.id)}
                {player.id === detail.myPlayerId ? (
                  <span className="text-muted"> (you)</span>
                ) : null}
                {player.userId === null ? <span className="text-muted"> · guest</span> : null}
              </span>
              <span className="text-sm">
                <BalanceLabel
                  amount={balanceOf.get(player.id) ?? MinorUnits.make(0)}
                  currency={detail.group.currency}
                />
              </span>
            </div>
          ))}
        </Surface>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Sessions</SectionHeading>
        {past.length === 0 && live.length === 0 ? (
          <EmptyState title="No sessions yet" action={startSession}>
            Start one when you sit down to play. Everyone's buy-ins and cash-outs go in it, and the
            balances above update as you go.
          </EmptyState>
        ) : past.length > 0 ? (
          <SessionHistory detail={detail} sessions={past} hasMore={detail.sessions.length >= 20} />
        ) : (
          <p className="text-sm text-muted">Finished sessions show up here.</p>
        )}
      </section>
    </>
  );
}
