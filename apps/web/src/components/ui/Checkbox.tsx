import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

import { cn } from "./cn";

const base =
  "inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-surface text-accent-ink " +
  "shadow-[inset_0_0_0_1px_var(--color-faint)] transition-[background-color,box-shadow] duration-150 " +
  "data-[checked]:bg-accent data-[checked]:shadow-none";

/** Wrap it in a `<label>`: that's where its accessible name and larger tap target come from. */
export function Checkbox({
  checked,
  disabled = false,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <BaseCheckbox.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className={cn(base, className)}
    >
      <BaseCheckbox.Indicator className="flex">
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
