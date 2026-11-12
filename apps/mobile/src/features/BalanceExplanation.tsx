import { balanceLineLabel, formatDay, playerNames } from "@stacks/client-runtime/format";
import type { GroupDetail, PlayerId, TripDetail } from "@stacks/contracts";
import { Text, View } from "react-native";

import { BalanceLabel, Money } from "../components/Money";
import { Sheet } from "../components/ui/Sheet";
import { List, Row } from "../components/ui/Surface";
import { Loaded, useStacks } from "../lib/stacks";

export function BalanceExplanationSheet({
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
    <Sheet
      open
      onClose={onClose}
      title={`${player}'s balance`}
      description="Money covered or held for each other, plus backing and payments. This is separate from winnings and losses at the tables."
    >
      <Loaded query={stacks.balance(trip.trip.id, playerId)}>
        {(explanation) => (
          <>
            <BalanceLabel amount={explanation.total} currency={currency} />
            <Text className="type-footnote text-muted">
              Positive amounts are owed to {player}; negative amounts are owed by {player}. These
              lines add up to the balance above.
            </Text>
            {explanation.lines.length === 0 ? (
              <Text className="type-body text-muted">
                No covered money, backing or payments on this trip.
              </Text>
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
                      className="flex-col items-stretch gap-2"
                    >
                      <View className="flex-row items-start gap-3">
                        <Text className="flex-1 type-body text-ink">
                          {balanceLineLabel(
                            line,
                            player,
                            names.get(line.counterpartyId) ?? "Another player",
                          )}
                        </Text>
                        <Text className="text-ink">
                          {line.amount > 0 ? "+" : ""}
                          <Money amount={line.amount} currency={currency} />
                        </Text>
                      </View>
                      <Text className="type-footnote text-muted">
                        {formatDay(line.occurredAt)}
                        {session ? ` · ${session.venue.name}` : ""}
                      </Text>
                      {line.kind === "stake" ? (
                        <Text className="type-footnote text-muted">
                          Principal <Money amount={line.principal} currency={currency} /> · backer
                          gets {line.lenderShare}% of winnings. Allocated play result{" "}
                          <Money amount={line.result} currency={currency} tone="result" />.
                        </Text>
                      ) : null}
                    </Row>
                  );
                })}
              </List>
            )}
          </>
        )}
      </Loaded>
    </Sheet>
  );
}
