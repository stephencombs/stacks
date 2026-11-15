import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check, ChevronDown, Ellipsis, X } from "lucide-react";
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
          className="-ml-2 inline-flex min-h-10 max-w-full items-center gap-1 self-start rounded-lg px-2 text-sm font-medium text-muted transition-colors duration-150 hover:bg-fill hover:text-ink data-[popup-open]:bg-fill data-[popup-open]:text-ink pointer-coarse:min-h-11"
        >
          <span className="truncate">{trigger}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </BaseMenu.Trigger>
      ) : (
        <BaseMenu.Trigger
          aria-label={label}
          className="inline-flex size-10 items-center pointer-coarse:size-11 justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-fill hover:text-ink data-[popup-open]:bg-fill"
        >
          {icon}
        </BaseMenu.Trigger>
      )}
      <Popup align={align ?? (trigger ? "start" : "end")}>{children}</Popup>
    </BaseMenu.Root>
  );
}

function Popup({ align, children }: { align: "start" | "end"; children: ReactNode }) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner className="z-40" sideOffset={4} align={align}>
        <BaseMenu.Popup className="glass max-h-96 min-w-52 origin-[var(--transform-origin)] overflow-y-auto rounded-xl p-1 outline-none transition-[scale,opacity] duration-(--duration-menu-in) ease-enter data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-(--duration-menu-out) data-[ending-style]:ease-exit data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

/**
 * A filter as a pill that opens its choices. Once a choice other than the first is picked, the
 * pill fills and gains a button that clears it.
 */
export function FilterChip<Value extends string>({
  name,
  options,
  value,
  applied,
  onChange,
  onClear,
}: {
  /** What it filters, read out before the choice: "Period". */
  name: string;
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  applied: boolean;
  onChange: (value: Value) => void;
  onClear: () => void;
}) {
  const label = options.find((option) => option.value === value)?.label ?? "";
  return (
    <span
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full type-callout font-medium",
        applied ? "bg-ink text-ink-inverse" : "bg-surface text-ink shadow-(--elevation-control)",
      )}
    >
      <BaseMenu.Root>
        <BaseMenu.Trigger
          aria-label={`${name}: ${label}`}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full whitespace-nowrap transition-[scale] duration-150 active:scale-[0.97] focus-visible:outline-offset-[-3px]",
            applied ? "pr-1 pl-4" : "px-4",
          )}
        >
          {label}
          {applied ? null : <ChevronDown className="size-3.5 text-muted" aria-hidden />}
        </BaseMenu.Trigger>
        <Popup align="start">
          <MenuChoice options={options} value={value} onChange={onChange} />
        </Popup>
      </BaseMenu.Root>
      {applied ? (
        <button
          type="button"
          aria-label={`Clear ${name.toLowerCase()} filter`}
          onClick={onClear}
          className="grid size-11 place-items-center rounded-full focus-visible:outline-offset-[-3px]"
        >
          <span className="grid size-5 place-items-center rounded-full bg-ink-inverse/20">
            <X className="size-3" strokeWidth={3} aria-hidden />
          </span>
        </button>
      ) : null}
    </span>
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
        "flex h-9 cursor-default pointer-coarse:h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm outline-none select-none data-[highlighted]:bg-fill",
        tone === "danger" ? "text-loss" : "text-ink",
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
          className="flex h-9 cursor-default pointer-coarse:h-11 items-center gap-2 rounded-lg px-3 text-sm text-ink outline-none select-none data-[highlighted]:bg-fill"
        >
          <span className="flex size-4 items-center justify-center">
            <BaseMenu.RadioItemIndicator>
              <Check className="size-4 text-ink" aria-hidden />
            </BaseMenu.RadioItemIndicator>
          </span>
          {option.label}
        </BaseMenu.RadioItem>
      ))}
    </BaseMenu.RadioGroup>
  );
}
