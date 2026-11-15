import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { useVisualViewport } from "~/lib/useVisualViewport";

import { cn } from "./cn";

// The sheet and its scrim move together: a sheet's timing on phones, a menu's once it's a centered
// dialog.
const timing =
  "duration-(--duration-sheet-in) ease-enter data-[ending-style]:duration-(--duration-sheet-out) data-[ending-style]:ease-exit " +
  "sm:duration-(--duration-menu-in) sm:data-[ending-style]:duration-(--duration-menu-out)";

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
        <BaseDialog.Backdrop
          className={cn(
            "fixed inset-0 z-40 bg-scrim transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            timing,
          )}
        />
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
            // On phones it's a glass sheet from the bottom edge, edge to edge and rounded on top;
            // wider screens fade it in centered.
            "glass-sheet fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] flex flex-col overflow-hidden rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none overscroll-contain",
            "pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]",
            "transition-[translate,opacity] data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
            timing,
            "sm:glass sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5",
            "sm:data-[ending-style]:-translate-y-[48%] sm:data-[ending-style]:opacity-0 sm:data-[starting-style]:-translate-y-[48%] sm:data-[starting-style]:opacity-0",
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
              className="-mt-1 -mr-2 inline-flex size-10 items-center pointer-coarse:size-11 justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
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
