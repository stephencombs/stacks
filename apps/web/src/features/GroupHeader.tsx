import type { GroupDetail } from "@stacks/contracts";
import type { ReactNode } from "react";

import { BackLink, Tab, Tabs } from "~/components/ui/Nav";
import { PageHeader } from "~/components/ui/Page";

const tabs = [
  { key: "home", label: "Trips", to: "/groups/$groupId" },
  { key: "stats", label: "Stats", to: "/groups/$groupId/stats" },
  { key: "settings", label: "People", to: "/groups/$groupId/settings" },
] as const;

export function GroupHeader({
  detail,
  current,
  action,
}: {
  detail: GroupDetail;
  current: (typeof tabs)[number]["key"];
  action?: ReactNode;
}) {
  return (
    <PageHeader
      back={<BackLink to="/groups">Your groups</BackLink>}
      title={detail.group.name}
      documentTitle={`${tabs.find((tab) => tab.key === current)!.label} · ${detail.group.name}`}
      action={action}
      tabs={
        <Tabs label="Group">
          {tabs.map((tab) => (
            <Tab
              key={tab.key}
              to={tab.to}
              params={{ groupId: detail.group.id }}
              current={tab.key === current}
            >
              {tab.label}
            </Tab>
          ))}
        </Tabs>
      }
    />
  );
}
