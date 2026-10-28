import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 bg-black/30 transition-opacity duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 sm:duration-200 sm:data-[ending-style]:duration-150" />
        <BaseDialog.Popup
          // React bubbles events through portals; a form in here must not submit one around the trigger.
          onSubmit={(event) => event.stopPropagation()}
          className={cn(
            "fixed inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none",
            // On phones it's a sheet sliding up from the bottom edge; wider screens fade it in centered.
            "transition-[translate,opacity] duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5 sm:duration-200 sm:data-[ending-style]:duration-150",
            "sm:data-[ending-style]:-translate-y-[48%] sm:data-[ending-style]:opacity-0 sm:data-[starting-style]:-translate-y-[48%] sm:data-[starting-style]:opacity-0",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <BaseDialog.Title className="font-serif text-2xl font-medium">
                {title}
              </BaseDialog.Title>
              {description ? (
                <BaseDialog.Description className="text-sm text-muted">
                  {description}
                </BaseDialog.Description>
              ) : null}
            </div>
            <BaseDialog.Close
              aria-label="Close"
              className="-mt-1 -mr-2 inline-flex size-9 items-center pointer-coarse:size-11 justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </BaseDialog.Close>
          </div>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
