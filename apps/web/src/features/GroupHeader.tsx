import type { GroupDetail } from "@stacks/contracts";
import type { ReactNode } from "react";

import { Tab, Tabs } from "~/components/ui/Nav";
import { PageTitle } from "~/components/ui/Surface";

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
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          eyebrow={`${detail.players.length} ${detail.players.length === 1 ? "player" : "players"} · ${detail.group.currency}`}
        >
          {detail.group.name}
        </PageTitle>
        {action}
      </div>
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
    </div>
  );
}
