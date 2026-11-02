import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check, Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

const more = <Ellipsis className="size-5" aria-hidden />;

/** A menu behind an icon button: "…" unless another icon fits better. */
export function Menu({
  label,
  icon = more,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={label}
        className="inline-flex size-9 items-center pointer-coarse:size-11 justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink data-[popup-open]:bg-sunken"
      >
        {icon}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align="end">
          <BaseMenu.Popup className="min-w-44 origin-[var(--transform-origin)] rounded-xl bg-surface p-1 shadow-[0_0_0_1px_var(--color-line-strong),0_4px_12px_-2px_rgb(0_0_0/0.25),0_12px_32px_-8px_rgb(0_0_0/0.3)] outline-none transition-[scale,opacity] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
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
