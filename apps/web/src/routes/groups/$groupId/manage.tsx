import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { csvFilename } from "@stacks/client-runtime/format";
import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { BackLink } from "~/components/ui/Nav";
import { Note, PageHeader, Section } from "~/components/ui/Page";
import { PaymentAppsSection } from "~/features/PaymentHandles";
import { Loaded, useAction, useStacks } from "~/lib/stacks";
import { GroupPageSkeleton } from "~/features/PageSkeletons";

/**
 * The group's settings: how people pay you, the ledger export, and leaving. Its address isn't
 * `/settings`, which meant People before the group had a hub and still redirects there.
 */
export const Route = createFileRoute("/groups/$groupId/manage")({ component: Settings });

function Settings() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.group(GroupId.make(groupId))}
      skeleton={<GroupPageSkeleton on="settings" />}
    >
      {(detail) => <SettingsView detail={detail} />}
    </Loaded>
  );
}

function SettingsView({ detail }: { detail: GroupDetail }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <PageHeader
        back={
          <BackLink to="/groups/$groupId" params={{ groupId: detail.group.id }}>
            {detail.group.name}
          </BackLink>
        }
        title="Settings"
        documentTitle={`Settings · ${detail.group.name}`}
      />
      <PaymentAppsSection detail={detail} />
      <ExportSection detail={detail} />
      <Section title="Leave the group">
        <div className="flex flex-col items-start gap-2">
          <Button variant="danger" onClick={() => setLeaving(true)}>
            Leave group
          </Button>
          <Note>You can only leave once you're settled up.</Note>
        </div>
      </Section>
      <LeaveDialog detail={detail} open={leaving} onOpenChange={setLeaving} />
    </>
  );
}

function ExportSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const exportCsv = useAction(stacks.Client.mutation("groups", "exportCsv"));
  const download = async () => {
    const csv = await exportCsv.run({ params: { groupId: detail.group.id } });
    if (csv == null) return;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(detail.group.name);
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Section title="Ledger">
      <div className="flex flex-col items-start gap-2">
        <Button onClick={() => void download()} pending={exportCsv.pending}>
          <Download className="size-4" aria-hidden />
          Export CSV
        </Button>
        <Note>Every buy-in, cash-out, adjustment, settlement and void in this group.</Note>
        {exportCsv.error ? <FormError>{exportCsv.error}</FormError> : null}
      </div>
    </Section>
  );
}

function LeaveDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: GroupDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const leave = useAction(stacks.Client.mutation("groups", "leave"));
  const confirm = async () => {
    if (await leave.run({ params: { groupId: detail.group.id } })) void navigate({ to: "/" });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Leave ${detail.group.name}?`}
      description="Your history stays in the group's ledger. Someone can invite you back."
    >
      <div className="flex flex-col gap-4">
        {leave.error ? <FormError>{leave.error}</FormError> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Stay</Button>
          <Button variant="danger" onClick={() => void confirm()} pending={leave.pending}>
            Leave group
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
