import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { csvFilename } from "@stacks/client-runtime/format";
import { paymentHandlesList } from "@stacks/client-runtime/pay";
import { useState } from "react";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { SettingsLayout, type SettingsLayoutProps } from "../components/ui/SettingsLayout";
import { Sheet } from "../components/ui/Sheet";
import { PaymentHandlesSheet } from "../features/PaymentHandles";
import { SettingsSkeleton } from "../features/ScreenSkeletons";
import { useLinkedScope } from "../lib/scope";
import { shareCsv } from "../lib/share";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

export function GroupSettingsScreen({ route }: Props) {
  const stacks = useStacks();
  useLinkedScope(route.params);
  return (
    <Loaded
      query={stacks.group(GroupId.make(route.params.groupId))}
      skeleton={
        <Screen>
          <SettingsSkeleton />
        </Screen>
      }
      renderError={(message) => (
        <Screen>
          <FormError>{message}</FormError>
        </Screen>
      )}
    >
      {(detail) => <SettingsView detail={detail} />}
    </Loaded>
  );
}

function SettingsView({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const exportCsv = useAction(stacks.Client.mutation("groups", "exportCsv"));
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const me = detail.players.find((player) => player.id === detail.myPlayerId);
  const items = me ? paymentHandlesList(me) : [];
  const exportLedger = async () => {
    const csv = await exportCsv.run({ params: { groupId: detail.group.id } });
    if (csv == null) return;
    await shareCsv(csvFilename(detail.group.name), csv);
  };
  const sections: SettingsLayoutProps["sections"] = [
    ...(me
      ? [
          {
            title: "Payment apps",
            footer:
              "Add your Venmo, Cash App or PayPal so people can pay you straight from settle up.",
            rows:
              items.length > 0
                ? items.map((item) => ({
                    label: item.label,
                    value: item.value,
                    disclosure: true,
                    onPress: () => setEditing(true),
                  }))
                : [
                    {
                      label: "Add payment apps",
                      disclosure: true,
                      onPress: () => setEditing(true),
                    },
                  ],
          },
        ]
      : []),
    {
      title: "Ledger",
      footer: "Every buy-in, cash-out, adjustment, settlement and void in this group.",
      error: exportCsv.error,
      rows: [
        { label: "Export CSV", pending: exportCsv.pending, onPress: () => void exportLedger() },
      ],
    },
    {
      footer: "You can only leave once you're settled up.",
      rows: [{ label: "Leave group", destructive: true, onPress: () => setLeaving(true) }],
    },
  ];

  return (
    <SettingsLayout
      groupName={detail.group.name}
      currency={detail.group.currency}
      sections={sections}
    >
      {editing && me ? (
        <PaymentHandlesSheet detail={detail} player={me} onClose={() => setEditing(false)} />
      ) : null}
      {leaving ? <LeaveSheet detail={detail} onClose={() => setLeaving(false)} /> : null}
    </SettingsLayout>
  );
}

function LeaveSheet({ detail, onClose }: { detail: GroupDetail; onClose: () => void }) {
  const stacks = useStacks();
  const navigation = useNavigation();
  const leave = useAction(stacks.Client.mutation("groups", "leave"));
  const confirm = async () => {
    if (await leave.run({ params: { groupId: detail.group.id } })) {
      onClose();
      navigation.navigate("Account", { screen: "Groups" });
    }
  };
  return (
    <Sheet
      open
      busy={leave.pending}
      onClose={onClose}
      title={`Leave ${detail.group.name}?`}
      description="Your history stays in the group's ledger. Someone can invite you back."
      footer={
        <>
          <Button
            label="Leave group"
            variant="danger"
            size="lg"
            pending={leave.pending}
            onPress={() => void confirm()}
          />
          <Button label="Stay" disabled={leave.pending} onPress={onClose} />
        </>
      }
    >
      {leave.error ? <FormError>{leave.error}</FormError> : null}
    </Sheet>
  );
}
