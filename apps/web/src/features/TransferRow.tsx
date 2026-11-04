import type { GroupDetail, PlayerId, Transfer } from "@stacks/contracts";
import { chipOf } from "@stacks/client-runtime/trip";
import { ArrowRight } from "lucide-react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Row } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";
import { PayLinks } from "~/features/PayLinks";

export function TransferRow({
  detail,
  tripName,
  transfer,
  onMarkPaid,
}: {
  detail: GroupDetail;
  tripName: string;
  transfer: Transfer;
  onMarkPaid: (transfer: Transfer) => void;
}) {
  return (
    <Row className="flex-wrap">
      {/* Sized to the names, so the amount wraps under them before either name is cut short. */}
      <span className="flex min-w-0 flex-auto items-center gap-2 font-medium">
        <Payer detail={detail} playerId={transfer.from} />
        <ArrowRight className="size-4 shrink-0 text-faint" role="img" aria-label="pays" />
        <Payer detail={detail} playerId={transfer.to} />
      </span>
      <span className="ml-auto flex items-center gap-3">
        <Money
          amount={transfer.amount}
          currency={detail.group.currency}
          className="font-semibold"
        />
        <Button size="sm" onClick={() => onMarkPaid(transfer)}>
          Mark paid
        </Button>
      </span>
      <PayLinks detail={detail} tripName={tripName} transfer={transfer} />
    </Row>
  );
}

function Payer({ detail, playerId }: { detail: GroupDetail; playerId: PlayerId }) {
  const name = detail.players.find((player) => player.id === playerId)?.displayName ?? "Someone";
  return (
    <span className="flex max-w-1/2 min-w-0 items-center gap-1.5">
      <Chip chip={chipOf(detail, playerId)} name={name} size={22} />
      <span className="truncate">{name}</span>
    </span>
  );
}
