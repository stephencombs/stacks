import { cn } from "./cn";

/** Pick one of a few views or sizes. */
export function Segmented<Value extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: ReadonlyArray<{ readonly value: Value; readonly label: string }>;
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap gap-1 self-start rounded-lg bg-sunken p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors duration-150 pointer-coarse:h-11 pointer-coarse:min-w-11 disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
