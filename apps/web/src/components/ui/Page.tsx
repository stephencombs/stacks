import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

export function PageHeader({
  back,
  options,
  title,
  documentTitle,
  tag,
  context,
  action,
  tabs,
}: {
  back?: ReactNode;
  options?: ReactNode;
  title: ReactNode;
  documentTitle?: string;
  tag?: ReactNode;
  context?: ReactNode;
  action?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {documentTitle || typeof title === "string" ? (
        <title>{`${documentTitle ?? title} · Stacks`}</title>
      ) : null}
      {back || options ? (
        <div className="flex min-h-9 items-center justify-between gap-3">
          {back}
          {options ? <div className="-mr-2 ml-auto">{options}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 type-title wrap-anywhere">{title}</h1>
            {tag}
          </div>
          {context ? <p className="text-sm text-muted wrap-anywhere">{context}</p> : null}
        </div>
        {action}
      </div>
      {tabs}
    </header>
  );
}

export function Section({
  title,
  action,
  aside,
  label,
  className,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  aside?: ReactNode;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
        {action ? <div className="-mr-3">{action}</div> : null}
        {aside ? <span className="shrink-0 text-sm text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Note({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("max-w-[65ch] text-sm text-pretty text-muted", className)} {...props} />;
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{title}</p>
      {children ? <Note>{children}</Note> : null}
    </div>
  );
}
