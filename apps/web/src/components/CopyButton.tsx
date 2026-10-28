import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./ui/Button";

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const reset = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(reset);
  }, [status]);
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => setStatus("copied"),
      () => setStatus("failed"),
    );
  return (
    <Button size="sm" onClick={() => void copy()} aria-live="polite">
      {status === "copied" ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : label}
    </Button>
  );
}
