import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { fetchInvitePreview } from "@stacks/client-runtime/api";
import { describeError } from "@stacks/client-runtime/errors";
import { useRedeemInvite } from "@stacks/client-runtime/recordingReact";
import type { PlayerInvitePreview } from "@stacks/contracts/recordingCommands";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { EmptyState, PageTitle, Skeleton } from "../components/ui/Surface";
import { PersonalScreen } from "../features/Personal";
import { apiUrl } from "../lib/config";

type Props = StaticScreenProps<{ token: string }>;

/** A personal invite: once taken up, this device records as the player it names. */
export function RedeemInviteScreen({ route }: Props) {
  const { token } = route.params;
  const navigation = useNavigation();

  const [preview, setPreview] = useState<
    { ok: PlayerInvitePreview } | { error: string } | undefined
  >(undefined);

  const redeem = useRedeemInvite(token);
  useEffect(() => {
    let current = true;
    void Effect.runPromiseExit(fetchInvitePreview({ baseUrl: apiUrl }, token)).then((exit) => {
      if (!current) return;

      if (Exit.isSuccess(exit)) return setPreview({ ok: exit.value });
      const failure = Option.getOrNull(Exit.findErrorOption(exit));
      setPreview({
        error:
          failure !== null && Predicate.isTagged(failure, "Conflict")
            ? describeError(failure)
            : "This invite doesn't work. Ask whoever sent it for a new one.",
      });
    });

    return () => {
      current = false;
    };
  }, [token]);

  const openHome = () =>
    navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } });

  return (
    <PersonalScreen>
      {Platform.OS === "android" ? <PageTitle inContent>Invite</PageTitle> : null}
      {preview === undefined ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : "error" in preview ? (
        <>
          <EmptyState title="This invite can't be used">{preview.error}</EmptyState>
          <Button label="Open Color Up" className="self-start" onPress={openHome} />
        </>
      ) : (
        <>
          <EmptyState title={`Record as ${preview.ok.player.displayName}`}>
            {`${
              preview.ok.invitedBy
                ? `${preview.ok.invitedBy} invited you to record your own play at their table.`
                : "You were invited to record your own play at a table."
            } Only take this up if you're ${preview.ok.player.displayName}. It works once, and you don't need an account.`}
          </EmptyState>
          <Button
            label={`I'm ${preview.ok.player.displayName}`}
            variant="primary"
            size="lg"
            className="self-start"
            pending={redeem.pending}
            onPress={async () => {
              if (await redeem.redeem()) openHome();
            }}
          />
          {redeem.error ? <FormError>{redeem.error}</FormError> : null}
          <Text className="text-sm text-muted">
            Your sessions at the table show in your play once this device syncs.
          </Text>
        </>
      )}
    </PersonalScreen>
  );
}
