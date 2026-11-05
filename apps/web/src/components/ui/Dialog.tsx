import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { useVisualViewport } from "~/lib/useVisualViewport";

import { cn } from "./cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const viewport = useVisualViewport(open);
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-250 ease-snap data-[ending-style]:duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:duration-200 sm:data-[ending-style]:duration-150" />
        <BaseDialog.Popup
          ref={popup}
          style={
            viewport
              ? { maxHeight: viewport.height * 0.92, marginBottom: viewport.bottom }
              : undefined
          }
          initialFocus={() => (matchMedia("(pointer: fine)").matches ? true : popup.current)}
          // React bubbles events through portals; a form in here must not submit one around the trigger.
          onSubmit={(event) => event.stopPropagation()}
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] flex flex-col overflow-hidden rounded-t-2xl bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-(--elevation-sheet) outline-none",
            // On phones it's a sheet sliding up from the bottom edge; wider screens fade it in centered.
            "transition-[translate,opacity] duration-250 ease-snap data-[ending-style]:duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5 sm:duration-200 sm:data-[ending-style]:duration-150",
            "sm:data-[ending-style]:-translate-y-[48%] sm:data-[ending-style]:opacity-0 sm:data-[starting-style]:-translate-y-[48%] sm:data-[starting-style]:opacity-0",
            "pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] overscroll-contain motion-reduce:transition-opacity motion-reduce:data-[starting-style]:translate-y-0 motion-reduce:data-[ending-style]:translate-y-0 motion-reduce:data-[starting-style]:opacity-0 motion-reduce:data-[ending-style]:opacity-0 sm:motion-reduce:data-[starting-style]:-translate-y-1/2 sm:motion-reduce:data-[ending-style]:-translate-y-1/2",
            className,
          )}
        >
          <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <BaseDialog.Title className="text-xl font-semibold">{title}</BaseDialog.Title>
              {description ? (
                <BaseDialog.Description className="text-sm text-muted">
                  {description}
                </BaseDialog.Description>
              ) : null}
            </div>
            <BaseDialog.Close
              aria-label="Close"
              className="-mt-1 -mr-2 inline-flex size-10 items-center pointer-coarse:size-11 justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </BaseDialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
          {footer ? <div className="shrink-0 border-t border-line pt-4 mt-4">{footer}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
