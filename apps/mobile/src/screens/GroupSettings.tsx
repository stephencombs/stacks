import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { csvFilename, isAdmin } from "@stacks/client-runtime/format";
import { useState } from "react";

import { confirmAction } from "../components/ui/confirmAction";
import { FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { SettingsLayout, type SettingsLayoutProps } from "../components/ui/SettingsLayout";
import { NameSheet } from "../features/NameSheet";
import { SettingsSkeleton } from "../features/ScreenSkeletons";
import { afterLeavingGroup } from "../lib/crewRoutes";
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
  const [renaming, setRenaming] = useState(false);
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
        navigation.dispatch(afterLeavingGroup());
        return null;
      },
    );
  const sections: SettingsLayoutProps["sections"] = [
    ...(isAdmin(detail)
      ? [
          {
            rows: [
              {
                label: "Name",
                value: detail.group.name,
                disclosure: true,
                onPress: () => setRenaming(true),
              },
            ],
          },
        ]
      : []),
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
    <>
      <SettingsLayout
        groupName={detail.group.name}
        currency={detail.group.currency}
        sections={sections}
      />
      {renaming ? <RenameGroupSheet detail={detail} onClose={() => setRenaming(false)} /> : null}
    </>
  );
}

function RenameGroupSheet({ detail, onClose }: { detail: GroupDetail; onClose: () => void }) {
  const stacks = useStacks();
  const rename = useAction(stacks.Client.mutation("groups", "rename"));
  return (
    <NameSheet
      title="Rename group"
      label="Group name"
      initial={detail.group.name}
      maxLength={80}
      emptyError="Give the group a name."
      pending={rename.pending}
      error={rename.error}
      onClose={onClose}
      onSave={async (name) =>
        Boolean(await rename.run({ params: { groupId: detail.group.id }, payload: { name } }))
      }
    />
  );
}
