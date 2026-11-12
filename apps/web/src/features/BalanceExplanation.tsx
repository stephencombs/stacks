import { balanceLineLabel, formatDay, playerNames } from "@stacks/client-runtime/format";
import type { GroupDetail, PlayerId, TripDetail } from "@stacks/contracts";

import { BalanceLabel, Money } from "~/components/Money";
import { Dialog } from "~/components/ui/Dialog";
import { Note } from "~/components/ui/Page";
import { List, Row, RowText } from "~/components/ui/Surface";
import { Loaded, useStacks } from "~/lib/stacks";

export function BalanceExplanationDialog({
  detail,
  trip,
  playerId,
  onClose,
}: {
  detail: GroupDetail;
  trip: TripDetail;
  playerId: PlayerId;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const names = playerNames(detail);
  const player = names.get(playerId) ?? "This player";
  const currency = detail.group.currency;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${player}'s balance`}
      description="Money covered or held for each other, plus backing and payments. This is separate from winnings and losses at the tables."
    >
      <div className="flex flex-col gap-4">
        <Loaded query={stacks.balance(trip.trip.id, playerId)}>
          {(explanation) => (
            <>
              <BalanceLabel amount={explanation.total} currency={currency} />
              <Note>
                Positive amounts are owed to {player}; negative amounts are owed by {player}. These
                lines add up to the balance above.
              </Note>
              {explanation.lines.length === 0 ? (
                <Note>No covered money, backing or payments on this trip.</Note>
              ) : (
                <List>
                  {explanation.lines.map((line) => {
                    const session =
                      line.kind === "stake"
                        ? undefined
                        : trip.sessions.find((item) => item.session.id === line.sessionId);
                    return (
                      <Row
                        key={line.kind === "stake" ? line.stakeId : line.entryId}
                        className="flex-wrap"
                      >
                        <RowText
                          title={balanceLineLabel(
                            line,
                            player,
                            names.get(line.counterpartyId) ?? "Another player",
                          )}
                          meta={`${formatDay(line.occurredAt)}${session ? ` · ${session.venue.name}` : ""}`}
                        />
                        <span className="whitespace-nowrap">
                          {line.amount > 0 ? "+" : ""}
                          <Money amount={line.amount} currency={currency} />
                        </span>
                        {line.kind === "stake" ? (
                          <p className="w-full text-sm text-muted">
                            Principal <Money amount={line.principal} currency={currency} /> · backer
                            gets {line.lenderShare}% of winnings. Allocated play result{" "}
                            <Money amount={line.result} currency={currency} tone="result" />.
                          </p>
                        ) : null}
                      </Row>
                    );
                  })}
                </List>
              )}
            </>
          )}
        </Loaded>
      </div>
    </Dialog>
  );
}
