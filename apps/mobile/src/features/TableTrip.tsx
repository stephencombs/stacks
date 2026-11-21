import { tableTripOptions } from "@stacks/client-runtime/recordingView";
import { useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import { TripId, type Table } from "@stacks/contracts";
import { useState } from "react";
import { Text } from "react-native";

import { Button } from "../components/ui/Button";
import { Choice, FormError } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { Skeleton } from "../components/ui/Surface";
import { useAccount } from "../lib/account";
import { Loaded, StacksProvider, useStacks } from "../lib/stacks";

export function TableTripButton({ attached, onOpen }: { attached: boolean; onOpen: () => void }) {
  const account = useAccount();

  if (!attached && (!account.available || !account.isSignedIn)) return null;

  return <Button label="Table's trip" variant="ghost" onPress={onOpen} />;
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
        <Text className="text-sm text-muted">
          Trips couldn't load. You can start a personal session and choose a trip later from Edit.
        </Text>
      )}
    >
      {(groups) => (
        <>
          <Choice
            label="Trip"
            presentation="menu"
            options={tableTripOptions(groups, value).map(({ key, label }) => ({
              value: key,
              label,
            }))}
            value={value ?? ""}
            onChange={(key) => onChange(key ? TripId.make(key) : null)}
          />
          {value ? (
            <Text className="text-sm text-muted">
              A trip shares this whole table's play with the group, including return visits.
            </Text>
          ) : null}
        </>
      )}
    </Loaded>
  );
}

export function TableTripSheet({
  table,
  back = false,
  onClose,
  onSaved,
}: {
  table: Table;
  back?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tripId, setTripId] = useState(table.tripId);
  const save = useRecordingSubmit();

  return (
    <Sheet
      open
      title="Table's trip"
      back={back}
      onClose={onClose}
      busy={save.pending}
      footer={
        <>
          {save.error ? <FormError>{save.error}</FormError> : null}
          <Button
            label="Save trip"
            variant="primary"
            pending={save.pending}
            onPress={async () => {
              if (await save.submit({ type: "set_table_trip", tableId: table.id, tripId }))
                onSaved();
            }}
          />
        </>
      }
    >
      <TripChoice value={tripId} onChange={setTripId} />
      {table.tripId !== null ? (
        <Button label="Keep this table personal" onPress={() => setTripId(null)} />
      ) : null}
    </Sheet>
  );
}
