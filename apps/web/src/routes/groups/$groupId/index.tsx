import { createFileRoute } from "@tanstack/react-router";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { isGuest } from "@stacks/client-runtime/format";

import { BackLink } from "~/components/ui/Nav";
import { PageHeader, Section } from "~/components/ui/Page";
import { List, RowLink, RowText } from "~/components/ui/Surface";
import { GroupPeople } from "~/features/GroupPeople";
import { GroupPageSkeleton } from "~/features/PageSkeletons";
import { StatsLink } from "~/features/StatsLink";
import { TripsSection } from "~/features/Trips";
import { Loaded, useStacks } from "~/lib/stacks";

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
  const members = detail.players.filter((player) => player.role !== null);
  const guests = detail.players.filter(isGuest);
  const people = [
    plural(members.length, "member"),
    guests.length > 0 ? plural(guests.length, "guest") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        back={<BackLink to="/crew">Crew</BackLink>}
        title={detail.group.name}
        context={`${people} · plays in ${detail.group.currency}`}
        action={<StatsLink pick={{ groupId: detail.group.id }} />}
      />
      <TripsSection detail={detail} />
      <GroupPeople detail={detail} />
      <Section title="Settings">
        <List>
          <RowLink to="/groups/$groupId/settings" params={{ groupId: detail.group.id }}>
            <RowText title="Export and leave" meta="Your ledger as a CSV, and leaving the group" />
          </RowLink>
        </List>
      </Section>
    </>
  );
}
