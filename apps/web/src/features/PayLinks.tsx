import type { GroupDetail, Transfer } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import { formatSettleUpShare, payLinks } from "@stacks/client-runtime/pay";
import { formatMoney } from "@stacks/shared/money";
import { ArrowUpRight, Check, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, ExternalLink } from "~/components/ui/Button";

export function PayLinks({
  detail,
  tripName,
  transfer,
}: {
  detail: GroupDetail;
  tripName: string;
  transfer: Transfer;
}) {
  const recipient = detail.players.find((player) => player.id === transfer.to);
  if (!recipient) return null;
  const currency = detail.group.currency;
  const links = payLinks(recipient, { amount: transfer.amount, currency, tripName });
  if (links.length === 0) return null;

  return (
    <span className="flex basis-full flex-wrap items-center gap-2">
      {links.map((link) => (
        <ExternalLink
          key={link.app}
          href={link.url}
          size="sm"
          aria-label={`Pay ${recipient.displayName} ${formatMoney(transfer.amount, currency)} on ${link.label}`}
        >
          {link.label}
          <ArrowUpRight className="size-3.5 text-muted" aria-hidden />
        </ExternalLink>
      ))}
    </span>
  );
}

export function ShareSettleUpButton({
  detail,
  tripName,
  transfers,
}: {
  detail: GroupDetail;
  tripName: string;
  transfers: ReadonlyArray<Transfer>;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const reset = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(reset);
  }, [status]);

  if (transfers.length === 0) return null;

  const share = async () => {
    const text = formatSettleUpShare({
      tripName,
      transfers,
      names: playerNames(detail),
      currency: detail.group.currency,
    });
    if (
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare({ text }))
    ) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(text).then(
      () => setStatus("copied"),
      () => setStatus("failed"),
    );
  };

  return (
    <Button size="sm" variant="ghost" onClick={() => void share()} aria-live="polite">
      {status === "copied" ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Share2 className="size-4" aria-hidden />
      )}
      {status === "copied" ? "Copied" : status === "failed" ? "Couldn't copy" : "Share"}
    </Button>
  );
}
