import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { csvFilename } from "@stacks/client-runtime/format";

import { confirmAction } from "../components/ui/confirmAction";
import { FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { SettingsLayout, type SettingsLayoutProps } from "../components/ui/SettingsLayout";
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
  const navigation = useNavigation();
  const exportCsv = useAction(stacks.Client.mutation("groups", "exportCsv"));
  const leave = useAction(stacks.Client.mutation("groups", "leave"));
  const exportLedger = async () => {
    const csv = await exportCsv.run({ params: { groupId: detail.group.id } });
    if (csv == null) return;
    await shareCsv(csvFilename(detail.group.name), csv);
  };
  const leaveGroup = () =>
    confirmAction(
      `Leave ${detail.group.name}?`,
      "Your history stays in the group's ledger. Someone can invite you back.",
      "Leave group",
      async () => {
        const { error } = await leave.attempt({ params: { groupId: detail.group.id } });
        if (error !== null) return error;
        navigation.navigate("Tabs", { screen: "CrewTab", params: { screen: "Crew" } });
        return null;
      },
    );
  const sections: SettingsLayoutProps["sections"] = [
    {
      title: "Ledger",
      footer: "Every buy-in, cash-out, adjustment and void in this group.",
      error: exportCsv.error,
      rows: [
        { label: "Export CSV", pending: exportCsv.pending, onPress: () => void exportLedger() },
      ],
    },
    {
      rows: [{ label: "Leave group", destructive: true, onPress: leaveGroup }],
    },
  ];

  return (
    <SettingsLayout
      groupName={detail.group.name}
      currency={detail.group.currency}
      sections={sections}
    />
  );
}
