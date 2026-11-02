import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  InviteId,
  SessionId,
  TripId,
  type Game,
  type GroupDetail,
  type TripDetail,
  type PlayerId,
  type SessionDetail,
  type Venue,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import * as DateTime from "effect/DateTime";
import { Link2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { CopyButton } from "~/components/CopyButton";
import { Button } from "~/components/ui/Button";
import { Checkbox } from "~/components/ui/Checkbox";
import { FormError, Input, RadioCards } from "~/components/ui/Field";
import { BackLink } from "~/components/ui/Nav";
import { Note, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowText, Skeleton } from "~/components/ui/Surface";
import { AddGuestDialog } from "~/features/AddGuestDialog";
import { Chip } from "~/features/Chip";
import { PlayerName } from "~/features/Player";
import { VenuePicker } from "~/features/VenuePicker";
import { gameNames } from "@stacks/client-runtime/format";
import { chipOf } from "@stacks/client-runtime/trip";
import { Loaded, useAction, useRememberTrip, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/sessions/new")({
  component: NewSession,
  // The session just left when moving tables: the new one starts with its place and players.
  validateSearch: (search): { from?: string } =>
    typeof search.from === "string" ? { from: search.from } : {},
});

function NewSession() {
  const { tripId } = Route.useParams();
  const { from } = Route.useSearch();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="h-96" />}>
      {(trip) => (
        <Loaded query={stacks.group(trip.trip.groupId)} skeleton={<Skeleton className="h-96" />}>
          {(detail) =>
            from ? (
              <Loaded
                query={stacks.session(SessionId.make(from))}
                skeleton={<Skeleton className="h-96" />}
              >
                {(session) => <NewSessionForm detail={detail} trip={trip} from={session} />}
              </Loaded>
            ) : (
              <NewSessionForm detail={detail} trip={trip} />
            )
          }
        </Loaded>
      )}
    </Loaded>
  );
}

const GAMES = Object.keys(gameNames) as ReadonlyArray<Game>;

/** `datetime-local` wants local wall time without a zone. */
const localInputValue = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function NewSessionForm({
  detail,
  trip,
  from,
}: {
  detail: GroupDetail;
  trip: TripDetail;
  from?: SessionDetail;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  useRememberTrip(trip.trip.id);
  const create = useAction(stacks.Client.mutation("sessions", "create"));
  const [venue, setVenue] = useState<Venue | null>(from?.venue ?? null);
  const [game, setGame] = useState<Game>(from?.session.game ?? "blackjack");
  const [highLimit, setHighLimit] = useState(from?.session.highLimit ?? false);
  const [playerIds, setPlayerIds] = useState<ReadonlySet<PlayerId>>(
    () => new Set(from?.playerIds ?? [detail.myPlayerId]),
  );
  // The start-time field opens two hours back, capped at the moment it was opened.
  const [earlier, setEarlier] = useState<{ readonly value: string; readonly max: string } | null>(
    null,
  );
  const [addingGuest, setAddingGuest] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const players = detail.players.filter((player) => player.role !== null || player.userId === null);

  const toggle = (id: PlayerId) =>
    setPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [first, ...rest] = players
      .filter((player) => playerIds.has(player.id))
      .map((player) => player.id);
    if (!venue) return setProblem("Pick where you're playing.");
    if (!first) return setProblem("Pick at least one player.");
    setProblem(null);
    const startedAtInput = String(new FormData(event.currentTarget).get("startedAt") ?? "");
    const startedAt =
      earlier && startedAtInput ? DateTime.makeUnsafe(new Date(startedAtInput)) : undefined;
    const session = await create.run({
      params: { tripId: trip.trip.id },
      payload: {
        id: SessionId.make(newId()),
        venueId: venue.id,
        game,
        playerIds: [first, ...rest],
        notes: null,
        highLimit,
        ...(startedAt ? { startedAt } : {}),
      },
    });
    if (session)
      void navigate({ to: "/sessions/$sessionId", params: { sessionId: session.session.id } });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <PageHeader
        back={
          <BackLink to="/trips/$tripId" params={{ tripId: trip.trip.id }}>
            {trip.trip.name}
          </BackLink>
        }
        title="Start a session"
        context={`${detail.group.name} · ${trip.trip.name}`}
      />

      <Section title="Where">
        <VenuePicker groupId={detail.group.id} selected={venue} onSelect={setVenue} />
      </Section>

      <Section title="Game">
        <RadioCards
          label={<span className="sr-only">Game</span>}
          options={GAMES.map((option) => ({ value: option, label: gameNames[option] }))}
          value={game}
          onChange={setGame}
          className="grid-cols-2 sm:grid-cols-4"
        />
        <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <Checkbox checked={highLimit} onCheckedChange={setHighLimit} />
          High-limit table
        </label>
      </Section>

      <Section
        title="Who's playing"
        action={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setInviting((open) => !open)}>
              <Link2 className="size-4" aria-hidden />
              Invite link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingGuest(true)}>
              <UserPlus className="size-4" aria-hidden />
              Add a guest
            </Button>
          </div>
        }
      >
        {inviting ? <InlineInvite detail={detail} /> : null}
        <List>
          {players.map((player) => (
            <label key={player.id} className="block cursor-pointer hover:bg-sunken">
              <Row as="span">
                <Checkbox
                  checked={playerIds.has(player.id)}
                  onCheckedChange={() => toggle(player.id)}
                />
                <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={28} />
                <RowText
                  title={
                    <PlayerName
                      name={player.displayName}
                      you={player.id === detail.myPlayerId}
                      guest={player.userId === null}
                    />
                  }
                />
              </Row>
            </label>
          ))}
        </List>
        <Note>Anyone else can join the session later.</Note>
      </Section>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={earlier !== null}
            onCheckedChange={(checked) => {
              const now = Date.now();
              setEarlier(
                checked
                  ? {
                      value: localInputValue(new Date(now - 2 * 3_600_000)),
                      max: localInputValue(new Date(now)),
                    }
                  : null,
              );
            }}
          />
          We started earlier
        </label>
        {earlier ? (
          <Input
            type="datetime-local"
            name="startedAt"
            aria-label="Start time"
            defaultValue={earlier.value}
            max={earlier.max}
            className="max-w-64"
          />
        ) : null}
      </div>

      {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        pending={create.pending}
        className="w-full sm:w-auto sm:self-start"
      >
        Start session
      </Button>

      <AddGuestDialog
        detail={detail}
        open={addingGuest}
        onOpenChange={setAddingGuest}
        onAdded={(id) => setPlayerIds((current) => new Set([...current, id]))}
      />
    </form>
  );
}

function InlineInvite({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("invites", "create"));
  const origin = window.location.origin;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-sunken p-3">
      <Loaded query={stacks.invites(detail.group.id)} skeleton={<Skeleton className="h-10" />}>
        {(invites) => {
          const active = invites[0];
          return active ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm text-muted">
                {`${origin}/join/${active.code}`}
              </span>
              <CopyButton text={`${origin}/join/${active.code}`} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">
                Send a link so friends can join {detail.group.name}.
              </span>
              <Button
                size="sm"
                pending={create.pending}
                onClick={() =>
                  void create.run({
                    params: { groupId: detail.group.id },
                    payload: { id: InviteId.make(newId()), maxUses: null },
                  })
                }
              >
                New invite link
              </Button>
            </div>
          );
        }}
      </Loaded>
      {create.error ? <FormError>{create.error}</FormError> : null}
    </div>
  );
}
