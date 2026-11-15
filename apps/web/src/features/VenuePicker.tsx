import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { describeError } from "@stacks/client-runtime/errors";
import type { CachedVenue } from "@stacks/client-runtime/recording";
import { useVenueSearch } from "@stacks/client-runtime/recordingReact";
import { venuePlace } from "@stacks/client-runtime/recordingView";
import * as Cause from "effect/Cause";
import { VenueId, type GroupId, type Venue } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Ban, Check, Home, Laptop, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, RadioCards } from "~/components/ui/Field";
import { cn } from "~/components/ui/cn";
import { useDebounced } from "~/lib/useDebounced";
import { useAction, useStacks } from "~/lib/stacks";

const kindIcon = { casino: MapPin, online: Laptop, home: Home } as const;

function VenueOption({
  venue,
  selected,
  onSelect,
}: {
  venue: CachedVenue & { readonly verified?: boolean };
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = kindIcon[venue.kind];
  return (
    <OptionRow
      icon={Icon}
      title={venue.name}
      detail={[venuePlace(venue), venue.verified === false ? "Unverified" : ""]
        .filter(Boolean)
        .join(" · ")}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function OptionRow({
  icon: Icon,
  title,
  detail,
  selected,
  onSelect,
}: {
  icon: typeof MapPin;
  title: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
        selected ? "bg-fill" : "hover:bg-fill",
      )}
    >
      <Icon className={cn("size-4 shrink-0", selected ? "text-ink" : "text-muted")} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        {detail ? <span className="truncate text-sm text-muted">{detail}</span> : null}
      </span>
      {selected ? <Check className="size-4 shrink-0 text-ink" aria-hidden /> : null}
    </button>
  );
}

function VenueResults({
  groupId,
  search,
  selected,
  onSelect,
}: {
  groupId: GroupId;
  search: { q: string; near?: { lat: number; lng: number } };
  selected: Venue | null;
  onSelect: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const query = stacks.venueSearch(groupId, search);
  const result = useAtomValue(query);
  const retry = useAtomRefresh(query);
  const venues = AsyncResult.getOrElse(result, () => []);
  if (AsyncResult.isInitial(result) || (result.waiting && venues.length === 0)) {
    return <p className="px-3 py-2 text-sm text-muted">Searching…</p>;
  }
  if (AsyncResult.isFailure(result))
    return (
      <div className="flex flex-col gap-3 px-3">
        <FormError>{describeError(Cause.squash(result.cause))}</FormError>
        <Button onClick={retry}>Retry venue search</Button>
      </div>
    );
  if (venues.length === 0)
    return <p className="px-3 py-2 text-sm text-muted">No venues match “{search.q}”.</p>;
  return (
    <div className="flex flex-col">
      {venues.map((venue) => (
        <VenueOption
          key={venue.id}
          venue={venue}
          selected={selected?.id === venue.id}
          onSelect={() => onSelect(venue)}
        />
      ))}
    </div>
  );
}

type Near = { lat: number; lng: number };

/**
 * Where the browser says this device is. It asks without a prompt only when permission is already
 * granted; `locate` asks, for the "Near me" button.
 */
function useNearby() {
  const [near, setNear] = useState<Near | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const locate = () => {
    if (!navigator.geolocation) return setLocating("failed");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating("idle");
      },
      () => setLocating("failed"),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };
  useEffect(() => {
    let current = true;
    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        if (current && status.state === "granted")
          navigator.geolocation.getCurrentPosition(
            (position) =>
              current && setNear({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => undefined,
            { timeout: 10_000, maximumAge: 300_000 },
          );
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return { near, locating, locate };
}

/**
 * The casino a personal session was at: nearby casinos first when location is allowed, then by
 * name as you type, and "Not listed" for none. Searching needs the network; casinos this device
 * has saved stay pickable without it. `selectedId` keeps an uncached casino distinct from none.
 */
export function SessionVenuePicker({
  selectedId,
  selected,
  onSelect,
}: {
  selectedId: VenueId | null;
  selected: CachedVenue | null;
  onSelect: (venue: CachedVenue | null) => void;
}) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const { near, locating, locate } = useNearby();
  const search = useVenueSearch(q, near);
  const shown =
    selected && !search.venues.some((venue) => venue.id === selected.id)
      ? [selected, ...search.venues]
      : search.venues;
  const status =
    search.status === "offline"
      ? "Searching needs a connection. These are the casinos saved on this device."
      : search.status === "searching" && search.venues.length === 0
        ? "Searching…"
        : search.status === "found" && search.venues.length === 0
          ? q
            ? `No casinos match “${q}”.`
            : "No casinos found near you. Search by name instead."
          : search.status === "saved" && search.venues.length === 0
            ? "Search for where you're playing."
            : null;
  const heading =
    search.status === "found" && search.venues.length > 0
      ? q
        ? null
        : "Near you"
      : search.status === "saved" && search.venues.length > 0
        ? "On this device"
        : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <Input
          aria-label="Search casinos"
          placeholder="Search casinos"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      {near ? null : (
        <Button size="sm" className="self-start" onClick={locate} pending={locating === "busy"}>
          <LocateFixed className="size-4" aria-hidden />
          Near me
        </Button>
      )}
      {locating === "failed" ? (
        <p className="text-sm text-muted">Couldn't get your location. Search by name instead.</p>
      ) : null}
      {status ? (
        <div className="flex items-start justify-between gap-3">
          <p role="status" className="text-sm text-muted">
            {status}
          </p>
          {search.status === "offline" ? (
            <Button size="sm" variant="ghost" className="shrink-0" onClick={search.retry}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col">
        {heading ? <p className="pb-1 text-sm text-muted">{heading}</p> : null}
        {selectedId !== null && !shown.some((venue) => venue.id === selectedId) ? (
          <p role="status" className="px-3 py-2 text-sm text-muted">
            Current casino unavailable. This session keeps it until you choose another casino or Not
            listed.
          </p>
        ) : null}
        {shown.map((venue) => (
          <VenueOption
            key={venue.id}
            venue={venue}
            selected={selectedId === venue.id}
            onSelect={() => onSelect(venue)}
          />
        ))}
        <OptionRow
          icon={Ban}
          title="Not listed"
          detail="Keep this session without a casino"
          selected={selectedId === null}
          onSelect={() => onSelect(null)}
        />
      </div>
    </div>
  );
}

export function VenuePicker({
  groupId,
  selected,
  onSelect,
}: {
  groupId: GroupId;
  selected: Venue | null;
  onSelect: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const recent = AsyncResult.getOrElse(useAtomValue(stacks.recentVenues(groupId)), () => []);
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const [adding, setAdding] = useState(false);

  const locate = () => {
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating("idle");
      },
      () => setLocating("failed"),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const searching = q !== "" || near !== null;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <Input
          aria-label="Search venues"
          placeholder="Search casinos"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={locate} pending={locating === "busy"}>
          <LocateFixed className="size-4" aria-hidden />
          {near ? "Near you" : "Near me"}
        </Button>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add a venue
        </Button>
      </div>
      {locating === "failed" ? (
        <p className="text-sm text-muted">Couldn't get your location. Search by name instead.</p>
      ) : null}

      <div className="-mx-3 flex flex-col">
        {searching ? (
          <VenueResults
            groupId={groupId}
            search={near && q === "" ? { q, near } : { q }}
            selected={selected}
            onSelect={onSelect}
          />
        ) : recent.length > 0 ? (
          <>
            <p className="px-3 pb-1 text-sm text-muted">Recent</p>
            {recent.map((venue) => (
              <VenueOption
                key={venue.id}
                venue={venue}
                selected={selected?.id === venue.id}
                onSelect={() => onSelect(venue)}
              />
            ))}
          </>
        ) : (
          <p className="px-3 text-sm text-muted">Search for where you're playing, or add it.</p>
        )}
        {selected && !searching && !recent.some((venue) => venue.id === selected.id) ? (
          <VenueOption venue={selected} selected onSelect={() => onSelect(selected)} />
        ) : null}
      </div>

      <AddVenueDialog
        groupId={groupId}
        open={adding}
        onOpenChange={setAdding}
        initialName={text.trim()}
        onAdded={(venue) => {
          onSelect(venue);
          setText("");
        }}
      />
    </div>
  );
}

function AddVenueDialog({
  groupId,
  open,
  onOpenChange,
  initialName,
  onAdded,
}: {
  groupId: GroupId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onAdded: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("venues", "create"));
  const [kind, setKind] = useState<Venue["kind"]>("casino");
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const city = String(form.get("city") ?? "").trim();
    if (!name) return setNameError("Enter the venue's name.");
    setNameError(null);
    const venue = await create.run({
      payload: {
        id: VenueId.make(newId()),
        name,
        kind,
        city: kind === "casino" && city ? city : null,
        region: null,
        country: null,
        groupId: kind === "home" ? groupId : null,
      },
    });
    if (venue) {
      onAdded(venue);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a venue"
      description="Casinos you add are shared with everyone on Stacks. Home games stay private to this group."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <RadioCards
          label="Kind"
          options={[
            { value: "casino", label: "Casino" },
            { value: "online", label: "Online" },
            { value: "home", label: "Home game" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Field label="Name" error={nameError}>
          {(props) => (
            <Input
              {...props}
              name="name"
              defaultValue={initialName}
              maxLength={80}
              autoComplete="off"
            />
          )}
        </Field>
        {kind === "casino" ? (
          <Field label="City">
            {(props) => (
              <Input {...props} name="city" maxLength={80} autoComplete="address-level2" />
            )}
          </Field>
        ) : null}
        {create.error ? <FormError>{create.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" pending={create.pending}>
          Add venue
        </Button>
      </form>
    </Dialog>
  );
}
