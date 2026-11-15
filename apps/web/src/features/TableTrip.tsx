import { useAtomValue } from "@effect/atom-react";
import { tableTripOptions } from "@stacks/client-runtime/recordingView";
import { useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import { tripNames } from "@stacks/client-runtime/trip";
import { TripId, type Table } from "@stacks/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Select } from "~/components/ui/Field";
import { Note } from "~/components/ui/Page";
import { Skeleton } from "~/components/ui/Surface";
import { useAccount } from "~/lib/account";
import { Loaded, StacksProvider, useStacks } from "~/lib/stacks";

export function TableTripButton({ attached, onOpen }: { attached: boolean; onOpen: () => void }) {
  const account = useAccount();
  if (!attached && (!account.available || !account.isSignedIn)) return null;
  return (
    <Button variant="ghost" onClick={onOpen}>
      Table's trip
    </Button>
  );
}

const noNames: ReadonlyMap<TripId, string> = new Map();

/**
 * The names of your groups' trips, for tables that belong to one. Signed out, or before they load,
 * there are none, and nothing waits for them.
 */
export function TripNames({
  children,
}: {
  children: (names: ReadonlyMap<TripId, string>) => ReactNode;
}) {
  const account = useAccount();
  if (!account.available || !account.isSignedIn) return children(noNames);
  return (
    <StacksProvider>
      <SignedInNames>{children}</SignedInNames>
    </StacksProvider>
  );
}

function SignedInNames({
  children,
}: {
  children: (names: ReadonlyMap<TripId, string>) => ReactNode;
}) {
  const groups = AsyncResult.getOrElse(useAtomValue(useStacks().groups), () => []);
  const names = useMemo(() => tripNames(groups), [groups]);
  return children(names);
}

export function TripChoice(props: {
  value: TripId | null;
  onChange: (value: TripId | null) => void;
}) {
  const account = useAccount();
  if (!account.available || !account.isSignedIn) return null;
  return (
    <StacksProvider>
      <SignedInChoice {...props} />
    </StacksProvider>
  );
}

function SignedInChoice({
  value,
  onChange,
}: {
  value: TripId | null;
  onChange: (value: TripId | null) => void;
}) {
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.groups}
      skeleton={<Skeleton className="h-20 w-full" />}
      renderError={() => (
        <Note>
          Trips couldn't load. You can start a personal session and choose a trip later from Edit.
        </Note>
      )}
    >
      {(groups) => (
        <>
          <Field label="Trip">
            {(props) => (
              <Select
                {...props}
                value={value ?? ""}
                onChange={(event) =>
                  onChange(event.target.value ? TripId.make(event.target.value) : null)
                }
              >
                {tableTripOptions(groups, value).map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Note>
            A trip shares this whole table's play with the group, including return visits.
          </Note>
        </>
      )}
    </Loaded>
  );
}

export function TableTripDialog({
  table,
  onClose,
  onSaved,
}: {
  table: Table;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tripId, setTripId] = useState(table.tripId);
  const save = useRecordingSubmit();
  return (
    <Dialog
      open
      title="Table's trip"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      footer={
        <>
          {save.error ? <FormError>{save.error}</FormError> : null}
          <Button
            variant="primary"
            pending={save.pending}
            onClick={async () => {
              if (await save.submit({ type: "set_table_trip", tableId: table.id, tripId }))
                onSaved();
            }}
          >
            Save trip
          </Button>
        </>
      }
    >
      <TripChoice value={tripId} onChange={setTripId} />
      {table.tripId !== null ? (
        <Button onClick={() => setTripId(null)}>Keep this table personal</Button>
      ) : null}
    </Dialog>
  );
}
