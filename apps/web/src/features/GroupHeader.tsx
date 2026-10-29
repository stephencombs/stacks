import { Link } from "@tanstack/react-router";
import type { GroupDetail } from "@stacks/contracts";
import type { ReactNode } from "react";

import { cn } from "~/components/ui/cn";

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
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-medium">{detail.group.name}</h1>
        {action}
      </div>
      {/* The padding keeps focus rings inside the scroll box, which clips everything past its edge. */}
      <nav aria-label="Group" className="-m-1 flex gap-1 overflow-x-auto p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            params={{ groupId: detail.group.id }}
            aria-current={tab.key === current ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-lg pointer-coarse:h-11 px-3 text-sm whitespace-nowrap transition-colors duration-150",
              tab.key === current
                ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]"
                : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
