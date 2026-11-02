import { ChevronDown, CircleAlert } from "lucide-react";
import { useId, type ComponentProps, type ReactElement, type ReactNode } from "react";

import { cn } from "./cn";

const control =
  "w-full rounded-lg bg-surface px-3 text-base text-ink shadow-(--elevation-control) " +
  "transition-shadow duration-150 placeholder:text-muted hover:shadow-[inset_0_0_0_1px_var(--color-faint)] " +
  "focus:shadow-[inset_0_0_0_2px_var(--color-ink)] focus:outline-none aria-invalid:shadow-[inset_0_0_0_2px_var(--color-danger)] " +
  "disabled:bg-sunken disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(control, "h-11 appearance-none pr-9")} {...props} />
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
}

/**
 * A labelled control. The render prop receives the IDs to wire up, so the label, hint and error
 * are always connected to the input for assistive tech.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactElement;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {hint && !error ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-danger">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A form-level failure, such as the API refusing the request. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2.5 text-sm text-danger"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A form value picked from a few short options, as a grid of cards. Set columns with `className`. */
export function RadioCards<Value extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: ReactNode;
  options: ReadonlyArray<{ readonly value: Value; readonly label: string }>;
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className={cn("grid grid-cols-3 gap-2", className)}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-medium outline-offset-2 outline-ink transition-colors duration-150 has-[:focus-visible]:outline-2",
              option.value === value
                ? "bg-accent/15 text-accent-text"
                : "shadow-(--elevation-control) hover:bg-sunken",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
