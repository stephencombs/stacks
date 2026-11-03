import type { GroupDetail, Transfer } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import { formatSettleUpShare, payLinks } from "@stacks/client-runtime/pay";
import { formatMoney } from "@stacks/shared/money";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { shareText } from "../lib/share";

export function PayLinks({
  detail,
  tripName,
  transfer,
}: {
  detail: GroupDetail;
  tripName: string;
  transfer: Transfer;
}) {
  const [openError, setOpenError] = useState<string | null>(null);
  const recipient = detail.players.find((player) => player.id === transfer.to);
  if (!recipient) return null;
  const currency = detail.group.currency;
  const links = payLinks(recipient, { amount: transfer.amount, currency, tripName });
  if (links.length === 0) return null;

  const open = async (url: string, label: string) => {
    setOpenError(null);
    try {
      await Linking.openURL(url);
    } catch {
      setOpenError(`Couldn't open ${label}.`);
    }
  };

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {links.map((link) => (
          <Button
            key={link.app}
            label={link.label}
            size="sm"
            accessibilityLabel={`Pay ${recipient.displayName} ${formatMoney(transfer.amount, currency)} on ${link.label}`}
            onPress={() => void open(link.url, link.label)}
          />
        ))}
      </View>
      {openError ? <FormError>{openError}</FormError> : null}
    </View>
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
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(reset);
  }, [copied]);

  if (transfers.length === 0) return null;

  const share = async () => {
    const text = formatSettleUpShare({
      tripName,
      transfers,
      names: playerNames(detail),
      currency: detail.group.currency,
    });
    if ((await shareText(text)) === "copied") setCopied(true);
  };

  return (
    <Button
      label={copied ? "Copied" : "Share"}
      size="sm"
      variant="ghost"
      onPress={() => void share()}
    />
  );
}
