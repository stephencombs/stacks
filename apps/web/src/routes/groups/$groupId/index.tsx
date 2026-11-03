import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { isGuest } from "@stacks/client-runtime/format";
import { chipOf } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { UserPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { PageHeader, Section } from "~/components/ui/Page";
import { List, RowLink, RowText } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";
import { InlineInvite } from "~/features/Invite";
import { TripsSection } from "~/features/Trips";
import { Loaded, useStacks } from "~/lib/stacks";
import { GroupPageSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/groups/$groupId/")({ component: GroupHome });

function GroupHome() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.group(GroupId.make(groupId))} skeleton={<GroupPageSkeleton on="hub" />}>
      {(detail) => <GroupHomeView detail={detail} />}
    </Loaded>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The group's own place: its trips, who's in it, and its settings. */
function GroupHomeView({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const seat = groups.find((item) => item.group.id === detail.group.id)?.mySession;
  const [inviting, setInviting] = useState(false);
  const members = detail.players.filter((player) => player.role !== null);
  const guests = detail.players.filter(isGuest);
  const people = [
    plural(members.length, "member"),
    guests.length > 0 ? plural(guests.length, "guest") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const params = { groupId: detail.group.id };

  return (
    <>
      <PageHeader
        title={detail.group.name}
        context={`${people} · plays in ${detail.group.currency}`}
      />
      <TripsSection detail={detail} {...(seat ? { seatTripId: seat.tripId } : {})} />
      <Section
        title="People"
        action={
          <Button size="sm" variant="ghost" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" aria-hidden />
            Invite
          </Button>
        }
      >
        <List>
          <RowLink to="/groups/$groupId/people" params={params}>
            <span aria-hidden className="flex shrink-0 -space-x-2">
              {[...members, ...guests].slice(0, 5).map((player) => (
                <Chip
                  key={player.id}
                  chip={chipOf(detail, player.id)}
                  name={player.displayName}
                  size={28}
                />
              ))}
            </span>
            <RowText
              title={people}
              meta={[...members, ...guests].map((player) => player.displayName).join(", ")}
            />
          </RowLink>
        </List>
      </Section>
      <Section title="Settings">
        <List>
          <RowLink to="/groups/$groupId/settings" params={params}>
            <RowText title="Payment apps and export" meta="Also where you leave the group" />
          </RowLink>
        </List>
      </Section>
      <Dialog
        open={inviting}
        onOpenChange={setInviting}
        title={`Invite to ${detail.group.name}`}
        description="Anyone with the link can join. Links last a week."
      >
        <InlineInvite detail={detail} />
      </Dialog>
    </>
  );
}
