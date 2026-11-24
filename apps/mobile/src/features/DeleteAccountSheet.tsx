import { previewFailure, type PreviewFailure } from "@stacks/client-runtime/accountDeletion";
import { describeError } from "@stacks/client-runtime/errors";
import type { AccountDeletionPreview } from "@stacks/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { Row, SettingsGroup, SettingsRow, Skeleton } from "../components/ui/Surface";
import { Text } from "../components/ui/Text";
import { useAccount } from "../lib/account";
import { accountApi, askAppleForCode, beginAccountWipe } from "../lib/accountDeletion";
import { useSessionsExport } from "./useSessionsExport";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly preview: AccountDeletionPreview }
  | ({ readonly status: "failed" } & PreviewFailure);

const loadPreview = (set: (load: Load) => void) =>
  accountApi.preview().then(
    (preview) => set({ status: "ready", preview }),
    (error) => set({ status: "failed", ...previewFailure(error) }),
  );

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function Line({ children }: { children: ReactNode }) {
  return (
    <Row className="py-3">
      <Text className="min-w-0 flex-1 type-body text-ink">{children}</Text>
    </Row>
  );
}

/**
 * The last question before an account is deleted. It reads what the deletion would change from
 * the API each time it opens, so the person sees their real groups and balances, and the button
 * stays off until it has. Deleting hands the phone to the wipe screen, which replaces the app.
 */
export function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const userId = account.available ? account.userId : null;
  const csv = useSessionsExport();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const [deleting, setDeleting] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });

  useEffect(() => {
    void loadPreview(setLoad);
  }, []);

  const remove = async () => {
    if (load.status !== "ready" || !userId || deleting.pending) return;
    setDeleting({ pending: true, error: null });

    try {
      const appleLinked = load.preview.appleLinked;
      const code = appleLinked ? await askAppleForCode() : null;
      const { status } = await accountApi.remove(code ?? undefined);
      beginAccountWipe({ userId, status, appleManual: appleLinked && code === null });
    } catch (error) {
      setDeleting({ pending: false, error: describeError(error) });
    }
  };

  return (
    <Sheet
      open
      back
      busy={deleting.pending}
      onClose={onClose}
      title="Delete account"
      footer={
        <>
          {deleting.error ? <FormError>{deleting.error}</FormError> : null}
          <Button
            label="Delete account"
            variant="danger"
            size="lg"
            pending={deleting.pending}
            disabled={load.status !== "ready"}
            onPress={() => void remove()}
          />
          <Button
            label="Keep account"
            variant="secondary"
            size="lg"
            disabled={deleting.pending}
            onPress={onClose}
          />
        </>
      }
    >
      <Text className="px-1 type-body text-muted">
        Deleting your account can't be undone. Here's what happens.
      </Text>

      <SettingsGroup
        title="Keep a copy first"
        footer={
          csv.error ? (
            <FormError>{csv.error}</FormError>
          ) : (
            <Text className="px-1 type-footnote text-muted">
              Play recorded only on this phone is deleted with the account.
            </Text>
          )
        }
      >
        <SettingsRow
          icon={<Icon name="download" color="ink" size={16} />}
          title={csv.pending ? "Exporting…" : "Export sessions (CSV)"}
          subtitle={
            csv.count === 0 ? "Nothing to export yet" : `${plural(csv.count, "finished session")}`
          }
          onPress={csv.count > 0 && !csv.pending ? () => void csv.run() : undefined}
          accessibilityHint="Exports all recorded sessions as a CSV file"
        />
      </SettingsGroup>

      {load.status === "loading" ? <Skeleton className="h-40" /> : null}

      {load.status === "failed" ? (
        <View className="gap-3">
          {load.kind === "offline" ? (
            <Text accessibilityLiveRegion="polite" className="px-1 type-body text-muted">
              {load.message}
            </Text>
          ) : (
            <FormError>{load.message}</FormError>
          )}
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              setLoad({ status: "loading" });
              void loadPreview(setLoad);
            }}
          />
        </View>
      ) : null}

      {load.status === "ready" ? <Consequences preview={load.preview} /> : null}
    </Sheet>
  );
}

function Consequences({ preview }: { preview: AccountDeletionPreview }) {
  const balances = preview.openBalances.filter((balance) => balance.amount !== 0);
  const carriesOver = balances.length > 0 || preview.openStakes.length > 0;

  return (
    <>
      <SettingsGroup title="Deleted">
        <Line>Your account and sign-in.</Line>
        <Line>Your sessions at tables nobody else played at.</Line>
        <Line>Everything saved only on this phone, including play that hasn't synced.</Line>
        {preview.soloGroups.map((group) => (
          <Line
            key={group.id}
          >{`${group.name}, and everything in it. You're its only member.`}</Line>
        ))}
      </SettingsGroup>

      <SettingsGroup title="Kept for your friends">
        <Line>
          Your name, and the play and balances you recorded in shared groups and at shared tables.
          They stay as a guest, so nobody else's results change.
        </Line>
      </SettingsGroup>

      {preview.ownershipMoves.length > 0 ? (
        <SettingsGroup title="Groups that change owner">
          {preview.ownershipMoves.map(({ group, newOwner }) => (
            <SettingsRow
              key={group.id}
              title={group.name}
              subtitle={`${newOwner.displayName} becomes the owner`}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {carriesOver ? (
        <SettingsGroup
          title="Balances and stakes"
          footer={
            <Text className="px-1 type-footnote text-muted">
              These stay with your guest, so friends can still settle up.
            </Text>
          }
        >
          {balances.map((balance) => (
            <SettingsRow
              key={`${balance.group.id}-${balance.currency}`}
              title={balance.group.name}
              subtitle={balance.amount > 0 ? "You're owed" : "You owe"}
              value={<Money amount={balance.amount} currency={balance.currency} tone="result" />}
            />
          ))}
          {preview.openStakes.map((stake) => (
            <SettingsRow
              key={stake.group.id}
              title={stake.group.name}
              subtitle={plural(stake.count, "open stake")}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {preview.appleLinked ? (
        <Text className="px-1 type-footnote text-muted">
          {Platform.OS === "ios"
            ? "Apple will ask you to confirm, so Color Up can be removed from your Apple Account. If you skip that, your account is still deleted."
            : "You signed in with Apple. After deleting, we'll show how to remove Color Up from your Apple Account."}
        </Text>
      ) : null}
    </>
  );
}
