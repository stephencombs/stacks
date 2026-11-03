import { cn } from "./cn";

/** Pick one of a few views or sizes. */
export function Segmented<Value extends string | number>({
  label,
  options,
  value,
  onChange,
  variant = "default",
  disabled = false,
}: {
  label: string;
  options: ReadonlyArray<{ readonly value: Value; readonly label: string }>;
  value: Value;
  onChange: (value: Value) => void;
  variant?: "default" | "quiet";
  disabled?: boolean;
}) {
  const quiet = variant === "quiet";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex flex-wrap gap-1 self-start",
        quiet ? "-ml-2" : "rounded-lg bg-sunken p-1",
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center justify-center transition-colors duration-150 pointer-coarse:h-11 pointer-coarse:min-w-11 disabled:cursor-not-allowed disabled:opacity-50",
            quiet
              ? "h-8 min-w-9 rounded-full px-3 text-xs font-medium"
              : "h-10 min-w-10 rounded-md px-3 text-sm font-medium",
            value === option.value
              ? quiet
                ? "bg-sunken text-ink"
                : "bg-raised text-ink shadow-sm"
              : quiet
                ? "text-muted hover:bg-sunken hover:text-ink"
                : "text-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
