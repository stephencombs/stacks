import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

/** An overflow menu behind a "…" button. */
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={label}
        className="inline-flex size-9 items-center pointer-coarse:size-11 justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink data-[popup-open]:bg-sunken"
      >
        <Ellipsis className="size-5" aria-hidden />
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align="end">
          <BaseMenu.Popup className="min-w-44 origin-[var(--transform-origin)] rounded-xl bg-surface p-1 shadow-[0_0_0_1px_var(--color-line),0_4px_12px_-2px_rgb(0_0_0/0.12),0_12px_32px_-8px_rgb(0_0_0/0.12)] outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export function MenuItem({
  onClick,
  tone = "default",
  children,
}: {
  onClick: () => void;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <BaseMenu.Item
      onClick={onClick}
      className={cn(
        "flex h-9 cursor-default pointer-coarse:h-11 items-center gap-2 rounded-lg px-3 text-sm outline-none select-none data-[highlighted]:bg-sunken",
        tone === "danger" ? "text-danger" : "text-ink",
      )}
    >
      {children}
    </BaseMenu.Item>
  );
}
