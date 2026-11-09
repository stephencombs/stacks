import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { csvFilename } from "@stacks/client-runtime/format";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import { SectionHeading } from "../components/ui/Surface";
import { PaymentAppsSection } from "../features/PaymentHandles";
import { SettingsSkeleton } from "../features/ScreenSkeletons";
import { useLinkedScope } from "../lib/scope";
import { shareCsv } from "../lib/share";
import { Loaded, useAction, useStacks } from "../lib/stacks";

type Props = StaticScreenProps<{ groupId: string }>;

/** The group's settings: how people pay you, the ledger as a file, and leaving. */
export function GroupSettingsScreen({ route }: Props) {
  const stacks = useStacks();
  useLinkedScope(route.params);
  return (
    <Screen>
      <Loaded
        query={stacks.group(GroupId.make(route.params.groupId))}
        skeleton={<SettingsSkeleton />}
      >
        {(detail) => <SettingsView detail={detail} />}
      </Loaded>
    </Screen>
  );
}

function SettingsView({ detail }: { detail: GroupDetail }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <PaymentAppsSection detail={detail} />
      <ExportSection detail={detail} />
      <View className="gap-2 border-t border-line pt-6">
        <Button label="Leave group" variant="danger" onPress={() => setLeaving(true)} />
        <Text className="text-sm text-muted">You can only leave once you're settled up.</Text>
      </View>
      {leaving ? <LeaveSheet detail={detail} onClose={() => setLeaving(false)} /> : null}
    </>
  );
}

function ExportSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const exportCsv = useAction(stacks.Client.mutation("groups", "exportCsv"));
  const exportLedger = async () => {
    const csv = await exportCsv.run({ params: { groupId: detail.group.id } });
    if (csv == null) return;
    await shareCsv(csvFilename(detail.group.name), csv);
  };
  return (
    <View className="gap-2">
      <SectionHeading>Ledger</SectionHeading>
      <Button label="Export CSV" pending={exportCsv.pending} onPress={() => void exportLedger()} />
      <Text className="text-sm text-muted">
        Every buy-in, cash-out, adjustment, settlement and void in this group.
      </Text>
      {exportCsv.error ? <FormError>{exportCsv.error}</FormError> : null}
    </View>
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
          <Button label="Stay" onPress={onClose} />
        </>
      }
    >
      {leave.error ? <FormError>{leave.error}</FormError> : null}
    </Sheet>
  );
}
