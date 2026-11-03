import type { GroupDetail, PlayerId, Transfer } from "@stacks/contracts";
import { chipOf } from "@stacks/client-runtime/trip";
import { ArrowRight } from "lucide-react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Row } from "~/components/ui/Surface";
import { Chip } from "~/features/Chip";

export function TransferRow({
  detail,
  transfer,
  onMarkPaid,
}: {
  detail: GroupDetail;
  transfer: Transfer;
  onMarkPaid: (transfer: Transfer) => void;
}) {
  return (
    <Row className="flex-wrap">
      <span className="flex min-w-0 flex-1 basis-40 items-center gap-2 font-medium">
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
    </Row>
  );
}

function Payer({ detail, playerId }: { detail: GroupDetail; playerId: PlayerId }) {
  const name = detail.players.find((player) => player.id === playerId)?.displayName ?? "Someone";
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Chip chip={chipOf(detail, playerId)} name={name} size={22} />
      <span className="truncate">{name}</span>
    </span>
  );
}
