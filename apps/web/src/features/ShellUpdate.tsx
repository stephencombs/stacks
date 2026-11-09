import { Button } from "~/components/ui/Button";
import { Surface } from "~/components/ui/Surface";
import { applyShellUpdate, useShellUpdate } from "~/lib/offlineShell";

/** Offers a newer installed version. It never reloads on its own, so nothing unsaved is lost. */
export function ShellUpdate() {
  if (!useShellUpdate()) return null;
  return (
    <Surface
      role="status"
      className="fixed top-[calc(env(safe-area-inset-top)+0.5rem)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 py-1 pr-1 pl-4 text-sm"
    >
      Update ready
      <Button size="sm" variant="tint" onClick={applyShellUpdate}>
        Reload
      </Button>
    </Surface>
  );
}
