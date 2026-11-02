import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check, ChevronDown, Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

const more = <Ellipsis className="size-5" aria-hidden />;

/** A menu behind an icon button, or behind a text trigger when switching context. */
export function Menu({
  label,
  icon = more,
  trigger,
  align,
  children,
}: {
  label?: string;
  icon?: ReactNode;
  trigger?: ReactNode;
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <BaseMenu.Root>
      {trigger ? (
        <BaseMenu.Trigger
          aria-label={label}
          className="-ml-2 inline-flex min-h-10 max-w-full items-center gap-1 self-start rounded-lg px-2 text-sm font-medium text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink data-[popup-open]:bg-sunken data-[popup-open]:text-ink pointer-coarse:min-h-11"
        >
          <span className="truncate">{trigger}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </BaseMenu.Trigger>
      ) : (
        <BaseMenu.Trigger
          aria-label={label}
          className="inline-flex size-10 items-center pointer-coarse:size-11 justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink data-[popup-open]:bg-sunken"
        >
          {icon}
        </BaseMenu.Trigger>
      )}
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align={align ?? (trigger ? "start" : "end")}>
          <BaseMenu.Popup className="max-h-96 min-w-52 origin-[var(--transform-origin)] overflow-y-auto rounded-xl bg-surface p-1 shadow-(--elevation-popover) outline-none transition-[scale,opacity] duration-150 ease-snap data-[ending-style]:duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted">{children}</div>;
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 h-px bg-line" />;
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
        "flex h-9 cursor-default pointer-coarse:h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm outline-none select-none data-[highlighted]:bg-sunken",
        tone === "danger" ? "text-danger" : "text-ink",
      )}
    >
      {children}
    </BaseMenu.Item>
  );
}

/** A menu's pick-one options, checked beside the current one. */
export function MenuChoice<Value extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <BaseMenu.RadioGroup value={value} onValueChange={(next: Value) => onChange(next)}>
      {options.map((option) => (
        <BaseMenu.RadioItem
          key={option.value}
          value={option.value}
          className="flex h-9 cursor-default pointer-coarse:h-11 items-center gap-2 rounded-lg px-3 text-sm text-ink outline-none select-none data-[highlighted]:bg-sunken"
        >
          <span className="flex size-4 items-center justify-center">
            <BaseMenu.RadioItemIndicator>
              <Check className="size-4 text-accent-text" aria-hidden />
            </BaseMenu.RadioItemIndicator>
          </span>
          {option.label}
        </BaseMenu.RadioItem>
      ))}
    </BaseMenu.RadioGroup>
  );
}
